<script setup>
/* Dashboard — os mesmos números do Dimensionamento, em gráficos:
   pendentes mês a mês · vencem × equipe consegue · equipe hoje × ideal · por unidade · custo. */
import { computed } from 'vue';
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

/* Cores: identidade fixa por série (nunca por posição) */
const COR = {
  pendente: '#c8781e', pendentePassado: 'rgba(200, 120, 30, .45)', pendenteHoje: '#8f1d17',
  vencem: '#e0a800',
  tecnicos: '#006b54', tecnicosClaro: 'rgba(0, 107, 84, .35)',
  administrativos: '#274b8f', administrativosClaro: 'rgba(39, 75, 143, .35)',
  ok: '#2f9e6b', atencao: '#e0a800', deficit: '#c0392b',
};
const corStatus = s => (s === 'deficit' ? COR.deficit : s === 'atencao' ? COR.atencao : COR.ok);
const meses = computed(() => dim.alvo.meses);
const rotulos = MESES.map((m, i) => m);
const barra = { borderRadius: 4, borderSkipped: false, maxBarThickness: 34 };
const linha = cor => ({ type: 'line', borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2, tension: 0.25 });

/* 1. Pendentes no fim de cada mês (o maior entre técnicos e administrativos) */
const pendentes = computed(() => meses.value.map(m => Math.max(dim.filaAlvo[TEC].meses[m.mes].filaFim, dim.filaAlvo[ADM].meses[m.mes].filaFim)));
const gPendentes = computed(() => ({
  labels: rotulos,
  datasets: [{ label: 'Pendentes no fim do mês', data: pendentes.value, ...barra,
    backgroundColor: meses.value.map(m => (m.mes < pref.mesAtual ? COR.pendentePassado : m.mes === pref.mesAtual ? COR.pendenteHoje : COR.pendente)) }],
}));
const oPendentes = { plugins: { tooltip: { callbacks: { label: c => { const m = meses.value[c.dataIndex]; const f = dim.filaAlvo[TEC].meses[m.mes]; return ` ${num(c.parsed.y)} pendentes (${num(f.filaInicio)} de antes + ${num(f.informado)} que vencem${m.mes >= pref.mesAtual ? ` − ${num(f.atendidas)} atendidas` : ''})`; } } } } };

/* 2. Vencem × equipe consegue (por área, o que limita) */
const gVencem = computed(() => ({
  labels: rotulos,
  datasets: [
    { label: 'Vencem no mês', data: meses.value.map(m => m.precisa), backgroundColor: COR.vencem, ...barra, order: 3 },
    { label: 'Técnicos conseguem', data: meses.value.map(m => m.funcoes[TEC].atendeEmpresas), ...linha(COR.tecnicos), order: 1 },
    { label: 'Administrativos conseguem', data: meses.value.map(m => m.funcoes[ADM].atendeEmpresas), ...linha(COR.administrativos), order: 2 },
  ],
}));

/* 3. Equipe hoje × ideal, por área */
const gEquipe = f => computed(() => ({
  labels: rotulos,
  datasets: [
    { label: 'Equipe hoje', data: meses.value.map(m => Math.round(m.pessoas[f] * 10) / 10), backgroundColor: f === TEC ? COR.tecnicosClaro : COR.administrativosClaro, ...barra },
    { label: 'Quadro ideal', data: meses.value.map(m => m.funcoes[f].ideal), backgroundColor: meses.value.map(m => (m.funcoes[f].faltam > 0 ? COR.deficit : f === TEC ? COR.tecnicos : COR.administrativos)), ...barra },
  ],
}));
const gTec = gEquipe(TEC), gAdm = gEquipe(ADM);
const oEquipe = { scales: { y: { ticks: { precision: 1 } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${numFte(c.parsed.y)}` } } } };

/* 4. Por unidade (quando "Todas"): pendentes hoje e contratar para zerar no prazo */
const unidades = computed(() => (dim.varias ? dim.resultado.unidades : []));
const gUnidadesPendentes = computed(() => ({
  labels: unidades.value.map(u => u.nome),
  datasets: [{ label: 'Pendentes hoje', data: unidades.value.map(u => dim.fila.unidades.find(x => x.id === u.id).grupos[TEC].meses[pref.mesAtual].pendentes), ...barra,
    backgroundColor: unidades.value.map(u => corStatus(u.meses[pref.mesAtual].status)) }],
}));
const gUnidadesContratar = computed(() => ({
  labels: unidades.value.map(u => u.nome),
  datasets: [
    { label: 'Técnicos', data: unidades.value.map(u => dim.fila.unidades.find(x => x.id === u.id).grupos[TEC].resumo.pessoasPrazo), backgroundColor: COR.tecnicos, ...barra },
    { label: 'Administrativos', data: unidades.value.map(u => dim.fila.unidades.find(x => x.id === u.id).grupos[ADM].resumo.pessoasPrazo), backgroundColor: COR.administrativos, ...barra },
  ],
}));
const oHorizontal = { indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: '#eef1f0' }, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false }, border: { color: '#dfe5e2' } } } };
const oHorizontalEmpilhado = { ...oHorizontal, scales: { x: { ...oHorizontal.scales.x, stacked: true }, y: { ...oHorizontal.scales.y, stacked: true } } };

/* 5. Custo (quando há custo cadastrado) */
const gCusto = computed(() => ({
  labels: rotulos,
  datasets: [
    { label: 'Contratar quem falta', data: meses.value.map(m => Calculo.FUNCOES.reduce((s, f) => s + (m.funcoes[f].custo ? m.funcoes[f].custo.contratar : 0), 0)), backgroundColor: COR.deficit, ...barra },
    { label: 'Sobra paga sem produção', data: meses.value.map(m => Calculo.FUNCOES.reduce((s, f) => s + (m.funcoes[f].custo ? m.funcoes[f].custo.sobra : 0), 0)), backgroundColor: 'rgba(95, 107, 102, .45)', ...barra },
  ],
}));
const oCusto = { scales: { y: { ticks: { callback: v => moeda(v) } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${moeda(c.parsed.y)}` } } } };

const hoje = computed(() => dim.hoje);
const p = computed(() => cad.parametros);
</script>

<template>
  <header class="page-header">
    <h1>Dashboard</h1>
    <p>Os números do Dimensionamento em gráficos — {{ dim.titulo }}, {{ pref.ano }}. Passe o mouse para ver os valores; a tabela completa está no Dimensionamento.</p>
  </header>

  <BarraOpcoes />

  <section v-if="cad.unidades.length === 0" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores para ver os gráficos.</p></section>
  <template v-else>
    <div class="mb-5 grid gap-3 md:grid-cols-4">
      <div class="stat" :class="hoje.pendentes > 0.5 ? 'row-deficit' : 'row-ok'"><div class="label">Pendentes hoje · {{ mesMin(hoje.mes) }}</div><div class="value">{{ num(hoje.pendentes) }}</div><div class="stat-detalhe muted">{{ num(hoje.deAntes) }} de antes + {{ num(hoje.vencem) }} que vencem</div></div>
      <div v-for="a in hoje.areas" :key="a.funcao" class="stat" :class="'row-' + (a.status === 'atencao' || a.status === 'deficit' ? a.status : 'ok')"><div class="label">{{ a.rotulo }}</div><div class="value">{{ numFte(a.pessoas) }}<small> hoje</small> <span class="seta">→</span> <span :class="a.faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.ideal }}</span><small> ideal</small></div><div class="stat-detalhe">Zerar em {{ p.prazoDias }} dias: <strong :class="a.contratarPrazo > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.contratarPrazo > 0 ? '+' + a.contratarPrazo : 'dá conta' }}</strong></div></div>
      <div class="stat row-ok"><div class="label">Vencem em {{ pref.ano }}</div><div class="value">{{ num(dim.alvo.janela.precisa) }}</div><div class="stat-detalhe muted">pendente em dezembro sem contratar: {{ num(pendentes[11]) }}</div></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-2">
      <section class="card">
        <div class="card-head"><div><h2>Pendentes no fim de cada mês</h2><div class="muted text-[13px]">Até {{ mesMin(Math.max(0, pref.mesAtual - 1)) }} vai somando (o lançado já é o que ficou em aberto); de {{ mesMin(pref.mesAtual) }} em diante a equipe atende o que consegue.</div></div></div>
        <Grafico type="bar" :data="gPendentes" :options="oPendentes" />
        <div class="mt-2 flex gap-4 text-[12px] text-muted"><span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: COR.pendentePassado }"></i>meses passados</span><span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: COR.pendenteHoje }"></i>mês atual</span><span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: COR.pendente }"></i>plano</span></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Vencem no mês × o que a equipe consegue</h2><div class="muted text-[13px]">Barras: clientes que vencem (cada um vale o peso do porte). Linhas: quantos cada área dá conta no mês, já com a folga.</div></div></div>
        <Grafico type="bar" :data="gVencem" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Técnicos: equipe hoje × quadro ideal</h2><div class="muted text-[13px]">Ideal em vermelho = falta gente naquele mês.</div></div></div>
        <Grafico type="bar" :data="gTec" :options="oEquipe" :height="220" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Administrativos: equipe hoje × quadro ideal</h2><div class="muted text-[13px]">Ideal em vermelho = falta gente naquele mês.</div></div></div>
        <Grafico type="bar" :data="gAdm" :options="oEquipe" :height="220" />
      </section>
      <template v-if="dim.varias">
        <section class="card">
          <div class="card-head"><div><h2>Pendentes hoje, por unidade</h2><div class="muted text-[13px]">Cor = situação da unidade em {{ mesMin(pref.mesAtual) }}.</div></div></div>
          <Grafico type="bar" :data="gUnidadesPendentes" :options="oHorizontal" :height="40 + unidades.length * 34" />
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Contratar para zerar em {{ p.prazoDias }} dias, por unidade</h2><div class="muted text-[13px]">Pessoas a mais para zerar o pendente de hoje e o que vence dentro do prazo.</div></div></div>
          <Grafico type="bar" :data="gUnidadesContratar" :options="oHorizontalEmpilhado" :height="40 + unidades.length * 34" />
        </section>
      </template>
      <section v-if="dim.temCusto" class="card xl:col-span-2">
        <div class="card-head"><div><h2>Impacto em R$, mês a mês</h2><div class="muted text-[13px]">Custo mensal de contratar quem falta e custo das pessoas inteiras que sobram (salário + encargos das Funções).</div></div></div>
        <Grafico type="bar" :data="gCusto" :options="oCusto" />
      </section>
    </div>
  </template>
</template>
