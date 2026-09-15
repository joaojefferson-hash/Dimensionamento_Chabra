<script setup>
/* Dimensionamento — a tela de resultado: barra (ano · mês atual · unidade), chefia, bloco "Hoje",
   tabela dos 12 meses, uma linha por unidade (quando "Todas"), "E se…?" e avisos de cadastro. */
import { computed } from 'vue';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import TabelaMeses from '../components/dimensionamento/TabelaMeses.vue';
import PorUnidade from '../components/dimensionamento/PorUnidade.vue';
import Simulacao from '../components/dimensionamento/Simulacao.vue';
import ChefiaLinha from '../components/ChefiaLinha.vue';
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
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const avisos = computed(() => {
  const a = dim.resultado.avisos, out = [];
  if (a.colabSemProducao && a.colabSemProducao.length) out.push(`<strong>Fora das contas (função sem produção):</strong> ${a.colabSemProducao.map(esc).join(', ')}.`);
  if (a.colabSemUnidade.length) out.push(`<strong>Sem unidade (não entram no dimensionamento):</strong> ${a.colabSemUnidade.map(esc).join(', ')}. Em Colaboradores, marque onde cada um atua.`);
  if (a.colabParcial && a.colabParcial.length) out.push(`<strong>Parte do tempo sem unidade:</strong> ${a.colabParcial.map(esc).join(', ')} — só a parte marcada conta.`);
  if (a.unidadesSemColab.length) out.push(`<strong>Unidades com empresas e sem equipe:</strong> ${a.unidadesSemColab.map(esc).join(', ')}.`);
  if (a.unidadesSemFuncao && a.unidadesSemFuncao.length) out.push(`<strong>Unidades sem alguém da função:</strong> ${a.unidadesSemFuncao.map(x => `${esc(x.unidade)} (sem ${x.funcao === 'tecnico' ? 'técnicos' : 'administrativos'})`).join(', ')}.`);
  return out;
});
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
  <ChefiaLinha v-if="cad.unidades.length" :chefia="dim.alvo.chefia" />

  <section v-if="cad.unidades.length === 0" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores para ver o dimensionamento.</p></section>
  <template v-else>
    <div class="mb-5 grid gap-3 md:grid-cols-3">
      <div class="stat" :class="dim.hoje.pendentes > 0.5 ? 'row-deficit' : 'row-ok'">
        <div class="label">Pendentes hoje · {{ mesMin(dim.hoje.mes) }}</div>
        <div class="value" :class="dim.hoje.pendentes > 0.5 ? 'text-danger' : ''">{{ num(dim.hoje.pendentes) }}<small> empresas</small></div>
        <div class="stat-detalhe">
          <template v-if="dim.hoje.deAntes > 0.5"><strong>{{ num(dim.hoje.deAntes) }}</strong> ficaram de meses anteriores<template v-if="dim.hoje.deAnoAnterior > 0.5"> (inclui {{ num(dim.hoje.deAnoAnterior) }} de {{ dim.hoje.anoAnterior }})</template> + {{ num(dim.hoje.vencem) }} que vencem em {{ mesMin(dim.hoje.mes) }}.</template>
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

    <TabelaMeses />
    <PorUnidade />
    <Simulacao />
    <div v-if="avisos.length" class="card border-[#f0d9a8] bg-warn-bg text-[13px] text-warn">
      <ul class="list-disc pl-5"><li v-for="(a, i) in avisos" :key="i" v-html="a"></li></ul>
    </div>
  </template>
</template>
