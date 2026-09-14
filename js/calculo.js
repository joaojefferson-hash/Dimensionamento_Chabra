/* ==========================================================================
   Calculo — motor de dimensionamento (modelo de produção diária)

   Funções puras sobre os cadastros; nada de DOM. Também roda em Node (testes).

   Entradas (formato do Store):
     unidades:      [{ id, nome, empresasBaixo, empresasMedio, empresasAlto, meses?: { [1..12]: {...} } }]
     colaboradores: [{ id, nome, funcao, empresasDia, inspecoesDia, relatoriosDia, alocacoes: [{ unidadeId, percentual }] }]
     parametros:    { diasUteis[12], fatorBaixo, fatorMedio, fatorAlto, ocupacaoAlvo }
     janela:        { de: 0..11, ate: 0..11 }   (meses, inclusive)

   Modelo:
     precisa(unidade, mês)     = empresas do mês ponderadas pelo peso do grau
                                 (cada empresa da carteira precisa, no mês, de 1 inspeção,
                                  1 relatório e 1 finalização administrativa)
     produção(colab, entrega, mês) = valor_por_dia × dias úteis do mês × fração alocada na unidade
     consegue(unidade, entrega, mês) = Σ produção × (ocupaçãoAlvo/100)   ← folga para imprevistos
     sobra = consegue − precisa  (negativa = falta)
     pessoas que faltam/sobram = sobra ÷ produção de uma pessoa inteira no período

   Entregas: técnicos → inspeções e relatórios; administrativos → empresas finalizadas.
   A situação de uma função é a pior entre as suas entregas; a da unidade, a pior das funções.
   ========================================================================== */

const Calculo = (() => {
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const TEC = 'Técnico de Segurança do Trabalho';
  const ADM = 'Administrativo';
  const FUNCOES = [TEC, ADM];
  const FUNCAO_CURTA = { [TEC]: 'Técnicos', [ADM]: 'Administrativos' };
  const FUNCAO_SINGULAR = { [TEC]: 'técnico', [ADM]: 'administrativo' };

  const ENTREGAS = [
    { id: 'inspecoes',  funcao: TEC, campo: 'inspecoesDia',  rotulo: 'Inspeções',            unidade: 'inspeções' },
    { id: 'relatorios', funcao: TEC, campo: 'relatoriosDia', rotulo: 'Relatórios',           unidade: 'relatórios' },
    { id: 'empresas',   funcao: ADM, campo: 'empresasDia',   rotulo: 'Empresas finalizadas', unidade: 'empresas finalizadas' },
  ];
  const ENTREGAS_DA_FUNCAO = { [TEC]: ENTREGAS.filter(e => e.funcao === TEC), [ADM]: ENTREGAS.filter(e => e.funcao === ADM) };

  const COLAB_PADRAO = { empresasDia: 2, inspecoesDia: 2, relatoriosDia: 2 }; // referência quando não há ninguém na função
  const MARGEM_ATENCAO = 0.10; // sobra menor que 10% do que a equipe consegue = "no limite"

  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /* ---------- blocos elementares ---------- */

  function empresasDoMes(u, mes) {
    const exc = u.meses && u.meses[mes + 1];
    return exc
      ? { empresasBaixo: n(exc.empresasBaixo), empresasMedio: n(exc.empresasMedio), empresasAlto: n(exc.empresasAlto), excecao: true }
      : { empresasBaixo: n(u.empresasBaixo), empresasMedio: n(u.empresasMedio), empresasAlto: n(u.empresasAlto), excecao: false };
  }

  /** Empresas ponderadas pelo peso do grau. Com `mes` (0..11) usa a quantidade daquele mês. */
  function empresasPonderadas(u, p, mes) {
    const q = mes === undefined ? u : empresasDoMes(u, mes);
    return n(q.empresasBaixo) * n(p.fatorBaixo) + n(q.empresasMedio) * n(p.fatorMedio) + n(q.empresasAlto) * n(p.fatorAlto);
  }

  /** Produção de um colaborador numa entrega num mês (100% do tempo). */
  function producaoMes(colab, entrega, mes, p) {
    return n(colab[entrega.campo]) * n(p.diasUteis[mes]);
  }

  function status(sobra, consegue) {
    if (sobra < -1e-9) return 'deficit';
    if (consegue > 0 && sobra < consegue * MARGEM_ATENCAO) return 'atencao';
    return 'ok';
  }

  const PIOR = { deficit: 3, atencao: 2, ok: 1 };
  const piorStatus = lista => lista.reduce((acc, s) => (PIOR[s] > PIOR[acc] ? s : acc), 'ok');

  /* ---------- montagem ---------- */

  /**
   * Bloco de uma entrega num período.
   *   precisa, consegue (já com a folga aplicada), consegueMax, sobra, status,
   *   pessoas (FTE alocadas), producaoPessoa (uma pessoa inteira, com folga),
   *   faltam (nº inteiro de pessoas a contratar), sobram (nº inteiro de pessoas de folga)
   */
  function bloco(precisa, consegueMax, pessoas, producaoPessoaMax, p) {
    const alvo = n(p.ocupacaoAlvo) / 100;
    const consegue = consegueMax * alvo;
    const producaoPessoa = producaoPessoaMax * alvo;
    const sobra = consegue - precisa;
    const pessoasEquivalentes = producaoPessoa > 0 ? sobra / producaoPessoa : 0;
    return {
      precisa, consegue, consegueMax, sobra,
      status: status(sobra, consegue),
      pessoas,
      producaoPessoa,
      pessoasEquivalentes,
      faltam: sobra < -1e-9 ? Math.ceil(-pessoasEquivalentes - 1e-9) : 0,
      sobram: sobra > 1e-9 ? Math.floor(pessoasEquivalentes + 1e-9) : 0,
    };
  }

  /** Resumo de uma função a partir das suas entregas: pior situação, maior falta, menor sobra. */
  function resumoFuncao(funcao, entregas) {
    const lista = ENTREGAS_DA_FUNCAO[funcao].map(e => entregas[e.id]);
    const st = piorStatus(lista.map(b => b.status));
    const faltam = Math.max(...lista.map(b => b.faltam));
    const sobram = Math.min(...lista.map(b => b.sobram));
    const limitante = lista.reduce((a, b) => (b.sobra < a.sobra ? b : a)); // entrega que limita
    const pessoas = lista[0].pessoas;
    return {
      funcao, status: st, faltam, sobram, pessoas,
      atendeEmpresas: Math.min(...lista.map(b => b.consegue)), // empresas que a função dá conta no período
      precisa: limitante.precisa,
      limitante: ENTREGAS_DA_FUNCAO[funcao].find(e => entregas[e.id] === limitante),
      sobraEmpresas: limitante.sobra,
      recomendacao: recomendacao(funcao, st, faltam, sobram, pessoas),
    };
  }

  /** Frase de recomendação em linguagem simples. */
  function recomendacao(funcao, st, faltam, sobram, pessoas) {
    const rot = FUNCAO_CURTA[funcao].toLowerCase();
    const sing = FUNCAO_SINGULAR[funcao];
    const plural = q => (q === 1 ? sing : sing + 's');
    if (st === 'deficit') {
      const q = Math.max(1, faltam);
      return { tipo: 'contratar', quantidade: q, texto: pessoas > 0
        ? `Faltam aproximadamente ${q} ${plural(q)} para dar conta da demanda.`
        : `Não há ${rot} alocados aqui: seriam necessários aproximadamente ${q} ${plural(q)}.` };
    }
    if (st === 'atencao') return { tipo: 'limite', quantidade: 0, texto: `Os ${rot} dão conta, mas estão no limite.` };
    if (sobram >= 1) return { tipo: 'folga', quantidade: sobram, texto: `Os ${rot} dão conta com folga — sobra o equivalente a ${sobram} ${plural(sobram)}.` };
    return { tipo: 'adequado', quantidade: 0, texto: `Os ${rot} dão conta da demanda.` };
  }

  /**
   * Calcula tudo para a janela. Retorna:
   * {
   *   janela: { de, ate, meses: [idx...] },
   *   unidades: [{ id, nome, pessoas: {funcao: fte}, colaboradores: [{ id, nome, funcao, fracao }],
   *                meses: [{ mes, nome, nomeLongo, diasUteis, empresas, precisa, excecao, entregas: {id: Bloco}, funcoes: {f: Resumo}, status }],
   *                janela: { nMeses, empresasMedia, precisa, precisaMedia, entregas, funcoes, status, mesesComExcecao } }],
   *   total: { pessoas, meses: [...], janela: {...} },
   *   avisos: { colabSemUnidade: [], colabParcial: [], unidadesSemColab: [], unidadesSemFuncao: [{unidade, funcao}] },
   *   parametros: p
   * }
   */
  function calcular({ unidades = [], colaboradores = [], parametros, janela }) {
    const p = normalizarParametros(parametros);
    const de = clampMes(janela && janela.de, 0);
    const ate = clampMes(janela && janela.ate, 11);
    const meses = [];
    for (let m = Math.min(de, ate); m <= Math.max(de, ate); m++) meses.push(m);

    const idsUnidades = new Set(unidades.map(u => u.id));
    const alocValidas = c => (c.alocacoes || []).filter(a => a && idsUnidades.has(a.unidadeId) && n(a.percentual) > 0);
    const fracaoEm = (c, unidadeId) => alocValidas(c).filter(a => a.unidadeId === unidadeId).reduce((s, a) => s + n(a.percentual), 0) / 100;
    const colabSemUnidade = colaboradores.filter(c => alocValidas(c).length === 0).map(c => c.nome);
    const colabParcial = colaboradores
      .map(c => ({ nome: c.nome, pct: alocValidas(c).reduce((s, a) => s + n(a.percentual), 0) }))
      .filter(x => x.pct > 0 && x.pct < 99.999)
      .map(x => `${x.nome} (${Math.round(x.pct)}%)`);

    // referência de "uma pessoa inteira" por função: os da unidade; senão, os da equipe; senão, o padrão
    const globalPorFuncao = {};
    FUNCOES.forEach(f => { const l = colaboradores.filter(c => c.funcao === f); globalPorFuncao[f] = l.length ? l : [COLAB_PADRAO]; });

    const calcUnidade = u => {
      const colabs = colaboradores.map(c => ({ ...c, fracao: fracaoEm(c, u.id) })).filter(c => c.fracao > 0);
      const porFuncao = {};
      FUNCOES.forEach(f => { porFuncao[f] = colabs.filter(c => c.funcao === f); });
      const pessoas = {};
      FUNCOES.forEach(f => { pessoas[f] = porFuncao[f].reduce((s, c) => s + c.fracao, 0); });

      const mesesCalc = meses.map(mes => {
        const q = empresasDoMes(u, mes);
        const precisa = empresasPonderadas(u, p, mes);
        const entregas = {};
        ENTREGAS.forEach(e => {
          const cf = porFuncao[e.funcao];
          const consegueMax = cf.reduce((s, c) => s + producaoMes(c, e, mes, p) * c.fracao, 0);
          const ref = cf.length ? cf : globalPorFuncao[e.funcao];
          const producaoPessoaMax = ref.reduce((s, c) => s + producaoMes(c, e, mes, p), 0) / ref.length;
          entregas[e.id] = bloco(precisa, consegueMax, pessoas[e.funcao], producaoPessoaMax, p);
        });
        const funcoes = {};
        FUNCOES.forEach(f => { funcoes[f] = resumoFuncao(f, entregas); });
        return {
          mes, nome: MESES[mes], nomeLongo: MESES_LONGO[mes], diasUteis: n(p.diasUteis[mes]),
          empresas: q.empresasBaixo + q.empresasMedio + q.empresasAlto, precisa, excecao: q.excecao,
          entregas, funcoes, status: piorStatus(FUNCOES.map(f => funcoes[f].status)),
        };
      });

      return {
        id: u.id, nome: u.nome, pessoas,
        colaboradores: colabs.map(c => ({ id: c.id, nome: c.nome, funcao: c.funcao, fracao: c.fracao })),
        meses: mesesCalc,
        janela: consolidar(mesesCalc, p),
      };
    };

    const resultadoUnidades = unidades.map(calcUnidade);

    // total = soma das unidades, mês a mês
    const alvo = n(p.ocupacaoAlvo) / 100 || 1;
    const totalMeses = meses.map((mes, i) => {
      const linhas = resultadoUnidades.map(u => u.meses[i]);
      const entregas = {};
      ENTREGAS.forEach(e => {
        const blocos = linhas.map(l => l.entregas[e.id]);
        const pessoas = blocos.reduce((s, b) => s + b.pessoas, 0);
        const consegueMax = blocos.reduce((s, b) => s + b.consegueMax, 0);
        const precisa = blocos.reduce((s, b) => s + b.precisa, 0);
        // produção de uma pessoa inteira: média ponderada pelas pessoas; sem gente, média das referências
        const prodMax = pessoas > 0
          ? blocos.reduce((s, b) => s + (b.producaoPessoa / alvo) * b.pessoas, 0) / pessoas
          : (blocos.length ? blocos.reduce((s, b) => s + b.producaoPessoa / alvo, 0) / blocos.length : 0);
        entregas[e.id] = bloco(precisa, consegueMax, pessoas, prodMax, p);
      });
      const funcoes = {};
      FUNCOES.forEach(f => { funcoes[f] = resumoFuncao(f, entregas); });
      return {
        mes, nome: MESES[mes], nomeLongo: MESES_LONGO[mes], diasUteis: n(p.diasUteis[mes]),
        empresas: linhas.reduce((s, l) => s + l.empresas, 0), precisa: linhas.reduce((s, l) => s + l.precisa, 0), excecao: linhas.some(l => l.excecao),
        entregas, funcoes, status: piorStatus(FUNCOES.map(f => funcoes[f].status)),
      };
    });
    const pessoasTotal = {};
    FUNCOES.forEach(f => { pessoasTotal[f] = resultadoUnidades.reduce((s, u) => s + u.pessoas[f], 0); });

    // No total, faltas e sobras são a SOMA das unidades (folga numa unidade não cobre falta em outra)
    // e a situação é a pior entre as unidades.
    const somarUnidades = (alvoTotal, pegar) => {
      FUNCOES.forEach(f => {
        const partes = resultadoUnidades.map(u => pegar(u).funcoes[f]);
        if (!partes.length) return;
        const r = alvoTotal.funcoes[f];
        r.faltam = partes.reduce((s, x) => s + x.faltam, 0);
        r.sobram = partes.reduce((s, x) => s + x.sobram, 0);
        r.status = piorStatus(partes.map(x => x.status));
        r.recomendacao = recomendacao(f, r.status, r.faltam, r.sobram, r.pessoas);
      });
      alvoTotal.status = piorStatus(FUNCOES.map(f => alvoTotal.funcoes[f].status));
    };
    totalMeses.forEach((m, i) => somarUnidades(m, u => u.meses[i]));
    const totalJanela = consolidar(totalMeses, p);
    somarUnidades(totalJanela, u => u.janela);

    return {
      janela: { de: Math.min(de, ate), ate: Math.max(de, ate), meses },
      unidades: resultadoUnidades,
      total: { pessoas: pessoasTotal, meses: totalMeses, janela: totalJanela },
      avisos: {
        colabSemUnidade,
        colabParcial,
        unidadesSemColab: resultadoUnidades.filter(u => u.colaboradores.length === 0 && u.janela.precisa > 0).map(u => u.nome),
        unidadesSemFuncao: resultadoUnidades.flatMap(u => FUNCOES.filter(f => u.pessoas[f] === 0 && u.janela.precisa > 0 && u.colaboradores.length > 0).map(f => ({ unidade: u.nome, funcao: f }))),
      },
      parametros: p,
    };
  }

  /** Consolida uma lista de meses (de uma unidade ou do total) na janela. */
  function consolidar(mesesCalc, p) {
    const nMeses = Math.max(1, mesesCalc.length);
    const alvo = n(p.ocupacaoAlvo) / 100 || 1;
    const entregas = {};
    ENTREGAS.forEach(e => {
      const blocos = mesesCalc.map(m => m.entregas[e.id]);
      const precisa = blocos.reduce((s, b) => s + b.precisa, 0);
      const consegueMax = blocos.reduce((s, b) => s + b.consegueMax, 0);
      const producaoPessoaMax = blocos.reduce((s, b) => s + b.producaoPessoa / alvo, 0);
      const pessoas = blocos.length ? blocos[0].pessoas : 0;
      const b = bloco(precisa, consegueMax, pessoas, producaoPessoaMax, p);
      entregas[e.id] = { ...b, porMes: { precisa: precisa / nMeses, consegue: b.consegue / nMeses } };
    });
    const funcoes = {};
    FUNCOES.forEach(f => { funcoes[f] = resumoFuncao(f, entregas); });
    return {
      nMeses,
      empresasMedia: mesesCalc.reduce((s, m) => s + m.empresas, 0) / nMeses,
      precisa: mesesCalc.reduce((s, m) => s + m.precisa, 0),
      precisaMedia: mesesCalc.reduce((s, m) => s + m.precisa, 0) / nMeses,
      mesesComExcecao: mesesCalc.filter(m => m.excecao).length,
      entregas, funcoes,
      status: piorStatus(FUNCOES.map(f => funcoes[f].status)),
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
      ocupacaoAlvo: n(base.ocupacaoAlvo) || 85,
    };
  }

  function clampMes(v, fallback) {
    const m = Number(v);
    return Number.isInteger(m) && m >= 0 && m <= 11 ? m : fallback;
  }

  /** Texto do ritmo diário de um colaborador ("2 inspeções · 2 relatórios por dia"). */
  function ritmoTexto(c) {
    const f = v => (Number.isInteger(n(v)) ? String(n(v)) : n(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
    return ENTREGAS_DA_FUNCAO[c.funcao === ADM ? ADM : TEC]
      .map(e => `${f(c[e.campo])} ${e.unidade}`)
      .join(' · ') + ' por dia';
  }

  return {
    MESES, MESES_LONGO, TEC, ADM, FUNCOES, FUNCAO_CURTA, FUNCAO_SINGULAR, ENTREGAS, ENTREGAS_DA_FUNCAO, COLAB_PADRAO, MARGEM_ATENCAO,
    empresasDoMes, empresasPonderadas, producaoMes, calcular, normalizarParametros, ritmoTexto, piorStatus,
  };
})();

// Node (testes): expõe como módulo; no navegador fica global.
if (typeof module !== 'undefined' && module.exports) module.exports = Calculo;
