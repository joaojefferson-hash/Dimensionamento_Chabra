/* ==========================================================================
   Calculo — motor de dimensionamento (modelo de produção diária)

   Funções puras sobre os cadastros; nada de DOM. Também roda em Node (testes).

   Entradas (formato do Store):
     unidades:      [{ id, nome, empresasVencidas (Mensal), empresasExclusivaTst, meses?: { [1..12]: { empresasVencidas, empresasExclusivaTst } } }]
     colaboradores: [{ id, nome, funcao, tipoProducao ('tecnico' | 'administrativo' | 'nenhuma'), chefia,
                       empresasDia, inspecoesDia, relatoriosDia, alocacoes: [{ unidadeId, percentual }] }]
                    // tipoProducao 'nenhuma' = não entra nas contas; chefia = aparece como responsável pelas unidades
     parametros:    { diasUteis[12], ocupacaoAlvo }
     simulacoes:    [{ unidadeId, grupo: 'tecnico' | 'administrativo', quantidade (≠ 0; negativa = a menos), de, ate (0..11),
                       inspecoesDia?, relatoriosDia?, empresasDia? }]   // "e se…": pessoas virtuais só nas contas
     janela:        { de: 0..11, ate: 0..11 }   (meses, inclusive)

   Modelo:
     precisa(unidade, entrega, mês) = clientes Mensal + Exclusiva TST do mês
                                      (cada um exige uma inspeção, um relatório e uma finalização)
                                 (ex.: inspeção a cada 3 meses → 1/3 das empresas por mês)
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
  // grupos de produção (tipo da função do colaborador)
  const TEC = 'tecnico';
  const ADM = 'administrativo';
  const FUNCOES = [TEC, ADM];
  const FUNCAO_CURTA = { [TEC]: 'Técnicos', [ADM]: 'Administrativos' };
  const FUNCAO_SINGULAR = { [TEC]: 'técnico', [ADM]: 'administrativo' };

  const ENTREGAS = [
    { id: 'inspecoes',  funcao: TEC, campo: 'inspecoesDia',  rotulo: 'Inspeções',            unidade: 'inspeções',            singular: 'uma inspeção' },
    { id: 'relatorios', funcao: TEC, campo: 'relatoriosDia', rotulo: 'Relatórios',           unidade: 'relatórios',           singular: 'um relatório' },
    { id: 'empresas',   funcao: ADM, campo: 'empresasDia',   rotulo: 'Empresas finalizadas', unidade: 'empresas finalizadas', singular: 'uma finalização' },
  ];
  const ENTREGAS_DA_FUNCAO = { [TEC]: ENTREGAS.filter(e => e.funcao === TEC), [ADM]: ENTREGAS.filter(e => e.funcao === ADM) };

  const COLAB_PADRAO = { empresasDia: 2, inspecoesDia: 2, relatoriosDia: 2 }; // referência quando não há ninguém na função
  const MARGEM_ATENCAO = 0.10; // sobra menor que 10% do que a equipe consegue = "no limite"

  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /* ---------- blocos elementares ---------- */

  function empresasDoMes(u, mes) {
    const exc = u.meses && u.meses[mes + 1];
    return exc
      ? { empresasVencidas: n(exc.empresasVencidas), empresasExclusivaTst: n(exc.empresasExclusivaTst), excecao: true }
      : { empresasVencidas: n(u.empresasVencidas), empresasExclusivaTst: n(u.empresasExclusivaTst), excecao: false };
  }

  /** Empresas que precisam de atendimento (Mensal + Exclusiva TST). Com `mes` (0..11) usa a quantidade daquele mês. */
  function empresasPonderadas(u, p, mes) {
    const q = mes === undefined ? u : empresasDoMes(u, mes);
    return n(q.empresasVencidas) + n(q.empresasExclusivaTst);
  }

  /** Produção de um colaborador numa entrega num mês (100% do tempo). */
  function producaoMes(colab, entrega, mes, p) {
    return n(colab[entrega.campo]) * n(p.diasUteis[mes]);
  }

  /** Quantas entregas a carteira da unidade precisa no mês (uma por empresa ponderada). */
  function precisaMes(u, entrega, mes, p) {
    return empresasPonderadas(u, p, mes);
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
   *   unidades: [{ id, nome, pessoas: {funcao: fte}, colaboradores: [{ id, nome, funcao, fracao }], chefia: [{ id, nome, funcao }],
   *                meses: [{ mes, nome, nomeLongo, diasUteis, empresas, precisa, excecao, entregas: {id: Bloco}, funcoes: {f: Resumo}, status }],
   *                janela: { nMeses, empresasMedia, precisa, precisaMedia, entregas, funcoes, status, mesesComExcecao } }],
   *   total: { pessoas, meses: [...], janela: {...}, chefia: [...] },
   *   avisos: { colabSemProducao: [], colabSemUnidade: [], colabParcial: [], unidadesSemColab: [], unidadesSemFuncao: [{unidade, funcao}] },
   *   parametros: p
   * }
   */
  function calcular({ unidades = [], colaboradores = [], parametros, janela, simulacoes = [] }) {
    const p = normalizarParametros(parametros);
    const de = clampMes(janela && janela.de, 0);
    const ate = clampMes(janela && janela.ate, 11);
    const meses = [];
    for (let m = Math.min(de, ate); m <= Math.max(de, ate); m++) meses.push(m);

    const idsUnidades = new Set(unidades.map(u => u.id));
    const alocValidas = c => (c.alocacoes || []).filter(a => a && idsUnidades.has(a.unidadeId) && n(a.percentual) > 0);
    const fracaoEm = (c, unidadeId) => alocValidas(c).filter(a => a.unidadeId === unidadeId).reduce((s, a) => s + n(a.percentual), 0) / 100;
    // simulações viram pessoas virtuais (quantidade inteira, podendo ser negativa) ativas só em alguns meses
    const simulados = colaboradoresSimulados(simulacoes).filter(c => idsUnidades.has(c.unidadeId));
    const ativoNoMes = (c, mes) => !c.mesesAtivos || c.mesesAtivos.includes(mes);
    // quem não produz fica fora das contas; se for chefia, aparece como responsável pelas unidades
    const chefes = colaboradores.filter(c => c.chefia)
      .map(c => ({ id: c.id, nome: c.nome, funcao: c.funcao || '', coordena: c.coordena || 'todos', ordem: n(c.funcaoOrdem) || 9999, unidades: alocValidas(c).map(a => a.unidadeId) }))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')); // chefia mais alta primeiro (ordem do cadastro de funções)
    const colabSemProducao = colaboradores.filter(c => !FUNCOES.includes(c.tipoProducao) && !c.chefia).map(c => `${c.nome}${c.funcao ? ' (' + c.funcao + ')' : ''}`);
    const produtivos = colaboradores.filter(c => FUNCOES.includes(c.tipoProducao));
    const produtivosESimulados = produtivos.concat(simulados);
    const colabSemUnidade = colaboradores.filter(c => (FUNCOES.includes(c.tipoProducao) || c.chefia) && alocValidas(c).length === 0).map(c => c.nome);
    const colabParcial = produtivos
      .map(c => ({ nome: c.nome, pct: alocValidas(c).reduce((s, a) => s + n(a.percentual), 0) }))
      .filter(x => x.pct > 0 && x.pct < 99.999)
      .map(x => `${x.nome} (${Math.round(x.pct)}%)`);

    // referência de "uma pessoa inteira" por grupo: os da unidade; senão, os da equipe; senão, o padrão
    const globalPorFuncao = {};
    FUNCOES.forEach(f => { const l = produtivos.filter(c => c.tipoProducao === f); globalPorFuncao[f] = l.length ? l : [COLAB_PADRAO]; });

    const calcUnidade = u => {
      const colabs = produtivosESimulados
        .map(c => ({ ...c, fracao: c.simulado ? (c.unidadeId === u.id ? c.quantidade : 0) : fracaoEm(c, u.id) }))
        .filter(c => c.fracao !== 0);
      const porFuncao = {};
      FUNCOES.forEach(f => { porFuncao[f] = colabs.filter(c => c.tipoProducao === f); });
      const pessoas = {}, pessoasSimuladas = {};
      FUNCOES.forEach(f => {
        pessoas[f] = porFuncao[f].filter(c => !c.simulado).reduce((s, c) => s + c.fracao, 0);          // pessoas reais
        pessoasSimuladas[f] = porFuncao[f].filter(c => c.simulado).reduce((s, c) => s + c.fracao, 0);  // saldo simulado (pode ser negativo)
      });

      const mesesCalc = meses.map(mes => {
        const q = empresasDoMes(u, mes);
        const precisa = empresasPonderadas(u, p, mes);
        const entregas = {};
        const pessoasMes = {};
        FUNCOES.forEach(f => { pessoasMes[f] = Math.max(0, porFuncao[f].filter(c => ativoNoMes(c, mes)).reduce((s, c) => s + c.fracao, 0)); });
        ENTREGAS.forEach(e => {
          const cf = porFuncao[e.funcao].filter(c => ativoNoMes(c, mes));
          // desligamento simulado além do que existe não fica negativo: a equipe vai a zero
          const consegueMax = Math.max(0, cf.reduce((s, c) => s + producaoMes(c, e, mes, p) * c.fracao, 0));
          const presentes = cf.filter(c => c.fracao > 0);
          const ref = presentes.length ? presentes : globalPorFuncao[e.funcao];
          const producaoPessoaMax = ref.reduce((s, c) => s + producaoMes(c, e, mes, p), 0) / ref.length;
          entregas[e.id] = bloco(precisaMes(u, e, mes, p), consegueMax, pessoasMes[e.funcao], producaoPessoaMax, p);
        });
        const funcoes = {};
        FUNCOES.forEach(f => { funcoes[f] = resumoFuncao(f, entregas); });
        return {
          mes, nome: MESES[mes], nomeLongo: MESES_LONGO[mes], diasUteis: n(p.diasUteis[mes]),
          empresas: q.empresasVencidas + q.empresasExclusivaTst, precisa, excecao: q.excecao,
          pessoas: pessoasMes,
          entregas, funcoes, status: piorStatus(FUNCOES.map(f => funcoes[f].status)),
        };
      });

      return {
        id: u.id, nome: u.nome, pessoas, pessoasSimuladas,
        colaboradores: colabs.filter(c => !c.simulado).map(c => ({ id: c.id, nome: c.nome, funcao: c.funcao, tipoProducao: c.tipoProducao, fracao: c.fracao })),
        chefia: chefes.filter(ch => ch.unidades.includes(u.id)).map(ch => ({ id: ch.id, nome: ch.nome, funcao: ch.funcao, coordena: ch.coordena })),
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
      const pessoasMes = {};
      FUNCOES.forEach(f => { pessoasMes[f] = linhas.reduce((s, l) => s + l.pessoas[f], 0); });
      return {
        mes, nome: MESES[mes], nomeLongo: MESES_LONGO[mes], diasUteis: n(p.diasUteis[mes]),
        empresas: linhas.reduce((s, l) => s + l.empresas, 0), precisa: linhas.reduce((s, l) => s + l.precisa, 0), excecao: linhas.some(l => l.excecao),
        pessoas: pessoasMes,
        entregas, funcoes, status: piorStatus(FUNCOES.map(f => funcoes[f].status)),
      };
    });
    const pessoasTotal = {}, pessoasSimuladasTotal = {};
    FUNCOES.forEach(f => {
      pessoasTotal[f] = resultadoUnidades.reduce((s, u) => s + u.pessoas[f], 0);
      pessoasSimuladasTotal[f] = resultadoUnidades.reduce((s, u) => s + u.pessoasSimuladas[f], 0);
    });

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
      total: { pessoas: pessoasTotal, pessoasSimuladas: pessoasSimuladasTotal, meses: totalMeses, janela: totalJanela, chefia: chefes.map(ch => ({ id: ch.id, nome: ch.nome, funcao: ch.funcao, coordena: ch.coordena })) },
      simulacao: simulados.length > 0,
      avisos: {
        colabSemProducao,
        colabSemUnidade,
        colabParcial,
        unidadesSemColab: resultadoUnidades.filter(u => u.colaboradores.length === 0 && u.janela.precisa > 0).map(u => u.nome),
        unidadesSemFuncao: resultadoUnidades.flatMap(u => FUNCOES.filter(f => u.pessoas[f] === 0 && u.janela.precisa > 0 && u.colaboradores.length > 0).map(f => ({ unidade: u.nome, funcao: f }))),
      },
      parametros: p,
    };
  }

  /**
   * Transforma simulações em pessoas virtuais: quantidade inteira (positiva = a mais,
   * negativa = a menos) numa unidade e num grupo, ativas só entre `de` e `ate`.
   * Ritmo por dia: o informado ou o padrão.
   */
  function colaboradoresSimulados(simulacoes) {
    return (simulacoes || [])
      .filter(s => s && FUNCOES.includes(s.grupo) && s.unidadeId && Math.round(n(s.quantidade)) !== 0)
      .map((s, i) => {
        const de = clampMes(s.de, 0), ate = clampMes(s.ate, 11);
        const mesesAtivos = [];
        for (let m = Math.min(de, ate); m <= Math.max(de, ate); m++) mesesAtivos.push(m);
        return {
          id: `sim-${i}`, nome: `Simulação ${i + 1}`, simulado: true, chefia: false,
          tipoProducao: s.grupo, unidadeId: s.unidadeId, quantidade: Math.round(n(s.quantidade)), mesesAtivos,
          inspecoesDia: s.inspecoesDia == null ? COLAB_PADRAO.inspecoesDia : Math.max(0, n(s.inspecoesDia)),
          relatoriosDia: s.relatoriosDia == null ? COLAB_PADRAO.relatoriosDia : Math.max(0, n(s.relatoriosDia)),
          empresasDia: s.empresasDia == null ? COLAB_PADRAO.empresasDia : Math.max(0, n(s.empresasDia)),
          alocacoes: [],
        };
      });
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
      const pessoas = blocos.length ? blocos.reduce((s, b) => s + b.pessoas, 0) / blocos.length : 0; // média (a simulação pode mudar por mês)
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
      ocupacaoAlvo: n(base.ocupacaoAlvo) || 85,
    };
  }

  function clampMes(v, fallback) {
    const m = Number(v);
    return Number.isInteger(m) && m >= 0 && m <= 11 ? m : fallback;
  }

  /** Texto do ritmo diário de um colaborador ("2 inspeções · 2 relatórios por dia"; "sem produção" para quem não produz). */
  function ritmoTexto(c) {
    const f = v => (Number.isInteger(n(v)) ? String(n(v)) : n(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
    const tipo = c.tipoProducao;
    if (!FUNCOES.includes(tipo)) return 'sem produção';
    return ENTREGAS_DA_FUNCAO[tipo].map(e => `${f(c[e.campo])} ${e.unidade}`).join(' · ') + ' por dia';
  }

  /* ---------- fila de atendimento (backlog) ----------
     O que não é atendido num mês passa para o seguinte. Roda em cima do resultado de
     calcular() para o ano inteiro (janela 0..11), por unidade e por grupo:
       fila no início do mês + entram no mês − atendidas (limitado ao que a equipe consegue) = fila no fim
     Situação do mês: ok = fila zerada; atenção = sobrou menos de um mês de entrada;
     precisa contratar = sobrou mais de um mês de entrada (prazo em risco).
     Resumo (a partir do mês atual, dentro do prazo em meses):
       faltaPrazo = fila hoje + entradas do prazo − o que a equipe consegue no prazo
       pessoasPrazo = pessoas a contratar para zerar isso dentro do prazo
     ---------------------------------------------------- */

  function fila(resultado, { mesAtual = 0, prazoMeses = 2 } = {}) {
    const t = clampMes(mesAtual, 0);
    const pm = Math.max(1, Math.round(n(prazoMeses)) || 1);
    const nomeMes = i => MESES_LONGO[i];

    const filaGrupo = (item, f) => {
      const entregas = ENTREGAS_DA_FUNCAO[f];
      let pend = 0;
      const meses = item.meses.map(m => {
        // entrega gargalo do grupo no mês (técnicos: inspeções ou relatórios, a menor)
        const gargaloEntrega = entregas.reduce((a, b) => (m.entregas[b.id].consegue < m.entregas[a.id].consegue ? b : a));
        const gargalo = m.entregas[gargaloEntrega.id];
        const entram = n(m.precisa);
        const consegue = Math.max(0, n(gargalo.consegue));
        const filaInicio = pend;
        const atendidas = Math.min(filaInicio + entram, consegue);
        const filaFim = Math.max(0, filaInicio + entram - atendidas);
        pend = filaFim;
        const producaoDiaPor = {};
        entregas.forEach(e => { producaoDiaPor[e.id] = m.diasUteis > 0 ? Math.max(0, n(m.entregas[e.id].consegue)) / m.diasUteis : 0; });
        return {
          mes: m.mes, nome: m.nome, nomeLongo: m.nomeLongo, diasUteis: m.diasUteis,
          entram, filaInicio, consegue, atendidas, filaFim,
          pessoas: n(m.pessoas[f]), producaoPessoa: n(gargalo.producaoPessoa),
          producaoDia: m.diasUteis > 0 ? consegue / m.diasUteis : 0,
          producaoDiaPor, gargaloId: gargaloEntrega.id,
          status: filaFim <= 1e-9 ? 'ok' : filaFim <= entram + 1e-9 ? 'atencao' : 'deficit',
        };
      });
      return { meses, resumo: resumoFila(meses, f) };
    };

    const resumoFila = (meses, f) => {
      const hoje = meses[t];
      const prazo = meses.slice(t, Math.min(12, t + pm));
      const filaHoje = hoje ? hoje.filaInicio : 0;
      const entramPrazo = prazo.reduce((s, m) => s + m.entram, 0);
      const conseguePrazo = prazo.reduce((s, m) => s + m.consegue, 0);
      const producaoPessoaPrazo = prazo.reduce((s, m) => s + m.producaoPessoa, 0);
      const faltaPrazo = Math.max(0, filaHoje + entramPrazo - conseguePrazo);
      const pessoasPrazo = faltaPrazo > 1e-9 && producaoPessoaPrazo > 0 ? Math.ceil(faltaPrazo / producaoPessoaPrazo - 1e-9) : 0;
      const sobraPrazo = Math.max(0, conseguePrazo - (filaHoje + entramPrazo));
      const pessoasSobram = sobraPrazo > 1e-9 && producaoPessoaPrazo > 0 ? Math.floor(sobraPrazo / producaoPessoaPrazo + 1e-9) : 0;
      const zeraIdx = meses.findIndex((m, i) => i >= t && m.filaFim <= 1e-9);
      const entramResto = meses.slice(t).reduce((s, m) => s + m.entram, 0);
      return {
        funcao: f, mesAtual: t, prazoMeses: pm,
        filaHoje, entramHoje: hoje ? hoje.entram : 0, entramPrazo, conseguePrazo, faltaPrazo, pessoasPrazo, pessoasSobram,
        entramResto, filaDezembro: meses[11].filaFim,
        zeraEm: zeraIdx >= 0 ? zeraIdx : null, zeraEmNome: zeraIdx >= 0 ? nomeMes(zeraIdx) : null,
        pessoas: hoje ? hoje.pessoas : 0, producaoDia: hoje ? hoje.producaoDia : 0,
        producaoDiaPor: hoje ? hoje.producaoDiaPor : {}, gargaloId: hoje ? hoje.gargaloId : null,
        status: piorStatus(meses.slice(t).map(m => m.status)),
      };
    };

    const unidades = resultado.unidades.map(u => {
      const grupos = {};
      FUNCOES.forEach(f => { grupos[f] = filaGrupo(u, f); });
      return { id: u.id, nome: u.nome, grupos };
    });

    // total = soma das unidades (a fila de uma unidade não é atendida pela equipe de outra)
    const grupos = {};
    FUNCOES.forEach(f => {
      const meses = resultado.total.meses.map((m, i) => {
        const partes = unidades.map(u => u.grupos[f].meses[i]);
        const soma = campo => partes.reduce((s, x) => s + x[campo], 0);
        const filaFim = soma('filaFim'), entram = soma('entram');
        const producaoDiaPor = {};
        ENTREGAS_DA_FUNCAO[f].forEach(e => { producaoDiaPor[e.id] = partes.reduce((s, x) => s + (x.producaoDiaPor[e.id] || 0), 0); });
        const gargaloId = ENTREGAS_DA_FUNCAO[f].reduce((a, b) => (producaoDiaPor[b.id] < producaoDiaPor[a.id] ? b : a)).id;
        return {
          mes: m.mes, nome: m.nome, nomeLongo: m.nomeLongo, diasUteis: m.diasUteis,
          entram, filaInicio: soma('filaInicio'), consegue: soma('consegue'), atendidas: soma('atendidas'), filaFim,
          pessoas: soma('pessoas'), producaoPessoa: soma('producaoPessoa') / Math.max(1, partes.length), producaoDia: soma('producaoDia'),
          producaoDiaPor, gargaloId,
          status: partes.length ? piorStatus(partes.map(x => x.status)) : 'ok',
        };
      });
      const resumo = resumoFila(meses, f);
      // pessoas a contratar no total = soma das unidades (folga numa não cobre fila de outra)
      resumo.pessoasPrazo = unidades.reduce((s, u) => s + u.grupos[f].resumo.pessoasPrazo, 0);
      resumo.pessoasSobram = unidades.reduce((s, u) => s + u.grupos[f].resumo.pessoasSobram, 0);
      resumo.faltaPrazo = unidades.reduce((s, u) => s + u.grupos[f].resumo.faltaPrazo, 0);
      grupos[f] = { meses, resumo };
    });

    return { mesAtual: t, prazoMeses: pm, unidades, total: { grupos } };
  }

  return {
    MESES, MESES_LONGO, TEC, ADM, FUNCOES, FUNCAO_CURTA, FUNCAO_SINGULAR, ENTREGAS, ENTREGAS_DA_FUNCAO, COLAB_PADRAO, MARGEM_ATENCAO, colaboradoresSimulados,
    empresasDoMes, empresasPonderadas, producaoMes, precisaMes, calcular, fila, normalizarParametros, ritmoTexto, piorStatus,
  };
})();

// Node (testes): expõe como módulo; no navegador fica global.
if (typeof module !== 'undefined' && module.exports) module.exports = Calculo;
