/* GERADO por scripts/sync-engine.mjs a partir de ../../js/calculo.js — não edite aqui. */
/* ==========================================================================
   Calculo — motor de dimensionamento (modelo de produção diária)

   Funções puras sobre os cadastros; nada de DOM. Também roda em Node (testes).

   Entradas (formato do Store):
     unidades:      [{ id, nome, meses?: { [1..12]: { empresasVencidas, empresasExclusivaTst,
                                                     demanda?: { mensal: { P, M, G… }, exclusiva_tst: { … } } } } }]
                    // empresasVencidas/ExclusivaTst = contagens (Σ dos portes); demanda = por porte (o motor pondera)
     colaboradores: [{ id, nome, funcao, tipoProducao ('tecnico' | 'administrativo' | 'nenhuma'), chefia,
                       empresasDia, inspecoesDia, relatoriosDia, alocacoes: [{ unidadeId, percentual }],
                       dataAdmissao? ('AAAA-MM-DD'), dataDesligamento?, custoMensal?, funcaoCustoMensal? }]
                    // tipoProducao 'nenhuma' = não entra nas contas; chefia = aparece como responsável pelas unidades
     parametros:    { diasUteis[12], ocupacaoAlvo, rampup?: [50, 80], pesosPorte?: { P: 1, M: 1.5, G: 2 } }
     simulacoes:    [{ unidadeId, grupo: 'tecnico' | 'administrativo', quantidade (≠ 0; negativa = a menos), de, ate (0..11),
                       inspecoesDia?, relatoriosDia?, empresasDia?, custoMensal? }]   // "e se…": pessoas virtuais só nas contas
     janela:        { de: 0..11, ate: 0..11 }   (meses, inclusive)
     ano:           ano dos meses calculados (para admissão/desligamento e ramp-up; padrão = ano corrente)

   Modelo:
     precisa(unidade, entrega, mês) = Σ clientes que vencem no mês × peso do porte (P 1,0 · M 1,5 · G 2,0)
                                      (cada um exige uma inspeção, um relatório e uma finalização)
     produção(colab, entrega, mês) = valor_por_dia × dias úteis do mês × fração alocada na unidade
                                     × presença no mês (admissão/desligamento, proporcional aos dias)
                                     × ramp-up (1º mês de casa rampup[0]%, 2º rampup[1]%…, depois 100%)
     consegue(unidade, entrega, mês) = Σ produção × (ocupaçãoAlvo/100)   ← folga para imprevistos
     sobra = consegue − precisa  (negativa = falta)
     pessoas que faltam/sobram = sobra ÷ produção de uma pessoa inteira (veterana) no período
     custo: por função, custo médio mensal de uma pessoa (colaborador.custoMensal ou o da função);
            faltam × custo = quanto custa contratar; sobram × custo = quanto custa a sobra

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
      ? { empresasVencidas: n(exc.empresasVencidas), empresasExclusivaTst: n(exc.empresasExclusivaTst), demanda: exc.demanda || null, excecao: true }
      : { empresasVencidas: n(u.empresasVencidas), empresasExclusivaTst: n(u.empresasExclusivaTst), demanda: u.demanda || null, excecao: false };
  }

  /** Peso de um porte (P 1,0 · M 1,5 · G 2,0…); porte desconhecido ou sem tabela de pesos = 1. */
  function pesoPorte(p, porte) {
    const pesos = p && p.pesosPorte;
    const w = pesos && pesos[porte];
    return Number.isFinite(Number(w)) && Number(w) > 0 ? Number(w) : 1;
  }

  /**
   * Esforço que a carteira exige no mês, em "empresas equivalentes": Σ clientes que vencem × peso do porte.
   * Sem detalhe por porte, vale a contagem (Mensal + Exclusiva TST). Com `mes` (0..11) usa a quantidade daquele mês.
   */
  function empresasPonderadas(u, p, mes) {
    const q = mes === undefined ? u : empresasDoMes(u, mes);
    const d = q.demanda;
    if (d && typeof d === 'object') {
      let total = 0;
      Object.values(d).forEach(porPorte => {
        if (porPorte && typeof porPorte === 'object') Object.entries(porPorte).forEach(([porte, qtd]) => { total += Math.max(0, n(qtd)) * pesoPorte(p, porte); });
      });
      return total;
    }
    return n(q.empresasVencidas) + n(q.empresasExclusivaTst);
  }

  /* ---------- presença no mês e ramp-up ---------- */

  const parseData = s => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const diasNoMes = (ano, mes) => new Date(ano, mes + 1, 0).getDate();

  /**
   * Presença de um colaborador num mês (0..1): fração dos dias do mês entre a admissão e o desligamento.
   * Sem datas = 1. Meses antes da admissão ou depois do desligamento = 0.
   */
  function presencaNoMes(c, ano, mes) {
    const adm = parseData(c.dataAdmissao), desl = parseData(c.dataDesligamento);
    if (!adm && !desl) return 1;
    const inicio = new Date(ano, mes, 1), fim = new Date(ano, mes, diasNoMes(ano, mes));
    if (adm && adm > fim) return 0;
    if (desl && desl < inicio) return 0;
    const de = adm && adm > inicio ? adm : inicio;
    const ate = desl && desl < fim ? desl : fim;
    const dias = Math.round((ate - de) / 86400000) + 1;
    return Math.max(0, Math.min(1, dias / diasNoMes(ano, mes)));
  }

  /**
   * Ramp-up (0..1) de quem foi contratado: no 1º mês de casa produz rampup[0]%, no 2º rampup[1]%…, depois 100%.
   * `mesesDeCasa` = 0 no mês da admissão. Sem admissão (veterano) = 1.
   */
  function fatorRampup(mesesDeCasa, rampup) {
    if (mesesDeCasa == null || mesesDeCasa < 0) return 1;
    const curva = Array.isArray(rampup) ? rampup : [];
    return mesesDeCasa < curva.length ? Math.max(0, Math.min(100, n(curva[mesesDeCasa]))) / 100 : 1;
  }
  const mesesDeCasa = (c, ano, mes) => {
    if (c.simulado) return c.quantidade > 0 && Number.isInteger(c.rampupDesde) ? mes - c.rampupDesde : null; // desligamento simulado não tem ramp-up
    const adm = parseData(c.dataAdmissao);
    return adm ? (ano - adm.getFullYear()) * 12 + (mes - adm.getMonth()) : null;
  };
  /** Produção efetiva no mês = presença × ramp-up (pessoas simuladas: presença 1 nos meses ativos). */
  const fatorProducao = (c, ano, mes, p) => (c.simulado ? 1 : presencaNoMes(c, ano, mes)) * fatorRampup(mesesDeCasa(c, ano, mes), p.rampup);

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
   *   faltam (nº inteiro de pessoas a contratar), sobram (nº inteiro de pessoas de folga),
   *   ideal (quadro ideal: pessoas inteiras para dar conta do que precisa no período)
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
      ideal: producaoPessoa > 0 && precisa > 1e-9 ? Math.ceil(precisa / producaoPessoa - 1e-9) : 0,
    };
  }

  /** Resumo de uma função a partir das suas entregas: pior situação, maior falta, menor sobra. */
  function resumoFuncao(funcao, entregas) {
    const lista = ENTREGAS_DA_FUNCAO[funcao].map(e => entregas[e.id]);
    const st = piorStatus(lista.map(b => b.status));
    const faltam = Math.max(...lista.map(b => b.faltam));
    const sobram = Math.min(...lista.map(b => b.sobram));
    const ideal = Math.max(...lista.map(b => b.ideal)); // quadro ideal = o que a entrega mais exigente pede
    const limitante = lista.reduce((a, b) => (b.sobra < a.sobra ? b : a)); // entrega que limita
    const pessoas = lista[0].pessoas;
    return {
      funcao, status: st, faltam, sobram, ideal, pessoas,
      atendeEmpresas: Math.min(...lista.map(b => b.consegue)), // empresas que a função dá conta no período
      precisa: limitante.precisa,
      limitante: ENTREGAS_DA_FUNCAO[funcao].find(e => entregas[e.id] === limitante),
      sobraEmpresas: limitante.sobra,
      recomendacao: recomendacao(funcao, st, faltam, sobram, pessoas),
    };
  }

  /**
   * Impacto financeiro de uma função num mês/período: custo médio de uma pessoa, quanto custa contratar
   * quem falta e quanto custa a sobra (pessoas inteiras × custo). Sem custo cadastrado, tudo zero.
   */
  function custoFuncao(resumo, custoPessoa) {
    const c = Math.max(0, n(custoPessoa));
    return { pessoa: c, contratar: c * n(resumo.faltam), sobra: c * n(resumo.sobram) };
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
  function calcular({ unidades = [], colaboradores = [], parametros, janela, simulacoes = [], ano = new Date().getFullYear() }) {
    const p = normalizarParametros(parametros);
    const anoCalc = Number.isInteger(Number(ano)) ? Number(ano) : new Date().getFullYear();
    /** Custo médio mensal de uma pessoa (o do colaborador, senão o da função). */
    const custoDe = c => (n(c.custoMensal) > 0 ? n(c.custoMensal) : n(c.funcaoCustoMensal));
    const de = clampMes(janela && janela.de, 0);
    const ate = clampMes(janela && janela.ate, 11);
    const meses = [];
    for (let m = Math.min(de, ate); m <= Math.max(de, ate); m++) meses.push(m);

    const idsUnidades = new Set(unidades.map(u => u.id));
    const alocValidas = c => (c.alocacoes || []).filter(a => a && idsUnidades.has(a.unidadeId) && n(a.percentual) > 0);
    const fracaoEm = (c, unidadeId) => alocValidas(c).filter(a => a.unidadeId === unidadeId).reduce((s, a) => s + n(a.percentual), 0) / 100;
    // simulações viram pessoas virtuais (quantidade inteira, podendo ser negativa) ativas só em alguns meses
    const simulados = colaboradoresSimulados(simulacoes).filter(c => idsUnidades.has(c.unidadeId));
    const ativoNoMes = (c, mes) => (c.mesesAtivos ? c.mesesAtivos.includes(mes) : presencaNoMes(c, anoCalc, mes) > 0);
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
    // custo médio de uma pessoa por grupo, na equipe toda (referência quando a unidade não tem ninguém do grupo)
    const custoGlobal = {};
    FUNCOES.forEach(f => { const l = produtivos.filter(c => c.tipoProducao === f && custoDe(c) > 0); custoGlobal[f] = l.length ? l.reduce((s, c) => s + custoDe(c), 0) / l.length : 0; });
    const custoMedio = (lista, f) => {
      const comCusto = lista.filter(c => c.fracao > 0 && custoDe(c) > 0);
      const peso = comCusto.reduce((s, c) => s + c.fracao, 0);
      return peso > 0 ? comCusto.reduce((s, c) => s + custoDe(c) * c.fracao, 0) / peso : custoGlobal[f];
    };

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
        const pessoasMes = {}, emRampup = {};
        FUNCOES.forEach(f => {
          const cf = porFuncao[f].filter(c => ativoNoMes(c, mes));
          // pessoas = presença no mês (quem entra dia 15 conta meio); ramp-up só reduz a produção
          pessoasMes[f] = Math.max(0, cf.reduce((s, c) => s + c.fracao * (c.simulado ? 1 : presencaNoMes(c, anoCalc, mes)), 0));
          emRampup[f] = cf.filter(c => c.fracao > 0 && fatorRampup(mesesDeCasa(c, anoCalc, mes), p.rampup) < 1).reduce((s, c) => s + Math.abs(c.fracao), 0);
        });
        ENTREGAS.forEach(e => {
          const cf = porFuncao[e.funcao].filter(c => ativoNoMes(c, mes));
          // desligamento simulado além do que existe não fica negativo: a equipe vai a zero
          const consegueMax = Math.max(0, cf.reduce((s, c) => s + producaoMes(c, e, mes, p) * c.fracao * fatorProducao(c, anoCalc, mes, p), 0));
          const presentes = cf.filter(c => c.fracao > 0);
          const ref = presentes.length ? presentes : globalPorFuncao[e.funcao];
          const producaoPessoaMax = ref.reduce((s, c) => s + producaoMes(c, e, mes, p), 0) / ref.length; // uma pessoa inteira, veterana
          entregas[e.id] = bloco(precisaMes(u, e, mes, p), consegueMax, pessoasMes[e.funcao], producaoPessoaMax, p);
        });
        const funcoes = {};
        FUNCOES.forEach(f => {
          funcoes[f] = resumoFuncao(f, entregas);
          funcoes[f].emRampup = emRampup[f];
          funcoes[f].custo = custoFuncao(funcoes[f], custoMedio(porFuncao[f].filter(c => ativoNoMes(c, mes)), f));
        });
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
        r.ideal = partes.reduce((s, x) => s + x.ideal, 0); // quadro ideal do total = soma das unidades
        r.emRampup = partes.reduce((s, x) => s + n(x.emRampup), 0);
        const comCusto = partes.filter(x => x.custo && x.custo.pessoa > 0);
        r.custo = {
          pessoa: comCusto.length ? comCusto.reduce((s, x) => s + x.custo.pessoa, 0) / comCusto.length : 0,
          contratar: partes.reduce((s, x) => s + (x.custo ? x.custo.contratar : 0), 0),
          sobra: partes.reduce((s, x) => s + (x.custo ? x.custo.sobra : 0), 0),
        };
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
          rampupDesde: Math.min(de, ate), // contratação simulada entra em ramp-up como uma contratação real
          custoMensal: Math.max(0, n(s.custoMensal)),
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
    FUNCOES.forEach(f => {
      funcoes[f] = resumoFuncao(f, entregas);
      const custos = mesesCalc.map(m => m.funcoes[f].custo || { pessoa: 0, contratar: 0, sobra: 0 });
      // no período: contratar = custo de cobrir a falta de cada mês, somado; sobra idem (o que se paga sem produção)
      funcoes[f].custo = {
        pessoa: custos.length ? custos.reduce((s, c) => s + c.pessoa, 0) / custos.length : 0,
        contratar: custos.reduce((s, c) => s + c.contratar, 0),
        sobra: custos.reduce((s, c) => s + c.sobra, 0),
      };
    });
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
    const rampup = Array.isArray(base.rampup) ? base.rampup.map(v => Math.max(0, Math.min(100, n(v)))) : [50, 80];
    const pesosPorte = {};
    Object.entries(base.pesosPorte || {}).forEach(([k, v]) => { if (n(v) > 0) pesosPorte[k] = n(v); });
    return {
      diasUteis: dias,
      ocupacaoAlvo: n(base.ocupacaoAlvo) || 85,
      rampup,
      pesosPorte,
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
     O número lançado em Empresas por Unidade é SÓ o que VENCE naquele mês (nunca um
     acumulado). Nos meses passados é o que venceu ali e AINDA ESTÁ EM ABERTO — a equipe
     já trabalhou de verdade e o que sobrou é esse número. O programa acumula sozinho,
     do primeiro mês em diante:
       pendentes(mês) = sobra do mês anterior + lançado(mês)          (todos os meses)
       meses passados : atendidas = 0 → tudo passa adiante (o lançado já é o que ficou em aberto;
                        não se desconta a produção da equipe de novo)
       mês atual e seguintes: atendidas = mínimo(pendentes, o que a equipe consegue no mês)
       sobra(mês)     = pendentes − atendidas   (nunca negativa; passa para o mês seguinte)
     Editar o lançado de um mês recalcula todos os seguintes.
     Roda em cima do resultado de calcular() para o ano inteiro (janela 0..11), por unidade e grupo.
     Situação do mês: ok = zerado no fim; atenção = ficou menos de um mês de trabalho;
     precisa contratar = ficou mais de um mês de trabalho (prazo em risco).
     Resumo (a partir do mês atual, dentro do prazo em meses):
       fila hoje    = pendentes do mês atual (o que vence no mês + o que sobrou dos anteriores)
       faltaPrazo   = fila hoje + o que vence nos meses seguintes do prazo − o que a equipe consegue no prazo
       pessoasPrazo = pessoas a contratar para zerar isso dentro do prazo
     ---------------------------------------------------- */

  function fila(resultado, { mesAtual = 0, prazoMeses = 2, periodo = null } = {}) {
    const t = clampMes(mesAtual, 0);
    const pm = Math.max(1, Math.round(n(prazoMeses)) || 1);
    const nomeMes = i => MESES_LONGO[i];
    const pDe = clampMes(periodo && periodo.de, 0), pAte = clampMes(periodo && periodo.ate, 11);
    const per = { de: Math.min(pDe, pAte), ate: Math.max(pDe, pAte) };

    /** Resumo de um trecho de meses (período escolhido): fila no início, entradas, o que a equipe consegue, fila no fim, pessoas. */
    const resumoPeriodo = meses => {
      const trecho = meses.slice(per.de, per.ate + 1);
      const soma = campo => trecho.reduce((s, m) => s + m[campo], 0);
      const filaInicio = trecho.length ? trecho[0].filaInicio : 0;
      const filaFim = trecho.length ? trecho[trecho.length - 1].filaFim : 0;
      const entram = soma('entram'), consegue = soma('consegue'), atendidas = soma('atendidas');
      // pessoas a contratar: só dali para a frente (meses já passados não mudam com contratação)
      const inicioContratacao = Math.max(per.de, t);
      const futuro = meses.slice(inicioContratacao, per.ate + 1);
      const somaF = campo => futuro.reduce((s, m) => s + m[campo], 0);
      const producaoPessoa = somaF('producaoPessoa');
      const filaInicioF = futuro.length ? futuro[0].filaInicio : 0;
      const entramF = somaF('entram');
      const falta = futuro.length ? Math.max(0, filaInicioF + somaF('entram') - somaF('consegue')) : 0;
      const sobra = futuro.length ? Math.max(0, somaF('consegue') - (filaInicioF + somaF('entram'))) : 0;
      return {
        de: per.de, ate: per.ate, nMeses: trecho.length, contratarDe: inicioContratacao,
        filaInicio, entram, consegue, atendidas, filaFim, falta,
        aAtender: filaInicioF + entramF, consegueFuturo: somaF('consegue'), // dali para a frente
        pessoas: falta > 1e-9 && producaoPessoa > 0 ? Math.ceil(falta / producaoPessoa - 1e-9) : 0,
        pessoasSobram: sobra > 1e-9 && producaoPessoa > 0 ? Math.floor(sobra / producaoPessoa + 1e-9) : 0,
        status: trecho.length ? piorStatus(trecho.map(m => m.status)) : 'ok',
      };
    };

    const filaGrupo = (item, f) => {
      const entregas = ENTREGAS_DA_FUNCAO[f];
      let pend = 0;
      const meses = item.meses.map((m, i) => {
        // entrega gargalo do grupo no mês (técnicos: inspeções ou relatórios, a menor)
        const gargaloEntrega = entregas.reduce((a, b) => (m.entregas[b.id].consegue < m.entregas[a.id].consegue ? b : a));
        const gargalo = m.entregas[gargaloEntrega.id];
        const informado = n(m.precisa); // número lançado no mês = o que vence no mês (nos passados, o que venceu e ainda está em aberto)
        const consegue = Math.max(0, n(gargalo.consegue));
        // sempre: pendentes = o que sobrou do mês anterior + o que vence no mês
        const filaInicio = pend;
        const entram = informado;
        const pendentes = filaInicio + entram;
        // meses passados: o lançado já é o que ficou em aberto — não se desconta a equipe de novo; tudo passa adiante
        // do mês atual em diante: a equipe atende o que consegue; o resto passa para o mês seguinte
        const atendidas = i < t ? 0 : Math.min(pendentes, consegue);
        const filaFim = Math.max(0, pendentes - atendidas);
        pend = filaFim;
        const producaoDiaPor = {};
        entregas.forEach(e => { producaoDiaPor[e.id] = m.diasUteis > 0 ? Math.max(0, n(m.entregas[e.id].consegue)) / m.diasUteis : 0; });
        return {
          mes: m.mes, nome: m.nome, nomeLongo: m.nomeLongo, diasUteis: m.diasUteis,
          passado: i < t, hoje: i === t,
          informado, entram, filaInicio, pendentes, consegue, atendidas, filaFim,
          pessoas: n(m.pessoas[f]), producaoPessoa: n(gargalo.producaoPessoa),
          producaoDia: m.diasUteis > 0 ? consegue / m.diasUteis : 0,
          producaoDiaPor, gargaloId: gargaloEntrega.id,
          status: filaFim <= 1e-9 ? 'ok' : filaFim <= consegue + 1e-9 ? 'atencao' : 'deficit',
        };
      });
      return { meses, resumo: resumoFila(meses, f), periodo: resumoPeriodo(meses) };
    };

    const resumoFila = (meses, f) => {
      const hoje = meses[t];
      const prazo = meses.slice(t, Math.min(12, t + pm));
      const filaHoje = hoje ? hoje.pendentes : 0;                     // acumulado total: vence no mês + sobrou dos anteriores
      const deMesesAnteriores = hoje ? hoje.filaInicio : 0;           // parte que veio de meses anteriores ainda não atendidos
      const entramPrazo = prazo.slice(1).reduce((s, m) => s + m.entram, 0); // o que vence nos meses seguintes dentro do prazo
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
        filaHoje, deMesesAnteriores, entramHoje: hoje ? hoje.informado : 0, entramPrazo, conseguePrazo, faltaPrazo, pessoasPrazo, pessoasSobram,
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
          passado: i < t, hoje: i === t,
          informado: soma('informado'), pendentes: soma('pendentes'),
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
      const periodoTotal = resumoPeriodo(meses);
      periodoTotal.pessoas = unidades.reduce((s, u) => s + u.grupos[f].periodo.pessoas, 0);
      periodoTotal.pessoasSobram = unidades.reduce((s, u) => s + u.grupos[f].periodo.pessoasSobram, 0);
      periodoTotal.falta = unidades.reduce((s, u) => s + u.grupos[f].periodo.falta, 0);
      grupos[f] = { meses, resumo, periodo: periodoTotal };
    });

    return { mesAtual: t, prazoMeses: pm, periodo: per, unidades, total: { grupos } };
  }

  return {
    MESES, MESES_LONGO, TEC, ADM, FUNCOES, FUNCAO_CURTA, FUNCAO_SINGULAR, ENTREGAS, ENTREGAS_DA_FUNCAO, COLAB_PADRAO, MARGEM_ATENCAO, colaboradoresSimulados,
    empresasDoMes, empresasPonderadas, pesoPorte, presencaNoMes, fatorRampup, custoFuncao,
    producaoMes, precisaMes, calcular, fila, normalizarParametros, ritmoTexto, piorStatus,
  };
})();

// Node (testes): expõe como módulo; no navegador fica global.

export default Calculo;
