/* ==========================================================================
   Store de cadastros — a fonte única de dados da aplicação (cache do banco).
   Carrega tudo de uma vez, expõe listas prontas para as telas e para o motor,
   e cada escrita atualiza o cache sem recarregar (a tela reage sozinha).
   ========================================================================== */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as api from '../services/api.js';

export const useCadastrosStore = defineStore('cadastros', () => {
  const funcoes = ref([]);
  const unidades = ref([]);
  const colaboradores = ref([]);
  const portes = ref([]);
  const parametros = ref({ ...api.PARAMETROS_PADRAO });
  const clientesPorte = ref({}); // { [codigo]: { nome, porte } } — porte de cada cliente do SGG
  const carregado = ref(false);
  const carregando = ref(false);
  const erro = ref('');
  let carregadoEm = 0;

  /* ---------- carga ---------- */

  async function carregar() {
    carregando.value = true;
    erro.value = '';
    try {
      const d = await api.carregarTudo();
      funcoes.value = d.funcoes;
      unidades.value = d.unidades;
      colaboradores.value = d.colaboradores;
      portes.value = d.portes;
      parametros.value = d.parametros;
      clientesPorte.value = d.clientesPorte || {};
      carregado.value = true;
      carregadoEm = Date.now();
    } catch (e) {
      erro.value = e.message;
      throw e;
    } finally {
      carregando.value = false;
    }
  }
  /** Recarrega se a última carga tiver mais de `maxAgeMs` (ao voltar para a aba). */
  async function recarregarSeVelho(maxAgeMs = 30000) {
    if (!carregado.value || Date.now() - carregadoEm < maxAgeMs) return;
    await carregar();
  }
  function limpar() {
    funcoes.value = []; unidades.value = []; colaboradores.value = []; portes.value = [];
    parametros.value = { ...api.PARAMETROS_PADRAO }; clientesPorte.value = {}; carregado.value = false;
  }

  /* ---------- getters ---------- */

  const funcaoPorId = computed(() => Object.fromEntries(funcoes.value.map(f => [f.id, f])));
  const unidadePorId = computed(() => Object.fromEntries(unidades.value.map(u => [u.id, u])));
  const pesosPorte = computed(() => Object.fromEntries(portes.value.map(p => [p.codigo, p.peso])));

  /** Colaboradores enriquecidos com a função (nome, tipo, chefia, custo) — o formato que o motor lê. */
  const colaboradoresCompletos = computed(() => colaboradores.value.map(c => {
    const f = funcaoPorId.value[c.funcaoId] || null;
    return {
      ...c,
      funcao: f ? f.nome : '',
      tipoProducao: f ? f.tipoProducao : 'nenhuma',
      chefia: !!(f && f.chefia),
      coordena: f && f.chefia ? f.coordena : 'todos',
      funcaoOrdem: f ? f.ordem : 9999,
      funcaoCustoMensal: f ? f.custoMensal : 0,
      alocacoes: c.alocacoes.map(a => ({ ...a, unidadeNome: (unidadePorId.value[a.unidadeId] || {}).nome || '' })),
    };
  }));

  /** Unidades com `meses` do ano pedido (formato do motor). */
  function unidadesDoAno(ano) {
    return unidades.value.map(u => ({ id: u.id, nome: u.nome, meses: (u.mesesPorAno && u.mesesPorAno[ano]) || {} }));
  }
  /** Anos que aparecem no seletor: 2025 até o ano corrente + 2, mais os que têm números. */
  function anosDisponiveis(anoSelecionado) {
    const hoje = new Date().getFullYear();
    const set = new Set();
    for (let y = Math.min(2025, hoje); y <= hoje + 2; y++) set.add(y);
    unidades.value.forEach(u => Object.keys(u.mesesPorAno || {}).forEach(y => set.add(Number(y))));
    if (anoSelecionado) set.add(anoSelecionado);
    return [...set].sort((a, b) => a - b);
  }
  const contagens = computed(() => ({ unidades: unidades.value.length, colaboradores: colaboradores.value.length, funcoes: funcoes.value.length }));

  /* ---------- escrita: funções ---------- */

  const ordenarFuncoes = () => funcoes.value.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  async function adicionarFuncao(f) { const nova = await api.funcoes.inserir(f); funcoes.value.push(nova); ordenarFuncoes(); return nova; }
  async function atualizarFuncao(id, patch) {
    const atual = funcaoPorId.value[id]; if (!atual) throw new Error('Função não encontrada.');
    const salva = await api.funcoes.atualizar(id, { ...atual, ...patch });
    funcoes.value = funcoes.value.map(f => (f.id === id ? salva : f)); ordenarFuncoes(); return salva;
  }
  async function removerFuncao(id) { await api.funcoes.remover(id); funcoes.value = funcoes.value.filter(f => f.id !== id); }

  /* ---------- escrita: unidades ---------- */

  async function adicionarUnidade(u) { const nova = await api.unidades.inserir(u); unidades.value.push(nova); return nova; }
  async function atualizarUnidade(id, patch) {
    const atual = unidadePorId.value[id]; if (!atual) throw new Error('Unidade não encontrada.');
    const salva = await api.unidades.atualizar(id, { ...atual, ...patch });
    unidades.value = unidades.value.map(u => (u.id === id ? { ...u, ...salva } : u)); return salva;
  }
  async function removerUnidade(id) { await api.unidades.remover(id); unidades.value = unidades.value.filter(u => u.id !== id); }

  /* ---------- escrita: colaboradores ---------- */

  async function adicionarColaborador(c) {
    const novo = await api.colaboradores.inserir(c);
    novo.alocacoes = c.alocacoes && c.alocacoes.length ? await api.colaboradores.definirAlocacoes(novo.id, c.alocacoes) : [];
    colaboradores.value.push(novo); return novo;
  }
  async function atualizarColaborador(id, patch) {
    const atual = colaboradores.value.find(c => c.id === id); if (!atual) throw new Error('Colaborador não encontrado.');
    const salvo = await api.colaboradores.atualizar(id, { ...atual, ...patch });
    salvo.alocacoes = patch.alocacoes !== undefined ? await api.colaboradores.definirAlocacoes(id, patch.alocacoes) : atual.alocacoes;
    colaboradores.value = colaboradores.value.map(c => (c.id === id ? salvo : c)); return salvo;
  }
  async function removerColaborador(id) { await api.colaboradores.remover(id); colaboradores.value = colaboradores.value.filter(c => c.id !== id); }

  /* ---------- escrita: demanda por mês ---------- */

  function mesDaUnidade(u, ano, mes) { return ((u.mesesPorAno || {})[ano] || {})[mes] || api.montarMes({}, 0); }
  function guardarMes(u, ano, mes, valorMes) {
    const doAno = { ...((u.mesesPorAno || {})[ano] || {}) };
    const vazio = valorMes.empresasVencidas === 0 && valorMes.empresasExclusivaTst === 0 && valorMes.clientesAtivos === 0;
    if (vazio) delete doAno[mes]; else doAno[mes] = valorMes;
    u.mesesPorAno = { ...(u.mesesPorAno || {}), [ano]: doAno };
  }
  async function definirDemanda(unidadeId, ano, mes, condicao, porte, quantidade) {
    const u = unidadePorId.value[unidadeId]; if (!u) throw new Error('Unidade não encontrada.');
    const q = await api.demanda.definir(unidadeId, ano, mes, condicao, porte, quantidade);
    const atual = mesDaUnidade(u, ano, mes);
    const demanda = { ...atual.demanda, [condicao]: { ...(atual.demanda[condicao] || {}) } };
    if (q > 0) demanda[condicao][porte] = q; else delete demanda[condicao][porte];
    guardarMes(u, ano, mes, api.montarMes(demanda, atual.clientesAtivos));
  }
  async function definirClientesAtivos(unidadeId, ano, mes, quantidade) {
    const u = unidadePorId.value[unidadeId]; if (!u) throw new Error('Unidade não encontrada.');
    const q = await api.demanda.definirClientesAtivos(unidadeId, ano, mes, quantidade);
    const atual = mesDaUnidade(u, ano, mes);
    guardarMes(u, ano, mes, api.montarMes(atual.demanda, q));
  }
  async function substituirDemandaAno(ano, linhas, condicao = null) { const r = await api.demanda.substituirAno(ano, linhas, condicao); await carregar(); return r; }
  /** Grava o porte de clientes (lista de { codigo, nome, porte }) e atualiza o cache. */
  async function salvarClientesPorte(lista) {
    await api.salvarClientesPorte(lista);
    const novo = { ...clientesPorte.value };
    lista.forEach(x => { if (x && String(x.codigo).trim()) novo[String(x.codigo).trim()] = { nome: x.nome || '', porte: x.porte }; });
    clientesPorte.value = novo;
  }
  async function limparAno(unidadeId, ano) {
    const u = unidadePorId.value[unidadeId]; if (!u) throw new Error('Unidade não encontrada.');
    await api.demanda.limparAno(unidadeId, ano);
    const m = { ...(u.mesesPorAno || {}) }; delete m[ano]; u.mesesPorAno = m;
  }

  /* ---------- escrita: parâmetros e portes ---------- */

  async function atualizarParametros(patch) { parametros.value = await api.atualizarParametros({ ...parametros.value, ...patch }); return parametros.value; }
  async function atualizarPorte(codigo, patch) {
    const atual = portes.value.find(p => p.codigo === codigo); if (!atual) throw new Error('Porte não encontrado.');
    const salvo = await api.atualizarPorte(codigo, { ...atual, ...patch });
    portes.value = portes.value.map(p => (p.codigo === codigo ? salvo : p)); return salvo;
  }

  /* ---------- backup ---------- */

  function exportarBackup() {
    const listaDemanda = u => Object.entries(u.mesesPorAno || {}).flatMap(([ano, meses]) => Object.entries(meses).flatMap(([mes, v]) =>
      api.CONDICOES.flatMap(c => Object.entries((v.demanda || {})[c.condicao] || {}).filter(([, q]) => q > 0)
        .map(([porte, quantidade]) => ({ ano: Number(ano), mes: Number(mes), condicao: c.condicao, porte, quantidade })))));
    const listaAtivos = u => Object.entries(u.mesesPorAno || {}).flatMap(([ano, meses]) => Object.entries(meses)
      .filter(([, v]) => v.clientesAtivos > 0).map(([mes, v]) => ({ ano: Number(ano), mes: Number(mes), clientesAtivos: v.clientesAtivos })));
    return {
      app: 'chabra-dimensiona', version: 12, exportedAt: new Date().toISOString(),
      portes: portes.value,
      funcoes: funcoes.value.map(f => ({ ...f, respondePara: f.respondeParaId ? (funcaoPorId.value[f.respondeParaId] || {}).nome || null : null })),
      unidades: unidades.value.map(u => ({ id: u.id, nome: u.nome, demandaPorMes: listaDemanda(u), clientesAtivosPorMes: listaAtivos(u) })),
      colaboradores: colaboradoresCompletos.value,
      parametros: parametros.value,
    };
  }
  async function importarBackup(json) { await api.importarBackup(json); await carregar(); }

  return {
    funcoes, unidades, colaboradores, portes, parametros, clientesPorte, carregado, carregando, erro,
    funcaoPorId, unidadePorId, pesosPorte, colaboradoresCompletos, contagens,
    carregar, recarregarSeVelho, limpar, unidadesDoAno, anosDisponiveis,
    adicionarFuncao, atualizarFuncao, removerFuncao,
    adicionarUnidade, atualizarUnidade, removerUnidade,
    adicionarColaborador, atualizarColaborador, removerColaborador,
    definirDemanda, definirClientesAtivos, limparAno, substituirDemandaAno, salvarClientesPorte,
    atualizarParametros, atualizarPorte,
    exportarBackup, importarBackup,
  };
});
