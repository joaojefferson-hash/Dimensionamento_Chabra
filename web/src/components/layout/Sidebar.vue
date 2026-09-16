<script setup>
/* Menu lateral fixo (sticky, altura da tela): telas agrupadas por seção, filtradas pelo papel;
   a lista rola sozinha quando não cabe; usuário e Sair ficam sempre no rodapé. */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { TELAS, podeVer } from '../../router/index.js';
import { useAuthStore, PAPEIS } from '../../stores/auth.js';
import { useCadastrosStore } from '../../stores/cadastros.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const router = useRouter();

const secoes = computed(() => {
  const visiveis = TELAS.filter(t => podeVer(t, auth.papel));
  const ordem = [...new Set(visiveis.map(t => t.secao))];
  return ordem.map(s => ({ nome: s, telas: visiveis.filter(t => t.secao === s) }));
});
const badge = nome => ({ unidades: cad.contagens.unidades, colaboradores: cad.contagens.colaboradores }[nome]);

async function sair() { await auth.sair(); router.push({ name: 'entrar' }); }
</script>

<template>
  <aside class="sticky top-0 flex h-screen w-[268px] shrink-0 flex-col self-start bg-primary text-white">
    <div class="flex items-center gap-3 px-5 py-5">
      <div class="grid h-10 w-10 place-items-center rounded-lg bg-white font-bold text-primary">CD</div>
      <div>
        <div class="font-semibold">Chabra Dimensiona</div>
        <div class="text-[12px] text-white/75">Dimensionamento de quadro SST</div>
      </div>
    </div>
    <nav class="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Telas">
      <template v-for="s in secoes" :key="s.nome">
        <div class="mt-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">{{ s.nome }}</div>
        <router-link v-for="t in s.telas" :key="t.name" :to="{ name: t.name }" class="flex items-center justify-between rounded-lg px-3 py-2 text-[14px] text-white/90 hover:bg-white/10" active-class="bg-white! text-primary-dark! font-semibold hover:bg-white!">
          <span>{{ t.titulo }}</span>
          <span v-if="badge(t.name) != null" class="rounded-full bg-black/15 px-2 text-[11px] font-semibold">{{ badge(t.name) }}</span>
        </router-link>
      </template>
    </nav>
    <div class="border-t border-white/15 px-5 py-4 text-[13px]">
      <div class="mb-2 flex items-center gap-2">
        <span class="chip bg-white/15 text-white">{{ PAPEIS[auth.papel] || auth.papel }}</span>
        <span class="truncate">{{ auth.nome }}</span>
      </div>
      <button class="btn btn-ghost w-full justify-center border-white/30 text-white hover:bg-white/10" type="button" @click="sair">Sair</button>
    </div>
  </aside>
</template>
