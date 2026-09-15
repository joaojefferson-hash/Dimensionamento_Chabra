<script setup>
/* "Chefia: Fulano (Supervisor ADM · administrativos) · Beltrano (Supervisor Geral)" de uma unidade ou do total. */
defineProps({ chefia: { type: Array, default: () => [] } });
const grupo = ch => (ch.coordena === 'tecnicos' ? ' · técnicos' : ch.coordena === 'administrativos' ? ' · administrativos' : '');
</script>

<template>
  <div class="-mt-2 mb-4 text-[13px]">
    <span v-if="!chefia.length" class="muted">Chefia: <em>não definida</em></span>
    <span v-else>Chefia:
      <template v-for="(ch, i) in chefia" :key="ch.id"><template v-if="i > 0"> · </template><strong>{{ ch.nome }}</strong><span v-if="ch.funcao" class="muted"> ({{ ch.funcao }}{{ grupo(ch) }})</span></template>
    </span>
  </div>
</template>
