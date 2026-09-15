<script setup>
/* Toasts + modal de confirmação (montado uma vez em App.vue). */
import { useUiStore } from '../../stores/ui.js';
const ui = useUiStore();
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
    <div v-for="t in ui.toasts" :key="t.id" class="pointer-events-auto rounded-lg px-4 py-2 text-[13px] shadow-card" :class="t.tipo === 'error' ? 'bg-danger-bg text-danger-dark border border-danger' : 'bg-primary-dark text-white'">{{ t.texto }}</div>
  </div>
  <div v-if="ui.confirmacao" class="fixed inset-0 z-40 grid place-items-center bg-black/40 px-4" @click.self="ui.responder(false)">
    <div class="card w-full max-w-md !mb-0" role="dialog" aria-modal="true">
      <h2 class="mb-2">{{ ui.confirmacao.titulo }}</h2>
      <p class="mb-4 text-[13px]">{{ ui.confirmacao.mensagem }}</p>
      <div class="flex justify-end gap-2">
        <button class="btn btn-ghost" type="button" @click="ui.responder(false)">Cancelar</button>
        <button class="btn" :class="ui.confirmacao.perigo ? 'bg-danger text-white hover:bg-danger-dark' : 'btn-primary'" type="button" @click="ui.responder(true)">{{ ui.confirmacao.textoConfirmar }}</button>
      </div>
    </div>
  </div>
</template>
