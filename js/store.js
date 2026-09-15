/* ==========================================================================
   Store — estado da aplicação sobre as tabelas do Supabase

   - Ao entrar, carrega tudo para um cache em memória (dataset pequeno).
   - Leituras (list/get/counts) são síncronas, a partir do cache.
   - Escritas (add/update/remove) gravam no Supabase e só então atualizam o
     cache e disparam 'store:change'. Rejeitam com Error de mensagem amigável.
   - Exportar/Importar JSON continuam disponíveis como backup; a importação
     substitui tudo numa transação (RPC importar_backup).

   Formato em JS (igual ao backup exportado, versão 2):
     unidades:      [{ id, nome, empresasVencidas (condição Mensal), empresasExclusivaTst, empresas (= soma),
                       clientesAtivos (total de clientes; só informativo, fora das contas),
                       mesesPorAno: { [ano]: { [1..12]: { empresasVencidas, empresasExclusivaTst, clientesAtivos } } },  // valores próprios por ano/mês
                       meses: { [1..12]: {...} } }]                                 // = mesesPorAno[Store.ano] (ano selecionado)
                    // empresas com documentos vencidos: cada uma exige o atendimento completo no mês
     documentos:    [{ id, nome, horas, periodicidadeMeses, responsavel }]   // periodicidade 0 = sob demanda
     funcoes:       [{ id, nome, tipoProducao: 'tecnico' | 'administrativo' | 'nenhuma', chefia,
                       coordena: 'todos' | 'tecnicos' | 'administrativos', respondeParaId (função de chefia acima; null = topo), ordem }]
     colaboradores: [{ id, nome, funcaoId, funcao (nome), tipoProducao, chefia, coordena, empresasDia, inspecoesDia, relatoriosDia,
                       alocacoes: [{ unidadeId, unidadeNome, percentual }] }]
                    // produção declarada por dia; alocações somam ≤ 100% (o restante é "não alocado")
     parametros:    { diasUteis[12], ocupacaoAlvo, prazoDias }  // prazoDias = régua da fila de atendimento (padrão 60)
   ========================================================================== */

const Store = (() => {
  const APP_ID = 'chabra-dimensiona';
  const SCHEMA_VERSION = 12; // v12: demanda por porte (demandaPorMes), clientesAtivosPorMes, portes, custo, admissão/desligamento, rampup
  /** Condições de cliente por unidade/mês (mesmo atendimento completo; separadas para enxergar cada uma). */
  const CONDICOES = [
    { campo: 'empresasVencidas',     condicao: 'mensal',        rotulo: 'Mensal',        classe: 'cond-mensal',    ajuda: 'clientes com contrato mensal cujos documentos vencem no mês' },
    { campo: 'empresasExclusivaTst', condicao: 'exclusiva_tst', rotulo: 'Exclusiva TST', classe: 'cond-exclusiva', ajuda: 'clientes na condição Exclusiva TST (mesmo atendimento completo)' },
  ];
  const PORTES_PADRAO = [{ codigo: 'P', nome: 'Pequeno', peso: 1, ordem: 1 }, { codigo: 'M', nome: 'Médio', peso: 1.5, ordem: 2 }, { codigo: 'G', nome: 'Grande', peso: 2, ordem: 3 }];
  /** Números só informativos por unidade/mês (não entram em nenhuma conta). */
  const INFORMATIVOS = [
    { campo: 'clientesAtivos', coluna: 'clientes_ativos', rotulo: 'Clientes ativos', classe: 'cond-ativos', ajuda: 'total de clientes da unidade no mês — só informativo, não entra em nenhuma conta' },
  ];
  const LOCAL_KEY = 'chabra-dimensiona:data';            // versão antiga (só localStorage)
  const LOCAL_BACKUP_KEY = 'chabra-dimensiona:backup-local'; // onde os dados locais ficam após a migração

  const FUNCOES = ['Técnico de Segurança do Trabalho', 'Administrativo']; // nomes legados (catálogo de documentos)
  const TIPOS_PRODUCAO = [
    { id: 'tecnico',        rotulo: 'Técnico',        descricao: 'faz inspeções e relatórios — entra na programação como técnico' },
    { id: 'administrativo', rotulo: 'Administrativo', descricao: 'finaliza empresas — entra na programação como administrativo' },
    { id: 'nenhuma',        rotulo: 'Sem produção',   descricao: 'não tem ritmo diário e não entra na programação (ex.: supervisores)' },
  ];
  const COORDENA = [
    { id: 'todos',           rotulo: 'Toda a equipe',      descricao: 'técnicos, administrativos e as chefias abaixo dela nas unidades em que estiver' },
    { id: 'tecnicos',        rotulo: 'Só os técnicos',     descricao: 'coordena a equipe técnica das unidades em que estiver' },
    { id: 'administrativos', rotulo: 'Só os administrativos', descricao: 'coordena a equipe administrativa das unidades em que estiver' },
  ];
  const DEFAULT_COLABORADOR = { empresasDia: 2, inspecoesDia: 2, relatoriosDia: 2 };
  const DEFAULT_PARAMETROS = {
    diasUteis: [21, 18, 22, 20, 20, 21, 23, 21, 21, 21, 19, 22],
    ocupacaoAlvo: 85, prazoDias: 60, rampup: [50, 80],
  };

  // Mesmos valores do seed da migration 0001 (sugestões, editáveis).
  const DEFAULT_DOCUMENTOS = [
    { nome: 'PGR',                           horas: 16, periodicidadeMeses: 24 },
    { nome: 'AET',                           horas: 12, periodicidadeMeses: 24 },
    { nome: 'Laudo de Insalubridade',        horas: 8,  periodicidadeMeses: 12 },
    { nome: 'Laudo de Periculosidade',       horas: 8,  periodicidadeMeses: 12 },
    { nome: 'LTCAT',                         horas: 8,  periodicidadeMeses: 12 },
    { nome: 'Investigação de Acidente',      horas: 6,  periodicidadeMeses: 0 },
    { nome: 'Relatório de Não Conformidade', horas: 2,  periodicidadeMeses: 1 },
    { nome: 'Treinamento',                   horas: 4,  periodicidadeMeses: 12 },
  ];

  /* ---------- helpers de coerção ---------- */

  const toStr = v => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
  const toNum = (v, fallback) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };
  const toInt = (v, fallback) => Math.max(0, Math.round(toNum(v, fallback)));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const chave = nome => toStr(nome).toLocaleLowerCase('pt-BR');

  /* ---------- normalização de registros + mapeamento JS <-> tabela ---------- */

  const ANO_KEY = 'chabra-dimensiona:ano';
  const anoCorrente = () => new Date().getFullYear();
  const anoValido = a => Number.isInteger(a) && a >= 2000 && a <= 2100;
  /** Ano selecionado (por navegador); os valores por mês mostrados e calculados são os desse ano. */
  let ano = (() => { try { const v = Number(localStorage.getItem(ANO_KEY)); return anoValido(v) ? v : anoCorrente(); } catch (_) { return anoCorrente(); } })();

  /**
   * Normaliza valores próprios por mês: lista [{ ano?, mes, ... }] (backup) ou objeto { "3": {...} } (formato
   * antigo, sem ano → ano corrente). Devolve { [ano]: { [mes]: { empresasVencidas } } }.
   */
  const buildMesesPorAno = fonte => {
    const out = {};
    const entradas = Array.isArray(fonte) ? fonte.map(m => [m && m.mes, m, m && m.ano])
      : (fonte && typeof fonte === 'object' && !Array.isArray(fonte))
        ? (Object.values(fonte).some(v => v && typeof v === 'object' && !('empresasVencidas' in v) && !('empresasBaixo' in v) && !('empresasAVencer' in v) && !('empresas' in v))
            ? Object.entries(fonte).flatMap(([a, meses]) => Object.entries(meses || {}).map(([k, v]) => [k, v, a])) // já por ano
            : Object.entries(fonte).map(([k, v]) => [k, v, undefined]))
        : [];
    entradas.forEach(([k, v, a]) => {
      const mes = Math.round(toNum(k, 0));
      const y = Math.round(toNum(a, anoCorrente()));
      if (!v || mes < 1 || mes > 12 || !anoValido(y)) return;
      // formato antigo: só contagens → tudo porte P
      const demanda = v.demanda && typeof v.demanda === 'object' ? v.demanda
        : { mensal: { P: vencidasDe(v) }, exclusiva_tst: { P: Math.max(0, toInt(v.empresasExclusivaTst, 0)) } };
      (out[y] = out[y] || {})[mes] = montarMes(demanda, Math.max(0, toInt(v.clientesAtivos, 0)));
    });
    return out;
  };
  /** Um mês no cache: demanda por condição × porte + contagens derivadas (Σ dos portes) + clientes ativos. */
  const montarMes = (demanda, clientesAtivos) => {
    const d = {};
    CONDICOES.forEach(c => {
      const porPorte = (demanda && demanda[c.condicao]) || {};
      d[c.condicao] = {};
      Object.entries(porPorte).forEach(([porte, q]) => { const n = Math.max(0, toInt(q, 0)); if (n > 0) d[c.condicao][porte] = n; });
    });
    const soma = cond => Object.values(d[cond]).reduce((s, q) => s + q, 0);
    return { demanda: d, empresasVencidas: soma('mensal'), empresasExclusivaTst: soma('exclusiva_tst'), clientesAtivos: Math.max(0, toInt(clientesAtivos, 0)) };
  };
  /** Demanda por mês no formato do backup v12: [{ ano, mes, condicao, porte, quantidade }]. */
  const demandaLista = u => Object.entries(u.mesesPorAno || {}).flatMap(([a, meses]) => Object.entries(meses || {}).flatMap(([mes, v]) =>
    CONDICOES.flatMap(c => Object.entries((v.demanda || {})[c.condicao] || {}).filter(([, q]) => q > 0)
      .map(([porte, quantidade]) => ({ ano: Number(a), mes: Number(mes), condicao: c.condicao, porte, quantidade })))))
    .sort((x, y) => x.ano - y.ano || x.mes - y.mes || x.condicao.localeCompare(y.condicao) || x.porte.localeCompare(y.porte));
  const clientesAtivosLista = u => Object.entries(u.mesesPorAno || {}).flatMap(([a, meses]) => Object.entries(meses || {})
    .filter(([, v]) => v.clientesAtivos > 0).map(([mes, v]) => ({ ano: Number(a), mes: Number(mes), clientesAtivos: v.clientesAtivos })))
    .sort((x, y) => x.ano - y.ano || x.mes - y.mes);
  /** Backup v12: demandaPorMes + clientesAtivosPorMes → mesesPorAno. */
  const mesesDeBackupV12 = (demandaPorMes, ativosPorMes) => {
    const out = {};
    const pegar = (a, mes) => { const y = Math.round(toNum(a, anoCorrente())); const m = Math.round(toNum(mes, 0)); if (m < 1 || m > 12 || !anoValido(y)) return null; return ((out[y] = out[y] || {})[m] = out[y][m] || { demanda: {}, clientesAtivos: 0 }); };
    (Array.isArray(demandaPorMes) ? demandaPorMes : []).forEach(x => {
      if (!x) return;
      const slot = pegar(x.ano, x.mes); if (!slot) return;
      const cond = CONDICOES.some(c => c.condicao === x.condicao) ? x.condicao : 'mensal';
      const porte = toStr(x.porte) || 'P';
      (slot.demanda[cond] = slot.demanda[cond] || {})[porte] = (slot.demanda[cond][porte] || 0) + Math.max(0, toInt(x.quantidade, 0));
    });
    (Array.isArray(ativosPorMes) ? ativosPorMes : []).forEach(x => { if (!x) return; const slot = pegar(x.ano, x.mes); if (slot) slot.clientesAtivos = Math.max(0, toInt(x.clientesAtivos, 0)); });
    Object.keys(out).forEach(y => Object.keys(out[y]).forEach(m => { out[y][m] = montarMes(out[y][m].demanda, out[y][m].clientesAtivos); }));
    return out;
  };
  /** Aplica o ano selecionado: u.meses passa a ser o mapa daquele ano. */
  const aplicarAno = u => { u.meses = (u.mesesPorAno && u.mesesPorAno[ano]) || {}; return u; };
  /**
   * Empresas com documentos vencidos de um objeto (unidade ou mês), aceitando formatos antigos:
   * situação (vencendo + a vencer; "em dia" não gerava trabalho), grau (baixo + médio + alto) ou só "empresas".
   */
  const vencidasDe = o => {
    if (o.empresasVencidas != null) return Math.max(0, toInt(o.empresasVencidas, 0));
    if (o.empresasAVencer != null || o.empresasVencendo != null) return Math.max(0, toInt(o.empresasVencendo, 0) + toInt(o.empresasAVencer, 0));
    if (o.empresasBaixo != null || o.empresasMedio != null || o.empresasAlto != null) return Math.max(0, toInt(o.empresasBaixo, 0) + toInt(o.empresasMedio, 0) + toInt(o.empresasAlto, 0));
    return Math.max(0, toInt(o.empresas, 0));
  };
  const buildUnidade = u => ({
    nome: toStr(u.nome),
    empresasVencidas: 0, empresasExclusivaTst: 0, empresas: 0, clientesAtivos: 0, // o "padrão" da unidade não existe mais: meses sem número valem zero
    mesesPorAno: Array.isArray(u.demandaPorMes) || Array.isArray(u.clientesAtivosPorMes)
      ? mesesDeBackupV12(u.demandaPorMes, u.clientesAtivosPorMes)
      : buildMesesPorAno(u.empresasPorMes !== undefined ? u.empresasPorMes : (u.mesesPorAno !== undefined ? u.mesesPorAno : u.meses)),
  });
  const buildPorte = x => ({ codigo: toStr(x.codigo).toUpperCase().slice(0, 3), nome: toStr(x.nome) || toStr(x.codigo), peso: Math.max(0.01, toNum(x.peso, 1)), ordem: toInt(x.ordem, 0) });
  const buildDocumento = d => ({
    nome: toStr(d.nome),
    horas: Math.max(0, toNum(d.horas, 0)),
    periodicidadeMeses: toInt(d.periodicidadeMeses, 0),
    responsavel: FUNCOES.includes(d.responsavel) ? d.responsavel : FUNCOES[0],
  });
  /** Normaliza alocações: remove inválidas/duplicadas, limita cada uma a 100 e a soma a 100. */
  const buildAlocacoes = lista => {
    const vistos = new Set();
    const out = [];
    let soma = 0;
    (Array.isArray(lista) ? lista : []).forEach(a => {
      if (!a) return;
      const unidadeId = toStr(a.unidadeId) || null;
      const unidadeNome = toStr(a.unidadeNome);
      const chaveA = unidadeId || chave(unidadeNome);
      if (!chaveA || vistos.has(chaveA)) return;
      let percentual = Math.min(100, Math.round(toNum(a.percentual, 0) * 100) / 100);
      if (!(percentual > 0)) return;
      percentual = Math.min(percentual, Math.max(0, 100 - soma));
      if (!(percentual > 0)) return;
      vistos.add(chaveA);
      soma += percentual;
      out.push({ unidadeId, unidadeNome, percentual });
    });
    return out;
  };
  const buildFuncao = f => ({
    nome: toStr(f.nome),
    tipoProducao: TIPOS_PRODUCAO.some(t => t.id === f.tipoProducao) ? f.tipoProducao : 'nenhuma',
    chefia: f.chefia === true || f.chefia === 'true',
    coordena: COORDENA.some(c => c.id === f.coordena) ? f.coordena : 'todos',
    respondeParaId: toStr(f.respondeParaId) || null,
    respondePara: toStr(f.respondePara), // nome (só no backup)
    ordem: Math.max(0, toInt(f.ordem, 0)),
    custoMensal: Math.max(0, toNum(f.custoMensal, 0)), // custo médio mensal de uma pessoa (salário + encargos)
  });
  const dataOuNull = v => { const s = toStr(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
  const buildColaborador = c => ({
    nome: toStr(c.nome),
    funcaoId: toStr(c.funcaoId) || null,
    funcao: toStr(c.funcao), // nome (usado no backup; o id vem do cadastro de funções)
    empresasDia: Math.max(0, toNum(c.empresasDia, DEFAULT_COLABORADOR.empresasDia)),
    inspecoesDia: Math.max(0, toNum(c.inspecoesDia, DEFAULT_COLABORADOR.inspecoesDia)),
    relatoriosDia: Math.max(0, toNum(c.relatoriosDia, DEFAULT_COLABORADOR.relatoriosDia)),
    dataAdmissao: dataOuNull(c.dataAdmissao),
    dataDesligamento: dataOuNull(c.dataDesligamento),
    custoMensal: toNum(c.custoMensal, 0) > 0 ? toNum(c.custoMensal, 0) : null, // opcional: sobrepõe o custo da função
    // formato legado (unidadeId/unidadeNome únicos) vira uma alocação de 100%
    alocacoes: buildAlocacoes(Array.isArray(c.alocacoes) ? c.alocacoes
      : (c.unidadeId || c.unidadeNome) ? [{ unidadeId: c.unidadeId, unidadeNome: c.unidadeNome, percentual: 100 }] : []),
  });
  const buildParametros = q => {
    const base = q || {};
    const dias = Array.isArray(base.diasUteis) && base.diasUteis.length === 12
      ? base.diasUteis.map(v => clamp(toInt(v, 21), 0, 31))
      : DEFAULT_PARAMETROS.diasUteis.slice();
    const pos = (v, fb) => { const x = toNum(v, fb); return x > 0 ? x : fb; };
    const rampup = Array.isArray(base.rampup) ? base.rampup.slice(0, 12).map(v => clamp(Math.round(toNum(v, 100)), 0, 100)) : DEFAULT_PARAMETROS.rampup.slice();
    return {
      diasUteis: dias,
      ocupacaoAlvo: clamp(pos(base.ocupacaoAlvo, DEFAULT_PARAMETROS.ocupacaoAlvo), 1, 100),
      prazoDias: clamp(Math.round(pos(base.prazoDias, DEFAULT_PARAMETROS.prazoDias)), 1, 365),
      rampup,
    };
  };
  const parametrosToRow = q => ({ dias_uteis: q.diasUteis, ocupacao_alvo: q.ocupacaoAlvo, prazo_dias: q.prazoDias, rampup: q.rampup });
  const parametrosFromRow = r => buildParametros({ diasUteis: r.dias_uteis, ocupacaoAlvo: r.ocupacao_alvo, prazoDias: r.prazo_dias, rampup: r.rampup });

  const TABELAS = {
    funcoes: {
      table: 'funcoes',
      build: buildFuncao,
      toRow: f => ({ nome: f.nome, tipo_producao: f.tipoProducao, chefia: f.chefia, coordena: f.chefia ? f.coordena : 'todos', responde_para: f.chefia ? f.respondeParaId : null, ordem: f.ordem, custo_mensal: f.custoMensal }),
      fromRow: r => ({ id: r.id, nome: r.nome, tipoProducao: r.tipo_producao, chefia: r.chefia === true, coordena: r.coordena || 'todos', respondeParaId: r.responde_para || null, ordem: Number(r.ordem), custoMensal: Number(r.custo_mensal || 0) }),
    },
    unidades: {
      table: 'unidades',
      build: buildUnidade,
      toRow: u => ({ nome: u.nome }),
      fromRow: r => ({ id: r.id, nome: r.nome, empresasVencidas: 0, empresasExclusivaTst: 0, clientesAtivos: 0, empresas: 0, mesesPorAno: {}, meses: {} }),
    },
    documentos: {
      table: 'documentos',
      build: buildDocumento,
      toRow: d => ({ nome: d.nome, horas: d.horas, periodicidade_meses: d.periodicidadeMeses, responsavel: d.responsavel }),
      fromRow: r => ({ id: r.id, nome: r.nome, horas: Number(r.horas), periodicidadeMeses: Number(r.periodicidade_meses), responsavel: r.responsavel || FUNCOES[0] }),
    },
    colaboradores: {
      table: 'colaboradores',
      build: buildColaborador,
      toRow: c => ({ nome: c.nome, funcao_id: c.funcaoId, empresas_dia: c.empresasDia, inspecoes_dia: c.inspecoesDia, relatorios_dia: c.relatoriosDia,
                     data_admissao: c.dataAdmissao, data_desligamento: c.dataDesligamento, custo_mensal: c.custoMensal }),
      fromRow: r => ({ id: r.id, nome: r.nome, funcaoId: r.funcao_id, empresasDia: Number(r.empresas_dia), inspecoesDia: Number(r.inspecoes_dia), relatoriosDia: Number(r.relatorios_dia),
                       dataAdmissao: r.data_admissao || null, dataDesligamento: r.data_desligamento || null, custoMensal: r.custo_mensal != null ? Number(r.custo_mensal) : null, alocacoes: [] }),
    },
  };

  /** Valida e normaliza um objeto bruto (backup JSON ou dados locais antigos). Remove nomes duplicados. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('O arquivo não contém um objeto JSON válido.');
    }
    const known = ['unidades', 'documentos', 'colaboradores'];
    if (!known.some(k => Array.isArray(raw[k]))) {
      throw new Error('O arquivo não parece ser um backup do Chabra Dimensiona.');
    }
    const lista = (k, build) => {
      const vistos = new Set();
      return (Array.isArray(raw[k]) ? raw[k] : [])
        .map(item => build(item || {}))
        .filter(item => item.nome && !vistos.has(chave(item.nome)) && vistos.add(chave(item.nome)));
    };
    const unidades = lista('unidades', buildUnidade);
    const colaboradores = lista('colaboradores', buildColaborador).map(c => {
      // ids não sobrevivem à importação: a unidade é resolvida pelo nome (se vier só o id, procura o nome no próprio arquivo)
      c.alocacoes = c.alocacoes.map(a => {
        let nome = a.unidadeNome;
        if (!nome && a.unidadeId && Array.isArray(raw.unidades)) {
          const u = raw.unidades.find(x => x && x.id === a.unidadeId);
          if (u) nome = toStr(u.nome);
        }
        return { unidadeId: null, unidadeNome: nome, percentual: a.percentual };
      }).filter(a => a.unidadeNome);
      return c;
    });
    return {
      portes: Array.isArray(raw.portes) ? raw.portes.map(x => buildPorte(x || {})).filter(x => x.codigo) : null,
      funcoes: lista('funcoes', buildFuncao),
      unidades,
      // Sem a chave "documentos" mantém o catálogo padrão; lista vazia explícita é respeitada.
      documentos: Array.isArray(raw.documentos) ? lista('documentos', buildDocumento) : DEFAULT_DOCUMENTOS.map(d => buildDocumento(d)),
      colaboradores,
      parametros: raw.parametros && typeof raw.parametros === 'object' ? buildParametros(raw.parametros) : null,
    };
  }

  /* ---------- erros amigáveis ---------- */

  function falha(error, fallback) {
    const code = error && error.code;
    const msg = String((error && error.message) || '');
    let texto;
    if (code === '23505') texto = 'Já existe um registro com esse nome.';
    else if (code === '23503') texto = 'Este item está em uso e não pode ser excluído.';
    else if (code === '23514') texto = /aloca/i.test(msg) ? msg : 'Valor fora do permitido (verifique os números informados).';
    else if (code === '42501' || code === 'PGRST301' || /jwt|not authenticated/i.test(msg)) texto = 'Sessão expirada ou sem permissão. Entre novamente.';
    else if (/failed to fetch|networkerror|load failed/i.test(msg)) texto = 'Sem conexão com o servidor. Verifique a internet.';
    else texto = msg || fallback;
    const e = new Error(texto);
    e.cause = error;
    return e;
  }

  /* ---------- estado (cache) ---------- */

  let state = { funcoes: [], unidades: [], documentos: [], colaboradores: [], parametros: buildParametros(null), portes: PORTES_PADRAO.slice() };
  let loaded = false;
  let loadedAt = 0;

  function emit() {
    document.dispatchEvent(new CustomEvent('store:change'));
  }

  /** Carrega as três tabelas do Supabase para o cache. */
  async function loadAll() {
    const consultas = Object.entries(TABELAS).map(([key, cfg]) =>
      db.from(cfg.table).select('*').order('created_at', { ascending: true }).order('id')
        .then(({ data, error }) => {
          if (error) throw falha(error, `Falha ao carregar ${key}.`);
          return [key, data.map(cfg.fromRow)];
        }));
    consultas.push(
      db.from('parametros').select('*').eq('id', 1).single()
        .then(({ data, error }) => {
          if (error) throw falha(error, 'Falha ao carregar os parâmetros.');
          return ['parametros', parametrosFromRow(data)];
        }));
    consultas.push(
      db.from('colaborador_unidades').select('colaborador_id, unidade_id, percentual')
        .then(({ data, error }) => {
          if (error) throw falha(error, 'Falha ao carregar as alocações.');
          return ['_alocacoes', data];
        }));
    consultas.push(
      db.from('demanda_mensal').select('unidade_id, ano, mes, condicao, porte, quantidade')
        .then(({ data, error }) => {
          if (error) throw falha(error, 'Falha ao carregar as empresas por mês.');
          return ['_demanda', data];
        }));
    consultas.push(
      db.from('unidade_mes').select('unidade_id, ano, mes, clientes_ativos')
        .then(({ data, error }) => {
          if (error) throw falha(error, 'Falha ao carregar os clientes ativos por mês.');
          return ['_ativos', data];
        }));
    consultas.push(
      db.from('portes').select('codigo, nome, peso, ordem').order('ordem').order('codigo')
        .then(({ data, error }) => {
          if (error) throw falha(error, 'Falha ao carregar os portes.');
          return ['portes', data.map(r => ({ codigo: r.codigo, nome: r.nome, peso: Number(r.peso), ordem: Number(r.ordem) }))];
        }));
    const resultados = await Promise.all(consultas);
    state = Object.fromEntries(resultados);
    // distribui as alocações nos colaboradores (unidadeNome preenchido a partir do cache)
    const porColab = {};
    state._alocacoes.forEach(a => {
      (porColab[a.colaborador_id] = porColab[a.colaborador_id] || []).push({ unidadeId: a.unidade_id, unidadeNome: '', percentual: Number(a.percentual) });
    });
    delete state._alocacoes;
    state.colaboradores.forEach(c => { c.alocacoes = comNomes(porColab[c.id] || []); });
    const porUnidade = {};
    state._demanda.forEach(d => { (porUnidade[d.unidade_id] = porUnidade[d.unidade_id] || { demandaPorMes: [], clientesAtivosPorMes: [] }).demandaPorMes.push({ ano: d.ano, mes: d.mes, condicao: d.condicao, porte: d.porte, quantidade: Number(d.quantidade) }); });
    state._ativos.forEach(a => { (porUnidade[a.unidade_id] = porUnidade[a.unidade_id] || { demandaPorMes: [], clientesAtivosPorMes: [] }).clientesAtivosPorMes.push({ ano: a.ano, mes: a.mes, clientesAtivos: Number(a.clientes_ativos) }); });
    delete state._demanda; delete state._ativos;
    state.unidades.forEach(u => { const x = porUnidade[u.id]; u.mesesPorAno = x ? mesesDeBackupV12(x.demandaPorMes, x.clientesAtivosPorMes) : {}; aplicarAno(u); });
    state.funcoes.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
    state.colaboradores.forEach(c => Object.assign(c, infoFuncao(c.funcaoId)));
    loaded = true;
    loadedAt = Date.now();
    emit();
  }

  /** Recarrega se a última carga tiver mais de `maxAgeMs` (usado ao voltar para a aba). */
  async function reloadIfStale(maxAgeMs = 30000) {
    if (!loaded || Date.now() - loadedAt < maxAgeMs) return;
    await loadAll();
  }

  function clear() {
    state = { funcoes: [], unidades: [], documentos: [], colaboradores: [], parametros: buildParametros(null), portes: PORTES_PADRAO.slice() };
    loaded = false;
    loadedAt = 0;
  }

  /** Nome e tipo de produção de uma função (pelo id), para enriquecer o colaborador. */
  function infoFuncao(funcaoId) {
    const f = funcaoId ? state.funcoes.find(x => x.id === funcaoId) : null;
    return { funcao: f ? f.nome : '', tipoProducao: f ? f.tipoProducao : 'nenhuma', chefia: !!(f && f.chefia), coordena: f && f.chefia ? f.coordena : 'todos', funcaoOrdem: f ? f.ordem : 9999, funcaoCustoMensal: f ? f.custoMensal : 0 };
  }

  /** Preenche unidadeNome de cada alocação a partir do cache de unidades. */
  function comNomes(alocacoes) {
    return alocacoes.map(a => ({ ...a, unidadeNome: nomeUnidade(a.unidadeId) || a.unidadeNome || '' }));
  }

  /** Grava as alocações de um colaborador (RPC atômica) e devolve a lista normalizada. */
  async function salvarAlocacoes(colaboradorId, alocacoes) {
    const validas = alocacoes.filter(a => a.unidadeId && a.percentual > 0)
      .map(a => ({ unidadeId: a.unidadeId, percentual: a.percentual }));
    const { error } = await db.rpc('definir_alocacoes', { p_colaborador: colaboradorId, p_alocacoes: validas });
    if (error) throw falha(error, 'Não foi possível salvar as alocações.');
    return comNomes(validas);
  }

  /* ---------- CRUD genérico por coleção ---------- */

  function makeCollection(key) {
    const { table, build, toRow, fromRow } = TABELAS[key];
    return {
      list: () => state[key].slice(),
      get: id => state[key].find(x => x.id === id) || null,

      async add(data) {
        const montado = build(data);
        const { data: row, error } = await db.from(table).insert(toRow(montado)).select().single();
        if (error) throw falha(error, 'Não foi possível adicionar.');
        const item = fromRow(row);
        if (key === 'colaboradores') {
          Object.assign(item, infoFuncao(item.funcaoId));
          if (montado.alocacoes.length) item.alocacoes = await salvarAlocacoes(item.id, montado.alocacoes);
        }
        state[key].push(item);
        if (key === 'funcoes') { state.funcoes.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')); state.colaboradores.forEach(c => Object.assign(c, infoFuncao(c.funcaoId))); }
        emit();
        return item;
      },

      async update(id, patch, { silent = false } = {}) {
        const atual = state[key].find(x => x.id === id);
        if (!atual) throw new Error('Registro não encontrado (talvez tenha sido excluído em outra máquina).');
        const montado = build({ ...atual, ...patch });
        const { data: row, error } = await db.from(table).update(toRow(montado)).eq('id', id).select().single();
        if (error) throw falha(error, 'Não foi possível salvar.');
        const item = fromRow(row);
        if (key === 'colaboradores') {
          Object.assign(item, infoFuncao(item.funcaoId));
          item.alocacoes = patch.alocacoes !== undefined
            ? await salvarAlocacoes(id, montado.alocacoes)
            : comNomes(atual.alocacoes || []);
        }
        if (key === 'unidades') { item.mesesPorAno = atual.mesesPorAno || {}; aplicarAno(item); }
        state[key] = state[key].map(x => (x.id === id ? item : x));
        if (key === 'funcoes') { state.funcoes.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')); state.colaboradores.forEach(c => Object.assign(c, infoFuncao(c.funcaoId))); }
        if (!silent) emit();
        return item;
      },

      async remove(id) {
        const { error } = await db.from(table).delete().eq('id', id);
        if (error) throw falha(error, 'Não foi possível excluir.');
        state[key] = state[key].filter(x => x.id !== id);
        emit();
      },
    };
  }

  /* ---------- variação mensal de empresas por unidade ---------- */

  /** Demanda por unidade × mês do ano selecionado: quantos clientes vencem, por condição e porte; e clientes ativos. */
  const empresasMes = {
    /** Grava a quantidade de uma condição × porte num mês (0 apaga a linha). */
    async definirDemanda(unidadeId, mes, condicao, porte, quantidade, { silent = false } = {}) {
      const u = state.unidades.find(x => x.id === unidadeId);
      if (!u) throw new Error('Unidade não encontrada.');
      const q = Math.max(0, toInt(quantidade, 0));
      if (q > 0) {
        const { error } = await db.from('demanda_mensal').upsert({ unidade_id: unidadeId, ano, mes, condicao, porte, quantidade: q }, { onConflict: 'unidade_id,ano,mes,condicao,porte' });
        if (error) throw falha(error, 'Não foi possível salvar o número do mês.');
      } else {
        const { error } = await db.from('demanda_mensal').delete().match({ unidade_id: unidadeId, ano, mes, condicao, porte });
        if (error) throw falha(error, 'Não foi possível apagar o número do mês.');
      }
      const atual = ((u.mesesPorAno || {})[ano] || {})[mes] || montarMes({}, 0);
      const demanda = { ...atual.demanda, [condicao]: { ...(atual.demanda[condicao] || {}) } };
      if (q > 0) demanda[condicao][porte] = q; else delete demanda[condicao][porte];
      this._guardar(u, mes, montarMes(demanda, atual.clientesAtivos));
      if (!silent) emit();
    },
    /** Grava os clientes ativos (informativo) de um mês (0 apaga a linha). */
    async definirClientesAtivos(unidadeId, mes, quantidade, { silent = false } = {}) {
      const u = state.unidades.find(x => x.id === unidadeId);
      if (!u) throw new Error('Unidade não encontrada.');
      const q = Math.max(0, toInt(quantidade, 0));
      if (q > 0) {
        const { error } = await db.from('unidade_mes').upsert({ unidade_id: unidadeId, ano, mes, clientes_ativos: q }, { onConflict: 'unidade_id,ano,mes' });
        if (error) throw falha(error, 'Não foi possível salvar os clientes ativos.');
      } else {
        const { error } = await db.from('unidade_mes').delete().match({ unidade_id: unidadeId, ano, mes });
        if (error) throw falha(error, 'Não foi possível apagar os clientes ativos.');
      }
      const atual = ((u.mesesPorAno || {})[ano] || {})[mes] || montarMes({}, 0);
      this._guardar(u, mes, montarMes(atual.demanda, q));
      if (!silent) emit();
    },
    _guardar(u, mes, valorMes) {
      const doAno = { ...((u.mesesPorAno || {})[ano] || {}) };
      const vazio = valorMes.empresasVencidas === 0 && valorMes.empresasExclusivaTst === 0 && valorMes.clientesAtivos === 0;
      if (vazio) delete doAno[mes]; else doAno[mes] = valorMes;
      u.mesesPorAno = { ...(u.mesesPorAno || {}), [ano]: doAno };
      aplicarAno(u);
    },
    /** Apaga todos os números da unidade no ano selecionado. */
    async limpar(unidadeId) {
      const u = state.unidades.find(x => x.id === unidadeId);
      if (!u) throw new Error('Unidade não encontrada.');
      const r1 = await db.from('demanda_mensal').delete().match({ unidade_id: unidadeId, ano });
      if (r1.error) throw falha(r1.error, 'Não foi possível limpar os números do ano.');
      const r2 = await db.from('unidade_mes').delete().match({ unidade_id: unidadeId, ano });
      if (r2.error) throw falha(r2.error, 'Não foi possível limpar os clientes ativos do ano.');
      u.mesesPorAno = { ...(u.mesesPorAno || {}) };
      delete u.mesesPorAno[ano];
      aplicarAno(u);
      emit();
    },
  };

  /* ---------- portes (pesos) ---------- */
  const portes = {
    list: () => state.portes.slice(),
    get: codigo => state.portes.find(p => p.codigo === codigo) || null,
    /** Pesos por porte no formato do motor: { P: 1, M: 1.5, G: 2 }. */
    pesos: () => Object.fromEntries(state.portes.map(p => [p.codigo, p.peso])),
    async atualizar(codigo, patch) {
      const atual = state.portes.find(p => p.codigo === codigo);
      if (!atual) throw new Error('Porte não encontrado.');
      const montado = buildPorte({ ...atual, ...patch, codigo });
      const { data, error } = await db.from('portes').update({ nome: montado.nome, peso: montado.peso, ordem: montado.ordem }).eq('codigo', codigo).select().single();
      if (error) throw falha(error, 'Não foi possível salvar o porte.');
      state.portes = state.portes.map(p => (p.codigo === codigo ? { codigo: data.codigo, nome: data.nome, peso: Number(data.peso), ordem: Number(data.ordem) } : p));
      emit();
    },
  };

  /** Anos disponíveis no seletor: 2025 até o ano corrente + 2, mais os que têm valores. */
  function anosDisponiveis() {
    const set = new Set();
    for (let y = Math.min(2025, anoCorrente()); y <= anoCorrente() + 2; y++) set.add(y);
    state.unidades.forEach(u => Object.keys(u.mesesPorAno || {}).forEach(y => set.add(Number(y))));
    set.add(ano);
    return [...set].filter(anoValido).sort((a, b) => a - b);
  }
  /** Troca o ano selecionado (por navegador) e avisa as telas. */
  function definirAno(novo) {
    const y = Math.round(toNum(novo, ano));
    if (!anoValido(y) || y === ano) return;
    ano = y;
    try { localStorage.setItem(ANO_KEY, String(y)); } catch (_) { /* ignora */ }
    state.unidades.forEach(aplicarAno);
    emit();
  }

  /* ---------- parâmetros do motor (linha única) ---------- */

  const parametros = {
    get: () => ({ ...state.parametros, diasUteis: state.parametros.diasUteis.slice(), rampup: state.parametros.rampup.slice() }),
    async update(patch, { silent = false } = {}) {
      const novo = buildParametros({ ...state.parametros, ...patch });
      const { data, error } = await db.from('parametros').update(parametrosToRow(novo)).eq('id', 1).select().single();
      if (error) throw falha(error, 'Não foi possível salvar os parâmetros.');
      state.parametros = parametrosFromRow(data);
      if (!silent) emit();
      return parametros.get();
    },
  };

  /** Nome de uma unidade pelo id (ou ''). */
  function nomeUnidade(unidadeId) {
    const u = unidadeId ? state.unidades.find(x => x.id === unidadeId) : null;
    return u ? u.nome : '';
  }

  /** Texto "Matriz 60% · Filial 40%" (ou '' se não alocado). */
  function descricaoAlocacoes(c) {
    return (c.alocacoes || [])
      .map(a => `${nomeUnidade(a.unidadeId) || a.unidadeNome || '?'} ${a.percentual % 1 === 0 ? a.percentual : a.percentual.toFixed(1).replace('.', ',')}%`)
      .join(' · ');
  }

  /** Soma dos percentuais alocados (0–100). */
  function totalAlocado(c) {
    return (c.alocacoes || []).reduce((s, a) => s + a.percentual, 0);
  }

  /** Verifica se já existe registro com o mesmo nome (ignora maiúsculas/minúsculas). */
  function nomeDuplicado(key, nome, exceptId = null) {
    const alvo = chave(nome);
    return state[key].some(x => x.id !== exceptId && chave(x.nome) === alvo);
  }

  /** Reinsere os documentos padrão que foram removidos. Retorna quantos foram adicionados. */
  async function restaurarDocumentosPadrao() {
    const faltando = DEFAULT_DOCUMENTOS.filter(d => !nomeDuplicado('documentos', d.nome));
    if (faltando.length === 0) return 0;
    const cfg = TABELAS.documentos;
    const { data, error } = await db.from(cfg.table).insert(faltando.map(cfg.toRow)).select();
    if (error) throw falha(error, 'Não foi possível restaurar os itens padrão.');
    state.documentos.push(...data.map(cfg.fromRow));
    emit();
    return data.length;
  }

  /* ---------- backup ---------- */

  function exportJSON() {
    const payload = {
      app: APP_ID,
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      funcoes: state.funcoes.map(f => { const s = f.respondeParaId ? state.funcoes.find(x => x.id === f.respondeParaId) : null; return { ...f, respondePara: s ? s.nome : null }; }),
      portes: state.portes,
      unidades: state.unidades.map(u => ({
        id: u.id, nome: u.nome,
        demandaPorMes: demandaLista(u),
        clientesAtivosPorMes: clientesAtivosLista(u),
      })),
      documentos: state.documentos,
      colaboradores: state.colaboradores.map(c => ({ ...c, ...infoFuncao(c.funcaoId), alocacoes: comNomes(c.alocacoes || []) })),
      parametros: state.parametros,
    };
    return JSON.stringify(payload, null, 2);
  }

  /** Lê o texto de um backup e devolve o estado normalizado (não aplica). Lança erro se inválido. */
  function parseImport(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (_) {
      throw new Error('Não foi possível ler o arquivo: o conteúdo não é um JSON válido.');
    }
    return normalize(raw);
  }

  /** Substitui TODOS os dados na nuvem pelo conteúdo normalizado (transação única). */
  async function importar(dados) {
    const { error } = await db.rpc('importar_backup', { p: dados });
    if (error) throw falha(error, 'Falha ao importar o backup.');
    await loadAll();
  }

  /* ---------- dados locais da versão anterior (só localStorage) ---------- */

  /** Devolve os dados locais antigos normalizados, ou null se não houver / forem ilegíveis. */
  function lerDadosLocais() {
    try {
      const text = localStorage.getItem(LOCAL_KEY);
      if (!text) return null;
      return normalize(JSON.parse(text));
    } catch (_) {
      return null;
    }
  }

  /** Move os dados locais antigos para uma chave de backup (não volta a perguntar). */
  function arquivarDadosLocais() {
    try {
      const text = localStorage.getItem(LOCAL_KEY);
      if (text) localStorage.setItem(LOCAL_BACKUP_KEY, text);
      localStorage.removeItem(LOCAL_KEY);
    } catch (_) { /* ignora */ }
  }

  /** Média mensal de clientes (Mensal + Exclusiva TST) de uma unidade no ano selecionado. */
  function mediaClientesMes(u) {
    let s = 0;
    for (let m = 1; m <= 12; m++) {
      const exc = (u.meses || {})[m];
      s += exc ? (Number(exc.empresasVencidas) || 0) + (Number(exc.empresasExclusivaTst) || 0) : 0;
    }
    return s / 12;
  }

  function counts() {
    return {
      unidades: state.unidades.length,
      empresas: Math.round(state.unidades.reduce((soma, u) => soma + mediaClientesMes(u), 0)),
      documentos: state.documentos.length,
      colaboradores: state.colaboradores.length,
    };
  }

  return {
    FUNCOES,
    TIPOS_PRODUCAO,
    COORDENA,
    CONDICOES,
    INFORMATIVOS,
    DEFAULT_COLABORADOR,
    DEFAULT_PARAMETROS,
    funcoes: makeCollection('funcoes'),
    unidades: makeCollection('unidades'),
    documentos: makeCollection('documentos'),
    colaboradores: makeCollection('colaboradores'),
    parametros,
    empresasMes,
    portes,
    mediaClientesMes,
    get ano() { return ano; },
    definirAno,
    anosDisponiveis,
    nomeUnidade,
    descricaoAlocacoes,
    totalAlocado,
    loadAll,
    reloadIfStale,
    clear,
    nomeDuplicado,
    restaurarDocumentosPadrao,
    exportJSON,
    parseImport,
    importar,
    lerDadosLocais,
    arquivarDadosLocais,
    counts,
    get loaded() { return loaded; },
  };
})();
