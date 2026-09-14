/* ==========================================================================
   Store — estado da aplicação sobre as tabelas do Supabase

   - Ao entrar, carrega tudo para um cache em memória (dataset pequeno).
   - Leituras (list/get/counts) são síncronas, a partir do cache.
   - Escritas (add/update/remove) gravam no Supabase e só então atualizam o
     cache e disparam 'store:change'. Rejeitam com Error de mensagem amigável.
   - Exportar/Importar JSON continuam disponíveis como backup; a importação
     substitui tudo numa transação (RPC importar_backup).

   Formato em JS (igual ao backup exportado):
     unidades:      [{ id, nome, empresas }]
     documentos:    [{ id, nome, horas, periodicidadeMeses }]   // 0 = sob demanda
     colaboradores: [{ id, nome, funcao, horasMes, eficiencia }] // eficiencia em %
   ========================================================================== */

const Store = (() => {
  const APP_ID = 'chabra-dimensiona';
  const SCHEMA_VERSION = 1;
  const LOCAL_KEY = 'chabra-dimensiona:data';            // versão antiga (só localStorage)
  const LOCAL_BACKUP_KEY = 'chabra-dimensiona:backup-local'; // onde os dados locais ficam após a migração

  const FUNCOES = ['Técnico de Segurança do Trabalho', 'Administrativo'];
  const DEFAULT_COLABORADOR = { horasMes: 160, eficiencia: 80 };

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

  const buildUnidade = u => ({
    nome: toStr(u.nome),
    empresas: toInt(u.empresas, 0),
  });
  const buildDocumento = d => ({
    nome: toStr(d.nome),
    horas: Math.max(0, toNum(d.horas, 0)),
    periodicidadeMeses: toInt(d.periodicidadeMeses, 0),
  });
  const buildColaborador = c => ({
    nome: toStr(c.nome),
    funcao: FUNCOES.includes(c.funcao) ? c.funcao : FUNCOES[0],
    horasMes: Math.max(0, toNum(c.horasMes, DEFAULT_COLABORADOR.horasMes)),
    eficiencia: clamp(toNum(c.eficiencia, DEFAULT_COLABORADOR.eficiencia), 1, 100),
  });

  const TABELAS = {
    unidades: {
      table: 'unidades',
      build: buildUnidade,
      toRow: u => ({ nome: u.nome, empresas: u.empresas }),
      fromRow: r => ({ id: r.id, nome: r.nome, empresas: Number(r.empresas) }),
    },
    documentos: {
      table: 'documentos',
      build: buildDocumento,
      toRow: d => ({ nome: d.nome, horas: d.horas, periodicidade_meses: d.periodicidadeMeses }),
      fromRow: r => ({ id: r.id, nome: r.nome, horas: Number(r.horas), periodicidadeMeses: Number(r.periodicidade_meses) }),
    },
    colaboradores: {
      table: 'colaboradores',
      build: buildColaborador,
      toRow: c => ({ nome: c.nome, funcao: c.funcao, horas_mes: c.horasMes, eficiencia: c.eficiencia }),
      fromRow: r => ({ id: r.id, nome: r.nome, funcao: r.funcao, horasMes: Number(r.horas_mes), eficiencia: Number(r.eficiencia) }),
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
    return {
      unidades: lista('unidades', buildUnidade),
      // Sem a chave "documentos" mantém o catálogo padrão; lista vazia explícita é respeitada.
      documentos: Array.isArray(raw.documentos) ? lista('documentos', buildDocumento) : DEFAULT_DOCUMENTOS.map(d => ({ ...d })),
      colaboradores: lista('colaboradores', buildColaborador),
    };
  }

  /* ---------- erros amigáveis ---------- */

  function falha(error, fallback) {
    const code = error && error.code;
    const msg = String((error && error.message) || '');
    let texto;
    if (code === '23505') texto = 'Já existe um registro com esse nome.';
    else if (code === '23514') texto = 'Valor fora do permitido (verifique os números informados).';
    else if (code === '42501' || code === 'PGRST301' || /jwt|not authenticated/i.test(msg)) texto = 'Sessão expirada ou sem permissão. Entre novamente.';
    else if (/failed to fetch|networkerror|load failed/i.test(msg)) texto = 'Sem conexão com o servidor. Verifique a internet.';
    else texto = msg || fallback;
    const e = new Error(texto);
    e.cause = error;
    return e;
  }

  /* ---------- estado (cache) ---------- */

  let state = { unidades: [], documentos: [], colaboradores: [] };
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
    const resultados = await Promise.all(consultas);
    state = Object.fromEntries(resultados);
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
    state = { unidades: [], documentos: [], colaboradores: [] };
    loaded = false;
    loadedAt = 0;
  }

  /* ---------- CRUD genérico por coleção ---------- */

  function makeCollection(key) {
    const { table, build, toRow, fromRow } = TABELAS[key];
    return {
      list: () => state[key].slice(),
      get: id => state[key].find(x => x.id === id) || null,

      async add(data) {
        const { data: row, error } = await db.from(table).insert(toRow(build(data))).select().single();
        if (error) throw falha(error, 'Não foi possível adicionar.');
        const item = fromRow(row);
        state[key].push(item);
        emit();
        return item;
      },

      async update(id, patch, { silent = false } = {}) {
        const atual = state[key].find(x => x.id === id);
        if (!atual) throw new Error('Registro não encontrado (talvez tenha sido excluído em outra máquina).');
        const { data: row, error } = await db.from(table).update(toRow(build({ ...atual, ...patch }))).eq('id', id).select().single();
        if (error) throw falha(error, 'Não foi possível salvar.');
        const item = fromRow(row);
        state[key] = state[key].map(x => (x.id === id ? item : x));
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
      unidades: state.unidades,
      documentos: state.documentos,
      colaboradores: state.colaboradores,
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

  function counts() {
    return {
      unidades: state.unidades.length,
      empresas: state.unidades.reduce((soma, u) => soma + u.empresas, 0),
      documentos: state.documentos.length,
      colaboradores: state.colaboradores.length,
    };
  }

  return {
    FUNCOES,
    DEFAULT_COLABORADOR,
    unidades: makeCollection('unidades'),
    documentos: makeCollection('documentos'),
    colaboradores: makeCollection('colaboradores'),
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
