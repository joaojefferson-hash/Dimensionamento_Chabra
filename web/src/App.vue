<script setup>
/* Casca da aplicação: tela de login (rota pública) ou layout com menu lateral + conteúdo.
   Carrega os cadastros uma vez após o login e recarrega ao voltar para a aba. */
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import Sidebar from './components/layout/Sidebar.vue';
import Avisos from './components/ui/Avisos.vue';
import { useAuthStore } from './stores/auth.js';
import { useCadastrosStore } from './stores/cadastros.js';

const route = useRoute();
const auth = useAuthStore();
const cad = useCadastrosStore();
const publica = computed(() => !!route.meta.publica);

watch(() => auth.logado, async logado => {
  if (logado) { try { await cad.carregar(); } catch (_) { /* erro fica em cad.erro */ } }
  else cad.limpar();
}, { immediate: true });

const aoVoltar = () => { if (document.visibilityState === 'visible' && auth.logado) cad.recarregarSeVelho().catch(() => {}); };
onMounted(() => document.addEventListener('visibilitychange', aoVoltar));
onUnmounted(() => document.removeEventListener('visibilitychange', aoVoltar));
</script>

<template>
  <Avisos />
  <div v-if="!auth.pronto" class="grid min-h-screen place-items-center text-muted">Carregando…</div>
  <router-view v-else-if="publica" />
  <div v-else class="flex min-h-screen">
    <Sidebar />
    <main class="min-w-0 flex-1 px-6 py-6 lg:px-8">
      <div v-if="auth.papel === 'leitura'" class="mb-4 rounded-lg border border-line bg-primary-light px-4 py-2 text-[13px] text-primary-dark">
        Acesso de <strong>leitura</strong>: você vê tudo, mas não altera cadastros. O ano, o mês atual, a unidade e o "E se…?" funcionam (ficam só neste navegador).
      </div>
      <div v-if="cad.erro" class="card border-danger bg-danger-bg text-danger-dark">
        <strong>Não foi possível carregar os dados.</strong> {{ cad.erro }}
        <button class="btn btn-ghost ml-3" type="button" @click="cad.carregar()">Tentar novamente</button>
      </div>
      <div v-else-if="!cad.carregado" class="text-muted">Carregando os cadastros…</div>
      <router-view v-else />
    </main>
  </div>
</template>
