/* Usuários — só admin. Passa pela Edge Function `usuarios` (service role fica no servidor). */
import { supabase } from './supabase.js';

async function chamar(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('usuarios', { body: { action, ...params } });
  if (error) {
    let msg = error.message || 'Falha ao chamar o servidor.';
    if (error.context && typeof error.context.json === 'function') {
      try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (_) { /* mantém */ }
    }
    if (/failed to fetch|networkerror|load failed/i.test(msg)) msg = 'Sem conexão com o servidor. Verifique a internet.';
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

export const usuarios = {
  listar: () => chamar('listar').then(r => r.usuarios),
  criar: dados => chamar('criar', dados).then(r => r.usuario),
  editar: (id, nome, sobrenome) => chamar('editar', { id, nome, sobrenome }).then(r => r.usuario),
  redefinirSenha: (id, senha) => chamar('redefinirSenha', { id, senha }),
  definirPapel: (id, papel) => chamar('definirPapel', { id, papel }),
  remover: id => chamar('remover', { id }),
};

export function gerarSenha(tamanho = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const a = new Uint32Array(tamanho);
  crypto.getRandomValues(a);
  return Array.from(a, v => chars[v % chars.length]).join('');
}
