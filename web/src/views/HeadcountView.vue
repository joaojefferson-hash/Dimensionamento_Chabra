<script setup>
/* Headcount — quantos colaboradores para eliminar os documentos vencidos acumulados até o
   mês escolhido. Ano, mês e unidade vêm da barra; o prazo de eliminação é escolhido aqui.
   Todo o cálculo vem de Calculo.headcount (núcleo puro). */
import { computed, ref, watch } from 'vue';
import Calculo from '../engine/calculo.js';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { num, numFte, moeda, mesLongo, mesMin, plural } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;
const FUNCOES = Calculo.FUNCOES;
const ETAPAS = Calculo.ENTREGAS.map(e => ({ id: e.id, rotulo: e.rotulo, funcao: e.funcao }));
const ROTULO = { [TEC]: 'Técnicos', [ADM]: 'Administrativos' };

watch(() => [cad.unidades.length, pref.unidadeSel], () => {
  if (cad.unidades.length && !cad.unidades.some(u => u.id === pref.unidadeSel)) pref.unidadeSel = cad.unidades[0].id;
}, { immediate: true });

/* ---- prazo de eliminação (fica no navegador) ---- */
const CHAVE = 'chabra-dimensiona:headcount-prazo';
const PRAZOS = [1, 2, 3, 6, 12];
const prazoEscolhido = ref((() => {
  try { const v = Number(localStorage.getItem(CHAVE)); return PRAZOS.includes(v) ? v : 2; } catch (_) { return 2; }
})());
watch(prazoEscolhido, v => { try { localStorage.setItem(CHAVE, String(v)); } catch (_) { /* segue sem lembrar */ } });

const calculo = computed(() => Calculo.headcount(dim.fluxoAlvo, { mes: pref.mesAtual, prazos: PRAZOS }));
const escolhido = computed(() => calculo.value.cenarios.find(c => c.prazoMeses === prazoEscolhido.value) || calculo.value.cenarios[0]);
const p = computed(() => cad.parametros);
const mesFluxo = computed(() => dim.fluxoAlvo.meses[pref.mesAtual]);
const idade = computed(() => calculo.value.backlog.idade);
const temCusto = computed(() => calculo.value.cenarios.some(c => c.custoTotal > 0));
const anosAnteriores = computed(() => dim.anosComLancamento.filter(a => a < pref.ano));
const vindoDeAntes = computed(() => (dim.fluxoAlvo.meses[0] ? dim.fluxoAlvo.meses[0].backlogInicio : 0));
const imprimir = () => window.print();
</script>

<template>
  <header class="page-header flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1>Headcount</h1>
      <p>Quantos colaboradores são necessários para eliminar os documentos vencidos acumulados até o mês escolhido. Selecione ano, mês e unidade na barra, e o prazo de eliminação abaixo.</p>
    </div>
    <button class="btn btn-ghost nao-imprimir" type="button" title="Imprimir ou salvar em PDF" @click="imprimir">Imprimir</button>
  </header>

  <div class="nao-imprimir"><BarraOpcoes sem-todas /></div>

  <section v-if="!cad.unidades.length" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores.</p></section>
  <template v-else>
    <div class="print-only print-cabecalho">
      <strong>Headcount para eliminar o vencido · {{ dim.titulo }} · {{ mesLongo(pref.mesAtual) }}/{{ pref.ano }}</strong>
      <span>Chabra Dimensiona · emitido em {{ new Date().toLocaleDateString('pt-BR') }}</span>
    </div>

    <div v-if="escolhido.impossivel" class="card nao-imprimir border-danger bg-danger-bg text-[13px] text-danger-dark">
      <strong>Não é possível calcular o quadro deste mês.</strong> Não há produção possível — verifique os dias úteis no Calendário e a produção diária em Colaboradores.
    </div>

    <!-- o que precisa ser eliminado -->
    <div class="mb-5 grid gap-3 md:grid-cols-4">
      <div class="stat" :class="calculo.backlog.total > 0.5 ? 'row-deficit' : 'row-ok'">
        <div class="label">Vencido acumulado até {{ mesMin(pref.mesAtual) }}</div>
        <div class="value" :class="calculo.backlog.total > 0.5 ? 'text-danger' : ''">{{ num(calculo.backlog.total) }}<small> UEP</small></div>
        <div class="stat-detalhe muted">
          <template v-if="vindoDeAntes > 0.5 && anosAnteriores.length">inclui {{ num(vindoDeAntes) }} vindo de {{ anosAnteriores.join(', ') }}</template>
          <template v-else>tudo venceu em {{ pref.ano }}</template>
        </div>
      </div>
      <div class="stat row-ok">
        <div class="label">Vence em {{ mesMin(pref.mesAtual) }}</div>
        <div class="value">{{ num(calculo.demandaDoMes) }}<small> UEP</small></div>
        <div class="stat-detalhe muted">{{ num(calculo.clientesDoMes) }} clientes no mês</div>
      </div>
      <div class="stat row-ok">
        <div class="label">Equipe atual</div>
        <div class="value">{{ numFte(calculo.quadroAtual) }}<small> pessoas</small></div>
        <div class="stat-detalhe muted">{{ FUNCOES.map(f => `${numFte(mesFluxo.areas[f].quadro)} ${ROTULO[f].toLowerCase()}`).join(' · ') }}</div>
      </div>
      <div class="stat" :class="escolhido.deficit > 0 ? 'row-deficit' : 'row-ok'">
        <div class="label">Faltam para eliminar em {{ escolhido.prazoMeses }} {{ escolhido.prazoMeses === 1 ? 'mês' : 'meses' }}</div>
        <div class="value" :class="escolhido.deficit > 0 ? 'text-danger' : 'txt-ok'">{{ escolhido.deficit > 0 ? '+' + escolhido.deficit : 'ninguém' }}</div>
        <div class="stat-detalhe">quadro necessário: <strong>{{ escolhido.pessoas }}</strong> {{ escolhido.pessoas === 1 ? 'pessoa' : 'pessoas' }}<span v-if="escolhido.custoDeficit > 0" class="muted"> · ≈ {{ moeda(escolhido.custoDeficit) }}/mês</span></div>
      </div>
    </div>

    <!-- cenários por prazo -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Quadro necessário por prazo de eliminação</h2>
          <div class="muted text-[13px]">Cada linha zera o vencido acumulado no prazo indicado, atendendo também o que continua vencendo no período.</div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[12px] nao-imprimir">
          <span class="muted">Prazo:</span>
          <div class="flex overflow-hidden rounded-lg border border-line">
            <button v-for="pz in PRAZOS" :key="pz" type="button" class="px-3 py-1"
              :class="prazoEscolhido === pz ? 'bg-primary text-white' : 'bg-white hover:bg-primary-light'"
              @click="prazoEscolhido = pz">{{ pz }} {{ pz === 1 ? 'mês' : 'meses' }}</button>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead>
            <tr>
              <th>Eliminar em</th>
              <th class="num" title="Vencido acumulado + o que vence durante o período">Trabalho total</th>
              <th class="num" title="Trabalho total dividido pelo prazo">Por mês</th>
              <th v-for="f in FUNCOES" :key="f" class="num">{{ ROTULO[f] }}</th>
              <th class="num">Total</th>
              <th class="num">Déficit</th>
              <th v-if="temCusto" class="num">Custo do déficit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in calculo.cenarios" :key="c.prazoMeses"
              :class="[c.prazoMeses === prazoEscolhido ? 'font-semibold' : '', c.deficit > 0 ? 'row-deficit' : 'row-ok']">
              <td class="whitespace-nowrap">
                {{ c.prazoMeses }} {{ c.prazoMeses === 1 ? 'mês' : 'meses' }}
                <span v-if="c.prazoMeses === prazoEscolhido" class="chip chip-blue">escolhido</span>
                <span v-if="c.mesesEstimados" class="chip bg-warn-bg text-warn" :title="`${c.mesesEstimados} mês(es) além de dezembro entram pela média do ano`">estimado</span>
              </td>
              <td class="num">{{ num(c.trabalhoTotal) }}</td>
              <td class="num">{{ num(c.trabalhoTotal / c.prazoMeses) }}</td>
              <td v-for="f in FUNCOES" :key="f" class="num">
                {{ c.areas[f].pessoas }}<small v-if="c.areas[f].deficit > 0" class="txt-deficit"> (+{{ c.areas[f].deficit }})</small>
              </td>
              <td class="num">{{ c.pessoas }}</td>
              <td class="num" :class="c.deficit > 0 ? 'txt-deficit' : 'txt-ok'">{{ c.deficit || '—' }}</td>
              <td v-if="temCusto" class="num">{{ c.custoDeficit > 0 ? moeda(c.custoDeficit) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">
        Uma pessoa inteira produz, por mês: {{ ETAPAS.map(e => `${num(escolhido.etapas[e.id].producaoPessoa)} em ${e.rotulo.toLowerCase()}`).join(' · ') }} — já descontada a margem para imprevistos de {{ Math.round(100 - p.ocupacaoAlvo) }}%.
        O quadro de cada área é o da etapa mais exigente, porque a mesma pessoa cobre as etapas da sua área.
      </p>
    </section>

    <!-- detalhe por etapa do prazo escolhido -->
    <section class="card">
      <div class="card-head"><div><h2>Onde entra cada pessoa — prazo de {{ escolhido.prazoMeses }} {{ escolhido.prazoMeses === 1 ? 'mês' : 'meses' }}</h2><div class="muted text-[13px]">A cadeia é sequencial: todo documento passa por inspeção, relatório e finalização.</div></div></div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Etapa</th><th>Área</th><th class="num">A fazer no período</th><th class="num">Por mês</th><th class="num">Uma pessoa faz</th><th class="num">Pessoas</th><th class="num">Hoje</th><th class="num">Faltam</th></tr></thead>
          <tbody>
            <tr v-for="e in ETAPAS" :key="e.id" :class="escolhido.etapas[e.id].deficit > 0 ? 'row-deficit' : 'row-ok'">
              <td class="font-medium">{{ e.rotulo }}</td>
              <td class="muted">{{ ROTULO[e.funcao] }}</td>
              <td class="num">{{ num(escolhido.etapas[e.id].trabalho) }}</td>
              <td class="num">{{ num(escolhido.etapas[e.id].porMes) }}</td>
              <td class="num">{{ num(escolhido.etapas[e.id].producaoPessoa) }}</td>
              <td class="num font-semibold">{{ escolhido.etapas[e.id].pessoas }}</td>
              <td class="num">{{ numFte(escolhido.etapas[e.id].quadro) }}</td>
              <td class="num" :class="escolhido.etapas[e.id].deficit > 0 ? 'txt-deficit' : 'txt-ok'">{{ escolhido.etapas[e.id].deficit || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- idade do que está vencido -->
    <section class="card">
      <div class="card-head"><div><h2>Há quanto tempo está vencido</h2><div class="muted text-[13px]">Por coortes mensais (aproximação de 30 dias por mês), em UEP.</div></div></div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Faixa</th><th v-for="f in Calculo.FAIXAS_IDADE" :key="f.id" class="num">{{ f.rotulo }}</th><th class="num bg-warn-bg">Fora do prazo ({{ p.prazoDias }} dias)</th></tr></thead>
          <tbody>
            <tr>
              <td class="font-medium">Vencido acumulado</td>
              <td v-for="f in Calculo.FAIXAS_IDADE" :key="f.id" class="num">{{ num(idade.faixas[f.id] || 0) }}</td>
              <td class="num bg-warn-bg font-semibold" :class="idade.foraDoPrazo > 0.5 ? 'txt-deficit' : ''">{{ num(idade.foraDoPrazo) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">
        <template v-if="idade.maisAntigaMeses != null">O mais antigo está vencido há <strong>{{ plural(idade.maisAntigaMeses, 'mês', 'meses') }}</strong>.</template>
        O vencido não zera na virada do ano: o que ficou em aberto em {{ anosAnteriores.length ? anosAnteriores.join(', ') : 'anos anteriores' }} continua contando aqui.
      </p>
    </section>
  </template>
</template>
