<script setup>
/* Empresas por Unidade — quantos clientes VENCEM em cada mês, por condição (Mensal, Exclusiva TST) e porte.
   Seletor Porte: digita-se um porte de cada vez; "Todos" mostra a soma (só leitura) e o esforço equivalente.
   Colunas: Jan … Dez | Acumulado até o mês atual (= Pendentes hoje) | Total do ano | Média. */
import { computed, ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useUiStore } from '../stores/ui.js';
import { CONDICOES } from '../services/api.js';
import ImportarPlanilha from '../components/empresas/ImportarPlanilha.vue';
import { MESES, MESES_LONGO, num } from '../composables/useFormat.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const ui = useUiStore();

const ATIVOS = { campo: 'clientesAtivos', rotulo: 'Clientes ativos', ajuda: 'total de clientes da unidade no mês — apenas informativo, não é considerado no cálculo' };
const condSel = ref('todas');
const porteSel = ref((() => { try { return localStorage.getItem('chabra-dimensiona:empresas-porte') || 'P'; } catch (_) { return 'P'; } })());
const escolherPorte = v => { porteSel.value = v; try { localStorage.setItem('chabra-dimensiona:empresas-porte', v); } catch (_) { /* ignora */ } };
const somaPortes = computed(() => porteSel.value === 'todos');
const porteObj = computed(() => cad.portes.find(p => p.codigo === porteSel.value) || null);
const conds = computed(() => (condSel.value === 'todas' ? CONDICOES : condSel.value === ATIVOS.campo ? [ATIVOS] : CONDICOES.filter(c => c.campo === condSel.value)));
const mostrarTotal = computed(() => condSel.value === 'todas');
const soAtivos = computed(() => condSel.value === ATIVOS.campo);
const anos = computed(() => cad.anosDisponiveis(pref.ano));

/* ---- valores ---- */
const mesDe = (u, mes) => ((u.mesesPorAno || {})[pref.ano] || {})[mes] || null;
const condicaoDe = campo => (CONDICOES.find(c => c.campo === campo) || {}).condicao || null;
function valor(u, mes, campo) {
  const x = mesDe(u, mes); if (!x) return 0;
  const cond = condicaoDe(campo);
  if (!cond) return x[campo] || 0;
  if (somaPortes.value) return x[campo] || 0;
  return ((x.demanda || {})[cond] || {})[porteSel.value] || 0;
}
const totalMes = (u, mes) => CONDICOES.reduce((s, c) => s + valor(u, mes, c.campo), 0);
const ponderado = (u, mes) => { const x = mesDe(u, mes); if (!x) return 0; let s = 0; Object.values(x.demanda || {}).forEach(pp => Object.entries(pp || {}).forEach(([porte, q]) => { s += q * (cad.pesosPorte[porte] || 1); })); return s; };
const somaAno = (u, campo) => { let s = 0; for (let m = 1; m <= 12; m++) s += campo ? valor(u, m, campo) : totalMes(u, m); return s; };
const acumulado = (u, campo) => { let s = 0; for (let m = 1; m <= pref.mesAtual + 1; m++) s += campo ? valor(u, m, campo) : totalMes(u, m); return s; };
const detalhe = (u, mes, campo) => { const cond = condicaoDe(campo); const x = mesDe(u, mes); if (!cond || !x) return ''; return cad.portes.map(p => { const q = ((x.demanda || {})[cond] || {})[p.codigo] || 0; return q ? `${p.codigo} ${q}` : null; }).filter(Boolean).join(' · '); };
const fmt = v => (Number.isInteger(v) ? String(v) : num(v, 1));
const temNumeros = u => Object.keys((u.mesesPorAno || {})[pref.ano] || {}).length > 0;
const somaUnidades = fn => cad.unidades.reduce((s, u) => s + fn(u), 0);

/* ---- escrita ---- */
const salvando = ref({});
async function mudar(u, mes, campo, ev) {
  const raw = ev.target.value.trim();
  const novo = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
  const antes = valor(u, mes, campo);
  ev.target.value = novo || '';
  if (novo === antes) return;
  const chave = `${u.id}-${mes}-${campo}`;
  salvando.value[chave] = true;
  try {
    const cond = condicaoDe(campo);
    if (cond) await cad.definirDemanda(u.id, pref.ano, mes, cond, porteSel.value, novo);
    else await cad.definirClientesAtivos(u.id, pref.ano, mes, novo);
  } catch (e) { ui.erro(e); ev.target.value = antes || ''; } finally { delete salvando.value[chave]; }
}
async function limpar(u) {
  const ok = await ui.confirmar({ titulo: `Limpar ${pref.ano}`, mensagem: `Excluir todos os lançamentos de ${pref.ano} de "${u.nome}" (clientes ativos, Mensal e Exclusiva TST, todos os portes)?`, textoConfirmar: 'Excluir', perigo: true });
  if (!ok) return;
  try { await cad.limparAno(u.id, pref.ano); ui.toast(`Lançamentos de ${pref.ano} excluídos.`); } catch (e) { ui.erro(e); }
}
</script>

<template>
  <header class="page-header"><h1>Empresas por Unidade</h1>
    <p>Quantidade de clientes de cada unidade com <strong>documentos a vencer em cada mês</strong>, por condição ({{ CONDICOES.map(c => c.rotulo).join(', ') }}) e por porte ({{ cad.portes.map(p => `${p.nome} = peso ${num(p.peso, 1)}`).join(', ') }} — o porte multiplica a demanda). <strong>Informe em cada mês apenas os vencimentos daquele mês</strong>; nos meses já decorridos, o que venceu e permanece em aberto. O acumulado é calculado pela Projeção. Célula em branco equivale a zero; os dados são salvos automaticamente.</p>
  </header>

  <form class="card flex flex-wrap items-end gap-5 !py-4" @submit.prevent>
    <label class="text-[12px]">
      <span class="mb-1 block font-semibold uppercase tracking-wider text-muted">Ano</span>
      <select class="input input-sm" :value="pref.ano" @change="pref.definirAno($event.target.value)"><option v-for="a in anos" :key="a" :value="a">{{ a }}</option></select>
    </label>
    <span class="muted pb-1 text-[12.5px]">Aplica-se à tabela e à importação. Mesmo ano da Projeção.</span>
  </form>

  <section v-if="!cad.unidades.length" class="card"><p class="muted">É necessário cadastrar as unidades previamente.</p></section>
  <ImportarPlanilha v-if="cad.unidades.length && auth.podeEditar" />
  <section v-if="cad.unidades.length" class="card">
    <div class="card-head">
      <h2>Vencimentos por mês · {{ pref.ano }}</h2>
      <div class="flex flex-wrap items-center gap-2 text-[12px]">
        <span class="muted">Exibir:</span>
        <div class="flex overflow-hidden rounded-lg border border-line">
          <button v-for="o in [{ v: 'todas', t: 'Todas' }, ...CONDICOES.map(c => ({ v: c.campo, t: 'Somente ' + c.rotulo })), { v: ATIVOS.campo, t: 'Somente Clientes ativos' }]" :key="o.v" type="button" class="px-3 py-1" :class="condSel === o.v ? 'bg-primary text-white' : 'bg-white hover:bg-primary-light'" @click="condSel = o.v">{{ o.t }}</button>
        </div>
        <span class="muted ml-2">Porte:</span>
        <div class="flex overflow-hidden rounded-lg border border-line" title="Os lançamentos são feitos por porte. Em Todos, as células exibem a soma dos portes.">
          <button v-for="p in cad.portes" :key="p.codigo" type="button" class="px-3 py-1" :class="porteSel === p.codigo ? 'bg-primary text-white' : 'bg-white hover:bg-primary-light'" :title="`${p.nome} — peso ${num(p.peso, 1)}`" @click="escolherPorte(p.codigo)">{{ p.nome }}</button>
          <button type="button" class="px-3 py-1" :class="somaPortes ? 'bg-primary text-white' : 'bg-white hover:bg-primary-light'" @click="escolherPorte('todos')">Todos</button>
        </div>
      </div>
    </div>
    <p class="muted mb-3 text-[13px]">
      <template v-if="somaPortes">Exibindo a <strong>soma dos portes</strong> (somente leitura). Para lançar valores, selecione um porte acima. A linha Total exibe entre parênteses a demanda equivalente quando há clientes de porte médio ou grande.</template>
      <template v-else>Lançamento do porte <strong>{{ porteObj ? porteObj.nome : porteSel }}</strong> (peso {{ porteObj ? num(porteObj.peso, 1) : 1 }}). Para clientes de outro porte, altere a seleção acima.</template>
      A linha <strong>Clientes ativos</strong> é apenas informativa.
    </p>
    <div class="table-wrap">
      <table class="table table-grade text-center [&_td]:px-1 [&_th]:px-1 [&_th]:text-center">
        <thead>
          <tr>
            <th class="text-left">Unidade</th><th class="text-left">Condição</th>
            <th v-for="(m, i) in MESES" :key="m" :class="i < pref.mesAtual ? 'text-muted/70' : i === pref.mesAtual ? 'text-primary-dark underline underline-offset-4' : ''" :title="i < pref.mesAtual ? 'Mês decorrido: vencimentos que permanecem em aberto' : i === pref.mesAtual ? 'Mês atual' : ''">{{ m }}</th>
            <th class="bg-warn-bg text-warn" :title="`Soma de janeiro a ${MESES_LONGO[pref.mesAtual].toLowerCase()}: corresponde às Pendências atuais da Projeção`">Acumulado até {{ MESES[pref.mesAtual].toLowerCase() }}</th>
            <th class="bg-page">Total {{ pref.ano }}</th><th class="bg-page">Média</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="u in cad.unidades" :key="u.id">
            <tr v-for="(c, ci) in (mostrarTotal ? [ATIVOS, ...CONDICOES] : conds)" :key="c.campo" :class="[ci === 0 ? 'border-t-[6px]! border-t-page!' : '', c === ATIVOS ? 'text-muted' : '']">
              <td v-if="ci === 0" class="bg-white text-left align-top font-semibold" :rowspan="mostrarTotal ? CONDICOES.length + 2 : conds.length">{{ u.nome }}<div v-if="auth.podeEditar && temNumeros(u)"><button class="btn-link text-[12px] font-normal" type="button" @click="limpar(u)">excluir lançamentos de {{ pref.ano }}</button></div></td>
              <td class="whitespace-nowrap text-left"><span class="chip" :class="c === ATIVOS ? 'bg-page text-muted' : c.cor" :title="c.ajuda">{{ c.rotulo }}</span></td>
              <td v-for="mes in 12" :key="mes" :class="valor(u, mes, c.campo) ? 'bg-[#eef4fb]' : ''">
                <span v-if="c !== ATIVOS && somaPortes" class="font-semibold" :title="detalhe(u, mes, c.campo) || 'sem clientes'">{{ valor(u, mes, c.campo) || '–' }}</span>
                <input v-else class="input input-sm w-12 !px-1 text-center" type="number" min="0" step="1" :value="valor(u, mes, c.campo) || ''" placeholder="–" :disabled="!auth.podeEditar || salvando[`${u.id}-${mes}-${c.campo}`]" :title="c !== ATIVOS ? detalhe(u, mes, c.campo) : ''" @change="mudar(u, mes, c.campo, $event)">
              </td>
              <td class="bg-warn-bg font-semibold">{{ c === ATIVOS ? '—' : fmt(acumulado(u, c.campo)) }}</td>
              <td class="bg-page font-semibold">{{ fmt(somaAno(u, c.campo)) }}</td>
              <td class="bg-page text-muted">{{ fmt(somaAno(u, c.campo) / 12) }}</td>
            </tr>
            <tr v-if="mostrarTotal" :key="u.id + '-total'" class="font-semibold">
              <td class="text-left">Total<small v-if="somaPortes" class="muted font-normal"> (equivalente)</small></td>
              <td v-for="mes in 12" :key="mes">{{ totalMes(u, mes) }}<small v-if="somaPortes && Math.abs(ponderado(u, mes) - totalMes(u, mes)) > 0.05" class="muted font-normal" title="Demanda equivalente: cada cliente ponderado pelo porte"> ({{ num(ponderado(u, mes), 1) }})</small></td>
              <td class="bg-warn-bg">{{ fmt(acumulado(u, null)) }}</td><td class="bg-page">{{ fmt(somaAno(u, null)) }}</td><td class="bg-page">{{ fmt(somaAno(u, null) / 12) }}</td>
            </tr>
          </template>
        </tbody>
        <tfoot class="font-semibold">
          <tr v-if="mostrarTotal" class="text-muted"><th colspan="2" class="text-left">Clientes ativos (todas)</th><th v-for="mes in 12" :key="mes">{{ fmt(somaUnidades(u => valor(u, mes, ATIVOS.campo))) }}</th><th class="bg-warn-bg">—</th><th class="bg-page">{{ fmt(somaUnidades(u => somaAno(u, ATIVOS.campo))) }}</th><th class="bg-page">{{ fmt(somaUnidades(u => somaAno(u, ATIVOS.campo)) / 12) }}</th></tr>
          <tr><th colspan="2" class="text-left">{{ soAtivos ? 'Clientes ativos (todas)' : 'Total das unidades' }}</th>
            <th v-for="mes in 12" :key="mes">{{ fmt(somaUnidades(u => conds.reduce((s, c) => s + valor(u, mes, c.campo), 0))) }}</th>
            <th class="bg-warn-bg">{{ soAtivos ? '—' : fmt(somaUnidades(u => conds.reduce((s, c) => s + acumulado(u, c.campo), 0))) }}</th>
            <th class="bg-page">{{ fmt(somaUnidades(u => conds.reduce((s, c) => s + somaAno(u, c.campo), 0))) }}</th>
            <th class="bg-page">{{ fmt(somaUnidades(u => conds.reduce((s, c) => s + somaAno(u, c.campo), 0)) / 12) }}</th>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="note">A Projeção considera a soma de todas as condições em cada mês, com cada cliente ponderado pelo porte ({{ cad.portes.map(p => `${p.codigo} ${num(p.peso, 1)}`).join(' · ') }}; os pesos são definidos no Calendário). As pendências são acumuladas mês a mês: a coluna <strong>Acumulado</strong> corresponde à soma de janeiro até o mês atual (as "Pendências atuais" da Projeção).</p>
  </section>
</template>
