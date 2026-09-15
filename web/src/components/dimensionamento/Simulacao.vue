<script setup>
/* "E se…?" — contratações (+) ou desligamentos (−) só neste navegador. Fechado por padrão;
   abre sozinho quando há simulação. Cada linha: unidade, grupo, pessoas, de/até, ritmo por dia. */
import { computed } from 'vue';
import Calculo from '../../engine/calculo.js';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { usePreferenciasStore } from '../../stores/preferencias.js';
import { MESES } from '../../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;

/** Ritmo sugerido: média do grupo na unidade; senão da equipe; senão o padrão. */
function ritmoSugerido(grupo, unidadeId) {
  const todos = cad.colaboradoresCompletos.filter(c => c.tipoProducao === grupo);
  const na = todos.filter(c => c.alocacoes.some(a => a.unidadeId === unidadeId && a.percentual > 0));
  const ref = na.length ? na : todos;
  const media = campo => (ref.length ? Math.round((ref.reduce((s, c) => s + Number(c[campo] || 0), 0) / ref.length) * 10) / 10 : Calculo.COLAB_PADRAO[campo]);
  return grupo === ADM ? { empresasDia: media('empresasDia') } : { inspecoesDia: media('inspecoesDia'), relatoriosDia: media('relatoriosDia') };
}
function adicionar() {
  const unidadeId = cad.unidades.some(u => u.id === pref.unidadeSel) ? pref.unidadeSel : cad.unidades[0].id;
  pref.adicionarSimulacao({ unidadeId, grupo: TEC, quantidade: 1, de: pref.mesAtual, ate: 11, ...ritmoSugerido(TEC, unidadeId) });
}
function mudarGrupoOuUnidade(i, patch) {
  const s = { ...pref.simulacoes[i], ...patch };
  pref.alterarSimulacao(i, { ...patch, ...ritmoSugerido(s.grupo, s.unidadeId) });
}
function mudarMeses(i, campo, v) {
  const s = { ...pref.simulacoes[i], [campo]: Number(v) };
  if (s.de > s.ate) [s.de, s.ate] = [s.ate, s.de];
  pref.alterarSimulacao(i, { de: s.de, ate: s.ate });
}
const nomeUnidade = id => (cad.unidadePorId[id] || {}).nome || '?';
const descricao = s => {
  const q = Math.round(Number(s.quantidade) || 0);
  const rot = Math.abs(q) === 1 ? Calculo.FUNCAO_SINGULAR[s.grupo] : Calculo.FUNCAO_SINGULAR[s.grupo] + 's';
  const quando = s.de === 0 && s.ate === 11 ? 'ano todo' : s.ate === 11 ? `a partir de ${MESES[s.de].toLowerCase()}` : s.de === s.ate ? `só em ${MESES[s.de].toLowerCase()}` : `${MESES[s.de].toLowerCase()}–${MESES[s.ate].toLowerCase()}`;
  return `${q > 0 ? '+' : '−'}${Math.abs(q)} ${rot} em ${nomeUnidade(s.unidadeId)} (${quando})`;
};
const resumo = computed(() => pref.simulacoes.map(descricao).join(' · '));
</script>

<template>
  <details class="mb-5 rounded-card border border-line bg-surface" :open="pref.simulacoes.length > 0">
    <summary class="cursor-pointer px-4 py-3 font-semibold">E se…? Simular contratações ou desligamentos
      <span v-if="pref.simulacoes.length" class="chip chip-blue ml-2 font-normal">simulando: {{ resumo }}</span>
    </summary>
    <div class="border-t border-line px-4 py-4">
      <p class="muted mb-3 text-[13px]">Teste contratações (quantidade positiva) ou desligamentos (negativa) numa unidade. A pessoa entra no mês escolhido e fica até o mês final (por padrão, dezembro). Quem entra passa pelo ramp-up como uma contratação real. Fica só neste navegador — não mexe no cadastro.</p>
      <div v-if="pref.simulacoes.length" class="table-wrap mb-3">
        <table class="table">
          <thead><tr><th>Unidade</th><th>Grupo</th><th class="num">Pessoas (+/−)</th><th>Na equipe</th><th>Ritmo por dia de cada pessoa</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in pref.simulacoes" :key="i">
              <td><select class="input input-sm" :value="s.unidadeId" @change="mudarGrupoOuUnidade(i, { unidadeId: $event.target.value })"><option v-for="u in cad.unidades" :key="u.id" :value="u.id">{{ u.nome }}</option></select></td>
              <td><select class="input input-sm" :value="s.grupo" @change="mudarGrupoOuUnidade(i, { grupo: $event.target.value })"><option :value="TEC">Técnicos</option><option :value="ADM">Administrativos</option></select></td>
              <td class="num"><input class="input input-sm w-20 text-right" type="number" step="1" :value="s.quantidade" title="Positivo = contratar; negativo = desligar" @change="pref.alterarSimulacao(i, { quantidade: Math.round(Number($event.target.value)) || 1 })"></td>
              <td class="whitespace-nowrap">
                <span class="muted text-[12px]">a partir de</span> <select class="input input-sm" :value="s.de" @change="mudarMeses(i, 'de', $event.target.value)"><option v-for="(m, k) in MESES" :key="k" :value="k">{{ m }}</option></select>
                <span class="muted text-[12px]">até</span> <select class="input input-sm" :value="s.ate" @change="mudarMeses(i, 'ate', $event.target.value)"><option v-for="(m, k) in MESES" :key="k" :value="k">{{ m }}</option></select>
              </td>
              <td class="whitespace-nowrap">
                <template v-if="s.grupo === ADM"><input class="input input-sm w-20 text-right" type="number" min="0" step="0.5" :value="s.empresasDia" @change="pref.alterarSimulacao(i, { empresasDia: Math.max(0, Number($event.target.value) || 0) })"> <span class="muted text-[12px]">empresas/dia</span></template>
                <template v-else>
                  <input class="input input-sm w-16 text-right" type="number" min="0" step="0.5" :value="s.inspecoesDia" @change="pref.alterarSimulacao(i, { inspecoesDia: Math.max(0, Number($event.target.value) || 0) })"> <span class="muted text-[12px]">insp.</span>
                  <input class="input input-sm w-16 text-right" type="number" min="0" step="0.5" :value="s.relatoriosDia" @change="pref.alterarSimulacao(i, { relatoriosDia: Math.max(0, Number($event.target.value) || 0) })"> <span class="muted text-[12px]">relat./dia</span>
                </template>
              </td>
              <td><button class="btn-link text-danger-dark" type="button" @click="pref.removerSimulacao(i)">Remover</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost" type="button" :disabled="!cad.unidades.length" @click="adicionar">+ Adicionar pessoas para simular</button>
        <button v-if="pref.simulacoes.length" class="btn btn-ghost" type="button" @click="pref.limparSimulacao()">Limpar simulação</button>
      </div>
    </div>
  </details>
</template>
