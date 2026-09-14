/* ==========================================================================
   Calculo — motor de dimensionamento (Fase 2)

   Funções puras sobre os cadastros; nada de DOM. Também roda em Node (testes).

   Entradas (formato do Store):
     unidades:      [{ id, nome, empresasBaixo, empresasMedio, empresasAlto }]
     documentos:    [{ id, nome, horas, periodicidadeMeses, responsavel }]
     colaboradores: [{ id, nome, funcao, horasMes, eficiencia, alocacoes: [{ unidadeId, percentual }] }]
     parametros:    { diasUteis[12], fatorBaixo, fatorMedio, fatorAlto, diasReferencia, ocupacaoAlvo }
     janela:        { de: 0..11, ate: 0..11 }   (meses, inclusive)

   Fórmulas (spec Fase 2):
     horas_dia            = horasMes ÷ diasReferencia
     capacidade_mes(colab)= diasUteis[mes] × horas_dia × eficiencia/100
     capacidade na unidade= capacidade_mes × percentual alocado/100 (colaborador pode estar em N unidades)
     colaboradores (FTE)  = Σ percentual/100
     empresas_ponderadas  = baixo×fatorBaixo + medio×fatorMedio + alto×fatorAlto
     demanda_anual(doc)   = empresas_ponderadas × horas × (12 ÷ periodicidade)   [periodicidade 0 = fora]
     demanda_mes          = demanda_anual ÷ 12 (distribuição uniforme)
     capacidade_planejável= capacidade × ocupacaoAlvo/100
     gap_horas            = capacidade_planejável − demanda
     gap_colab            = gap_horas ÷ capacidade média por colaborador
   ========================================================================== */

const Calculo = (() => {
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const FUNCOES = ['Técnico de Segurança do Trabalho', 'Administrativo'];
  const FUNCAO_CURTA = { 'Técnico de Segurança do Trabalho': 'Técnicos', 'Administrativo': 'Administrativos' };
  const COLAB_PADRAO = { horasMes: 160, eficiencia: 80 }; // usado quando não há colaborador para tirar a média

  // Abaixo desta fração da capacidade planejável, o gap positivo é "próximo do limite"
  const MARGEM_ATENCAO = 0.10;

  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /* ---------- blocos elementares ---------- */

  function horasDia(colab, p) {
    return p.diasReferencia > 0 ? n(colab.horasMes) / p.diasReferencia : 0;
  }

  function capacidadeMes(colab, mes, p) {
    return n(p.diasUteis[mes]) * horasDia(colab, p) * (n(colab.eficiencia) / 100);
  }

  function empresasPonderadas(u, p) {
    return n(u.empresasBaixo) * n(p.fatorBaixo) + n(u.empresasMedio) * n(p.fatorMedio) + n(u.empresasAlto) * n(p.fatorAlto);
  }

  /** Demanda anual (h) de um documento para uma unidade. 0 se sob demanda. */
  function demandaAnualDoc(u, d, p) {
    const per = n(d.periodicidadeMeses);
    if (per <= 0) return 0;
    return empresasPonderadas(u, p) * n(d.horas) * (12 / per);
  }

  function status(gap, capacidadePlanejavel) {
    if (gap < -1e-9) return 'deficit';
    if (capacidadePlanejavel > 0 && gap < capacidadePlanejavel * MARGEM_ATENCAO) return 'atencao';
    return 'ok';
  }

  /** Nº de colaboradores equivalente ao gap (negativo = faltam; positivo = sobram). */
  function gapColaboradores(gapHoras, capacidadeMediaColab) {
    if (!(capacidadeMediaColab > 0)) return 0;
    return gapHoras / capacidadeMediaColab;
  }

  /** Recomendação textual a partir do gap em colaboradores. */
  function recomendacao(gapColab, rotulo = 'colaborador') {
    const plural = s => s + (s.endsWith('r') ? 'es' : 's');
    if (gapColab < 0) {
      const q = Math.ceil(-gapColab - 1e-9);
      return { tipo: 'contratar', quantidade: q, texto: `Contratar ${q} ${q === 1 ? rotulo : plural(rotulo)}` };
    }
    const q = Math.floor(gapColab + 1e-9);
    if (q >= 1) return { tipo: 'ocioso', quantidade: q, texto: `Capacidade ociosa de ${q} ${q === 1 ? rotulo : plural(rotulo)}` };
    return { tipo: 'adequado', quantidade: 0, texto: 'Quadro adequado' };
  }

  /* ---------- agregação ---------- */

  function novoAcumulador() {
    return { capacidade: 0, demanda: 0, colaboradores: 0 };
  }

  /**
   * Calcula tudo para a janela. Retorna:
   * {
   *   janela: { de, ate, meses: [idx...] },
   *   unidades: [{ id, nome, empresas, empresasPonderadas, colaboradores: [...],
   *                meses: [{ mes, diasUteis, total: Bloco, porFuncao: {f: Bloco} }],
   *                janela: { total: Bloco, porFuncao: {f: Bloco} } }],
   *   total: { meses: [...], janela: {...} },
   *   avisos: { docsSobDemanda: [nomes], colabSemUnidade: [nomes], unidadesSemColab: [nomes] },
   *   parametros: p
   * }
   * Bloco = { capacidade, capacidadePlanejavel, demanda, gap, gapColab, ocupacao, status, colaboradores, recomendacao }
   */
  function calcular({ unidades = [], documentos = [], colaboradores = [], parametros, janela }) {
    const p = normalizarParametros(parametros);
    const de = clampMes(janela && janela.de, 0);
    const ate = clampMes(janela && janela.ate, 11);
    const meses = [];
    for (let m = Math.min(de, ate); m <= Math.max(de, ate); m++) meses.push(m);

    const docsValidos = documentos.filter(d => n(d.periodicidadeMeses) > 0);
    const docsSobDemanda = documentos.filter(d => n(d.periodicidadeMeses) <= 0).map(d => d.nome);
    const idsUnidades = new Set(unidades.map(u => u.id));
    const alocValidas = c => (c.alocacoes || []).filter(a => a && idsUnidades.has(a.unidadeId) && n(a.percentual) > 0);
    const fracaoEm = (c, unidadeId) => alocValidas(c).filter(a => a.unidadeId === unidadeId).reduce((s, a) => s + n(a.percentual), 0) / 100;
    const colabSemUnidade = colaboradores.filter(c => alocValidas(c).length === 0).map(c => c.nome);
    const colabParcial = colaboradores
      .map(c => ({ nome: c.nome, pct: alocValidas(c).reduce((s, a) => s + n(a.percentual), 0) }))
      .filter(x => x.pct > 0 && x.pct < 99.999)
      .map(x => `${x.nome} (${Math.round(x.pct)}%)`);

    // capacidade média por colaborador (por função) para converter gap em nº de pessoas.
    // Usa os colaboradores da unidade; se não houver, os de toda a equipe; se não houver, o padrão.
    const mediaGlobal = {};
    FUNCOES.forEach(f => {
      const lista = colaboradores.filter(c => c.funcao === f);
      mediaGlobal[f] = lista.length ? lista : [COLAB_PADRAO];
    });

    const resultadoUnidades = unidades.map(u => {
      // colaboradores com alguma alocação nesta unidade, com a fração dedicada
      const colabs = colaboradores.map(c => ({ ...c, fracao: fracaoEm(c, u.id) })).filter(c => c.fracao > 0);
      const demandaAnualPorFuncao = {};
      FUNCOES.forEach(f => {
        demandaAnualPorFuncao[f] = docsValidos
          .filter(d => (d.responsavel || FUNCOES[0]) === f)
          .reduce((s, d) => s + demandaAnualDoc(u, d, p), 0);
      });

      const mesesCalc = meses.map(mes => {
        const porFuncao = {};
        FUNCOES.forEach(f => {
          const cf = colabs.filter(c => c.funcao === f);
          const cap = cf.reduce((s, c) => s + capacidadeMes(c, mes, p) * c.fracao, 0);
          const fte = cf.reduce((s, c) => s + c.fracao, 0);
          // média por colaborador INTEIRO (100%), para converter gap em pessoas
          const refLista = cf.length ? cf : mediaGlobal[f];
          const media = refLista.reduce((s, c) => s + capacidadeMes(c, mes, p), 0) / refLista.length;
          porFuncao[f] = bloco(cap, demandaAnualPorFuncao[f] / 12, fte, media, p, FUNCAO_CURTA[f]);
        });
        const total = somaBlocos(Object.values(porFuncao), p);
        return { mes, nome: MESES[mes], nomeLongo: MESES_LONGO[mes], diasUteis: n(p.diasUteis[mes]), total, porFuncao };
      });

      const janelaPorFuncao = {};
      FUNCOES.forEach(f => {
        const blocosMes = mesesCalc.map(m => m.porFuncao[f]);
        const cap = blocosMes.reduce((s, b) => s + b.capacidade, 0);
        const dem = blocosMes.reduce((s, b) => s + b.demanda, 0);
        const cf = colabs.filter(c => c.funcao === f);
        const fte = cf.reduce((s, c) => s + c.fracao, 0);
        const refLista = cf.length ? cf : mediaGlobal[f];
        const media = refLista.reduce((s, c) => s + meses.reduce((t, mes) => t + capacidadeMes(c, mes, p), 0), 0) / refLista.length;
        janelaPorFuncao[f] = bloco(cap, dem, fte, media, p, FUNCAO_CURTA[f]);
      });
      const janelaTotal = somaBlocos(Object.values(janelaPorFuncao), p);

      return {
        id: u.id,
        nome: u.nome,
        empresas: n(u.empresasBaixo) + n(u.empresasMedio) + n(u.empresasAlto),
        empresasPonderadas: empresasPonderadas(u, p),
        colaboradores: colabs.map(c => ({ ...capacidadeNominal(c, meses, p), fracao: c.fracao })),
        meses: mesesCalc,
        janela: { total: janelaTotal, porFuncao: janelaPorFuncao },
      };
    });

    // total geral = soma das unidades (colaboradores sem unidade ficam fora, como na spec)
    const totalMeses = meses.map((mes, i) => {
      const porFuncao = {};
      FUNCOES.forEach(f => {
        porFuncao[f] = somaBlocos(resultadoUnidades.map(u => u.meses[i].porFuncao[f]), p, FUNCAO_CURTA[f]);
      });
      return { mes, nome: MESES[mes], nomeLongo: MESES_LONGO[mes], diasUteis: n(p.diasUteis[mes]), total: somaBlocos(Object.values(porFuncao), p), porFuncao };
    });
    const totalJanelaPorFuncao = {};
    FUNCOES.forEach(f => {
      totalJanelaPorFuncao[f] = somaBlocos(resultadoUnidades.map(u => u.janela.porFuncao[f]), p, FUNCAO_CURTA[f]);
    });

    return {
      janela: { de: Math.min(de, ate), ate: Math.max(de, ate), meses },
      unidades: resultadoUnidades,
      total: { meses: totalMeses, janela: { total: somaBlocos(Object.values(totalJanelaPorFuncao), p), porFuncao: totalJanelaPorFuncao } },
      avisos: {
        docsSobDemanda,
        colabSemUnidade,
        colabParcial,
        unidadesSemColab: resultadoUnidades.filter(u => u.colaboradores.length === 0 && u.empresas > 0).map(u => u.nome),
      },
      parametros: p,
    };
  }

  /** Monta um bloco de indicadores. `media` = capacidade média por colaborador no mesmo período. */
  function bloco(capacidade, demanda, colaboradores, media, p, rotulo) {
    const capacidadePlanejavel = capacidade * (n(p.ocupacaoAlvo) / 100);
    const gap = capacidadePlanejavel - demanda;
    const gapColab = gapColaboradores(gap, media * (n(p.ocupacaoAlvo) / 100));
    return {
      capacidade,
      capacidadePlanejavel,
      demanda,
      gap,
      gapColab,
      ocupacao: capacidade > 0 ? demanda / capacidade : (demanda > 0 ? Infinity : 0),
      status: status(gap, capacidadePlanejavel),
      colaboradores,
      capacidadeMediaColab: media,
      recomendacao: recomendacao(gapColab, rotulo ? singular(rotulo) : 'colaborador'),
    };
  }

  /** Soma blocos (unidades ou funções). O gap em colaboradores é recalculado pela média ponderada. */
  function somaBlocos(blocos, p, rotulo) {
    const capacidade = blocos.reduce((s, b) => s + b.capacidade, 0);
    const demanda = blocos.reduce((s, b) => s + b.demanda, 0);
    const colaboradores = blocos.reduce((s, b) => s + b.colaboradores, 0);
    // média por colaborador inteiro: média ponderada pelas FTEs; sem gente, média das médias
    const media = colaboradores > 0
      ? blocos.reduce((s, b) => s + b.capacidadeMediaColab * b.colaboradores, 0) / colaboradores
      : (blocos.length ? blocos.reduce((s, b) => s + b.capacidadeMediaColab, 0) / blocos.length : 0);
    return bloco(capacidade, demanda, colaboradores, media, p, rotulo);
  }

  function singular(rotuloPlural) {
    if (rotuloPlural === 'Técnicos') return 'técnico';
    if (rotuloPlural === 'Administrativos') return 'administrativo';
    return 'colaborador';
  }

  /** Capacidade nominal de um colaborador (produtividade individual, sem apontamento real). */
  function capacidadeNominal(c, meses, p) {
    const hDia = horasDia(c, p);
    return {
      id: c.id,
      nome: c.nome,
      funcao: c.funcao,
      horasDia: hDia,
      horasMesEfetivas: n(c.horasMes) * (n(c.eficiencia) / 100),
      capacidadeJanela: meses.reduce((s, mes) => s + capacidadeMes(c, mes, p), 0),
    };
  }

  function normalizarParametros(p) {
    const base = p || {};
    const dias = Array.isArray(base.diasUteis) && base.diasUteis.length === 12 ? base.diasUteis.map(n) : new Array(12).fill(21);
    return {
      diasUteis: dias,
      fatorBaixo: n(base.fatorBaixo) || 1,
      fatorMedio: n(base.fatorMedio) || 1.3,
      fatorAlto: n(base.fatorAlto) || 1.6,
      diasReferencia: n(base.diasReferencia) || 20,
      ocupacaoAlvo: n(base.ocupacaoAlvo) || 85,
    };
  }

  function clampMes(v, fallback) {
    const m = Number(v);
    return Number.isInteger(m) && m >= 0 && m <= 11 ? m : fallback;
  }

  /** Demanda anual por documento numa unidade (para tabelas de detalhe). */
  function demandaPorDocumento(u, documentos, parametros) {
    const p = normalizarParametros(parametros);
    return documentos.map(d => ({
      id: d.id,
      nome: d.nome,
      responsavel: d.responsavel || FUNCOES[0],
      sobDemanda: n(d.periodicidadeMeses) <= 0,
      demandaAnual: demandaAnualDoc(u, d, p),
    }));
  }

  return {
    MESES, MESES_LONGO, FUNCOES, FUNCAO_CURTA, COLAB_PADRAO, MARGEM_ATENCAO,
    horasDia, capacidadeMes, empresasPonderadas, demandaAnualDoc, demandaPorDocumento,
    gapColaboradores, recomendacao, status, calcular, normalizarParametros,
  };
})();

// Node (testes): expõe como módulo; no navegador fica global.
if (typeof module !== 'undefined' && module.exports) module.exports = Calculo;
