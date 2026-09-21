<script setup>
/* Resumo do mês — a foto de um único mês: o acumulado que vem dos meses anteriores,
   o que vence no mês escolhido e a projeção com a equipe atual (quanto a equipe atende,
   quanto fica pendente e quantas admissões eliminariam a pendência no prazo). */
import { computed, watch } from 'vue';
import Calculo from '../engine/calculo.js';
import BarraOpcoes from '../components/BarraOpcoes.vue';
import ChefiaLinha from '../components/ChefiaLinha.vue';
import EquipeDaUnidade from '../components/EquipeDaUnidade.vue';
import { useCadastrosStore } from '../stores/cadastros.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { MESES_LONGO, num, numFte, moeda, mesLongo, mesMin, plural, qtdFuncao } from '../composables/useFormat.js';

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

const t = computed(() => pref.mesAtual);
const p = computed(() => cad.parametros);
const mes = computed(() => dim.alvo.meses[t.value]);
const areasEvolucao = computed(() => dim.evolucaoAlvo);
const doMes = f => areasEvolucao.value[f].meses[t.value];

/* ---- o acumulado que chega neste mês, mês a mês ---- */
const composicao = computed(() => {
  const linhas = [];
  const anterior = dim.hoje.deAnoAnterior;
  if (anterior > 0.5) linhas.push({ chave: 'anterior', rotulo: `Vindo de ${pref.ano - 1}`, entrou: anterior, atendido: 0, restou: anterior, anoAnterior: true });
  for (let i = 0; i < t.value; i++) {
    const a = doMesIndice(TEC, i), b = doMesIndice(ADM, i);
    linhas.push({
      chave: i, rotulo: MESES_LONGO[i], mes: i,
      entrou: a.entram,
      atendido: Math.min(a.atendidas, b.atendidas),
      informado: a.informado,
      restou: dim.backlogMes(i),
    });
  }
  return linhas;
});
const doMesIndice = (f, i) => areasEvolucao.value[f].meses[i];
const acumulado = computed(() => dim.hoje.deAntes);

/* ---- o mês escolhido ---- */
const areas = computed(() => FUNCOES.map(f => {
  const e = doMes(f);
  const g = mes.value.funcoes[f];
  const area = dim.hoje.areas.find(x => x.funcao === f);
  return {
    funcao: f, rotulo: ROTULO[f],
    pessoas: mes.value.pessoas[f],
    cabecas: mes.value.cabecas ? mes.value.cabecas[f] : 0,
    capacidade: e.capacidade,
    ideal: g.ideal,
    faltam: g.faltam,
    sobram: g.sobram,
    status: g.status,
    emRampup: g.emRampup || 0,
    necessarioRecuperacao: e.necessarioRecuperacao,
    contratarPrazo: area ? area.contratarPrazo : 0,
    custoContratarPrazo: area ? area.custoContratarPrazo : 0,
    custoPessoa: e.custoPessoa,
    producaoDia: area ? area.producaoDia : [],
    filaFim: e.filaFim,
  };
}));

const totalAAtender = computed(() => acumulado.value + dim.hoje.vencem);
const capacidadeMes = computed(() => Math.min(...FUNCOES.map(f => doMes(f).capacidade)));
const pendenteFim = computed(() => dim.backlogMes(t.value));
const atendeNoMes = computed(() => Math.max(0, totalAAtender.value - pendenteFim.value));
const classeStatus = s => 'row-' + (s === 'atencao' || s === 'deficit' ? s : 'ok');

/* ---- projeção dali para a frente, sem contratar ---- */
const projecao = computed(() => {
  const resumo = dim.filaAlvo[TEC].resumo;
  const resumoAdm = dim.filaAlvo[ADM].resumo;
  const zera = [resumo.zeraEm, resumoAdm.zeraEm].filter(v => v != null);
  const dezembro = dim.backlogMes(11);
  const proximos = [];
  for (let i = t.value + 1; i <= Math.min(11, t.value + 3); i++) {
    proximos.push({
      mes: i, nome: MESES_LONGO[i],
      entram: dim.filaAlvo[TEC].meses[i].entram,
      filaFim: dim.backlogMes(i),
    });
  }
  return { zeraEm: zera.length === 2 ? Math.max(...zera) : null, dezembro, proximos };
});

const rotuloPrazo = computed(() => {
  const fim = Math.min(11, t.value + dim.prazoMeses - 1);
  return fim === t.value ? mesMin(t.value) : `${mesMin(t.value)} a ${mesMin(fim)}`;
});
const imprimir = () => window.print();
</script>

<template>
  <header class="page-header flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1>Resumo do mês</h1>
      <p>A foto de um mês: o que vem acumulado dos meses anteriores, o que vence no mês e a projeção com a equipe atual. O mês é o escolhido na barra abaixo.</p>
    </div>
    <button class="btn btn-ghost nao-imprimir" type="button" title="Imprimir ou salvar em PDF" @click="imprimir">Imprimir</button>
  </header>

  <div class="nao-imprimir"><BarraOpcoes sem-todas /></div>

  <section v-if="!cad.unidades.length" class="card"><p class="muted">Cadastre unidades, empresas por unidade e colaboradores para ver o resumo do mês.</p></section>
  <template v-else>
    <div class="print-only print-cabecalho">
      <strong>Resumo de {{ mesLongo(t) }} de {{ pref.ano }} · {{ dim.titulo }}</strong>
      <span>Chabra Dimensiona · emitido em {{ new Date().toLocaleDateString('pt-BR') }}</span>
    </div>
    <ChefiaLinha :chefia="dim.alvo.chefia" />

    <div class="mb-5 grid gap-3 md:grid-cols-4">
      <div class="stat" :class="acumulado > 0.5 ? 'row-atencao' : 'row-ok'">
        <div class="label">Acumulado até {{ mesMin(t) }}</div>
        <div class="value">{{ num(acumulado) }}<small> empresas</small></div>
        <div class="stat-detalhe muted">em aberto de meses anteriores<template v-if="dim.hoje.deAnoAnterior > 0.5">, incluindo {{ num(dim.hoje.deAnoAnterior) }} de {{ pref.ano - 1 }}</template></div>
      </div>
      <div class="stat row-ok">
        <div class="label">Vencem em {{ mesMin(t) }}</div>
        <div class="value">{{ num(dim.hoje.vencem) }}<small> empresas</small></div>
        <div class="stat-detalhe muted">{{ num(mes.empresas) }} clientes, ponderados pelo porte</div>
      </div>
      <div class="stat" :class="totalAAtender > capacidadeMes ? 'row-deficit' : 'row-ok'">
        <div class="label">A atender no mês</div>
        <div class="value">{{ num(totalAAtender) }}</div>
        <div class="stat-detalhe">a equipe atende <strong>{{ num(atendeNoMes) }}</strong> em {{ mes.diasUteis }} dias úteis</div>
      </div>
      <div class="stat" :class="pendenteFim > 0.5 ? 'row-deficit' : 'row-ok'">
        <div class="label">Pendências ao fim de {{ mesMin(t) }}</div>
        <div class="value" :class="pendenteFim > 0.5 ? 'text-danger' : ''">{{ num(pendenteFim) }}</div>
        <div class="stat-detalhe muted">passa para {{ t < 11 ? mesMin(t + 1) : 'janeiro de ' + (pref.ano + 1) }}</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Equipe de {{ mesLongo(t) }}</h2><div class="muted text-[13px]">Quadro atual, quadro ideal para os vencimentos do mês e o quadro que eliminaria as pendências no prazo de {{ p.prazoDias }} dias ({{ rotuloPrazo }}).</div></div></div>
      <div class="grid gap-3 md:grid-cols-2">
        <div v-for="a in areas" :key="a.funcao" class="stat" :class="classeStatus(a.status)">
          <div class="label">{{ a.rotulo }}</div>
          <div class="value">{{ num(a.cabecas) }}<small> atual</small> <span class="seta">→</span> <span :class="a.faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.ideal }}</span><small> ideal em {{ mesMin(t) }}</small></div>
          <div v-if="Math.abs(a.cabecas - a.pessoas) > 0.05" class="stat-detalhe muted" title="Alocação em mais de uma unidade, admissões ou desligamentos no meio do mês">equivalem a {{ numFte(a.pessoas) }} em tempo integral</div>
          <div class="stat-detalhe">
            <template v-if="a.faltam > 0"><strong class="txt-deficit">Faltam {{ qtdFuncao(a.funcao, a.faltam) }}</strong> para os vencimentos do mês</template>
            <template v-else-if="a.sobram > 0"><strong class="txt-ok">Excedente de {{ qtdFuncao(a.funcao, a.sobram) }}</strong> em relação aos vencimentos do mês</template>
            <template v-else><strong class="txt-ok">Quadro suficiente</strong> para os vencimentos do mês</template>
          </div>
          <div class="stat-detalhe">Para eliminar as pendências em {{ p.prazoDias }} dias:
            <strong v-if="a.contratarPrazo > 0" class="txt-deficit">+{{ qtdFuncao(a.funcao, a.contratarPrazo) }}</strong>
            <strong v-else class="txt-ok">equipe suficiente</strong>
            <span v-if="a.contratarPrazo > 0 && a.custoContratarPrazo > 0" class="muted">≈ {{ moeda(a.custoContratarPrazo) }}/mês</span>
          </div>
          <div class="stat-detalhe muted">Capacidade no mês: {{ num(a.capacidade) }} empresas · produção diária: {{ a.producaoDia.map(e => `${num(e.valor, 1)} ${e.unidade}`).join(' · ') }}</div>
          <div v-if="a.emRampup > 0" class="stat-detalhe muted">{{ numFte(a.emRampup) }} em período de adaptação</div>
        </div>
      </div>
    </section>

    <EquipeDaUnidade />

    <section v-if="composicao.length" class="card">
      <div class="card-head"><div><h2>De onde vem o acumulado</h2><div class="muted text-[13px]">Os meses anteriores a {{ mesMin(t) }}: o que venceu, o que foi atendido e o que permaneceu em aberto.</div></div></div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Mês</th><th class="num">Venceu</th><th class="num">Atendido</th><th class="num bg-warn-bg">Em aberto ao fim do mês</th></tr></thead>
          <tbody>
            <tr v-for="l in composicao" :key="l.chave">
              <td>{{ l.rotulo }}<span v-if="l.anoAnterior" class="chip bg-page text-muted ml-1">ano anterior</span></td>
              <td class="num">{{ num(l.entrou) }}</td>
              <td class="num" :title="l.informado ? 'informado em Empresas por Unidade' : 'sem informação de atendimento no mês'">{{ l.anoAnterior ? '—' : num(l.atendido) }}<small v-if="!l.anoAnterior && !l.informado" class="muted"> não informado</small></td>
              <td class="num bg-warn-bg font-semibold">{{ num(l.restou) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="row-ok font-semibold"><th>Chega em {{ mesLongo(t) }}</th><th class="num">—</th><th class="num">—</th><th class="num bg-warn-bg">{{ num(acumulado) }}</th></tr>
          </tfoot>
        </table>
      </div>
      <p class="note">Enquanto a linha <strong>Atendidas no mês</strong> (Empresas por Unidade) estiver vazia, os meses já decorridos acumulam tudo o que venceu.</p>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Projeção com a equipe atual</h2><div class="muted text-[13px]">Mantendo o quadro de hoje, sem novas admissões.</div></div></div>
      <div class="grid gap-3 md:grid-cols-3">
        <div class="stat row-ok">
          <div class="label">Próximos meses</div>
          <div class="stat-detalhe">
            <div v-for="x in projecao.proximos" :key="x.mes">{{ x.nome }}: vencem {{ num(x.entram) }} · ficam <strong>{{ num(x.filaFim) }}</strong></div>
            <div v-if="!projecao.proximos.length" class="muted">{{ mesLongo(t) }} é o último mês do ano.</div>
          </div>
        </div>
        <div class="stat" :class="projecao.zeraEm != null ? 'row-ok' : 'row-deficit'">
          <div class="label">Quando as pendências zeram</div>
          <div class="value" :class="projecao.zeraEm == null ? '!text-[18px]' : ''">{{ projecao.zeraEm != null ? mesLongo(projecao.zeraEm) : 'Não zeram em ' + pref.ano }}</div>
          <div class="stat-detalhe muted">com a equipe atual e os vencimentos já lançados</div>
        </div>
        <div class="stat" :class="projecao.dezembro > 0.5 ? 'row-deficit' : 'row-ok'">
          <div class="label">Pendências em dezembro</div>
          <div class="value">{{ num(projecao.dezembro) }}</div>
          <div class="stat-detalhe muted">entram em janeiro de {{ pref.ano + 1 }}</div>
        </div>
      </div>
      <p class="note">Quadro ideal = pessoas inteiras para atender os vencimentos do mês, com cada cliente ponderado pelo porte e descontada a margem para imprevistos de {{ Math.round(100 - p.ocupacaoAlvo) }}%. O mês a mês completo está na Projeção; o histórico com as admissões que seriam necessárias, na Evolução.</p>
    </section>
  </template>
</template>
