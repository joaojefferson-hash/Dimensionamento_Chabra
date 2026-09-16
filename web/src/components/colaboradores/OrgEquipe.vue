<script setup>
/* Equipe de uma unidade dentro de uma caixa do organograma: título da unidade,
   rótulo da área (quando há mais de uma) e os colaboradores. */
import { computed } from 'vue';
import OrgPessoa from './OrgPessoa.vue';
import { ROTULO_TIPO } from '../../composables/organograma.js';
import { num } from '../../composables/useFormat.js';

const props = defineProps({ equipe: { type: Object, required: true } });
defineEmits(['editar']);

/** Rótulo da área apenas quando muda de uma pessoa para a outra (e há mais de uma área). */
const linhas = computed(() => {
  const tipos = new Set(props.equipe.membros.map(m => m.c.tipoProducao));
  let ultimo = null;
  return props.equipe.membros.map(m => {
    const rotulo = tipos.size > 1 && m.c.tipoProducao !== ultimo ? (ROTULO_TIPO[m.c.tipoProducao] || 'Outros') : null;
    ultimo = m.c.tipoProducao;
    return { ...m, rotulo };
  });
});
const fte = computed(() => props.equipe.membros.reduce((s, m) => s + m.pct / 100, 0));
const parcial = computed(() => Math.abs(fte.value - props.equipe.membros.length) > 0.01);
</script>

<template>
  <div class="org-equipe">
    <div class="org-equipe-titulo"><strong>{{ equipe.unidade }}</strong> <span class="muted">{{ equipe.membros.length }}<template v-if="parcial"> (= {{ num(fte, 1) }} {{ Math.abs(fte - 1) < 0.005 ? 'pessoa' : 'pessoas' }})</template></span></div>
    <template v-for="(m, i) in linhas" :key="m.c.id + '-' + i">
      <div v-if="m.rotulo" class="org-grupo-rotulo">{{ m.rotulo }}</div>
      <OrgPessoa :pessoa="m.c" :pct="m.pct" @editar="$emit('editar', $event)" />
    </template>
  </div>
</template>
