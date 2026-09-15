/* ==========================================================================
   Store de autenticação: sessão, papel (admin | supervisor | leitura) e permissões.
   O papel vem do JWT (app_metadata.papel) — definido só pelo servidor.
   ========================================================================== */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { supabase, erroAmigavel } from '../services/supabase.js';

export const PAPEIS = { admin: 'Administrador', supervisor: 'Supervisão', leitura: 'Leitura' };

export const useAuthStore = defineStore('auth', () => {
  const sessao = ref(null);
  const pronto = ref(false); // já sabemos se há sessão?

  const usuario = computed(() => (sessao.value ? sessao.value.user : null));
  const papel = computed(() => {
    const m = (usuario.value && usuario.value.app_metadata) || {};
    if (m.papel === 'admin' || m.papel === 'supervisor' || m.papel === 'leitura') return m.papel;
    return m.admin === true ? 'admin' : null; // compatibilidade com contas marcadas só como admin
  });
  const logado = computed(() => !!usuario.value && !!papel.value);
  const isAdmin = computed(() => papel.value === 'admin');
  const podeEditar = computed(() => papel.value === 'admin' || papel.value === 'supervisor');
  const nome = computed(() => {
    const u = usuario.value;
    if (!u) return '';
    const m = u.user_metadata || {};
    return [m.nome, m.sobrenome].filter(Boolean).join(' ') || u.email || '';
  });

  async function iniciar() {
    const { data } = await supabase.auth.getSession();
    sessao.value = data.session;
    pronto.value = true;
    supabase.auth.onAuthStateChange((_evento, nova) => { sessao.value = nova; });
  }

  async function entrar(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw erroAmigavel(error, 'Não foi possível entrar. Confira e-mail e senha.');
  }

  async function sair() {
    await supabase.auth.signOut();
    sessao.value = null;
  }

  async function trocarSenha(nova) {
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) throw erroAmigavel(error, 'Não foi possível trocar a senha.');
  }

  return { sessao, pronto, usuario, papel, logado, isAdmin, podeEditar, nome, iniciar, entrar, sair, trocarSenha };
});
