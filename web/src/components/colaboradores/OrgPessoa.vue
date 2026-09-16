<script setup>
/* Um colaborador dentro do organograma: nome, função e (quando parcial) o tempo alocado.
   O clique abre a edição no modo Cadastro. */
import { num } from '../../composables/useFormat.js';

const props = defineProps({
  pessoa: { type: Object, required: true },
  pct: { type: Number, default: null },
  chefia: { type: Boolean, default: false },
});
defineEmits(['editar']);

const parcial = () => props.pct != null && props.pct < 99.999 && props.pessoa.tipoProducao !== 'nenhuma';
</script>

<template>
  <button type="button" class="org-pessoa" :title="`Editar ${pessoa.nome}`" @click="$emit('editar', pessoa)">
    <span class="org-nome"><span v-if="chefia" class="org-estrela">★</span> {{ pessoa.nome }}</span>
    <span class="org-funcao">{{ pessoa.funcao || 'sem função' }}<template v-if="parcial()"> · {{ num(pct, 1) }}% do tempo</template></span>
  </button>
</template>
