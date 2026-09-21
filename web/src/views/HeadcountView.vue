<script setup>
/* Headcount — quantos colaboradores para eliminar os documentos vencidos acumulados até o
   mês escolhido. Ano, mês e unidade vêm da barra; o prazo de eliminação é escolhido aqui.
   Todo o cálculo vem de Calculo.headcount (núcleo puro). */
import { computed, ref, watch } from 'vue';
import Calculo from '../engine/calculo.js';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import EquipeDaUnidade from '../components/EquipeDaUnidade.vue';
import Grafico from '../components/ui/Grafico.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { num, numFte, moeda, mesLongo, mesMin, plural } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;
const FUNCOES = Calculo.FUNCOES;
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
/** Alocados nesta unidade sem produção diária declarada: contam no quadro e não produzem. */
const semProducaoDeclarada = computed(() => dim.equipeDoMes.filter(c => FUNCOES.includes(c.tipoProducao) && c.semProducao).map(c => c.nome));
/** Uma linha por área: o técnico faz a inspeção e o relatório do mesmo documento, então as duas
    atividades são uma conta só — vale a mais exigente, porque é a mesma pessoa. */
const areasDetalhe = computed(() => FUNCOES.map(f => {
  const daArea = Calculo.ENTREGAS_DA_FUNCAO[f];
  const a = escolhido.value.areas[f];
  const critica = escolhido.value.etapas[a.etapaCritica];
  const producoes = daArea.map(e => ({ rotulo: e.unidade, valor: escolhido.value.etapas[e.id].producaoPessoa }));
  return {
    funcao: f, rotulo: ROTULO[f],
    atividades: daArea.map(e => e.rotulo.toLowerCase()).join(' e '),
    trabalho: critica.trabalho, porMes: critica.porMes,
    producao: producoes.map(x => `${num(x.valor)} ${x.rotulo}`).join(' · '),
    criticaRotulo: critica.rotulo.toLowerCase(),
    // só vale destacar a atividade que manda quando as duas exigem gente diferente
    mandaUma: daArea.length > 1 && daArea.some(e => escolhido.value.etapas[e.id].pessoas !== a.pessoas),
    pessoas: a.pessoas, quadro: a.quadro, cabecas: a.cabecas, deficit: a.deficit,
  };
}));
/** A diferença entre gente e equivalente vem de tempo parcial e de entradas/saídas no meio do mês. */
const temTempoParcial = computed(() => Math.abs(calculo.value.cabecasAtual - calculo.value.quadroAtual) > 0.05);
/* ---- gráficos ---- */
const COR = { [TEC]: '#006b54', [ADM]: '#e0a800', atual: '#5f6b66' };
const barra = { borderRadius: 4, borderSkipped: false, maxBarThickness: 34 };
/** O prazo escolhido em cor cheia; os outros esmaecidos — a comparação sem tirar o foco. */
const tom = (f, prazo) => (prazo === prazoEscolhido.value ? COR[f] : COR[f] + '59');

const gPrazos = computed(() => ({
  labels: calculo.value.cenarios.map(c => `${c.prazoMeses} ${c.prazoMeses === 1 ? 'mês' : 'meses'}`),
  datasets: [
    ...FUNCOES.map(f => ({
      label: ROTULO[f],
      data: calculo.value.cenarios.map(c => c.areas[f].pessoas),
      backgroundColor: calculo.value.cenarios.map(c => tom(f, c.prazoMeses)),
      stack: 'quadro',
      ...barra,
    })),
    {
      type: 'line', label: `Equipe atual (${numFte(calculo.value.quadroAtual)} em tempo integral)`,
      data: calculo.value.cenarios.map(() => calculo.value.quadroAtual),
      borderColor: COR.atual, backgroundColor: COR.atual, borderWidth: 2, borderDash: [6, 4],
      pointRadius: 0, pointHoverRadius: 0, tension: 0,
    },
  ],
}));
const oPrazos = computed(() => ({
  scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'pessoas' } } },
  plugins: {
    // a legenda mostra a cor cheia: o esmaecido é destaque do prazo escolhido, não identidade da série
    legend: {
      labels: {
        generateLabels: grafico => grafico.data.datasets.map((d, i) => {
          const cor = [COR[TEC], COR[ADM], COR.atual][i];
          return { text: d.label, fillStyle: cor, strokeStyle: cor, lineWidth: 0, pointStyle: 'circle', hidden: !grafico.isDatasetVisible(i), datasetIndex: i };
        }),
      },
    },
    tooltip: {
      callbacks: {
        footer: itens => {
          const c = calculo.value.cenarios[itens[0].dataIndex];
          return c ? `Total: ${c.pessoas} · déficit ${c.deficit > 0 ? '+' + c.deficit : 'nenhum'}` : '';
        },
      },
    },
  },
}));

const gIdade = computed(() => ({
  labels: Calculo.FAIXAS_IDADE.map(f => f.rotulo),
  datasets: [{
    label: 'Vencido acumulado (UEP)',
    data: Calculo.FAIXAS_IDADE.map(f => idade.value.faixas[f.id] || 0),
    backgroundColor: ['#2f9e6b', '#8bbf6b', '#e0a800', '#d2691e', '#c0392b'],
    ...barra,
  }],
}));

const imprimir = () => window.print();
</script>

<template>
  <header class="page-header flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1>Headcount</h1>
      <p><strong>{{ dim.titulo }}</strong> · {{ mesLongo(pref.mesAtual) }} de {{ pref.ano }} — quantos colaboradores são necessários para eliminar os documentos vencidos acumulados até esse mês. Troque ano, mês, unidade e o prazo de eliminação na barra abaixo.</p>
    </div>
    <button class="btn btn-ghost nao-imprimir" type="button" title="Imprimir ou salvar em PDF" @click="imprimir">Imprimir</button>
  </header>

  <div class="nao-imprimir">
    <BarraOpcoes sem-todas>
      <div class="text-[12px]">
        <span class="mb-1 block font-semibold uppercase tracking-wider text-muted">Prazo de eliminação</span>
        <div class="flex overflow-hidden rounded-lg border border-line text-[13px]">
          <button v-for="pz in PRAZOS" :key="pz" type="button" class="px-3 py-[4px]"
            :class="prazoEscolhido === pz ? 'bg-primary text-white' : 'bg-white hover:bg-primary-light'"
            @click="prazoEscolhido = pz">{{ pz }} {{ pz === 1 ? 'mês' : 'meses' }}</button>
        </div>
      </div>
    </BarraOpcoes>
  </div>

  <section v-if="!cad.unidades.length" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores.</p></section>
  <template v-else>
    <div class="print-only print-cabecalho">
      <strong>Headcount para eliminar o vencido · {{ dim.titulo }} · {{ mesLongo(pref.mesAtual) }}/{{ pref.ano }}</strong>
      <span>Chabra Dimensiona · emitido em {{ new Date().toLocaleDateString('pt-BR') }}</span>
    </div>

    <div v-if="semProducaoDeclarada.length" class="card nao-imprimir border-[#f0d9a8] bg-warn-bg text-[13px] text-warn">
      <strong>Cadastro incompleto:</strong> {{ semProducaoDeclarada.join(', ') }} {{ semProducaoDeclarada.length === 1 ? 'está alocado' : 'estão alocados' }} nesta unidade com <strong>produção diária zerada</strong>. {{ semProducaoDeclarada.length === 1 ? 'Conta' : 'Contam' }} no quadro, mas não {{ semProducaoDeclarada.length === 1 ? 'produz' : 'produzem' }} — informe a produção diária em Colaboradores para o cálculo ficar correto.
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
        <div class="value">{{ num(calculo.cabecasAtual) }}<small>&nbsp;{{ calculo.cabecasAtual === 1 ? 'pessoa' : 'pessoas' }}</small></div>
        <div class="stat-detalhe muted">{{ FUNCOES.map(f => `${num(mesFluxo.areas[f].cabecas)} ${ROTULO[f].toLowerCase()}`).join(' · ') }}</div>
        <div v-if="temTempoParcial" class="stat-detalhe muted" title="Tempo parcial e admissões ou desligamentos no meio do mês">equivalem a {{ numFte(calculo.quadroAtual) }} em tempo integral</div>
      </div>
      <div class="stat" :class="escolhido.deficit > 0 ? 'row-deficit' : 'row-ok'">
        <div class="label">Faltam para eliminar em {{ escolhido.prazoMeses }} {{ escolhido.prazoMeses === 1 ? 'mês' : 'meses' }}</div>
        <div class="value" :class="escolhido.deficit > 0 ? 'text-danger' : 'txt-ok'">{{ escolhido.deficit > 0 ? '+' + escolhido.deficit : 'ninguém' }}</div>
        <div class="stat-detalhe">quadro necessário: <strong>{{ escolhido.pessoas }}</strong> {{ escolhido.pessoas === 1 ? 'pessoa' : 'pessoas' }}<span v-if="escolhido.custoDeficit > 0" class="muted"> · ≈ {{ moeda(escolhido.custoDeficit) }}/mês</span></div>
      </div>
    </div>

    <EquipeDaUnidade />

    <!-- cenários por prazo -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>{{ dim.titulo }}: quadro necessário para eliminar em {{ escolhido.prazoMeses }} {{ escolhido.prazoMeses === 1 ? 'mês' : 'meses' }}</h2>
          <div class="muted text-[13px]">Zera o vencido acumulado até {{ mesLongo(pref.mesAtual) }}, atendendo também o que continua vencendo no período. Troque o prazo na barra acima.</div>
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
            <tr v-for="c in [escolhido]" :key="c.prazoMeses" class="font-semibold" :class="c.deficit > 0 ? 'row-deficit' : 'row-ok'">
              <td class="whitespace-nowrap">
                {{ c.prazoMeses }} {{ c.prazoMeses === 1 ? 'mês' : 'meses' }}
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
        Uma pessoa inteira produz, por mês — <template v-for="(a, i) in areasDetalhe" :key="a.funcao"><strong>{{ a.rotulo.toLowerCase() }}</strong>: {{ a.producao }}{{ i < areasDetalhe.length - 1 ? '; ' : '' }}</template> —
        já descontada a margem para imprevistos de {{ Math.round(100 - p.ocupacaoAlvo) }}%.
        O quadro de cada área é o da atividade mais exigente, porque é a mesma pessoa que faz as duas.
      </p>
    </section>

    <!-- detalhe por etapa do prazo escolhido -->
    <section class="card">
      <div class="card-head"><div><h2>Onde entra cada pessoa · {{ dim.titulo }} — prazo de {{ escolhido.prazoMeses }} {{ escolhido.prazoMeses === 1 ? 'mês' : 'meses' }}</h2><div class="muted text-[13px]">Todo documento passa por inspeção, relatório e finalização. As duas primeiras são do mesmo técnico, então contam como uma pessoa só.</div></div></div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Área</th><th>Atividades</th><th class="num">A fazer no período</th><th class="num">Por mês</th><th>Uma pessoa faz, por mês</th><th class="num">Pessoas</th><th class="num">Hoje</th><th class="num">Faltam</th></tr></thead>
          <tbody>
            <tr v-for="a in areasDetalhe" :key="a.funcao" :class="a.deficit > 0 ? 'row-deficit' : 'row-ok'">
              <td class="font-medium">{{ a.rotulo }}</td>
              <td class="muted">{{ a.atividades }}</td>
              <td class="num">{{ num(a.trabalho) }}</td>
              <td class="num">{{ num(a.porMes) }}</td>
              <td>{{ a.producao }}<small v-if="a.mandaUma" class="muted"> — manda {{ a.criticaRotulo }}</small></td>
              <td class="num font-semibold">{{ a.pessoas }}</td>
              <td class="num">{{ numFte(a.quadro) }}</td>
              <td class="num" :class="a.deficit > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.deficit || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">
        O técnico faz a inspeção e o relatório do mesmo documento, e o administrativo finaliza. Por isso as atividades do técnico
        não somam gente: quando uma delas exige mais pessoas, é ela que define o quadro da área.
      </p>
    </section>

    <!-- idade do que está vencido -->
    <section class="card">
      <div class="card-head"><div><h2>Há quanto tempo está vencido · {{ dim.titulo }}</h2><div class="muted text-[13px]">Por coortes mensais (aproximação de 30 dias por mês), em UEP.</div></div></div>
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

    <!-- os mesmos números em gráfico -->
    <div class="grid gap-5 xl:grid-cols-2">
      <section class="card">
        <div class="card-head"><div><h2>Quadro necessário por prazo · {{ dim.titulo }}</h2><div class="muted text-[13px]">Quanto mais longo o prazo, menos gente é preciso admitir. Em cor cheia, o prazo escolhido; a linha tracejada é a equipe de hoje.</div></div></div>
        <Grafico type="bar" :data="gPrazos" :options="oPrazos" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Idade do vencido acumulado · {{ dim.titulo }}</h2><div class="muted text-[13px]">Em UEP, por faixas de 30 dias. Acima de {{ p.prazoDias }} dias está fora do prazo de atendimento.</div></div></div>
        <Grafico type="bar" :data="gIdade" />
      </section>
    </div>
  </template>
</template>
