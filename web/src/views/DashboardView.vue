<script setup>
/* Dashboard — os mesmos números da Projeção, em gráficos, sempre de UMA unidade
   (sem o total "Todas as unidades", para não confundir): pendentes mês a mês · vencem × equipe
   consegue · equipe hoje × ideal · custo. */
import { computed, watch } from 'vue';
import Calculo from '../engine/calculo.js';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import Grafico from '../components/ui/Grafico.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { MESES, num, numFte, moeda, mesMin } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;

// sempre uma unidade: sem escolha (ou "Todas"), usa a primeira do cadastro
watch(() => [cad.unidades.length, pref.unidadeSel], () => {
  if (cad.unidades.length && !cad.unidades.some(u => u.id === pref.unidadeSel)) pref.unidadeSel = cad.unidades[0].id;
}, { immediate: true });

/* Cores: identidade fixa por série (nunca por posição) */
const COR = {
  pendente: '#c8781e', pendentePassado: 'rgba(200, 120, 30, .45)', pendenteHoje: '#8f1d17',
  vencem: '#e0a800',
  tecnicos: '#006b54', tecnicosClaro: 'rgba(0, 107, 84, .35)',
  administrativos: '#274b8f', administrativosClaro: 'rgba(39, 75, 143, .35)',
  deficit: '#c0392b',
};
const meses = computed(() => dim.alvo.meses);
const rotulos = MESES.map((m, i) => m);
const barra = { borderRadius: 4, borderSkipped: false, maxBarThickness: 34 };
const linha = cor => ({ type: 'line', borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2, tension: 0.25 });

/* 1. Pendentes no fim de cada mês (o maior entre técnicos e administrativos) */
const pendentes = computed(() => meses.value.map(m => dim.backlogMes(m.mes)));
const gPendentes = computed(() => ({
  labels: rotulos,
  datasets: [{ label: 'Pendências ao fim do mês', data: pendentes.value, ...barra,
    backgroundColor: meses.value.map(m => (m.mes < pref.mesAtual ? COR.pendentePassado : m.mes === pref.mesAtual ? COR.pendenteHoje : COR.pendente)) }],
}));
const oPendentes = { plugins: { tooltip: { callbacks: { label: c => { const m = meses.value[c.dataIndex]; const f = dim.filaAlvo[TEC].meses[m.mes]; return ` ${num(c.parsed.y)} pendências (${num(f.filaInicio)} anteriores + ${num(f.informado)} vencimentos${m.mes >= pref.mesAtual ? ` − ${num(f.atendidas)} atendimentos` : ''})`; } } } } };

/* 2. Vencem × equipe consegue (por área, o que limita) */
const gVencem = computed(() => ({
  labels: rotulos,
  datasets: [
    { label: 'Vencimentos no mês', data: meses.value.map(m => m.precisa), backgroundColor: COR.vencem, ...barra, order: 3 },
    { label: 'Produção dos técnicos', data: meses.value.map(m => m.funcoes[TEC].atendeEmpresas), ...linha(COR.tecnicos), order: 1 },
    { label: 'Produção dos administrativos', data: meses.value.map(m => m.funcoes[ADM].atendeEmpresas), ...linha(COR.administrativos), order: 2 },
  ],
}));

/* 3. Equipe hoje × ideal, por área */
const gEquipe = f => computed(() => ({
  labels: rotulos,
  datasets: [
    { label: 'Equipe atual', data: meses.value.map(m => Math.round(m.pessoas[f] * 10) / 10), backgroundColor: f === TEC ? COR.tecnicosClaro : COR.administrativosClaro, ...barra },
    { label: 'Quadro ideal', data: meses.value.map(m => m.funcoes[f].ideal), backgroundColor: meses.value.map(m => (m.funcoes[f].faltam > 0 ? COR.deficit : f === TEC ? COR.tecnicos : COR.administrativos)), ...barra },
  ],
}));
const gTec = gEquipe(TEC), gAdm = gEquipe(ADM);
const oEquipe = { scales: { y: { ticks: { precision: 1 } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${numFte(c.parsed.y)}` } } } };

/* 5. Custo (quando há custo cadastrado) */
const gCusto = computed(() => ({
  labels: rotulos,
  datasets: [
    { label: 'Contratações necessárias', data: meses.value.map(m => Calculo.FUNCOES.reduce((s, f) => s + (m.funcoes[f].custo ? m.funcoes[f].custo.contratar : 0), 0)), backgroundColor: COR.deficit, ...barra },
    { label: 'Excedente de pessoal', data: meses.value.map(m => Calculo.FUNCOES.reduce((s, f) => s + (m.funcoes[f].custo ? m.funcoes[f].custo.sobra : 0), 0)), backgroundColor: 'rgba(95, 107, 102, .45)', ...barra },
  ],
}));
const oCusto = { scales: { y: { ticks: { callback: v => moeda(v) } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${moeda(c.parsed.y)}` } } } };

const hoje = computed(() => dim.hoje);
const p = computed(() => cad.parametros);
</script>

<template>
  <header class="page-header">
    <h1>Dashboard</h1>
    <p>Indicadores da Projeção em gráficos, por unidade — {{ dim.titulo }}, {{ pref.ano }}. Posicione o cursor sobre o gráfico para ver os valores; a tabela completa está na Projeção.</p>
  </header>

  <BarraOpcoes sem-todas />

  <section v-if="cad.unidades.length === 0" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores para ver os gráficos.</p></section>
  <template v-else>
    <div class="mb-5 grid gap-3 md:grid-cols-4">
      <div class="stat" :class="hoje.pendentes > 0.5 ? 'row-deficit' : 'row-ok'"><div class="label">Pendências atuais · {{ mesMin(hoje.mes) }}</div><div class="value">{{ num(hoje.pendentes) }}</div><div class="stat-detalhe muted">{{ num(hoje.deAntes) }} acumuladas + {{ num(hoje.vencem) }} vencimentos do mês</div></div>
      <div v-for="a in hoje.areas" :key="a.funcao" class="stat" :class="'row-' + (a.status === 'atencao' || a.status === 'deficit' ? a.status : 'ok')"><div class="label">{{ a.rotulo }}</div><div class="value">{{ numFte(a.pessoas) }}<small> atual</small> <span class="seta">→</span> <span :class="a.faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.ideal }}</span><small> ideal</small></div><div class="stat-detalhe">Eliminar pendências em {{ p.prazoDias }} dias: <strong :class="a.contratarPrazo > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.contratarPrazo > 0 ? '+' + a.contratarPrazo : 'equipe suficiente' }}</strong></div></div>
      <div class="stat row-ok"><div class="label">Vencimentos em {{ pref.ano }}</div><div class="value">{{ num(dim.alvo.janela.precisa) }}</div><div class="stat-detalhe muted">pendências em dezembro sem contratações: {{ num(pendentes[11]) }}</div></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-2">
      <section class="card">
        <div class="card-head"><div><h2>Pendências ao fim de cada mês</h2><div class="muted text-[13px]">Até {{ mesMin(Math.max(0, pref.mesAtual - 1)) }}: acumulado real (o valor lançado corresponde ao que permanece em aberto). De {{ mesMin(pref.mesAtual) }} em diante: projeção com os atendimentos da equipe.</div></div></div>
        <Grafico type="bar" :data="gPendentes" :options="oPendentes" />
        <div class="mt-2 flex gap-4 text-[12px] text-muted"><span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: COR.pendentePassado }"></i>meses decorridos</span><span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: COR.pendenteHoje }"></i>mês atual</span><span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: COR.pendente }"></i>projeção</span></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Vencimentos × produção da equipe</h2><div class="muted text-[13px]">Barras: clientes com vencimento no mês (ponderados pelo porte). Linhas: produção mensal de cada área, já descontada a margem para imprevistos.</div></div></div>
        <Grafico type="bar" :data="gVencem" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Técnicos: equipe atual × quadro ideal</h2><div class="muted text-[13px]">Ideal em vermelho = déficit de pessoal no mês.</div></div></div>
        <Grafico type="bar" :data="gTec" :options="oEquipe" :height="220" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Administrativos: equipe atual × quadro ideal</h2><div class="muted text-[13px]">Ideal em vermelho = déficit de pessoal no mês.</div></div></div>
        <Grafico type="bar" :data="gAdm" :options="oEquipe" :height="220" />
      </section>
      <section v-if="dim.temCusto" class="card xl:col-span-2">
        <div class="card-head"><div><h2>Impacto financeiro mensal</h2><div class="muted text-[13px]">Custo mensal das contratações necessárias e custo do excedente de pessoal (salário + encargos cadastrados nas Funções).</div></div></div>
        <Grafico type="bar" :data="gCusto" :options="oCusto" />
      </section>
    </div>
  </template>
</template>
