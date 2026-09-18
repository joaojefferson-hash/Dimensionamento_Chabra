/* Sincronização com a API de documentos SST — passa pela Edge Function `sincronizar-sst`
   (as credenciais da API ficam no servidor e nunca chegam ao navegador). Só admin. */
import { supabase } from './supabase.js';

async function chamar(body) {
  const { data, error } = await supabase.functions.invoke('sincronizar-sst', { body });
  if (error) {
    let msg = error.message || 'Falha ao chamar o servidor.';
    if (error.context && typeof error.context.json === 'function') {
      try { const corpo = await error.context.json(); if (corpo && corpo.message) msg = corpo.message; } catch (_) { /* mantém */ }
    }
    if (/failed to fetch|networkerror|load failed/i.test(msg)) msg = 'Sem conexão com o servidor. Verifique a internet.';
    throw new Error(msg);
  }
  if (data && data.message && !data.aplicado && !data.previa) throw new Error(data.message);
  return data;
}

/** Prévia: não grava nada, só devolve o que seria gravado por unidade. */
export const previa = ano => chamar({ ano, aplicar: false });
/** Aplica: grava demanda e atendidas das unidades com cobertura utilizável. */
export const sincronizar = ano => chamar({ ano, aplicar: true });

/** Últimas execuções registradas (uma linha por unidade e execução). */
export async function ultimasSincronizacoes(limite = 12) {
  const { data, error } = await supabase
    .from('sincronizacao_sst')
    .select('executado_em, ano, codigo_api, cobertura, ultima_varredura_em, documentos, demanda_gravada, atendidas_gravadas, aplicada, mensagem')
    .order('executado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}
