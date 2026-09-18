<script setup>
/* Evolução — controle histórico mês a mês: com a carteira e a equipe de cada mês, o quadro
   estava insuficiente, adequado ou excedente? Quantas admissões deveriam ter ocorrido?
   Fila real × fila no cenário com essas admissões, por unidade. */
import { computed, watch } from 'vue';
import Calculo from '../engine/calculo.js';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import Grafico from '../components/ui/Grafico.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { MESES, num, numFte, moeda, plural } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;
const FUNCOES = Calculo.FUNCOES;
const ROTULO = { [TEC]: 'Técnicos', [ADM]: 'Administrativos' };

// sempre uma unidade por vez, como nas demais telas de dimensionamento
watch(() => [cad.unidades.length, pref.unidadeSel], () => {
  if (cad.unidades.length && !cad.unidades.some(u => u.id === pref.unidadeSel)) pref.unidadeSel = cad.unidades[0].id;
}, { immediate: true });

const areas = computed(() => dim.evolucaoAlvo);
const meses = computed(() => areas.value[TEC].meses.map((m, i) => ({
  ...m,
  porArea: Object.fromEntries(FUNCOES.map(f => [f, areas.value[f].meses[i]])),
})));
/** A fila da unidade é a maior entre as áreas (a que trava o atendimento). */
const filaDoMes = i => dim.backlogMes(i);            // fonte única: soma das filas das etapas
const filaCenarioDoMes = i => dim.backlogCenarioMes(i);
const admissoesDoMes = i => FUNCOES.reduce((s, f) => s + areas.value[f].meses[i].cenario.admissoes, 0);
const custoDoMes = i => FUNCOES.reduce((s, f) => s + areas.value[f].meses[i].custoDeficit, 0);

const conclusao = i => {
  const partes = FUNCOES
    .map(f => ({ f, faltam: areas.value[f].meses[i].faltamVazao }))
    .filter(x => x.faltam > 0)
    .map(x => `${x.faltam} ${x.faltam === 1 ? Calculo.FUNCAO_SINGULAR[x.f] : Calculo.FUNCAO_SINGULAR[x.f] + 's'}`);
  if (partes.length) return { texto: `Quadro insuficiente: faltavam ${partes.join(' e ')}`, classe: 'txt-deficit' };
  const emRisco = FUNCOES.some(f => areas.value[f].meses[i].status === 'atencao');
  if (!emRisco) return { texto: 'Quadro suficiente', classe: 'txt-ok' };
  const comFila = areas.value[TEC].meses[i].filaInicio > 0.5 || areas.value[ADM].meses[i].filaInicio > 0.5;
  return { texto: comFila ? 'Quadro suficiente para a entrada do mês, mas sem folga para reduzir a fila' : 'Quadro suficiente, com margem reduzida', classe: 'text-warn' };
};
const classe = i => 'row-' + (FUNCOES.some(f => areas.value[f].meses[i].status === 'deficit') ? 'deficit'
  : FUNCOES.some(f => areas.value[f].meses[i].status === 'atencao') ? 'atencao' : 'ok');

const resumo = computed(() => {
  const ultimo = meses.value.length - 1;
  const admissoes = FUNCOES.map(f => ({ funcao: f, total: areas.value[f].resumo.admissoesTotal }));
  const custoAno = meses.value.reduce((s, m, i) => s + custoDoMes(i), 0);
  return {
    filaDezembro: filaDoMes(ultimo),
    filaDezembroCenario: filaCenarioDoMes(ultimo),
    admissoes: admissoes.filter(a => a.total > 0),
    admissoesTotal: admissoes.reduce((s, a) => s + a.total, 0),
    mesesInsuficientes: meses.value.filter((m, i) => classe(i) === 'row-deficit').length,
    mesesInformados: areas.value[TEC].resumo.mesesInformados,
    custoMedio: custoAno / 12,
    primeiro: (() => { const i = meses.value.findIndex((m, k) => classe(k) === 'row-deficit'); return i >= 0 ? meses.value[i].nomeLongo : null; })(),
  };
});

/* ---- gráficos ---- */
const COR = { fila: '#c0392b', cenario: '#2f9e6b', entram: '#e0a800', capacidade: '#274b8f', real: 'rgba(0, 107, 84, .35)', necessario: '#006b54' };
const barra = { borderRadius: 4, borderSkipped: false, maxBarThickness: 30 };
const linha = cor => ({ type: 'line', borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2, tension: 0.25 });

const gFila = computed(() => ({
  labels: MESES,
  datasets: [
    { label: 'Fila ao fim do mês', data: meses.value.map((m, i) => filaDoMes(i)), backgroundColor: COR.fila, ...barra },
    { label: 'Fila com as admissões sugeridas', data: meses.value.map((m, i) => filaCenarioDoMes(i)), ...linha(COR.cenario) },
  ],
}));
const gFluxo = computed(() => ({
  labels: MESES,
  datasets: [
    { label: 'Entrou no mês', data: meses.value.map(m => m.entram), backgroundColor: COR.entram, ...barra },
    ...FUNCOES.map(f => ({ label: `Capacidade · ${ROTULO[f].toLowerCase()}`, data: areas.value[f].meses.map(m => m.capacidade), ...linha(f === TEC ? COR.capacidade : '#8f1d17') })),
  ],
}));
const gQuadro = f => computed(() => ({
  labels: MESES,
  datasets: [
    { label: 'Quadro real', data: areas.value[f].meses.map(m => Math.round(m.quadro * 10) / 10), backgroundColor: COR.real, ...barra },
    { label: 'Necessário (vazão)', data: areas.value[f].meses.map(m => m.necessarioVazao), backgroundColor: COR.necessario, ...barra },
    { label: 'Necessário (recuperação)', data: areas.value[f].meses.map(m => m.necessarioRecuperacao), ...linha(COR.fila) },
  ],
}));
const gTec = gQuadro(TEC), gAdm = gQuadro(ADM);
const oQuadro = { scales: { y: { ticks: { precision: 1 } } } };

const imprimir = () => window.print();
const p = computed(() => cad.parametros);
const semDatas = computed(() => cad.colaboradores.length > 0 && cad.colaboradores.every(c => !c.dataAdmissao));
</script>

<template>
  <header class="page-header flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1>Evolução</h1>
      <p>Mês a mês, com a carteira e a equipe de cada período: o quadro estava suficiente, quanto ficou pendente e quantas admissões seriam necessárias. As pendências de um mês entram no seguinte.</p>
    </div>
    <button class="btn btn-ghost nao-imprimir" type="button" title="Imprimir ou salvar em PDF" @click="imprimir">Imprimir</button>
  </header>

  <div class="nao-imprimir"><BarraOpcoes sem-todas /></div>

  <section v-if="!cad.unidades.length" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores para acompanhar a evolução.</p></section>
  <template v-else>
    <div class="print-only print-cabecalho">
      <strong>Evolução do quadro · {{ dim.titulo }} · {{ pref.ano }}</strong>
      <span>Chabra Dimensiona · emitido em {{ new Date().toLocaleDateString('pt-BR') }}</span>
    </div>

    <div class="mb-5 grid gap-3 md:grid-cols-4">
      <div class="stat" :class="resumo.mesesInsuficientes ? 'row-deficit' : 'row-ok'">
        <div class="label">Meses com quadro insuficiente</div>
        <div class="value">{{ resumo.mesesInsuficientes }}<small> de 12</small></div>
        <div class="stat-detalhe muted"><template v-if="resumo.primeiro">a partir de {{ resumo.primeiro }}</template><template v-else>o quadro deu conta da entrada em todos os meses</template></div>
      </div>
      <div class="stat" :class="resumo.admissoesTotal ? 'row-atencao' : 'row-ok'">
        <div class="label">Admissões que seriam necessárias</div>
        <div class="value">{{ resumo.admissoesTotal }}</div>
        <div class="stat-detalhe muted"><template v-if="resumo.admissoes.length">{{ resumo.admissoes.map(a => `${a.total} ${ROTULO[a.funcao].toLowerCase()}`).join(' · ') }}</template><template v-else>nenhuma</template></div>
      </div>
      <div class="stat" :class="resumo.filaDezembro > 0.5 ? 'row-deficit' : 'row-ok'">
        <div class="label">Pendências em dezembro</div>
        <div class="value">{{ num(resumo.filaDezembro) }}</div>
        <div class="stat-detalhe">com as admissões: <strong class="txt-ok">{{ num(resumo.filaDezembroCenario) }}</strong></div>
      </div>
      <div class="stat" :class="resumo.custoMedio > 0 ? 'row-atencao' : 'row-ok'">
        <div class="label">Custo médio do déficit</div>
        <div class="value">{{ resumo.custoMedio > 0 ? moeda(resumo.custoMedio) : '—' }}<small v-if="resumo.custoMedio > 0">/mês</small></div>
        <div class="stat-detalhe muted"><template v-if="resumo.custoMedio > 0">folha das pessoas que faltavam</template><template v-else>cadastre o custo mensal nas Funções</template></div>
      </div>
    </div>

    <div v-if="!dim.temAtendidas" class="card nao-imprimir border-[#f0d9a8] bg-warn-bg text-[13px] text-warn">
      <strong>Sem atendimentos informados.</strong> Enquanto a linha <strong>Atendidas no mês</strong> (em Empresas por Unidade) estiver vazia, os meses já decorridos acumulam tudo o que venceu e a fila fica pelo teto. Informe as empresas concluídas em cada mês para o histórico refletir o que a equipe entregou.
    </div>
    <div v-if="semDatas" class="card nao-imprimir border-[#f0d9a8] bg-warn-bg text-[13px] text-warn">
      <strong>Equipe considerada constante.</strong> Nenhum colaborador tem data de admissão cadastrada, então o sistema considera a equipe de hoje em todos os meses. Preencha as admissões (e desligamentos) em Colaboradores para o histórico ficar fiel.
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>{{ dim.titulo }} · mês a mês · {{ pref.ano }}</h2>
          <div class="muted text-[13px]">Fila no início · entrada do mês · o que a equipe entregou · fila no fim · quadro real e necessário por área.</div>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[12px] text-muted">
          <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#2f9e6b]"></i>suficiente</span>
          <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#e0a800]"></i>sem margem</span>
          <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#c0392b]"></i>insuficiente</span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead>
            <tr>
              <th rowspan="2">Mês</th>
              <th class="num" rowspan="2" title="Pendências trazidas do mês anterior">Fila inicial</th>
              <th class="num" rowspan="2" title="Clientes que vencem no mês, ponderados pelo porte">Entrou</th>
              <th class="num" rowspan="2" title="Empresas concluídas (informadas em Empresas por Unidade) ou, sem informação, o que a equipe consegue">Atendidas</th>
              <th class="num bg-warn-bg" rowspan="2" title="Fila inicial + entrada − atendidas">Fila final</th>
              <th v-for="f in FUNCOES" :key="f" class="num" colspan="3">{{ ROTULO[f] }}</th>
              <th rowspan="2">Conclusão</th>
            </tr>
            <tr>
              <template v-for="f in FUNCOES" :key="f">
                <th class="num" title="Equipe daquele mês (pessoas inteiras equivalentes)">real</th>
                <th class="num" title="Quadro para dar conta do que entra no mês">vazão</th>
                <th class="num" title="Quadro para dar conta do que entra e ainda diluir a fila no prazo">recup.</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in meses" :key="m.mes" :class="[classe(i), m.passado ? '' : 'text-muted', m.hoje ? 'font-semibold' : '']">
              <td class="whitespace-nowrap">{{ m.nomeLongo }}
                <span v-if="m.hoje" class="chip chip-blue">mês atual</span>
                <span v-else-if="!m.passado" class="chip bg-page text-muted">projeção</span>
              </td>
              <td class="num">{{ num(m.filaInicio) }}</td>
              <td class="num">{{ num(m.entram) }}<small v-if="m.clientes && Math.abs(m.entram - m.clientes) > 0.05" class="muted"> ({{ num(m.clientes) }} clientes)</small></td>
              <td class="num" :title="m.informado ? `${num(m.informadas)} empresas informadas` : 'sem informação: estimado pela capacidade da equipe'">
                {{ num(m.porArea[TEC].atendidas) }}<small v-if="!m.informado" class="muted"> est.</small>
              </td>
              <td class="num bg-warn-bg"><strong>{{ num(filaDoMes(i)) }}</strong></td>
              <template v-for="f in FUNCOES" :key="f">
                <td class="num">{{ numFte(m.porArea[f].quadro) }}</td>
                <td class="num" :class="m.porArea[f].faltamVazao > 0 ? 'txt-deficit font-semibold' : ''">{{ m.porArea[f].necessarioVazao }}</td>
                <td class="num muted">{{ m.porArea[f].necessarioRecuperacao }}</td>
              </template>
              <td class="min-w-[260px] whitespace-normal">
                <span :class="conclusao(i).classe">{{ conclusao(i).texto }}</span>
                <span v-if="admissoesDoMes(i) > 0" class="muted"> · admitir {{ plural(admissoesDoMes(i), 'pessoa', 'pessoas') }}</span>
                <span v-if="custoDoMes(i) > 0" class="muted" title="Folha mensal das pessoas que faltavam"> · ≈ {{ moeda(custoDoMes(i)) }}/mês</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="row-ok font-semibold">
              <th>Ano de {{ pref.ano }}</th>
              <th class="num">—</th>
              <th class="num">{{ num(areas[TEC].resumo.entram) }}</th>
              <th class="num">{{ num(areas[TEC].resumo.atendidas) }}</th>
              <th class="num bg-warn-bg">{{ num(resumo.filaDezembro) }}</th>
              <th v-for="f in FUNCOES" :key="f" class="num" colspan="3">{{ areas[f].resumo.admissoesTotal ? `+${areas[f].resumo.admissoesTotal} no ano` : 'sem admissões' }}</th>
              <th class="whitespace-normal text-[13px] font-normal normal-case tracking-normal text-ink">
                <template v-if="resumo.admissoesTotal">Com {{ plural(resumo.admissoesTotal, 'admissão', 'admissões') }} ao longo do ano, dezembro terminaria com <strong>{{ num(resumo.filaDezembroCenario) }}</strong> em vez de {{ num(resumo.filaDezembro) }}.</template>
                <template v-else>A equipe deu conta do ano sem admissões.</template>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="note">Capacidade = equipe do mês × produção diária × dias úteis, descontada a margem para imprevistos de {{ Math.round(100 - p.ocupacaoAlvo) }}%. <strong>Vazão</strong> = quadro para atender o que entra no mês; <strong>recuperação</strong> = quadro para atender a entrada e ainda diluir a fila no prazo de {{ p.prazoDias }} dias. As admissões sugeridas são acumulativas (quem entra permanece) e produzem menos nos primeiros meses (período de adaptação).</p>
    </section>

    <div class="grid gap-5 xl:grid-cols-2">
      <section class="card">
        <div class="card-head"><div><h2>Fila ao fim de cada mês</h2><div class="muted text-[13px]">Barras: o que ficou pendente. Linha: o que teria ficado com as admissões sugeridas.</div></div></div>
        <Grafico type="bar" :data="gFila" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Entrada × capacidade da equipe</h2><div class="muted text-[13px]">Meses em que a linha fica abaixo da barra são os meses em que a fila cresceu.</div></div></div>
        <Grafico type="bar" :data="gFluxo" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Técnicos: quadro real × necessário</h2></div></div>
        <Grafico type="bar" :data="gTec" :options="oQuadro" :height="220" />
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Administrativos: quadro real × necessário</h2></div></div>
        <Grafico type="bar" :data="gAdm" :options="oQuadro" :height="220" />
      </section>
    </div>
  </template>
</template>
