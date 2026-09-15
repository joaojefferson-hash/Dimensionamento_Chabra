<script setup>
/* Dimensionamento — Etapa 3: barra (ano · mês atual · unidade) e o bloco "Hoje" ligados à store.
   A tabela mês a mês, a linha por unidade e o "E se…?" viram componentes na Etapa 4. */
import { computed } from 'vue';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { useFormat } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const { num, numFte, moeda, qtdFuncao, mesMin } = useFormat();

const p = computed(() => cad.parametros);
const fimPrazo = computed(() => Math.min(11, pref.mesAtual + dim.prazoMeses - 1));
const rotuloPrazo = computed(() => (fimPrazo.value === pref.mesAtual ? mesMin(pref.mesAtual) : `${mesMin(pref.mesAtual)} a ${mesMin(fimPrazo.value)}`));
const classeStatus = s => 'row-' + (s === 'atencao' || s === 'deficit' ? s : 'ok');
/** No total, a sobra de uma unidade não cobre a falta de outra. */
const notaDistribuicao = a => {
  if (!dim.varias || (a.faltam <= 0 && a.sobram <= 0)) return '';
  const partes = [];
  if (a.faltam > 0) partes.push(`faltam ${a.faltam} onde precisa`);
  if (a.sobram > 0) partes.push(`sobram ${a.sobram} em outras unidades`);
  return partes.join(' · ');
};
</script>

<template>
  <header class="page-header">
    <h1>Dimensionamento</h1>
    <p>Com as empresas que vencem em cada mês e a equipe de hoje: dá conta? Qual o quadro ideal? Quanto fica pendente? Quantos contratar, e em qual área?</p>
  </header>

  <BarraOpcoes />

  <section v-if="cad.unidades.length === 0" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores para ver o dimensionamento.</p></section>
  <template v-else>
    <div class="mb-5 grid gap-3 md:grid-cols-3">
      <div class="stat" :class="dim.hoje.pendentes > 0.5 ? 'row-deficit' : 'row-ok'">
        <div class="label">Pendentes hoje · {{ mesMin(dim.hoje.mes) }}</div>
        <div class="value" :class="dim.hoje.pendentes > 0.5 ? 'text-danger' : ''">{{ num(dim.hoje.pendentes) }}<small> empresas</small></div>
        <div class="stat-detalhe">
          <template v-if="dim.hoje.deAntes > 0.5"><strong>{{ num(dim.hoje.deAntes) }}</strong> ficaram de meses anteriores + {{ num(dim.hoje.vencem) }} que vencem em {{ mesMin(dim.hoje.mes) }}.</template>
          <template v-else>Tudo o que vence em {{ mesMin(dim.hoje.mes) }}; nada ficou de meses anteriores.</template>
        </div>
      </div>
      <div v-for="a in dim.hoje.areas" :key="a.funcao" class="stat" :class="classeStatus(a.status)">
        <div class="label">{{ a.rotulo }}</div>
        <div class="value">{{ numFte(a.pessoas) }}<small> hoje</small> <span class="seta">→</span> <span :class="a.faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.ideal }}</span><small> ideal em {{ mesMin(dim.hoje.mes) }}</small></div>
        <div v-if="notaDistribuicao(a)" class="text-[12px] text-muted">{{ notaDistribuicao(a) }}</div>
        <div class="stat-detalhe">Para zerar o pendente em {{ p.prazoDias }} dias ({{ rotuloPrazo }}):
          <strong v-if="a.contratarPrazo > 0" class="txt-deficit">+{{ qtdFuncao(a.funcao, a.contratarPrazo) }}</strong>
          <strong v-else class="txt-ok">a equipe dá conta</strong>
          <span v-if="a.contratarPrazo > 0 && a.custoContratarPrazo > 0" class="muted">≈ {{ moeda(a.custoContratarPrazo) }}/mês</span>
        </div>
        <div v-if="a.emRampup > 0" class="stat-detalhe muted">{{ numFte(a.emRampup) }} em ramp-up (produzindo menos nos primeiros meses de casa)</div>
        <div class="stat-detalhe muted" :title="`Ritmo da equipe por dia, já com a folga de ${Math.round(100 - p.ocupacaoAlvo)}%`">Produz por dia: {{ a.producaoDia.map(e => `${num(e.valor, 1)} ${e.unidade}`).join(' · ') }}</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>{{ dim.titulo }} · mês a mês · {{ pref.ano }}</h2></div>
      <p class="muted">A tabela dos 12 meses, a linha por unidade e o "E se…?" entram na Etapa 4 como componentes (<code>TabelaMeses</code>, <code>PorUnidade</code>, <code>Simulacao</code>). Os dados já estão na store: <code>dim.alvo.meses</code> e <code>dim.filaAlvo</code>.</p>
    </section>
  </template>
</template>
