<script setup>
/* Unidades — nome; média mensal de clientes do ano selecionado; excluir apaga os números por mês. */
import { computed, ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useUiStore } from '../stores/ui.js';
import { CONDICOES } from '../services/api.js';
import { useFormat } from '../composables/useFormat.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const ui = useUiStore();
const { num } = useFormat();

const nome = ref('');
const editando = ref(null);
const ocupado = ref(false);

const mediaMes = u => { const meses = (u.mesesPorAno || {})[pref.ano] || {}; let s = 0; for (let m = 1; m <= 12; m++) { const x = meses[m]; if (x) CONDICOES.forEach(c => { s += x[c.campo] || 0; }); } return s / 12; };
const pessoasEm = id => cad.colaboradoresCompletos.filter(c => c.alocacoes.some(a => a.unidadeId === id)).length;
const duplicado = computed(() => cad.unidades.some(u => u.id !== editando.value && u.nome.trim().toLocaleLowerCase('pt-BR') === nome.value.trim().toLocaleLowerCase('pt-BR')));

function editar(u) { editando.value = u.id; nome.value = u.nome; }
function cancelar() { editando.value = null; nome.value = ''; }
async function salvar() {
  const n = nome.value.trim();
  if (!n) return;
  if (duplicado.value) { ui.toast('Já existe uma unidade com este nome.', 'error'); return; }
  ocupado.value = true;
  try {
    if (editando.value) { await cad.atualizarUnidade(editando.value, { nome: n }); ui.toast('Unidade atualizada.'); }
    else { await cad.adicionarUnidade({ nome: n }); ui.toast('Unidade adicionada.'); }
    cancelar();
  } catch (e) { ui.erro(e); } finally { ocupado.value = false; }
}
async function remover(u) {
  const ok = await ui.confirmar({ titulo: 'Excluir unidade', mensagem: `Excluir "${u.nome}"? Os lançamentos mensais e a alocação de colaboradores nesta unidade também serão excluídos.`, textoConfirmar: 'Excluir', perigo: true });
  if (!ok) return;
  try { await cad.removerUnidade(u.id); ui.toast('Unidade excluída.'); } catch (e) { ui.erro(e); }
}
</script>

<template>
  <header class="page-header"><h1>Unidades</h1><p>Unidades (filiais) da consultoria. Os vencimentos mensais são lançados em Empresas por Unidade; a equipe, em Colaboradores.</p></header>

  <section v-if="auth.podeEditar" class="card">
    <div class="card-head"><h2>{{ editando ? 'Editar unidade' : 'Nova unidade' }}</h2></div>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="salvar">
      <label class="text-[13px]"><span class="mb-1 block font-medium">Nome</span><input v-model="nome" class="input w-72" required maxlength="80" placeholder="Ex.: Teresópolis"></label>
      <button class="btn btn-primary" type="submit" :disabled="ocupado">{{ editando ? 'Salvar' : 'Adicionar' }}</button>
      <button v-if="editando" class="btn btn-ghost" type="button" @click="cancelar">Cancelar</button>
    </form>
  </section>

  <section class="card">
    <div class="card-head"><h2>Unidades cadastradas</h2><span class="muted">{{ cad.unidades.length }} {{ cad.unidades.length === 1 ? 'unidade' : 'unidades' }}</span></div>
    <p v-if="!cad.unidades.length" class="muted">Nenhuma unidade cadastrada.</p>
    <div v-else class="table-wrap">
      <table class="table">
        <thead><tr><th>Unidade</th><th class="num" :title="`Média mensal de clientes de todas as condições em ${pref.ano}`">Clientes/mês ({{ pref.ano }})</th><th class="num">Colaboradores</th><th v-if="auth.podeEditar"></th></tr></thead>
        <tbody>
          <tr v-for="u in cad.unidades" :key="u.id" :class="u.id === editando ? 'bg-primary-light' : ''">
            <td class="font-medium">{{ u.nome }}</td>
            <td class="num">{{ num(mediaMes(u), 1) }}</td>
            <td class="num">{{ pessoasEm(u.id) }}</td>
            <td v-if="auth.podeEditar" class="num whitespace-nowrap"><button class="btn-link mr-3" type="button" @click="editar(u)">Editar</button><button class="btn-link text-danger-dark" type="button" @click="remover(u)">Excluir</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
