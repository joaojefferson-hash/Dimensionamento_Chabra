<script setup>
/* Colaboradores — nome, função, ritmo por dia, admissão/desligamento, custo e unidades onde atua (% do tempo).
   Lista com busca e filtros. (O modo Organograma fica para a próxima rodada.) */
import { computed, reactive, ref } from 'vue';
import Calculo from '../engine/calculo.js';
import { useAuthStore } from '../stores/auth.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { useUiStore } from '../stores/ui.js';
import { MESES, num } from '../composables/useFormat.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const ui = useUiStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;

const vazio = () => ({ nome: '', funcaoId: '', inspecoesDia: 2, relatoriosDia: 1, empresasDia: 1, dataAdmissao: '', dataDesligamento: '', custoMensal: '', alocacoes: {} });
const form = reactive(vazio());
const editando = ref(null);
const ocupado = ref(false);
const busca = ref('');
const filtroFuncao = ref('');
const filtroUnidade = ref('');

const funcaoSel = computed(() => cad.funcaoPorId[form.funcaoId] || null);
const tipoSel = computed(() => (funcaoSel.value ? funcaoSel.value.tipoProducao : 'nenhuma'));
const somaAloc = computed(() => Object.values(form.alocacoes).reduce((s, a) => s + (a.marcada ? Number(a.percentual) || 0 : 0), 0));

function editar(c) {
  editando.value = c.id;
  const aloc = {};
  cad.unidades.forEach(u => { const a = c.alocacoes.find(x => x.unidadeId === u.id); aloc[u.id] = { marcada: !!a, percentual: a ? a.percentual : 100 }; });
  Object.assign(form, { nome: c.nome, funcaoId: c.funcaoId || '', inspecoesDia: c.inspecoesDia, relatoriosDia: c.relatoriosDia, empresasDia: c.empresasDia, dataAdmissao: c.dataAdmissao || '', dataDesligamento: c.dataDesligamento || '', custoMensal: c.custoMensal > 0 ? c.custoMensal : '', alocacoes: aloc });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cancelar() { editando.value = null; Object.assign(form, vazio()); }
function marcar(uid, on) {
  const atual = form.alocacoes[uid] || { marcada: false, percentual: 100 };
  const marcadas = Object.values(form.alocacoes).filter(a => a.marcada).length + (on && !atual.marcada ? 1 : 0);
  form.alocacoes[uid] = { marcada: on, percentual: on ? (marcadas > 1 ? Math.floor(100 / marcadas) : 100) : atual.percentual };
}
async function salvar() {
  const nome = form.nome.trim();
  if (!nome) return;
  if (!funcaoSel.value) { ui.toast('Selecione a função. Caso ainda não exista, cadastre-a em Funções.', 'error'); return; }
  if (cad.colaboradores.some(c => c.id !== editando.value && c.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) { ui.toast('Já existe um colaborador com este nome.', 'error'); return; }
  if (form.dataAdmissao && form.dataDesligamento && form.dataDesligamento < form.dataAdmissao) { ui.toast('A data de desligamento não pode ser anterior à admissão.', 'error'); return; }
  let alocacoes = Object.entries(form.alocacoes).filter(([, a]) => a.marcada).map(([unidadeId, a]) => ({ unidadeId, percentual: Math.max(0, Math.min(100, Number(a.percentual) || 0)) })).filter(a => a.percentual > 0);
  if (tipoSel.value === 'nenhuma') { const n = alocacoes.length; alocacoes = alocacoes.map(a => ({ ...a, percentual: Math.round((100 / n) * 100) / 100 })); }
  if (alocacoes.reduce((s, a) => s + a.percentual, 0) > 100.0001) { ui.toast('A soma da alocação nas unidades não pode exceder 100%.', 'error'); return; }
  const dados = {
    nome, funcaoId: funcaoSel.value.id,
    inspecoesDia: Math.max(0, Number(form.inspecoesDia) || 0), relatoriosDia: Math.max(0, Number(form.relatoriosDia) || 0), empresasDia: Math.max(0, Number(form.empresasDia) || 0),
    dataAdmissao: form.dataAdmissao || null, dataDesligamento: form.dataDesligamento || null,
    custoMensal: Number(form.custoMensal) > 0 ? Number(form.custoMensal) : null, alocacoes,
  };
  ocupado.value = true;
  try {
    if (editando.value) { await cad.atualizarColaborador(editando.value, dados); ui.toast('Colaborador atualizado.'); }
    else { await cad.adicionarColaborador(dados); ui.toast('Colaborador adicionado.'); }
    cancelar();
  } catch (e) { ui.erro(e); } finally { ocupado.value = false; }
}
async function remover(c) {
  const ok = await ui.confirmar({ titulo: 'Excluir colaborador', mensagem: `Excluir "${c.nome}"? Em caso de desligamento, recomenda-se informar a data de desligamento em vez de excluir, preservando o histórico.`, textoConfirmar: 'Excluir', perigo: true });
  if (!ok) return;
  try { await cad.removerColaborador(c.id); ui.toast('Colaborador excluído.'); } catch (e) { ui.erro(e); }
}

/* ---- lista ---- */
const ritmo = c => (c.tipoProducao === TEC ? `${num(c.inspecoesDia, 1)} inspeções · ${num(c.relatoriosDia, 1)} relatórios/dia` : c.tipoProducao === ADM ? `${num(c.empresasDia, 1)} empresas/dia` : 'sem produção');
const naEquipe = c => {
  const hoje = new Date();
  const partes = [];
  if (c.dataAdmissao) {
    const [a, m] = c.dataAdmissao.split('-'); const adm = new Date(Number(a), Number(m) - 1, 1);
    const meses = (hoje.getFullYear() - adm.getFullYear()) * 12 + (hoje.getMonth() - adm.getMonth());
    const r = cad.parametros.rampup;
    partes.push(`desde ${MESES[Number(m) - 1].toLowerCase()}/${a}${meses >= 0 && meses < r.length ? ` · adaptação ${r[meses]}%` : meses < 0 ? ' · admissão futura' : ''}`);
  }
  if (c.dataDesligamento) { const [a, m, d] = c.dataDesligamento.split('-'); partes.push(`até ${d}/${m}/${a}${c.dataDesligamento < hoje.toISOString().slice(0, 10) ? ' (desligado)' : ''}`); }
  return partes.join(' · ') || '—';
};
const listados = computed(() => {
  const t = busca.value.trim().toLocaleLowerCase('pt-BR');
  return cad.colaboradoresCompletos
    .filter(c => !filtroFuncao.value || c.funcaoId === filtroFuncao.value)
    .filter(c => !filtroUnidade.value || c.alocacoes.some(a => a.unidadeId === filtroUnidade.value))
    .filter(c => !t || `${c.nome} ${c.funcao} ${c.alocacoes.map(a => a.unidadeNome).join(' ')}`.toLocaleLowerCase('pt-BR').includes(t))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
});
const totalAlocado = c => c.alocacoes.reduce((s, a) => s + a.percentual, 0);
</script>

<template>
  <header class="page-header"><h1>Colaboradores</h1><p>Cadastro da equipe: função, produção diária, período de vigência e unidades de atuação. Estes dados determinam a produção considerada no Dimensionamento.</p></header>

  <section v-if="auth.podeEditar" class="card">
    <div class="card-head"><h2>{{ editando ? 'Editar colaborador' : 'Novo colaborador' }}</h2></div>
    <form class="grid gap-4 md:grid-cols-4" @submit.prevent="salvar">
      <label class="text-[13px] md:col-span-2"><span class="mb-1 block font-medium">Nome</span><input v-model="form.nome" class="input w-full" required maxlength="80"></label>
      <label class="text-[13px] md:col-span-2"><span class="mb-1 block font-medium">Função</span>
        <select v-model="form.funcaoId" class="input w-full" required><option value="" disabled>Selecione…</option><option v-for="f in cad.funcoes" :key="f.id" :value="f.id">{{ f.nome }}{{ f.chefia ? ' (chefia)' : '' }}</option></select>
        <small class="muted block">Define o tipo de produção do colaborador. Novas funções são cadastradas na tela Funções.</small>
      </label>
      <p v-if="tipoSel === 'nenhuma'" class="note md:col-span-4 !mt-0"><strong>Função sem produção.</strong> Não é considerada no cálculo; se for chefia, é exibida como responsável pelas unidades selecionadas.</p>
      <template v-if="tipoSel === TEC">
        <label class="text-[13px] md:col-span-2"><span class="mb-1 block font-medium">Inspeções por dia</span><input v-model="form.inspecoesDia" class="input w-full" type="number" min="0" step="0.5"></label>
        <label class="text-[13px] md:col-span-2"><span class="mb-1 block font-medium">Relatórios por dia</span><input v-model="form.relatoriosDia" class="input w-full" type="number" min="0" step="0.5"></label>
      </template>
      <label v-if="tipoSel === ADM" class="text-[13px] md:col-span-2"><span class="mb-1 block font-medium">Empresas finalizadas por dia</span><input v-model="form.empresasDia" class="input w-full" type="number" min="0" step="0.5"></label>
      <label class="text-[13px]"><span class="mb-1 block font-medium">Data de admissão</span><input v-model="form.dataAdmissao" class="input w-full" type="date"><small class="muted block">Opcional: o colaborador é considerado a partir desta data, com período de adaptação.</small></label>
      <label class="text-[13px]"><span class="mb-1 block font-medium">Data de desligamento</span><input v-model="form.dataDesligamento" class="input w-full" type="date"><small class="muted block">Opcional: o colaborador deixa de ser considerado a partir desta data.</small></label>
      <label class="text-[13px] md:col-span-2"><span class="mb-1 block font-medium">Custo mensal do colaborador (R$)</span><input v-model="form.custoMensal" class="input w-full" type="number" min="0" step="100" :placeholder="funcaoSel && funcaoSel.custoMensal > 0 ? `${funcaoSel.custoMensal} (da função)` : 'custo da função'"><small class="muted block">Opcional. Em branco, utiliza-se o custo médio da função.</small></label>
      <div class="text-[13px] md:col-span-4">
        <span class="mb-1 block font-medium">{{ funcaoSel && funcaoSel.chefia ? 'Unidades sob responsabilidade' : 'Unidades de atuação' }}</span>
        <p v-if="!cad.unidades.length" class="note !mt-0">É necessário cadastrar ao menos uma unidade.</p>
        <div v-else class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label v-for="u in cad.unidades" :key="u.id" class="flex items-center gap-2 rounded-lg border border-line px-3 py-2" :class="(form.alocacoes[u.id] || {}).marcada ? 'border-primary bg-primary-light' : ''">
            <input type="checkbox" :checked="(form.alocacoes[u.id] || {}).marcada" @change="marcar(u.id, $event.target.checked)">
            <span class="flex-1">{{ u.nome }}</span>
            <template v-if="(form.alocacoes[u.id] || {}).marcada && tipoSel !== 'nenhuma'"><input v-model="form.alocacoes[u.id].percentual" class="input input-sm w-16 text-right" type="number" min="1" max="100" step="1"><span class="muted">%</span></template>
          </label>
        </div>
        <small v-if="tipoSel !== 'nenhuma'" class="muted block" :class="somaAloc > 100 ? 'text-danger-dark' : ''">Tempo alocado: {{ num(somaAloc) }}% {{ somaAloc < 100 ? '(o restante não é considerado no dimensionamento)' : somaAloc > 100 ? '— não pode exceder 100%' : '' }}</small>
      </div>
      <div class="flex gap-2 md:col-span-4">
        <button class="btn btn-primary" type="submit" :disabled="ocupado">{{ editando ? 'Salvar alterações' : 'Adicionar colaborador' }}</button>
        <button v-if="editando" class="btn btn-ghost" type="button" @click="cancelar">Cancelar</button>
      </div>
    </form>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>Equipe <span class="muted font-normal">{{ listados.length }} de {{ cad.colaboradores.length }}</span></h2>
      <div class="flex flex-wrap gap-2">
        <input v-model="busca" class="input input-sm w-52" placeholder="Pesquisar…">
        <select v-model="filtroFuncao" class="input input-sm"><option value="">Todas as funções</option><option v-for="f in cad.funcoes" :key="f.id" :value="f.id">{{ f.nome }}</option></select>
        <select v-model="filtroUnidade" class="input input-sm"><option value="">Todas as unidades</option><option v-for="u in cad.unidades" :key="u.id" :value="u.id">{{ u.nome }}</option></select>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nome</th><th>Função</th><th>Produção diária</th><th>Vigência</th><th>Unidades</th><th class="num">Alocação</th><th v-if="auth.podeEditar"></th></tr></thead>
        <tbody>
          <tr v-for="c in listados" :key="c.id" :class="c.id === editando ? 'bg-primary-light' : ''">
            <td class="font-medium">{{ c.nome }}</td>
            <td><span class="chip" :class="c.tipoProducao === TEC ? 'bg-ok-bg text-ok' : c.tipoProducao === ADM ? 'chip-blue' : 'bg-page text-muted'">{{ c.funcao || 'sem função' }}</span></td>
            <td :class="c.tipoProducao === 'nenhuma' ? 'muted' : ''">{{ ritmo(c) }}</td>
            <td class="text-[12.5px]" :class="c.dataDesligamento ? 'txt-deficit' : ''">{{ naEquipe(c) }}</td>
            <td><span v-if="!c.alocacoes.length" class="chip bg-warn-bg text-warn">sem unidade</span><template v-else><div v-for="a in c.alocacoes" :key="a.unidadeId">{{ a.unidadeNome }}</div></template></td>
            <td class="num"><template v-if="c.alocacoes.length && c.tipoProducao !== 'nenhuma'"><div v-for="a in c.alocacoes" :key="a.unidadeId">{{ num(a.percentual) }}%</div><div v-if="totalAlocado(c) < 99.999" class="chip bg-warn-bg text-warn">{{ num(100 - totalAlocado(c)) }}% não alocado</div></template><span v-else class="muted">—</span></td>
            <td v-if="auth.podeEditar" class="num whitespace-nowrap"><button class="btn-link mr-3" type="button" @click="editar(c)">Editar</button><button class="btn-link text-danger-dark" type="button" @click="remover(c)">Excluir</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
