/* Avisos (toast) e confirmação (modal) — usados por qualquer tela. */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref([]);
  let seq = 0;
  function toast(texto, tipo = 'ok') {
    const id = ++seq;
    toasts.value.push({ id, texto, tipo });
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, tipo === 'error' ? 6000 : 3500);
  }
  const erro = e => toast(e && e.message ? e.message : String(e), 'error');

  const confirmacao = ref(null); // { titulo, mensagem, confirmar, perigo, resolve }
  function confirmar({ titulo = 'Confirmar', mensagem = '', textoConfirmar = 'Confirmar', perigo = false } = {}) {
    return new Promise(resolve => { confirmacao.value = { titulo, mensagem, textoConfirmar, perigo, resolve }; });
  }
  function responder(ok) { if (confirmacao.value) { confirmacao.value.resolve(ok); confirmacao.value = null; } }

  return { toasts, toast, erro, confirmacao, confirmar, responder };
});
