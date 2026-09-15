<script setup>
/* Usuários (só admin): criar, editar nome, papel, redefinir senha, remover; backup exportar/importar. */
import { onMounted, reactive, ref } from 'vue';
import { useAuthStore, PAPEIS } from '../stores/auth.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { useUiStore } from '../stores/ui.js';
import { usuarios as api, gerarSenha } from '../services/usuarios.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const ui = useUiStore();
const lista = ref([]);
const carregando = ref(false);
const form = reactive({ nome: '', sobrenome: '', email: '', senha: '', papel: 'leitura' });
const editando = ref(null);
const ocupado = ref(false);
const DESCRICAO = { admin: 'vê e altera tudo; gerencia usuários e backup', supervisor: 'vê e altera os cadastros', leitura: 'vê tudo, não altera nada' };

async function carregar() { carregando.value = true; try { lista.value = await api.listar(); } catch (e) { ui.erro(e); } finally { carregando.value = false; } }
onMounted(carregar);

function editar(u) { editando.value = u.id; form.nome = u.nome || ''; form.sobrenome = u.sobrenome || ''; }
function cancelar() { editando.value = null; Object.assign(form, { nome: '', sobrenome: '', email: '', senha: '', papel: 'leitura' }); }
async function salvar() {
  if (!form.nome.trim()) return;
  ocupado.value = true;
  try {
    if (editando.value) { await api.editar(editando.value, form.nome.trim(), form.sobrenome.trim()); ui.toast('Usuário atualizado.'); }
    else {
      if (form.senha.length < 8) { ui.toast('A senha precisa ter pelo menos 8 caracteres.', 'error'); return; }
      await api.criar({ nome: form.nome.trim(), sobrenome: form.sobrenome.trim(), email: form.email.trim(), senha: form.senha, papel: form.papel });
      ui.toast(`Usuário ${form.nome.trim()} criado. Passe a senha inicial para a pessoa.`);
    }
    cancelar(); await carregar();
  } catch (e) { ui.erro(e); } finally { ocupado.value = false; }
}
async function papel(u, novo) {
  if (u.id === auth.usuario.id && novo !== 'admin') { ui.toast('Você não pode tirar o seu próprio acesso de administrador.', 'error'); await carregar(); return; }
  try { await api.definirPapel(u.id, novo); ui.toast(`${u.nomeCompleto || u.email}: ${PAPEIS[novo]} (vale no próximo login).`); await carregar(); } catch (e) { ui.erro(e); await carregar(); }
}
async function senha(u) {
  const nova = gerarSenha();
  const ok = await ui.confirmar({ titulo: 'Redefinir senha', mensagem: `Definir a senha de ${u.nomeCompleto || u.email} como "${nova}"? Anote e passe para a pessoa; ela pode trocar depois.`, textoConfirmar: 'Redefinir' });
  if (!ok) return;
  try { await api.redefinirSenha(u.id, nova); ui.toast(`Senha redefinida: ${nova}`); } catch (e) { ui.erro(e); }
}
async function remover(u) {
  if (u.id === auth.usuario.id) { ui.toast('Você não pode remover a sua própria conta.', 'error'); return; }
  const ok = await ui.confirmar({ titulo: 'Remover usuário', mensagem: `Remover o acesso de ${u.nomeCompleto || u.email}?`, textoConfirmar: 'Remover', perigo: true });
  if (!ok) return;
  try { await api.remover(u.id); ui.toast('Usuário removido.'); await carregar(); } catch (e) { ui.erro(e); }
}
const quando = s => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/* ---- backup ---- */
function exportar() {
  const json = JSON.stringify(cad.exportarBackup(), null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `chabra-dimensiona_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
const arquivo = ref(null);
async function importar(ev) {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  let json;
  try { json = JSON.parse(await f.text()); } catch (_) { ui.toast('O arquivo não é um JSON válido.', 'error'); return; }
  if (!json || typeof json !== 'object' || !Array.isArray(json.unidades)) { ui.toast('O arquivo não parece ser um backup do Chabra Dimensiona.', 'error'); return; }
  const ok = await ui.confirmar({ titulo: 'Importar backup', mensagem: `Substituir TODOS os dados atuais pelo arquivo "${f.name}" (${json.unidades.length} unidades, ${(json.colaboradores || []).length} colaboradores)? Isso vale para toda a equipe.`, textoConfirmar: 'Substituir tudo', perigo: true });
  if (!ok) return;
  try { await cad.importarBackup(json); ui.toast('Backup importado.'); } catch (e) { ui.erro(e); }
}
</script>

<template>
  <header class="page-header"><h1>Usuários</h1><p>Quem acessa o sistema e com qual papel. O papel vale no próximo login da pessoa.</p></header>

  <section class="card">
    <div class="card-head"><h2>{{ editando ? 'Editar usuário' : 'Novo usuário' }}</h2></div>
    <form class="grid gap-4 md:grid-cols-4" @submit.prevent="salvar">
      <label class="text-[13px]"><span class="mb-1 block font-medium">Nome</span><input v-model="form.nome" class="input w-full" required maxlength="60"></label>
      <label class="text-[13px]"><span class="mb-1 block font-medium">Sobrenome</span><input v-model="form.sobrenome" class="input w-full" maxlength="60"></label>
      <template v-if="!editando">
        <label class="text-[13px]"><span class="mb-1 block font-medium">E-mail</span><input v-model="form.email" class="input w-full" type="email" required></label>
        <label class="text-[13px]"><span class="mb-1 block font-medium">Senha inicial</span><div class="flex gap-2"><input v-model="form.senha" class="input w-full" type="text" required minlength="8"><button class="btn btn-ghost" type="button" @click="form.senha = gerarSenha()">Gerar</button></div></label>
        <div class="text-[13px] md:col-span-4"><span class="mb-1 block font-medium">Papel</span>
          <div class="grid gap-2 md:grid-cols-3"><label v-for="(rot, id) in PAPEIS" :key="id" class="flex cursor-pointer gap-2 rounded-lg border border-line p-3" :class="form.papel === id ? 'border-primary bg-primary-light' : ''"><input v-model="form.papel" type="radio" :value="id"><span><strong>{{ rot }}</strong><small class="muted block">{{ DESCRICAO[id] }}</small></span></label></div>
        </div>
      </template>
      <div class="flex gap-2 md:col-span-4"><button class="btn btn-primary" type="submit" :disabled="ocupado">{{ editando ? 'Salvar' : 'Criar usuário' }}</button><button v-if="editando" class="btn btn-ghost" type="button" @click="cancelar">Cancelar</button></div>
    </form>
  </section>

  <section class="card">
    <div class="card-head"><h2>Usuários</h2><span class="muted">{{ lista.length }}</span></div>
    <p v-if="carregando && !lista.length" class="muted">Carregando…</p>
    <div v-else class="table-wrap">
      <table class="table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in lista" :key="u.id">
            <td class="font-medium">{{ u.nomeCompleto || '(sem nome)' }}<span v-if="u.id === auth.usuario.id" class="muted"> (você)</span></td>
            <td>{{ u.email }}<span v-if="u.confirmado === false" class="chip ml-1 bg-page text-muted">não confirmado</span></td>
            <td><select class="input input-sm" :value="u.papel || 'leitura'" :title="DESCRICAO[u.papel]" @change="papel(u, $event.target.value)"><option v-for="(rot, id) in PAPEIS" :key="id" :value="id">{{ rot }}</option></select></td>
            <td class="muted whitespace-nowrap">{{ quando(u.ultimoLogin) }}</td>
            <td class="num whitespace-nowrap"><button class="btn-link mr-3" type="button" @click="editar(u)">Editar</button><button class="btn-link mr-3" type="button" @click="senha(u)">Redefinir senha</button><button class="btn-link text-danger-dark" type="button" @click="remover(u)">Remover</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Backup dos dados</h2><span class="muted">os dados ficam na nuvem, compartilhados com toda a equipe</span></div>
    <p class="muted mb-3 text-[13px]">Exporte um arquivo JSON com todos os cadastros para guardar uma cópia. Importar um arquivo <strong>substitui todos os dados atuais</strong> — use só para restaurar um backup.</p>
    <div class="flex gap-2"><button class="btn btn-primary" type="button" @click="exportar">Exportar JSON</button><button class="btn btn-ghost" type="button" @click="arquivo.click()">Importar JSON…</button><input ref="arquivo" type="file" accept="application/json,.json" hidden @change="importar"></div>
  </section>
</template>
