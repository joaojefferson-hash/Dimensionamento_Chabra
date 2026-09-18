<script setup>
/* Diretoria — visão executiva: carteira, demanda, capacidade, backlog (com idade), QLP em três
   leituras (operacional, recuperação, estrutural), déficit, custo e gargalo da cadeia.
   Tudo vem do núcleo Calculo.fluxo; nenhuma conta é refeita aqui. */
import { computed, watch } from 'vue';
import Calculo from '../engine/calculo.js';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import Grafico from '../components/ui/Grafico.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { MESES, num, numFte, moeda, mesLongo, mesMin } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;
const FUNCOES = Calculo.FUNCOES;
const ROTULO = { [TEC]: 'Técnicos', [ADM]: 'Administrativos' };
const ETAPAS = Calculo.ENTREGAS.map(e => ({ id: e.id, rotulo: e.rotulo, funcao: e.funcao }));

watch(() => [cad.unidades.length, pref.unidadeSel], () => {
  if (cad.unidades.length && !cad.unidades.some(u => u.id === pref.unidadeSel)) pref.unidadeSel = cad.unidades[0].id;
}, { immediate: true });

const fx = computed(() => dim.fluxoAlvo);
const mes = computed(() => fx.value.meses[pref.mesAtual]);
const resumo = computed(() => fx.value.resumo);
const p = computed(() => cad.parametros);
const prazoMeses = computed(() => dim.prazoMeses);

/* ---- indicadores ---- */
const carteira = computed(() => {
  const meses = (cad.unidadePorId[dim.unidadeSelValida] || {}).mesesPorAno || {};
  const doAno = meses[pref.ano] || {};
  const ativos = Object.values(doAno).reduce((s, m) => Math.max(s, m.clientesAtivos || 0), 0);
  return { ativos, clientesAno: fx.value.meses.reduce((s, m) => s + m.clientes, 0) };
});
const capacidade = computed(() => {
  const m = mes.value;
  const nominal = Math.min(...ETAPAS.map(e => m.etapas[e.id].capacidadeNominal));
  const planejada = Math.min(...ETAPAS.map(e => m.etapas[e.id].capacidade));
  return { nominal, planejada, margem: Math.round(100 - p.value.ocupacaoAlvo) };
});
const idade = computed(() => mes.value.idade);
const foraDoPrazo = computed(() => mes.value.idade.foraDoPrazo);
const qlp = computed(() => FUNCOES.map(f => {
  const a = mes.value.areas[f];
  const e = resumo.value.estrutural[f];
  return {
    funcao: f, rotulo: ROTULO[f],
    atual: a.quadro,
    operacional: a.qlpOperacional,
    recuperacao: a.qlpRecuperacao,
    estrutural: e.qlp,
    pico: e.pico,
    deficitOperacional: Math.max(0, Math.ceil(a.qlpOperacional - a.quadro - 1e-9)),
    deficitRecuperacao: Math.max(0, Math.ceil(a.qlpRecuperacao - a.quadro - 1e-9)),
    temporarios: Math.max(0, a.qlpRecuperacao - e.qlp),
    custoAtual: e.custoAtual,
    custoEstrutural: e.custoEstrutural,
    custoRecuperacao: e.custoRecuperacao,
    custoIncremental: e.custoIncremental,
  };
}));
const totais = computed(() => ({
  atual: qlp.value.reduce((s, q) => s + q.atual, 0),
  operacional: qlp.value.reduce((s, q) => s + q.operacional, 0),
  recuperacao: qlp.value.reduce((s, q) => s + q.recuperacao, 0),
  estrutural: qlp.value.reduce((s, q) => s + q.estrutural, 0),
  pico: qlp.value.reduce((s, q) => s + q.pico, 0),
  deficit: qlp.value.reduce((s, q) => s + q.deficitRecuperacao, 0),
  custoAtual: qlp.value.reduce((s, q) => s + q.custoAtual, 0),
  custoEstrutural: qlp.value.reduce((s, q) => s + q.custoEstrutural, 0),
  custoRecuperacao: qlp.value.reduce((s, q) => s + q.custoRecuperacao, 0),
  custoIncremental: qlp.value.reduce((s, q) => s + q.custoIncremental, 0),
}));
const temCusto = computed(() => totais.value.custoAtual > 0 || totais.value.custoEstrutural > 0);
const gargalo = computed(() => {
  const e = ETAPAS.find(x => x.id === mes.value.gargalo) || ETAPAS[0];
  const d = mes.value.etapas[e.id];
  return { ...e, fila: d.filaFim, capacidade: d.capacidade, ocioso: d.ocioso, saturada: d.saturada };
});
const ociosas = computed(() => ETAPAS.filter(e => mes.value.etapas[e.id].ocioso > 1e-9)
  .map(e => ({ ...e, ocioso: mes.value.etapas[e.id].ocioso })));
const normalizacao = computed(() => (resumo.value.zeraEm != null ? mesLongo(resumo.value.zeraEm) : null));

/* ---- gráficos ---- */
const COR = { demanda: '#e0a800', capacidade: '#006b54', backlog: '#c0392b', cenario: '#2f9e6b', atual: 'rgba(0,107,84,.35)', necessario: '#006b54', recup: '#c0392b' };
const barra = { borderRadius: 4, borderSkipped: false, maxBarThickness: 30 };
const linha = cor => ({ type: 'line', borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2, tension: 0.25 });

const gDemanda = computed(() => ({
  labels: MESES,
  datasets: [
    { label: 'Demanda (UEP)', data: fx.value.meses.map(m => m.demanda), backgroundColor: COR.demanda, ...barra },
    { label: 'Capacidade planejada da cadeia', data: fx.value.meses.map(m => Math.min(...ETAPAS.map(e => m.etapas[e.id].capacidade))), ...linha(COR.capacidade) },
  ],
}));
const gBacklog = computed(() => ({
  labels: MESES,
  datasets: [
    { label: 'Backlog ao fim do mês (UEP)', data: fx.value.meses.map(m => m.backlog), backgroundColor: COR.backlog, ...barra },
    { label: 'Com as admissões sugeridas', data: fx.value.meses.map(m => m.backlogCenario), ...linha(COR.cenario) },
  ],
}));
const gIdade = computed(() => ({
  labels: Calculo.FAIXAS_IDADE.map(f => f.rotulo),
  datasets: [{ label: 'Backlog por idade (UEP)', data: Calculo.FAIXAS_IDADE.map(f => idade.value.faixas[f.id] || 0), backgroundColor: ['#2f9e6b', '#8bbf6b', '#e0a800', '#d2691e', '#c0392b'], ...barra }],
}));
const gQlp = computed(() => ({
  labels: qlp.value.map(q => q.rotulo),
  datasets: [
    { label: 'Quadro atual', data: qlp.value.map(q => Math.round(q.atual * 10) / 10), backgroundColor: COR.atual, ...barra },
    { label: 'QLP estrutural', data: qlp.value.map(q => q.estrutural), backgroundColor: COR.necessario, ...barra },
    { label: 'QLP de recuperação', data: qlp.value.map(q => q.recuperacao), backgroundColor: COR.recup, ...barra },
  ],
}));
const oQlp = { scales: { y: { ticks: { precision: 1 } } } };
const imprimir = () => window.print();
</script>

<template>
  <header class="page-header flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1>Diretoria</h1>
      <p>Visão executiva de {{ mesLongo(pref.mesAtual) }} de {{ pref.ano }} — {{ dim.titulo }}: carteira, demanda, capacidade, backlog com idade, quadro necessário em três leituras e custo.</p>
    </div>
    <button class="btn btn-ghost nao-imprimir" type="button" title="Imprimir ou salvar em PDF" @click="imprimir">Imprimir</button>
  </header>

  <div class="nao-imprimir"><BarraOpcoes sem-todas /></div>

  <section v-if="!cad.unidades.length" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores.</p></section>
  <template v-else>
    <div class="print-only print-cabecalho">
      <strong>Dimensionamento executivo · {{ dim.titulo }} · {{ mesLongo(pref.mesAtual) }}/{{ pref.ano }}</strong>
      <span>Chabra Dimensiona · emitido em {{ new Date().toLocaleDateString('pt-BR') }}</span>
    </div>

    <div v-if="mes.impossivel" class="card nao-imprimir border-danger bg-danger-bg text-[13px] text-danger-dark">
      <strong>Não é possível dimensionar este mês.</strong> Há demanda, mas nenhuma produção possível — verifique os dias úteis do mês no Calendário e a produção diária cadastrada nos Colaboradores.
    </div>
    <div v-else-if="mes.quadroEstimado" class="card nao-imprimir border-[#f0d9a8] bg-warn-bg text-[13px] text-warn">
      <strong>Quadro estimado por produção de referência.</strong> Alguma etapa não tem ninguém alocado nesta unidade; o QLP foi calculado com a produtividade média da equipe (ou o padrão do sistema) e deve ser lido como estimativa.
    </div>

    <!-- carteira, demanda, capacidade, backlog -->
    <div class="mb-5 grid gap-3 md:grid-cols-4">
      <div class="stat row-ok">
        <div class="label">Carteira do mês</div>
        <div class="value">{{ num(mes.clientes) }}<small> clientes</small></div>
        <div class="stat-detalhe muted">{{ num(carteira.clientesAno) }} vencimentos no ano</div>
      </div>
      <div class="stat row-ok" title="Unidade Equivalente de Produção: converte clientes de portes diferentes em uma unidade comum de esforço">
        <div class="label">Demanda do mês</div>
        <div class="value">{{ num(mes.demanda) }}<small> UEP</small></div>
        <div class="stat-detalhe muted">peso médio {{ num(mes.pesoMedio, 2) }} por cliente</div>
      </div>
      <div class="stat" :class="capacidade.planejada >= mes.demanda ? 'row-ok' : 'row-deficit'">
        <div class="label">Capacidade da cadeia</div>
        <div class="value">{{ num(capacidade.planejada) }}<small> UEP</small></div>
        <div class="stat-detalhe muted">nominal {{ num(capacidade.nominal) }} − margem de {{ capacidade.margem }}%</div>
      </div>
      <div class="stat" :class="mes.backlog > 0.5 ? 'row-deficit' : 'row-ok'">
        <div class="label">Backlog ao fim do mês</div>
        <div class="value" :class="mes.backlog > 0.5 ? 'text-danger' : ''">{{ num(mes.backlog) }}<small> UEP</small></div>
        <div class="stat-detalhe">fora do prazo ({{ p.prazoDias }} dias): <strong :class="foraDoPrazo > 0.5 ? 'txt-deficit' : 'txt-ok'">{{ num(foraDoPrazo) }}</strong></div>
      </div>
    </div>

    <!-- QLP -->
    <section class="card">
      <div class="card-head">
        <div><h2>Quadro de lotação (QLP)</h2><div class="muted text-[13px]">Três leituras: manter a operação, recuperar o backlog no prazo de {{ p.prazoDias }} dias e o quadro permanente depois de normalizado.</div></div>
      </div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead>
            <tr>
              <th>Área</th>
              <th class="num" title="Pessoas hoje na unidade, em equivalentes de tempo integral">Atual</th>
              <th class="num" title="Pessoas para atender a demanda do mês sem aumentar o backlog">Operacional</th>
              <th class="num" title="Pessoas para atender a demanda e eliminar o backlog dentro do prazo">Recuperação</th>
              <th class="num" title="Pessoas necessárias depois que o backlog for normalizado (demanda média do ano)">Estrutural</th>
              <th class="num" title="Maior quadro operacional exigido em um único mês do ano">Pico do ano</th>
              <th class="num" title="Recuperação − estrutural: reforço temporário">Temporário</th>
              <th class="num">Déficit</th>
              <th v-if="temCusto" class="num">Custo atual</th>
              <th v-if="temCusto" class="num">Custo necessário</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="q in qlp" :key="q.funcao" :class="q.deficitRecuperacao > 0 ? 'row-deficit' : 'row-ok'">
              <td class="font-medium">{{ q.rotulo }}</td>
              <td class="num">{{ numFte(q.atual) }}</td>
              <td class="num">{{ q.operacional }}</td>
              <td class="num">{{ q.recuperacao }}</td>
              <td class="num">{{ q.estrutural }}</td>
              <td class="num muted">{{ q.pico }}</td>
              <td class="num muted">{{ q.temporarios || '—' }}</td>
              <td class="num" :class="q.deficitRecuperacao > 0 ? 'txt-deficit font-semibold' : 'txt-ok'">{{ q.deficitRecuperacao || '—' }}</td>
              <td v-if="temCusto" class="num">{{ q.custoAtual > 0 ? moeda(q.custoAtual) : '—' }}</td>
              <td v-if="temCusto" class="num">{{ q.custoEstrutural + q.custoRecuperacao > 0 ? moeda(q.custoEstrutural + q.custoRecuperacao) : '—' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="row-ok font-semibold">
              <th>Total</th>
              <th class="num">{{ numFte(totais.atual) }}</th>
              <th class="num">{{ totais.operacional }}</th>
              <th class="num">{{ totais.recuperacao }}</th>
              <th class="num">{{ totais.estrutural }}</th>
              <th class="num">{{ totais.pico }}</th>
              <th class="num">{{ Math.max(0, totais.recuperacao - totais.estrutural) || '—' }}</th>
              <th class="num" :class="totais.deficit > 0 ? 'txt-deficit' : 'txt-ok'">{{ totais.deficit || '—' }}</th>
              <th v-if="temCusto" class="num">{{ moeda(totais.custoAtual) }}</th>
              <th v-if="temCusto" class="num">{{ moeda(totais.custoEstrutural + totais.custoRecuperacao) }}</th>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="temCusto" class="note">Incremento mensal para o cenário de recuperação: <strong>{{ moeda(totais.custoIncremental) }}</strong> — <strong>{{ moeda(totais.custoIncremental * 12) }}</strong> no ano. Desse incremento, o reforço <strong>temporário</strong> (recuperação − estrutural) sai da folha quando o backlog normalizar.</p>
      <p v-else class="note">Cadastre o custo mensal nas Funções para ver o impacto financeiro de cada leitura do quadro.</p>
    </section>

    <!-- cadeia e gargalo -->
    <section class="card">
      <div class="card-head"><div><h2>Onde está o gargalo</h2><div class="muted text-[13px]">A cadeia é sequencial: cada etapa só processa o que a anterior concluiu. Valores de {{ mesLongo(pref.mesAtual) }}, em UEP.</div></div></div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Etapa</th><th>Área</th><th class="num">Entrou</th><th class="num">Capacidade</th><th class="num">Concluiu</th><th class="num">Ociosa</th><th class="num bg-warn-bg">Fila ao fim</th><th>Situação</th></tr></thead>
          <tbody>
            <tr v-for="e in ETAPAS" :key="e.id" :class="mes.gargalo === e.id ? 'row-deficit' : mes.etapas[e.id].ocioso > 1e-9 ? 'row-atencao' : 'row-ok'">
              <td class="font-medium">{{ e.rotulo }}<span v-if="mes.gargalo === e.id" class="chip bg-danger-bg text-danger-dark ml-1">gargalo</span></td>
              <td class="muted">{{ ROTULO[e.funcao] }}</td>
              <td class="num">{{ num(mes.etapas[e.id].entrada) }}</td>
              <td class="num">{{ num(mes.etapas[e.id].capacidade) }}</td>
              <td class="num">{{ num(mes.etapas[e.id].concluido) }}</td>
              <td class="num" :class="mes.etapas[e.id].ocioso > 1e-9 ? 'text-warn' : 'muted'">{{ mes.etapas[e.id].ocioso > 1e-9 ? num(mes.etapas[e.id].ocioso) : '—' }}</td>
              <td class="num bg-warn-bg font-semibold">{{ num(mes.etapas[e.id].filaFim) }}</td>
              <td>{{ mes.etapas[e.id].saturada ? 'Saturada: tudo o que chega não cabe' : mes.etapas[e.id].ocioso > 1e-9 ? 'Ociosa: falta trabalho da etapa anterior' : 'Equilibrada' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">A conclusão do mês ({{ num(mes.concluido) }} UEP) é limitada pela etapa gargalo — <strong>{{ gargalo.rotulo }}</strong>. Aumentar a equipe de uma etapa ociosa não aumenta a conclusão; é preciso resolver o gargalo primeiro.</p>
    </section>

    <div class="grid gap-5 xl:grid-cols-2">
      <section class="card">
        <div class="card-head"><div><h2>Demanda × capacidade</h2><div class="muted text-[13px]">Meses em que a linha fica abaixo da barra são meses em que o backlog cresce.</div></div></div>
        <Grafico type="bar" :data="gDemanda" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Backlog mês a mês</h2><div class="muted text-[13px]">Real e no cenário com as admissões sugeridas.</div></div></div>
        <Grafico type="bar" :data="gBacklog" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Idade do backlog em {{ mesMin(pref.mesAtual) }}</h2><div class="muted text-[13px]">Por coortes mensais (aproximação de 30 dias por mês).</div></div></div>
        <Grafico type="bar" :data="gIdade" />
        <p class="note">Mais antigo em fila: <strong>{{ idade.maisAntigaMeses != null ? idade.maisAntigaMeses + ' ' + (idade.maisAntigaMeses === 1 ? 'mês' : 'meses') : '—' }}</strong>. Normalização prevista: <strong>{{ normalizacao || 'não ocorre em ' + pref.ano }}</strong>.</p>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Quadro atual × necessário</h2><div class="muted text-[13px]">Estrutural (permanente) e de recuperação (com o reforço temporário).</div></div></div>
        <Grafico type="bar" :data="gQlp" :options="oQlp" :height="220" />
      </section>
    </div>

    <p class="note">
      <strong>UEP</strong> (Unidade Equivalente de Produção) converte clientes de portes diferentes em uma unidade comum de esforço: {{ cad.portes.map(pt => `${pt.nome} = ${num(pt.peso, 1)}`).join(' · ') }}.
      <strong>Capacidade planejada</strong> = capacidade nominal menos a margem para imprevistos de {{ capacidade.margem }}%.
      <strong>QLP operacional</strong> mantém a operação sem aumentar o backlog; <strong>QLP de recuperação</strong> elimina o backlog no prazo de {{ p.prazoDias }} dias ({{ prazoMeses }} {{ prazoMeses === 1 ? 'mês' : 'meses' }}); <strong>QLP estrutural</strong> é o quadro permanente depois da normalização.
      Os números não são ajustados: quando o prazo é inviável com a equipe atual, o déficit aparece como é.
    </p>
  </template>
</template>
