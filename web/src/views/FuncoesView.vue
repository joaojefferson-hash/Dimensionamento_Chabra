<script setup>
/* Funções — o que a função entrega (técnico / administrativo / sem produção), chefia (quem coordena,
   para quem responde), custo mensal de uma pessoa e a ordem de exibição. */
import { computed, reactive, ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { useUiStore } from '../stores/ui.js';
import { TIPOS_PRODUCAO, COORDENA } from '../services/api.js';
import { useFormat } from '../composables/useFormat.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const ui = useUiStore();
const { moeda } = useFormat();

const vazio = () => ({ nome: '', tipoProducao: 'tecnico', chefia: false, coordena: 'todos', respondeParaId: '', custoMensal: '' });
const form = reactive(vazio());
const editando = ref(null);
const ocupado = ref(false);

const chefias = computed(() => cad.funcoes.filter(f => f.chefia && f.id !== editando.value));
const pessoasDe = f => cad.colaboradores.filter(c => c.funcaoId === f.id).length;
const tipo = id => TIPOS_PRODUCAO.find(t => t.id === id) || TIPOS_PRODUCAO[2];
const coordenaTxt = f => (COORDENA.find(c => c.id === f.coordena) || COORDENA[0]).rotulo.toLowerCase();
const nomeFuncao = id => (cad.funcaoPorId[id] || {}).nome || 'função excluída';

function editar(f) { editando.value = f.id; Object.assign(form, { nome: f.nome, tipoProducao: f.tipoProducao, chefia: f.chefia, coordena: f.coordena, respondeParaId: f.respondeParaId || '', custoMensal: f.custoMensal > 0 ? f.custoMensal : '' }); }
function cancelar() { editando.value = null; Object.assign(form, vazio()); }
async function salvar() {
  const nome = form.nome.trim();
  if (!nome) return;
  if (cad.funcoes.some(f => f.id !== editando.value && f.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) { ui.toast('Já existe uma função com esse nome.', 'error'); return; }
  const respondeParaId = form.chefia ? form.respondeParaId || null : null;
  for (let cur = respondeParaId, passos = 0; cur && passos < 50; passos++) {
    if (cur === editando.value) { ui.toast('Essa escolha de "Responde para" fecharia um ciclo.', 'error'); return; }
    const f = cad.funcaoPorId[cur]; cur = f ? f.respondeParaId : null;
  }
  const dados = { nome, tipoProducao: form.tipoProducao, chefia: form.chefia, coordena: form.chefia ? form.coordena : 'todos', respondeParaId, custoMensal: Math.max(0, Number(form.custoMensal) || 0) };
  ocupado.value = true;
  try {
    if (editando.value) { await cad.atualizarFuncao(editando.value, dados); ui.toast('Função atualizada.'); }
    else { await cad.adicionarFuncao({ ...dados, ordem: cad.funcoes.reduce((m, f) => Math.max(m, f.ordem), 0) + 1 }); ui.toast('Função adicionada.'); }
    cancelar();
  } catch (e) { ui.erro(e); } finally { ocupado.value = false; }
}
async function remover(f) {
  const n = pessoasDe(f);
  if (n > 0) { ui.toast(`"${f.nome}" está em uso por ${n} ${n === 1 ? 'pessoa' : 'pessoas'}. Mude a função delas antes.`, 'error'); return; }
  const ok = await ui.confirmar({ titulo: 'Excluir função', mensagem: `Excluir "${f.nome}"?`, textoConfirmar: 'Excluir', perigo: true });
  if (!ok) return;
  try { await cad.removerFuncao(f.id); ui.toast('Função excluída.'); } catch (e) { ui.erro(e); }
}
async function mover(f, delta) {
  const lista = cad.funcoes.slice();
  const i = lista.findIndex(x => x.id === f.id), j = i + delta;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  try {
    for (let k = 0; k < lista.length; k++) if (lista[k].ordem !== k + 1) await cad.atualizarFuncao(lista[k].id, { ordem: k + 1 });
  } catch (e) { ui.erro(e); }
}
</script>

<template>
  <header class="page-header"><h1>Funções</h1><p>Cada função diz o que a pessoa entrega e, se for chefia, quem coordena e para quem responde (isso monta o organograma). O custo mensal alimenta os valores em R$ do Dimensionamento.</p></header>

  <section v-if="auth.podeEditar" class="card">
    <div class="card-head"><h2>{{ editando ? 'Editar função' : 'Nova função' }}</h2></div>
    <form class="grid gap-4 md:grid-cols-2" @submit.prevent="salvar">
      <label class="text-[13px]"><span class="mb-1 block font-medium">Nome da função</span><input v-model="form.nome" class="input w-full" required maxlength="80" placeholder="Ex.: Supervisor TST Externo"></label>
      <label class="text-[13px]"><span class="mb-1 block font-medium">Custo mensal de uma pessoa (R$)</span><input v-model="form.custoMensal" class="input w-full" type="number" min="0" step="100" placeholder="salário + encargos, em média"><small class="muted block">Deixe vazio para não mostrar valores em R$.</small></label>
      <div class="text-[13px] md:col-span-2">
        <span class="mb-1 block font-medium">O que essa função entrega?</span>
        <div class="grid gap-2 md:grid-cols-3">
          <label v-for="t in TIPOS_PRODUCAO" :key="t.id" class="flex cursor-pointer gap-2 rounded-lg border border-line p-3" :class="form.tipoProducao === t.id ? 'border-primary bg-primary-light' : ''"><input v-model="form.tipoProducao" type="radio" :value="t.id"><span><strong>{{ t.rotulo }}</strong><small class="muted block">{{ t.descricao }}</small></span></label>
        </div>
      </div>
      <label class="flex items-start gap-2 text-[13px] md:col-span-2"><input v-model="form.chefia" type="checkbox" class="mt-1"><span><strong>Chefia de equipe</strong><small class="muted block">Marque para quem lidera pessoas. Aparece como chefia das unidades em que a pessoa está — mesmo sem produção própria.</small></span></label>
      <template v-if="form.chefia">
        <div class="text-[13px]"><span class="mb-1 block font-medium">Quem essa chefia coordena?</span><select v-model="form.coordena" class="input w-full"><option v-for="c in COORDENA" :key="c.id" :value="c.id">{{ c.rotulo }}</option></select></div>
        <div class="text-[13px]"><span class="mb-1 block font-medium">Responde para</span><select v-model="form.respondeParaId" class="input w-full"><option value="">Ninguém — é o topo</option><option v-for="f in chefias" :key="f.id" :value="f.id">{{ f.nome }}</option></select></div>
      </template>
      <div class="flex gap-2 md:col-span-2">
        <button class="btn btn-primary" type="submit" :disabled="ocupado">{{ editando ? 'Salvar alterações' : 'Adicionar função' }}</button>
        <button v-if="editando" class="btn btn-ghost" type="button" @click="cancelar">Cancelar</button>
      </div>
    </form>
  </section>

  <section class="card">
    <div class="card-head"><h2>Funções cadastradas</h2><span class="muted">{{ cad.funcoes.length }} {{ cad.funcoes.length === 1 ? 'função' : 'funções' }}</span></div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Função</th><th>O que entrega</th><th>Chefia</th><th>Coordena · responde para</th><th class="num">Custo/mês</th><th class="num">Pessoas</th><th v-if="auth.podeEditar"></th></tr></thead>
        <tbody>
          <tr v-for="(f, i) in cad.funcoes" :key="f.id" :class="f.id === editando ? 'bg-primary-light' : ''">
            <td class="font-medium">{{ f.nome }}</td>
            <td><span class="chip" :class="f.tipoProducao === 'tecnico' ? 'bg-ok-bg text-ok' : f.tipoProducao === 'administrativo' ? 'chip-blue' : 'bg-page text-muted'">{{ tipo(f.tipoProducao).rotulo }}</span></td>
            <td>{{ f.chefia ? 'Chefia' : '—' }}</td>
            <td class="muted">{{ f.chefia ? `${coordenaTxt(f)} · ${f.respondeParaId ? 'responde para ' + nomeFuncao(f.respondeParaId) : 'topo'}` : '—' }}</td>
            <td class="num" :class="f.custoMensal > 0 ? '' : 'muted'">{{ f.custoMensal > 0 ? moeda(f.custoMensal) : '—' }}</td>
            <td class="num">{{ pessoasDe(f) }}</td>
            <td v-if="auth.podeEditar" class="num whitespace-nowrap">
              <button class="btn-link mr-2" type="button" :disabled="i === 0" @click="mover(f, -1)">▲</button>
              <button class="btn-link mr-3" type="button" :disabled="i === cad.funcoes.length - 1" @click="mover(f, 1)">▼</button>
              <button class="btn-link mr-3" type="button" @click="editar(f)">Editar</button>
              <button class="btn-link text-danger-dark" type="button" @click="remover(f)">Excluir</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
