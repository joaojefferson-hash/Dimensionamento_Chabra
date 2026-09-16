<script setup>
/* Barra de opções da Projeção: ano · mês atual · unidade (tudo fica no navegador, via store de preferências). */
import { computed } from 'vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { MESES_LONGO } from '../composables/useFormat.js';

const props = defineProps({ semTodas: { type: Boolean, default: false } }); // sem a opção "Todas as unidades"
const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const anos = computed(() => cad.anosDisponiveis(pref.ano));
</script>

<template>
  <form class="card flex flex-wrap items-end gap-5 !py-4" @submit.prevent>
    <label class="text-[12px]">
      <span class="mb-1 block font-semibold uppercase tracking-wider text-muted">Ano</span>
      <select class="input input-sm" :value="pref.ano" @change="pref.definirAno($event.target.value)">
        <option v-for="a in anos" :key="a" :value="a">{{ a }}</option>
      </select>
    </label>
    <label class="text-[12px]">
      <span class="mb-1 block font-semibold uppercase tracking-wider text-muted">Mês atual</span>
      <select class="input input-sm" :value="pref.mesAtual" @change="pref.definirMesAtual($event.target.value)" title="Separa o período realizado da projeção. Preferência deste navegador.">
        <option v-for="(m, i) in MESES_LONGO" :key="i" :value="i">{{ m }}</option>
      </select>
    </label>
    <label class="text-[12px]">
      <span class="mb-1 block font-semibold uppercase tracking-wider text-muted">Unidade</span>
      <select v-model="pref.unidadeSel" class="input input-sm">
        <option v-if="!props.semTodas" value="">Todas as unidades</option>
        <option v-for="u in cad.unidades" :key="u.id" :value="u.id">{{ u.nome }}</option>
      </select>
    </label>
  </form>
</template>
