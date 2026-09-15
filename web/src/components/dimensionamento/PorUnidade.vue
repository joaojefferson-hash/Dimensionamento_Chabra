<script setup>
/* Uma linha por unidade (quando "Todas"): pendentes hoje, hoje → ideal por área, +N para zerar, conclusão do mês atual. */
import Calculo from '../../engine/calculo.js';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { usePreferenciasStore } from '../../stores/preferencias.js';
import { useDimensionamentoStore } from '../../stores/dimensionamento.js';
import { useFormat } from '../../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const { num, numFte, qtdFuncao, mesMin } = useFormat();
const FUNCOES = Calculo.FUNCOES;
const ROTULO = { [Calculo.TEC]: 'Técnicos', [Calculo.ADM]: 'Administrativos' };
const classe = s => 'row-' + (s === 'atencao' || s === 'deficit' ? s : 'ok');

const linha = u => {
  const fu = dim.fila.unidades.find(x => x.id === u.id).grupos;
  const m = u.meses[pref.mesAtual];
  const partes = FUNCOES.map(f => (m.funcoes[f].faltam > 0 ? qtdFuncao(f, m.funcoes[f].faltam) : null)).filter(Boolean);
  return {
    id: u.id, nome: u.nome, status: m.status,
    pendentes: fu[Calculo.TEC].meses[pref.mesAtual].pendentes,
    areas: FUNCOES.map(f => ({ f, pessoas: m.pessoas[f], ideal: m.funcoes[f].ideal, faltam: m.funcoes[f].faltam, status: m.funcoes[f].status, zerar: fu[f].resumo.pessoasPrazo })),
    conclusao: partes.length ? `Contratar ${partes.join(' e ')}` : 'Dá conta',
    falta: partes.length > 0,
  };
};
</script>

<template>
  <section v-if="dim.varias" class="card">
    <div class="card-head">
      <div><h2>Por unidade · hoje ({{ mesMin(pref.mesAtual) }})</h2><div class="muted text-[13px]">clique numa unidade para ver o mês a mês dela</div></div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Unidade</th>
            <th class="num bg-warn-bg" title="Empresas em aberto hoje: o que vence no mês + o que ficou dos anteriores">Pendentes hoje</th>
            <th v-for="f in FUNCOES" :key="f" class="num">{{ ROTULO[f] }}<small class="block font-normal normal-case tracking-normal text-muted">hoje → ideal</small></th>
            <th>Conclusão para {{ mesMin(pref.mesAtual) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in dim.resultado.unidades.map(linha)" :key="l.id" :class="classe(l.status)">
            <td><button class="btn-link font-semibold" type="button" @click="pref.unidadeSel = l.id">{{ l.nome }}</button></td>
            <td class="num bg-warn-bg"><strong>{{ num(l.pendentes) }}</strong></td>
            <td v-for="a in l.areas" :key="a.f" class="num">
              {{ numFte(a.pessoas) }} <span class="seta">→</span> <strong :class="a.faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ a.ideal }}</strong>
              <div v-if="a.zerar > 0" class="text-[12px] text-muted">+{{ a.zerar }} para zerar em {{ cad.parametros.prazoDias }} dias</div>
            </td>
            <td class="whitespace-normal"><strong v-if="l.falta" class="txt-deficit">{{ l.conclusao }}</strong><span v-else class="txt-ok">{{ l.conclusao }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
