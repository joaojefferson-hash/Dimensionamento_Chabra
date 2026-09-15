<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const router = useRouter();
const email = ref('');
const senha = ref('');
const erro = ref('');
const ocupado = ref(false);

async function entrar() {
  erro.value = '';
  ocupado.value = true;
  try {
    await auth.entrar(email.value.trim(), senha.value);
    if (!auth.papel) { erro.value = 'Esta conta ainda não possui perfil de acesso definido. Contate o administrador.'; await auth.sair(); return; }
    router.push({ name: 'dimensionamento' });
  } catch (e) {
    erro.value = e.message;
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-page px-4">
    <form class="card w-full max-w-sm" @submit.prevent="entrar">
      <div class="mb-4 flex items-center gap-3">
        <div class="grid h-10 w-10 place-items-center rounded-lg bg-primary font-bold text-white">CD</div>
        <div>
          <div class="font-semibold">Chabra Dimensiona</div>
          <div class="text-[12px] text-muted">Dimensionamento de quadro SST</div>
        </div>
      </div>
      <label class="mb-3 block text-[13px]">
        <span class="mb-1 block font-medium">E-mail</span>
        <input v-model="email" class="input w-full" type="email" autocomplete="username" required>
      </label>
      <label class="mb-4 block text-[13px]">
        <span class="mb-1 block font-medium">Senha</span>
        <input v-model="senha" class="input w-full" type="password" autocomplete="current-password" required>
      </label>
      <p v-if="erro" class="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger-dark">{{ erro }}</p>
      <button class="btn btn-primary w-full justify-center" type="submit" :disabled="ocupado">{{ ocupado ? 'Autenticando…' : 'Entrar' }}</button>
      <p class="mt-3 text-[12px] text-muted">Para criar acesso ou redefinir a senha, contate o administrador.</p>
    </form>
  </div>
</template>
