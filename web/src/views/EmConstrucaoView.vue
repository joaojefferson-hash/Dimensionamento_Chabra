<script setup>
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <header class="page-header"><h1>{{ route.meta.titulo }}</h1><p>Esta tela chega na Etapa 4 (componentes). Enquanto isso, use o app atual para este cadastro.</p></header>
  <section class="card"><p class="muted">Em construção.</p></section>
</template>
