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
/** Alocados nesta unidade sem produção diária declarada: contam no quadro e não produzem. */
const semProducaoDeclarada = computed(() => {
  const unidadeId = dim.unidadeSelValida;
  return cad.colaboradoresCompletos.filter(c => {
    if (!FUNCOES.includes(c.tipoProducao)) return false;
    const aqui = (c.alocacoes || []).some(a => (!unidadeId || a.unidadeId === unidadeId) && Number(a.percentual) > 0);
    if (!aqui) return false;
    return Calculo.ENTREGAS_DA_FUNCAO[c.tipoProducao].every(e => Number(c[e.campo] || 0) <= 0);
  }).map(c => c.nome);
});
/** Equipe alocada NESTA unidade, no mês escolhido — a lista que a diretoria confere na mão. */
const equipeDaUnidade = computed(() => {
  const unidadeId = dim.unidadeSelValida;
  const data = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '');
  return cad.colaboradoresCompletos
    .map(c => {
      const alocs = (c.alocacoes || []).filter(a => a.unidadeId === unidadeId && Number(a.percentual) > 0);
      if (!alocs.length) return null;
      const fracao = alocs.reduce((s2, a) => s2 + Number(a.percentual), 0) / 100;
      const presenca = Calculo.presencaNoMes(c, pref.ano, pref.mesAtual);
      const entregas = Calculo.ENTREGAS_DA_FUNCAO[c.tipoProducao] || [];
      return {
        id: c.id, nome: c.nome, funcao: c.funcao, tipoProducao: c.tipoProducao, chefia: c.chefia,
        fracao, presenca, equivalente: fracao * presenca,
        producao: c.tipoProducao === TEC ? `${num(c.inspecoesDia, 1)} inspeções · ${num(c.relatoriosDia, 1)} relatórios/dia`
          : c.tipoProducao === ADM ? `${num(c.empresasDia, 1)} empresas/dia` : 'sem produção',
        semProducao: entregas.length > 0 && entregas.every(e => Number(c[e.campo] || 0) <= 0),
        admissao: data(c.dataAdmissao), desligamento: data(c.dataDesligamento),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.tipoProducao.localeCompare(b.tipoProducao) || a.nome.localeCompare(b.nome, 'pt-BR'));
});
const equipeProdutiva = computed(() => equipeDaUnidade.value.filter(c => FUNCOES.includes(c.tipoProducao) && c.presenca > 0));
const equipeChefia = computed(() => equipeDaUnidade.value.filter(c => c.chefia));
const equipeForaDoMes = computed(() => equipeDaUnidade.value.filter(c => FUNCOES.includes(c.tipoProducao) && c.presenca <= 0));
const equipeSemFuncao = computed(() => equipeDaUnidade.value.filter(c => !c.chefia && !FUNCOES.includes(c.tipoProducao)));
/** A diferença entre gente e equivalente vem de tempo parcial e de entradas/saídas no meio do mês. */
const temTempoParcial = computed(() => Math.abs(calculo.value.cabecasAtual - calculo.value.quadroAtual) > 0.05);
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

    <!-- a equipe, pessoa por pessoa: o número da unidade tem que bater com o cadastro -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Equipe de {{ dim.titulo }} em {{ mesLongo(pref.mesAtual) }}</h2>
          <div class="muted text-[13px]">
            <strong>{{ plural(calculo.cabecasAtual, 'pessoa', 'pessoas') }}</strong> com alocação nesta unidade.
            <template v-if="temTempoParcial">O cálculo usa o equivalente em tempo integral — <strong>{{ numFte(calculo.quadroAtual) }}</strong> —, porque quem divide a jornada com outra unidade ou entrou no meio do mês não trabalha o mês inteiro aqui.</template>
            <template v-else>Todas em tempo integral no mês.</template>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Nome</th><th>Função</th><th class="num">Alocação aqui</th><th class="num">Presença no mês</th><th>Produção diária declarada</th><th class="num">Equivale a</th></tr></thead>
          <tbody>
            <tr v-for="c in equipeProdutiva" :key="c.id" :class="c.semProducao ? 'row-deficit' : ''">
              <td class="font-medium">{{ c.nome }}</td>
              <td class="muted">{{ c.funcao }}</td>
              <td class="num">{{ Math.round(c.fracao * 100) }}%</td>
              <td class="num">
                {{ Math.round(c.presenca * 100) }}%
                <small v-if="c.presenca < 0.999" class="muted block">{{ c.admissao ? 'desde ' + c.admissao : '' }}{{ c.desligamento ? ' até ' + c.desligamento : '' }}</small>
              </td>
              <td :class="c.semProducao ? 'txt-deficit' : ''">{{ c.producao }}<small v-if="c.semProducao"> — informe a produção</small></td>
              <td class="num font-semibold">{{ numFte(c.equivalente) }}</td>
            </tr>
            <tr v-if="!equipeProdutiva.length"><td colspan="6" class="muted">Ninguém com produção alocado nesta unidade neste mês.</td></tr>
          </tbody>
          <tfoot v-if="equipeProdutiva.length">
            <tr class="font-semibold">
              <td>Total</td>
              <td colspan="4" class="muted">{{ FUNCOES.map(f => `${num(mesFluxo.areas[f].cabecas)} ${ROTULO[f].toLowerCase()}`).join(' · ') }}</td>
              <td class="num">{{ numFte(calculo.quadroAtual) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="equipeChefia.length" class="note">
        <strong>Chefia alocada aqui:</strong> {{ equipeChefia.map(c => `${c.nome} (${c.funcao})`).join(', ') }}.
        Não entra no quadro porque não tem produção própria — coordena a equipe.
      </p>
      <p v-if="equipeForaDoMes.length" class="note">
        <strong>Fora deste mês:</strong> {{ equipeForaDoMes.map(c => `${c.nome}${c.admissao ? ' (admissão em ' + c.admissao + ')' : ''}${c.desligamento ? ' (desligamento em ' + c.desligamento + ')' : ''}`).join(', ') }}.
        Está alocado na unidade, mas não conta em {{ mesLongo(pref.mesAtual) }}.
      </p>
      <p v-if="equipeSemFuncao.length" class="note">
        <strong>Sem produção cadastrada na função:</strong> {{ equipeSemFuncao.map(c => `${c.nome}${c.funcao ? ' (' + c.funcao + ')' : ''}`).join(', ') }}.
        A função está marcada como sem produção, então não entra no dimensionamento.
      </p>
    </section>

    <!-- cenários por prazo -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Quadro necessário para eliminar em {{ escolhido.prazoMeses }} {{ escolhido.prazoMeses === 1 ? 'mês' : 'meses' }}</h2>
          <div class="muted text-[13px]">Zera o vencido acumulado até {{ mesLongo(pref.mesAtual) }}, atendendo também o que continua vencendo no período. Troque o prazo ao lado.</div>
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
