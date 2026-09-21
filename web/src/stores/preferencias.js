/* ==========================================================================
   Store de preferências — o que fica só no navegador de quem usa:
   ano selecionado, mês atual e unidade escolhida.
   Persistido em localStorage (mesmas chaves do app anterior).
   ========================================================================== */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const K = {
  ano: 'chabra-dimensiona:ano',
  mesAtual: 'chabra-dimensiona:mes-atual',
  filtros: 'chabra-dimensiona:filtros-programacao',
  simulacao: 'chabra-dimensiona:simulacao',   // da simulação "E se…?", que saiu com a tela de Projeção
};
const ler = (chave, fb) => { try { const v = JSON.parse(localStorage.getItem(chave)); return v == null ? fb : v; } catch (_) { return fb; } };
const gravar = (chave, v) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (_) { /* ignora */ } };
const anoValido = a => Number.isInteger(a) && a >= 2000 && a <= 2100;

export const usePreferenciasStore = defineStore('preferencias', () => {
  const hoje = new Date();
  const anoLido = ler(K.ano, null);
  const mesLido = ler(K.mesAtual, null);
  const ano = ref(anoLido != null && anoValido(Number(anoLido)) ? Number(anoLido) : hoje.getFullYear());
  const mesAtual = ref(mesLido != null && Number.isInteger(Number(mesLido)) && Number(mesLido) >= 0 && Number(mesLido) <= 11 ? Number(mesLido) : hoje.getMonth());
  const unidadeSel = ref(String((ler(K.filtros, {}) || {}).unidade || ''));
  // a simulação saiu junto com a Projeção: apaga o que ficou gravado, para não distorcer
  // silenciosamente os números de quem tinha um cenário salvo no navegador
  try { localStorage.removeItem(K.simulacao); } catch (_) { /* segue sem limpar */ }

  watch(ano, v => gravar(K.ano, v));
  watch(mesAtual, v => gravar(K.mesAtual, v));
  watch(unidadeSel, v => gravar(K.filtros, { unidade: v }));

  function definirAno(v) { const y = Number(v); if (anoValido(y)) ano.value = y; }
  function definirMesAtual(v) { const m = Number(v); if (Number.isInteger(m) && m >= 0 && m <= 11) mesAtual.value = m; }

  return { ano, mesAtual, unidadeSel, definirAno, definirMesAtual };
});
