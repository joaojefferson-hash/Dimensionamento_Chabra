/* ==========================================================================
   Aviso de nova versão publicada.

   A aplicação é uma página única: quem deixa a aba aberta continua com a
   versão carregada no primeiro acesso e não vê recursos novos. Aqui a página
   busca o index.html de tempo em tempo (e ao voltar para a aba) e compara o
   arquivo do script principal — cujo nome muda a cada publicação. Quando muda,
   `novaVersao` fica verdadeiro e a interface oferece o recarregamento.
   ========================================================================== */
import { ref, onMounted, onUnmounted } from 'vue';

const INTERVALO = 10 * 60 * 1000; // 10 minutos

/** Script principal da página em execução (o nome traz a identificação da versão). */
function scriptAtual() {
  const s = document.querySelector('script[type="module"][src]');
  return s ? s.getAttribute('src') : null;
}

/** Script principal declarado no index.html publicado agora. */
async function scriptPublicado() {
  const r = await fetch(`./?v=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

export function useVersao() {
  const novaVersao = ref(false);
  const meu = scriptAtual();
  let timer = null;

  async function verificar() {
    if (novaVersao.value || !meu || document.visibilityState !== 'visible') return;
    try {
      const publicado = await scriptPublicado();
      if (publicado && publicado !== meu) novaVersao.value = true;
    } catch (_) { /* sem conexão: verifica na próxima vez */ }
  }
  const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
  function recarregar() { window.location.reload(); }

  onMounted(() => {
    timer = setInterval(verificar, INTERVALO);
    document.addEventListener('visibilitychange', aoVoltar);
    verificar();
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', aoVoltar);
  });

  return { novaVersao, verificar, recarregar };
}
