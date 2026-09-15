/* ==========================================================================
   Store — estado da aplicação sobre as tabelas do Supabase

   - Ao entrar, carrega tudo para um cache em memória (dataset pequeno).
   - Leituras (list/get/counts) são síncronas, a partir do cache.
   - Escritas (add/update/remove) gravam no Supabase e só então atualizam o
     cache e disparam 'store:change'. Rejeitam com Error de mensagem amigável.
   - Exportar/Importar JSON continuam disponíveis como backup; a importação
     substitui tudo numa transação (RPC importar_backup).

   Formato em JS (igual ao backup exportado, versão 2):
     unidades:      [{ id, nome, empresasVencidas, empresas (= empresasVencidas),
                       mesesPorAno: { [ano]: { [1..12]: { empresasVencidas } } },  // valores próprios por ano/mês
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
  const SCHEMA_VERSION = 9; // v9: empresasPorMes com ano
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
    ocupacaoAlvo: 85, prazoDias: 60,
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
      (out[y] = out[y] || {})[mes] = { empresasVencidas: vencidasDe(v) };
    });
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
  const buildUnidade = u => {
    const vencidas = vencidasDe(u);
    return {
      nome: toStr(u.nome), empresasVencidas: vencidas, empresas: vencidas,
      mesesPorAno: buildMesesPorAno(u.empresasPorMes !== undefined ? u.empresasPorMes : (u.mesesPorAno !== undefined ? u.mesesPorAno : u.meses)),
    };
  };
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
  });
  const buildColaborador = c => ({
    nome: toStr(c.nome),
    funcaoId: toStr(c.funcaoId) || null,
    funcao: toStr(c.funcao), // nome (usado no backup; o id vem do cadastro de funções)
    empresasDia: Math.max(0, toNum(c.empresasDia, DEFAULT_COLABORADOR.empresasDia)),
    inspecoesDia: Math.max(0, toNum(c.inspecoesDia, DEFAULT_COLABORADOR.inspecoesDia)),
    relatoriosDia: Math.max(0, toNum(c.relatoriosDia, DEFAULT_COLABORADOR.relatoriosDia)),
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
    return {
      diasUteis: dias,
      ocupacaoAlvo: clamp(pos(base.ocupacaoAlvo, DEFAULT_PARAMETROS.ocupacaoAlvo), 1, 100),
      prazoDias: clamp(Math.round(pos(base.prazoDias, DEFAULT_PARAMETROS.prazoDias)), 1, 365),
    };
  };
  const parametrosToRow = q => ({ dias_uteis: q.diasUteis, ocupacao_alvo: q.ocupacaoAlvo, prazo_dias: q.prazoDias });
  const parametrosFromRow = r => buildParametros({ diasUteis: r.dias_uteis, ocupacaoAlvo: r.ocupacao_alvo, prazoDias: r.prazo_dias });

  const TABELAS = {
    funcoes: {
      table: 'funcoes',
      build: buildFuncao,
      toRow: f => ({ nome: f.nome, tipo_producao: f.tipoProducao, chefia: f.chefia, coordena: f.chefia ? f.coordena : 'todos', responde_para: f.chefia ? f.respondeParaId : null, ordem: f.ordem }),
      fromRow: r => ({ id: r.id, nome: r.nome, tipoProducao: r.tipo_producao, chefia: r.chefia === true, coordena: r.coordena || 'todos', respondeParaId: r.responde_para || null, ordem: Number(r.ordem) }),
    },
    unidades: {
      table: 'unidades',
      build: buildUnidade,
      toRow: u => ({ nome: u.nome, empresas_vencidas: u.empresasVencidas }),
      fromRow: r => ({
        id: r.id, nome: r.nome,
        empresasVencidas: Number(r.empresas_vencidas), empresas: Number(r.empresas_vencidas),
        mesesPorAno: {}, meses: {},
      }),
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
      toRow: c => ({ nome: c.nome, funcao_id: c.funcaoId, empresas_dia: c.empresasDia, inspecoes_dia: c.inspecoesDia, relatorios_dia: c.relatoriosDia }),
      fromRow: r => ({ id: r.id, nome: r.nome, funcaoId: r.funcao_id, empresasDia: Number(r.empresas_dia), inspecoesDia: Number(r.inspecoes_dia), relatoriosDia: Number(r.relatorios_dia), alocacoes: [] }),
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

  let state = { funcoes: [], unidades: [], documentos: [], colaboradores: [], parametros: buildParametros(null) };
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
      db.from('unidade_empresas_mes').select('unidade_id, ano, mes, empresas_vencidas')
        .then(({ data, error }) => {
          if (error) throw falha(error, 'Falha ao carregar a variação mensal de empresas.');
          return ['_meses', data];
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
    state._meses.forEach(m => {
      const porAno = (porUnidade[m.unidade_id] = porUnidade[m.unidade_id] || {});
      (porAno[m.ano] = porAno[m.ano] || {})[m.mes] = { empresasVencidas: Number(m.empresas_vencidas) };
    });
    delete state._meses;
    state.unidades.forEach(u => { u.mesesPorAno = porUnidade[u.id] || {}; aplicarAno(u); });
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
    state = { funcoes: [], unidades: [], documentos: [], colaboradores: [], parametros: buildParametros(null) };
    loaded = false;
    loadedAt = 0;
  }

  /** Nome e tipo de produção de uma função (pelo id), para enriquecer o colaborador. */
  function infoFuncao(funcaoId) {
    const f = funcaoId ? state.funcoes.find(x => x.id === funcaoId) : null;
    return { funcao: f ? f.nome : '', tipoProducao: f ? f.tipoProducao : 'nenhuma', chefia: !!(f && f.chefia), coordena: f && f.chefia ? f.coordena : 'todos', funcaoOrdem: f ? f.ordem : 9999 };
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

  const empresasMes = {
    /** Define o valor próprio de um mês do ano selecionado (valores) ou remove (null → volta ao padrão). */
    async definir(unidadeId, mes, valores, { silent = false } = {}) {
      const u = state.unidades.find(x => x.id === unidadeId);
      if (!u) throw new Error('Unidade não encontrada.');
      const doAno = { ...((u.mesesPorAno || {})[ano] || {}) };
      if (valores) {
        const row = {
          unidade_id: unidadeId, ano, mes,
          empresas_vencidas: Math.max(0, toInt(valores.empresasVencidas, 0)),
        };
        const { error } = await db.from('unidade_empresas_mes').upsert(row, { onConflict: 'unidade_id,ano,mes' });
        if (error) throw falha(error, 'Não foi possível salvar o valor do mês.');
        doAno[mes] = { empresasVencidas: row.empresas_vencidas };
      } else {
        const { error } = await db.from('unidade_empresas_mes').delete().eq('unidade_id', unidadeId).eq('ano', ano).eq('mes', mes);
        if (error) throw falha(error, 'Não foi possível remover o valor do mês.');
        delete doAno[mes];
      }
      u.mesesPorAno = { ...(u.mesesPorAno || {}), [ano]: doAno };
      aplicarAno(u);
      if (!silent) emit();
    },
    /** Remove todos os valores próprios da unidade no ano selecionado (todos os meses voltam ao padrão). */
    async limpar(unidadeId) {
      const u = state.unidades.find(x => x.id === unidadeId);
      if (!u) throw new Error('Unidade não encontrada.');
      const { error } = await db.from('unidade_empresas_mes').delete().eq('unidade_id', unidadeId).eq('ano', ano);
      if (error) throw falha(error, 'Não foi possível limpar os valores do ano.');
      u.mesesPorAno = { ...(u.mesesPorAno || {}) };
      delete u.mesesPorAno[ano];
      aplicarAno(u);
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
    get: () => ({ ...state.parametros, diasUteis: state.parametros.diasUteis.slice() }),
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
      unidades: state.unidades.map(u => ({
        ...u,
        meses: undefined,
        empresasPorMes: Object.entries(u.mesesPorAno || {})
          .flatMap(([a, meses]) => Object.entries(meses || {}).map(([mes, v]) => ({ ano: Number(a), mes: Number(mes), ...v })))
          .sort((a, b) => a.ano - b.ano || a.mes - b.mes),
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
    TIPOS_PRODUCAO,
    COORDENA,
    DEFAULT_COLABORADOR,
    DEFAULT_PARAMETROS,
    funcoes: makeCollection('funcoes'),
    unidades: makeCollection('unidades'),
    documentos: makeCollection('documentos'),
    colaboradores: makeCollection('colaboradores'),
    parametros,
    empresasMes,
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
