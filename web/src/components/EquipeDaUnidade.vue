<script setup>
/* Equipe da unidade no mês — a lista de conferência: quantas pessoas são, quanto cada uma
   contribui e por que o equivalente em tempo integral é menor que a contagem de gente.
   Usada na Diretoria, no Headcount e no Resumo do mês; a fonte é dim.equipeDoMes. */
import { computed } from 'vue';
import Calculo from '../engine/calculo.js';
import { usePreferenciasStore } from '../stores/preferencias.js';
import { useDimensionamentoStore } from '../stores/dimensionamento.js';
import { num, numFte, mesLongo } from '../composables/useFormat.js';

const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const FUNCOES = Calculo.FUNCOES;
const ROTULO = { [Calculo.TEC]: 'técnicos', [Calculo.ADM]: 'administrativos' };

const mes = computed(() => dim.fluxoAlvo.meses[pref.mesAtual]);
const cabecas = computed(() => FUNCOES.reduce((s, f) => s + Number(mes.value.areas[f].cabecas || 0), 0));
const equivalente = computed(() => FUNCOES.reduce((s, f) => s + Number(mes.value.areas[f].quadro || 0), 0));
const porArea = computed(() => FUNCOES.map(f => `${num(mes.value.areas[f].cabecas)} ${ROTULO[f]}`).join(' · '));
const temTempoParcial = computed(() => Math.abs(cabecas.value - equivalente.value) > 0.05);

const produtiva = computed(() => dim.equipeDoMes.filter(c => FUNCOES.includes(c.tipoProducao) && c.presenca > 0));
const chefia = computed(() => dim.equipeDoMes.filter(c => c.chefia));
const foraDoMes = computed(() => dim.equipeDoMes.filter(c => FUNCOES.includes(c.tipoProducao) && c.presenca <= 0));
const semFuncao = computed(() => dim.equipeDoMes.filter(c => !c.chefia && !FUNCOES.includes(c.tipoProducao)));
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div>
        <h2>Equipe de {{ dim.titulo }} em {{ mesLongo(pref.mesAtual) }}</h2>
        <div class="muted text-[13px]">
          <strong>{{ num(cabecas) }}</strong> {{ cabecas === 1 ? 'pessoa' : 'pessoas' }} com alocação{{ dim.unidadeSelValida ? ' nesta unidade' : '' }}.
          <template v-if="temTempoParcial">O cálculo usa o equivalente em tempo integral — <strong>{{ numFte(equivalente) }}</strong> —, porque quem divide a jornada com outra unidade ou entrou no meio do mês não trabalha o mês inteiro aqui.</template>
          <template v-else>Todas em tempo integral no mês.</template>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table table-grade">
        <thead><tr><th>Nome</th><th>Função</th><th class="num">Alocação{{ dim.unidadeSelValida ? ' aqui' : '' }}</th><th class="num">Presença no mês</th><th>Produção diária declarada</th><th class="num">Equivale a</th></tr></thead>
        <tbody>
          <tr v-for="c in produtiva" :key="c.id" :class="c.semProducao ? 'row-deficit' : ''">
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
          <tr v-if="!produtiva.length"><td colspan="6" class="muted">Ninguém com produção alocado neste mês.</td></tr>
        </tbody>
        <tfoot v-if="produtiva.length">
          <tr class="font-semibold">
            <td>Total</td>
            <td colspan="4" class="muted">{{ porArea }}</td>
            <td class="num">{{ numFte(equivalente) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-if="chefia.length" class="note">
      <strong>Chefia alocada aqui:</strong> {{ chefia.map(c => `${c.nome} (${c.funcao})`).join(', ') }}.
      Não entra no quadro porque não tem produção própria — coordena a equipe.
    </p>
    <p v-if="foraDoMes.length" class="note">
      <strong>Fora deste mês:</strong> {{ foraDoMes.map(c => `${c.nome}${c.admissao ? ' (admissão em ' + c.admissao + ')' : ''}${c.desligamento ? ' (desligamento em ' + c.desligamento + ')' : ''}`).join(', ') }}.
      Está alocado na unidade, mas não conta em {{ mesLongo(pref.mesAtual) }}.
    </p>
    <p v-if="semFuncao.length" class="note">
      <strong>Sem produção cadastrada na função:</strong> {{ semFuncao.map(c => `${c.nome}${c.funcao ? ' (' + c.funcao + ')' : ''}`).join(', ') }}.
      A função está marcada como sem produção, então não entra no dimensionamento.
    </p>
  </section>
</template>
