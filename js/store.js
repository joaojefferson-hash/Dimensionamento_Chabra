/* ==========================================================================
   Store — estado da aplicação, persistência em localStorage e backup JSON

   Modelo de dados (schema v1):
   {
     app: 'chabra-dimensiona', version: 1, updatedAt: ISO,
     unidades:      [{ id, nome, empresas }],
     documentos:    [{ id, nome, horas, periodicidadeMeses }],   // 0 = sob demanda
     colaboradores: [{ id, nome, funcao, horasMes, eficiencia }] // eficiencia em %
   }
   ========================================================================== */

const Store = (() => {
  const STORAGE_KEY = 'chabra-dimensiona:data';
  const APP_ID = 'chabra-dimensiona';
  const SCHEMA_VERSION = 1;

  const FUNCOES = ['Técnico de Segurança do Trabalho', 'Administrativo'];

  const DEFAULT_COLABORADOR = { horasMes: 160, eficiencia: 80 };

  // Valores iniciais são sugestões — todos editáveis pela equipe.
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

  function uid() {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- normalização de registros (usada no CRUD e na importação) ---------- */

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

  function emptyState() {
    return {
      app: APP_ID,
      version: SCHEMA_VERSION,
      updatedAt: null,
      unidades: [],
      documentos: DEFAULT_DOCUMENTOS.map(d => ({ id: uid(), ...d })),
      colaboradores: [],
    };
  }

  /** Valida e normaliza um objeto bruto (localStorage ou arquivo importado). */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('O arquivo não contém um objeto JSON válido.');
    }
    const known = ['unidades', 'documentos', 'colaboradores'];
    if (!known.some(k => Array.isArray(raw[k]))) {
      throw new Error('O arquivo não parece ser um backup do Chabra Dimensiona.');
    }
    const arr = k => (Array.isArray(raw[k]) ? raw[k] : []);
    const withId = (item, build) => ({ id: toStr(item && item.id) || uid(), ...build(item || {}) });

    const state = emptyState();
    state.unidades = arr('unidades').map(u => withId(u, buildUnidade)).filter(u => u.nome);
    // Sem a chave "documentos" mantém o catálogo padrão; lista vazia explícita é respeitada.
    if (Array.isArray(raw.documentos)) {
      state.documentos = raw.documentos.map(d => withId(d, buildDocumento)).filter(d => d.nome);
    }
    state.colaboradores = arr('colaboradores').map(c => withId(c, buildColaborador)).filter(c => c.nome);
    state.updatedAt = toStr(raw.updatedAt) || null;
    return state;
  }

  /* ---------- persistência ---------- */

  let storageOk = true;

  function load() {
    let text = null;
    try {
      text = localStorage.getItem(STORAGE_KEY);
      if (!text) return emptyState();
      return normalize(JSON.parse(text));
    } catch (err) {
      console.warn('[Store] Dados salvos ilegíveis; iniciando do zero.', err);
      try { if (text) localStorage.setItem(STORAGE_KEY + ':corrompido', text); } catch (_) { /* ignora */ }
      return emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (err) {
      storageOk = false;
      console.error('[Store] Falha ao salvar no localStorage.', err);
      document.dispatchEvent(new CustomEvent('store:error', { detail: err }));
    }
  }

  let state = load();

  /**
   * Aplica uma mutação, persiste e avisa a interface.
   * opts.silent = true → salva sem disparar 'store:change' (para edições inline).
   */
  function commit(mutator, { silent = false } = {}) {
    mutator(state);
    state.updatedAt = new Date().toISOString();
    save();
    if (!silent) document.dispatchEvent(new CustomEvent('store:change'));
  }

  /* ---------- CRUD genérico por coleção ---------- */

  function makeCollection(key, build) {
    return {
      list: () => state[key].slice(),
      get: id => state[key].find(x => x.id === id) || null,
      add(data, opts) {
        const item = { id: uid(), ...build(data) };
        commit(s => s[key].push(item), opts);
        return item;
      },
      update(id, patch, opts) {
        commit(s => {
          const i = s[key].findIndex(x => x.id === id);
          if (i >= 0) s[key][i] = { id, ...build({ ...s[key][i], ...patch }) };
        }, opts);
      },
      remove(id, opts) {
        commit(s => { s[key] = s[key].filter(x => x.id !== id); }, opts);
      },
    };
  }

  /** Verifica se já existe registro com o mesmo nome (ignora maiúsculas/minúsculas). */
  function nomeDuplicado(key, nome, exceptId = null) {
    const alvo = toStr(nome).toLocaleLowerCase('pt-BR');
    return state[key].some(x => x.id !== exceptId && x.nome.toLocaleLowerCase('pt-BR') === alvo);
  }

  /** Reinsere os documentos padrão que foram removidos. Retorna quantos foram adicionados. */
  function restaurarDocumentosPadrao() {
    let adicionados = 0;
    commit(s => {
      DEFAULT_DOCUMENTOS.forEach(d => {
        if (!nomeDuplicado('documentos', d.nome)) {
          s.documentos.push({ id: uid(), ...d });
          adicionados++;
        }
      });
    });
    return adicionados;
  }

  /* ---------- backup ---------- */

  function exportJSON() {
    const payload = { ...state, app: APP_ID, version: SCHEMA_VERSION, exportedAt: new Date().toISOString() };
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

  /** Substitui todo o estado atual (usado na importação). */
  function replace(newState) {
    state = newState;
    commit(() => {});
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
    unidades: makeCollection('unidades', buildUnidade),
    documentos: makeCollection('documentos', buildDocumento),
    colaboradores: makeCollection('colaboradores', buildColaborador),
    nomeDuplicado,
    restaurarDocumentosPadrao,
    exportJSON,
    parseImport,
    replace,
    counts,
    get updatedAt() { return state.updatedAt; },
    get storageOk() { return storageOk; },
  };
})();
