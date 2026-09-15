/* ==========================================================================
   Cliente Supabase (única instância). A chave publishable é pública por design;
   o que protege os dados é o login + RLS. Pode ser sobreposta por .env
   (VITE_SUPABASE_URL / VITE_SUPABASE_KEY).
   ========================================================================== */
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wdlxpbusyuieftnxemot.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_JShHESezBIHHmowVLqFOOA_EeWW1bc0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Erro amigável a partir de um erro do PostgREST/Auth. */
export function erroAmigavel(error, fallback = 'Ocorreu um erro inesperado.') {
  const code = error && error.code;
  const msg = String((error && error.message) || '');
  let texto;
  if (code === '23505') texto = 'Já existe um registro com este nome.';
  else if (code === '23503') texto = 'Este item está em uso e não pode ser excluído.';
  else if (code === '23514') texto = /aloca/i.test(msg) ? msg : 'Valor fora do intervalo permitido (verifique os números informados).';
  else if (code === '42501' || code === 'PGRST301' || /jwt|not authenticated/i.test(msg)) texto = 'Sessão expirada ou sem permissão. Efetue login novamente.';
  else if (/failed to fetch|networkerror|load failed/i.test(msg)) texto = 'Sem conexão com o servidor. Verifique a conexão com a internet.';
  else texto = msg || fallback;
  const e = new Error(texto);
  e.cause = error;
  return e;
}
