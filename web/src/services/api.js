/* ==========================================================================
   Serviços de dados — a única camada que fala com o Supabase.
   Entrada/saída em objetos do domínio (camelCase), no mesmo formato que o
   motor (engine/calculo.js) consome. Nada de estado aqui: quem guarda é a store.

   Domínio:
     funcao:      { id, nome, tipoProducao, chefia, coordena, respondeParaId, ordem, custoMensal }
     unidade:     { id, nome, mesesPorAno: { [ano]: { [mes 1..12]: { demanda: { mensal: {P,M,G…}, exclusiva_tst: {…} },
                                                                   empresasVencidas, empresasExclusivaTst, clientesAtivos } } } }
     colaborador: { id, nome, funcaoId, inspecoesDia, relatoriosDia, empresasDia, dataAdmissao, dataDesligamento, custoMensal,
                    alocacoes: [{ unidadeId, percentual }] }
     porte:       { codigo, nome, peso, ordem }
     parametros:  { diasUteis[12], ocupacaoAlvo, prazoDias, rampup[] }
   ========================================================================== */
import { supabase, erroAmigavel } from './supabase.js';

export const CONDICOES = [
  { condicao: 'mensal',        campo: 'empresasVencidas',     rotulo: 'Mensal',        ajuda: 'clientes com contrato mensal cujos documentos vencem no mês' },
  { condicao: 'exclusiva_tst', campo: 'empresasExclusivaTst', rotulo: 'Exclusiva TST', ajuda: 'clientes na condição Exclusiva TST (atendimento completo)' },
];
export const TIPOS_PRODUCAO = [
  { id: 'tecnico',        rotulo: 'Técnico',        descricao: 'realiza inspeções e relatórios — considerado no dimensionamento como técnico' },
  { id: 'administrativo', rotulo: 'Administrativo', descricao: 'finaliza empresas — considerado como administrativo' },
  { id: 'nenhuma',        rotulo: 'Sem produção',   descricao: 'sem produção diária; não é considerada no cálculo (ex.: supervisores)' },
];
export const COORDENA = [
  { id: 'todos',           rotulo: 'Toda a equipe' },
  { id: 'tecnicos',        rotulo: 'Somente os técnicos' },
  { id: 'administrativos', rotulo: 'Somente os administrativos' },
];
export const PARAMETROS_PADRAO = { diasUteis: [21, 18, 22, 20, 20, 21, 23, 21, 21, 21, 19, 22], ocupacaoAlvo: 85, prazoDias: 60, rampup: [50, 80] };

const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const lancar = (error, fallback) => { throw erroAmigavel(error, fallback); };

/* ---------- conversores linha ↔ domínio ---------- */

const funcaoDeLinha = r => ({ id: r.id, nome: r.nome, tipoProducao: r.tipo_producao, chefia: r.chefia === true, coordena: r.coordena || 'todos', respondeParaId: r.responde_para || null, ordem: num(r.ordem), custoMensal: num(r.custo_mensal) });
const funcaoParaLinha = f => ({ nome: f.nome.trim(), tipo_producao: f.tipoProducao, chefia: !!f.chefia, coordena: f.chefia ? f.coordena : 'todos', responde_para: f.chefia ? f.respondeParaId || null : null, ordem: num(f.ordem), custo_mensal: Math.max(0, num(f.custoMensal)) });

const colaboradorDeLinha = r => ({ id: r.id, nome: r.nome, funcaoId: r.funcao_id || null, inspecoesDia: num(r.inspecoes_dia), relatoriosDia: num(r.relatorios_dia), empresasDia: num(r.empresas_dia), dataAdmissao: r.data_admissao || null, dataDesligamento: r.data_desligamento || null, custoMensal: r.custo_mensal != null ? num(r.custo_mensal) : null, alocacoes: [] });
const colaboradorParaLinha = c => ({ nome: c.nome.trim(), funcao_id: c.funcaoId || null, inspecoes_dia: Math.max(0, num(c.inspecoesDia)), relatorios_dia: Math.max(0, num(c.relatoriosDia)), empresas_dia: Math.max(0, num(c.empresasDia)), data_admissao: c.dataAdmissao || null, data_desligamento: c.dataDesligamento || null, custo_mensal: num(c.custoMensal) > 0 ? num(c.custoMensal) : null });

const porteDeLinha = r => ({ codigo: r.codigo, nome: r.nome, peso: num(r.peso, 1), ordem: num(r.ordem) });
const parametrosDeLinha = r => ({
  diasUteis: Array.isArray(r.dias_uteis) && r.dias_uteis.length === 12 ? r.dias_uteis.map(v => num(v, 21)) : PARAMETROS_PADRAO.diasUteis.slice(),
  ocupacaoAlvo: num(r.ocupacao_alvo, 85),
  prazoDias: num(r.prazo_dias, 60),
  rampup: Array.isArray(r.rampup) ? r.rampup.map(v => num(v, 100)) : PARAMETROS_PADRAO.rampup.slice(),
});

/** Monta um mês: demanda por condição × porte + contagens derivadas + clientes ativos. */
export function montarMes(demanda = {}, clientesAtivos = 0) {
  const d = {};
  CONDICOES.forEach(c => {
    d[c.condicao] = {};
    Object.entries(demanda[c.condicao] || {}).forEach(([porte, q]) => { const n = Math.max(0, Math.round(num(q))); if (n > 0) d[c.condicao][porte] = n; });
  });
  const soma = cond => Object.values(d[cond]).reduce((s, q) => s + q, 0);
  return { demanda: d, empresasVencidas: soma('mensal'), empresasExclusivaTst: soma('exclusiva_tst'), clientesAtivos: Math.max(0, Math.round(num(clientesAtivos))) };
}

/** Linhas de demanda_mensal + unidade_mes → mesesPorAno de cada unidade. */
function mesesPorUnidade(demanda, ativos) {
  const por = {};
  const slot = (uid, ano, mes) => { const u = (por[uid] = por[uid] || {}); const a = (u[ano] = u[ano] || {}); return (a[mes] = a[mes] || { demanda: {}, clientesAtivos: 0 }); };
  demanda.forEach(d => { const s = slot(d.unidade_id, d.ano, d.mes); (s.demanda[d.condicao] = s.demanda[d.condicao] || {})[d.porte] = num(d.quantidade); });
  ativos.forEach(a => { slot(a.unidade_id, a.ano, a.mes).clientesAtivos = num(a.clientes_ativos); });
  Object.values(por).forEach(anos => Object.values(anos).forEach(meses => Object.keys(meses).forEach(m => { meses[m] = montarMes(meses[m].demanda, meses[m].clientesAtivos); })));
  return por;
}

/* ---------- carga ---------- */

/** Carrega todos os cadastros de uma vez (em paralelo). */
export async function carregarTudo() {
  const q = async (promessa, oQue) => { const { data, error } = await promessa; if (error) lancar(error, `Falha ao carregar ${oQue}.`); return data; };
  const [funcoes, unidades, colaboradores, alocacoes, demanda, ativos, portes, parametros, clientesPorte] = await Promise.all([
    q(supabase.from('funcoes').select('*').order('ordem').order('nome'), 'as funções'),
    q(supabase.from('unidades').select('*').order('created_at').order('id'), 'as unidades'),
    q(supabase.from('colaboradores').select('*').order('created_at').order('id'), 'os colaboradores'),
    q(supabase.from('colaborador_unidades').select('colaborador_id, unidade_id, percentual'), 'as alocações'),
    q(supabase.from('demanda_mensal').select('unidade_id, ano, mes, condicao, porte, quantidade'), 'as empresas por mês'),
    q(supabase.from('unidade_mes').select('unidade_id, ano, mes, clientes_ativos'), 'os clientes ativos'),
    q(supabase.from('portes').select('*').order('ordem').order('codigo'), 'os portes'),
    q(supabase.from('parametros').select('*').eq('id', 1).single(), 'os parâmetros'),
    q(supabase.from('clientes_porte').select('codigo, nome, porte'), 'o porte dos clientes'),
  ]);
  const porUnidade = mesesPorUnidade(demanda, ativos);
  const porColab = {};
  alocacoes.forEach(a => { (porColab[a.colaborador_id] = porColab[a.colaborador_id] || []).push({ unidadeId: a.unidade_id, percentual: num(a.percentual) }); });
  return {
    funcoes: funcoes.map(funcaoDeLinha),
    unidades: unidades.map(r => ({ id: r.id, nome: r.nome, mesesPorAno: porUnidade[r.id] || {} })),
    colaboradores: colaboradores.map(r => ({ ...colaboradorDeLinha(r), alocacoes: porColab[r.id] || [] })),
    portes: portes.map(porteDeLinha),
    parametros: parametrosDeLinha(parametros),
    clientesPorte: Object.fromEntries(clientesPorte.map(r => [r.codigo, { nome: r.nome, porte: r.porte }])),
  };
}

/** Porte de clientes (pelo código do SGG): grava vários de uma vez. */
export async function salvarClientesPorte(lista) {
  const linhas = lista.filter(x => x && String(x.codigo).trim()).map(x => ({ codigo: String(x.codigo).trim(), nome: String(x.nome || '').trim(), porte: x.porte }));
  if (!linhas.length) return;
  const { error } = await supabase.from('clientes_porte').upsert(linhas, { onConflict: 'codigo' });
  if (error) lancar(error, 'Não foi possível salvar o porte do cliente.');
}

/* ---------- escrita: cadastros ---------- */

export const funcoes = {
  async inserir(f) { const { data, error } = await supabase.from('funcoes').insert(funcaoParaLinha(f)).select().single(); if (error) lancar(error, 'Não foi possível adicionar a função.'); return funcaoDeLinha(data); },
  async atualizar(id, f) { const { data, error } = await supabase.from('funcoes').update(funcaoParaLinha(f)).eq('id', id).select().single(); if (error) lancar(error, 'Não foi possível salvar a função.'); return funcaoDeLinha(data); },
  async remover(id) { const { error } = await supabase.from('funcoes').delete().eq('id', id); if (error) lancar(error, 'Não foi possível excluir a função.'); },
};

export const unidades = {
  async inserir(u) { const { data, error } = await supabase.from('unidades').insert({ nome: u.nome.trim() }).select().single(); if (error) lancar(error, 'Não foi possível adicionar a unidade.'); return { id: data.id, nome: data.nome, mesesPorAno: {} }; },
  async atualizar(id, u) { const { data, error } = await supabase.from('unidades').update({ nome: u.nome.trim() }).eq('id', id).select().single(); if (error) lancar(error, 'Não foi possível salvar a unidade.'); return { id: data.id, nome: data.nome }; },
  async remover(id) { const { error } = await supabase.from('unidades').delete().eq('id', id); if (error) lancar(error, 'Não foi possível excluir a unidade.'); },
};

export const colaboradores = {
  async inserir(c) { const { data, error } = await supabase.from('colaboradores').insert(colaboradorParaLinha(c)).select().single(); if (error) lancar(error, 'Não foi possível adicionar o colaborador.'); return colaboradorDeLinha(data); },
  async atualizar(id, c) { const { data, error } = await supabase.from('colaboradores').update(colaboradorParaLinha(c)).eq('id', id).select().single(); if (error) lancar(error, 'Não foi possível salvar o colaborador.'); return colaboradorDeLinha(data); },
  async remover(id) { const { error } = await supabase.from('colaboradores').delete().eq('id', id); if (error) lancar(error, 'Não foi possível excluir o colaborador.'); },
  /** Substitui as alocações (RPC atômica). */
  async definirAlocacoes(id, alocacoes) {
    const validas = alocacoes.filter(a => a.unidadeId && num(a.percentual) > 0).map(a => ({ unidadeId: a.unidadeId, percentual: num(a.percentual) }));
    const { error } = await supabase.rpc('definir_alocacoes', { p_colaborador: id, p_alocacoes: validas });
    if (error) lancar(error, 'Não foi possível salvar as alocações.');
    return validas;
  },
};

/* ---------- escrita: demanda por mês ---------- */

export const demanda = {
  /** Quantos clientes de uma condição × porte vencem num mês (0 apaga a linha). */
  async definir(unidadeId, ano, mes, condicao, porte, quantidade) {
    const q = Math.max(0, Math.round(num(quantidade)));
    const r = q > 0
      ? await supabase.from('demanda_mensal').upsert({ unidade_id: unidadeId, ano, mes, condicao, porte, quantidade: q }, { onConflict: 'unidade_id,ano,mes,condicao,porte' })
      : await supabase.from('demanda_mensal').delete().match({ unidade_id: unidadeId, ano, mes, condicao, porte });
    if (r.error) lancar(r.error, 'Não foi possível salvar o número do mês.');
    return q;
  },
  async definirClientesAtivos(unidadeId, ano, mes, quantidade) {
    const q = Math.max(0, Math.round(num(quantidade)));
    const r = q > 0
      ? await supabase.from('unidade_mes').upsert({ unidade_id: unidadeId, ano, mes, clientes_ativos: q }, { onConflict: 'unidade_id,ano,mes' })
      : await supabase.from('unidade_mes').delete().match({ unidade_id: unidadeId, ano, mes });
    if (r.error) lancar(r.error, 'Não foi possível salvar os clientes ativos.');
    return q;
  },
  /** Importação: substitui a demanda de um ano das unidades presentes nas linhas (RPC, uma transação).
   *  Com `condicao` ('mensal' | 'exclusiva_tst'), substitui somente essa condição; sem, as duas. */
  async substituirAno(ano, linhas, condicao = null) {
    const { data, error } = await supabase.rpc('substituir_demanda_ano', { p_ano: ano, p_linhas: linhas, p_condicao: condicao || null });
    if (error) lancar(error, 'Não foi possível importar a demanda.');
    return data;
  },
  async limparAno(unidadeId, ano) {
    const r1 = await supabase.from('demanda_mensal').delete().match({ unidade_id: unidadeId, ano });
    if (r1.error) lancar(r1.error, 'Não foi possível limpar os números do ano.');
    const r2 = await supabase.from('unidade_mes').delete().match({ unidade_id: unidadeId, ano });
    if (r2.error) lancar(r2.error, 'Não foi possível limpar os clientes ativos do ano.');
  },
};

/* ---------- escrita: parâmetros e portes ---------- */

export async function atualizarParametros(p) {
  const linha = { dias_uteis: p.diasUteis, ocupacao_alvo: p.ocupacaoAlvo, prazo_dias: p.prazoDias, rampup: p.rampup };
  const { data, error } = await supabase.from('parametros').update(linha).eq('id', 1).select().single();
  if (error) lancar(error, 'Não foi possível salvar os parâmetros.');
  return parametrosDeLinha(data);
}

export async function atualizarPorte(codigo, patch) {
  const { data, error } = await supabase.from('portes').update({ nome: patch.nome, peso: patch.peso, ordem: patch.ordem }).eq('codigo', codigo).select().single();
  if (error) lancar(error, 'Não foi possível salvar o porte.');
  return porteDeLinha(data);
}

/* ---------- histórico e backup ---------- */

export async function carregarHistorico({ antesDe = null, limite = 100 } = {}) {
  let q = supabase.from('historico').select('*').order('quando', { ascending: false }).order('id', { ascending: false }).limit(limite);
  if (antesDe) q = q.lt('quando', antesDe);
  const { data, error } = await q;
  if (error) lancar(error, 'Falha ao carregar o histórico.');
  return data;
}

/** Substitui TODOS os dados pelo backup (RPC admin-only; aceita o formato v12 e os antigos). */
export async function importarBackup(json) {
  const { error } = await supabase.rpc('importar_backup', { p: json });
  if (error) lancar(error, 'Falha ao importar o backup.');
}
