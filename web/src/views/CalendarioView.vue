<script setup>
/* Calendário — dias úteis por mês; parâmetros (folga, prazo, ramp-up); pesos dos portes. Salva ao alterar. */
import { computed, ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { useUiStore } from '../stores/ui.js';
import { PARAMETROS_PADRAO } from '../services/api.js';
import { MESES_LONGO, num } from '../composables/useFormat.js';

const auth = useAuthStore();
const cad = useCadastrosStore();
const ui = useUiStore();
const p = computed(() => cad.parametros);
const total = computed(() => p.value.diasUteis.reduce((s, d) => s + d, 0));
const salvo = ref(false);
const piscar = () => { salvo.value = true; setTimeout(() => { salvo.value = false; }, 1500); };

async function dias(i, v) {
  const valor = Math.max(0, Math.min(31, Math.floor(Number(v) || 0)));
  const d = p.value.diasUteis.slice(); d[i] = valor;
  try { await cad.atualizarParametros({ diasUteis: d }); piscar(); } catch (e) { ui.erro(e); }
}
async function folga(v) { const x = Number(v); if (!(x >= 0 && x <= 90)) { ui.toast('A margem deve estar entre 0% e 90%.', 'error'); return; } try { await cad.atualizarParametros({ ocupacaoAlvo: 100 - x }); piscar(); } catch (e) { ui.erro(e); } }
async function prazo(v) { const x = Math.round(Number(v)); if (!(x >= 1 && x <= 365)) { ui.toast('O prazo deve estar entre 1 e 365 dias.', 'error'); return; } try { await cad.atualizarParametros({ prazoDias: x }); piscar(); } catch (e) { ui.erro(e); } }
const rampupVal = i => (p.value.rampup[i] != null ? p.value.rampup[i] : 100);
async function rampup(i, v) {
  const x = Math.round(Number(v)); if (!(x >= 0 && x <= 100)) { ui.toast('O percentual de adaptação deve estar entre 0% e 100%.', 'error'); return; }
  const r = [0, 1, 2].map(k => (k === i ? x : rampupVal(k)));
  while (r.length && r[r.length - 1] >= 100) r.pop();
  try { await cad.atualizarParametros({ rampup: r }); piscar(); } catch (e) { ui.erro(e); }
}
async function peso(codigo, v) { const x = Number(v); if (!(x >= 0.1 && x <= 20)) { ui.toast('O peso deve estar entre 0,1 e 20.', 'error'); return; } try { await cad.atualizarPorte(codigo, { peso: x }); piscar(); } catch (e) { ui.erro(e); } }
async function restaurar() {
  const ok = await ui.confirmar({ titulo: 'Restaurar padrão 2026', mensagem: 'Substituir os 12 valores pelos dias úteis de 2026 (dias de semana, excluídos os feriados nacionais)?', textoConfirmar: 'Restaurar' });
  if (!ok) return;
  try { await cad.atualizarParametros({ diasUteis: PARAMETROS_PADRAO.diasUteis.slice() }); ui.toast('Calendário restaurado.'); } catch (e) { ui.erro(e); }
}
</script>

<template>
  <header class="page-header"><h1>Calendário e parâmetros</h1><p>Dias úteis de cada mês (convertem a produção diária em produção mensal), margem para imprevistos, prazo de atendimento, período de adaptação de novos colaboradores e peso de cada porte de cliente. Os parâmetros são compartilhados e salvos automaticamente ao alterar.</p></header>
  <div class="mb-4 text-[13px] text-muted">Dias úteis no ano: <strong class="text-ink">{{ total }}</strong> · média por mês: <strong class="text-ink">{{ num(total / 12, 1) }}</strong> <span v-if="salvo" class="ml-3 text-ok">salvo ✓</span></div>

  <fieldset :disabled="!auth.podeEditar" class="contents">
    <section class="card">
      <div class="card-head"><h2>Dias úteis por mês</h2><button v-if="auth.podeEditar" class="btn btn-ghost" type="button" @click="restaurar">Restaurar padrão 2026</button></div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <label v-for="(m, i) in MESES_LONGO" :key="i" class="text-[13px]"><span class="mb-1 block font-medium">{{ m }}</span><input class="input w-full" type="number" min="0" max="31" step="1" :value="p.diasUteis[i]" @change="dias(i, $event.target.value)"></label>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Parâmetros do dimensionamento</h2></div>
      <div class="grid gap-5 md:grid-cols-3">
        <label class="text-[13px]"><span class="mb-1 block font-medium">Margem para imprevistos (%)</span><input class="input w-28" type="number" min="0" max="90" step="1" :value="Math.round(100 - p.ocupacaoAlvo)" @change="folga($event.target.value)"><small class="muted block">Com 15%, considera-se 85% da produção declarada de cada colaborador.</small></label>
        <label class="text-[13px]"><span class="mb-1 block font-medium">Prazo de atendimento (dias)</span><input class="input w-28" type="number" min="1" max="365" step="1" :value="p.prazoDias" @change="prazo($event.target.value)"><small class="muted block">O Dimensionamento indica as contratações necessárias para eliminar as pendências neste prazo.</small></label>
        <div class="text-[13px]"><span class="mb-1 block font-medium">Período de adaptação de novos colaboradores</span>
          <div class="flex flex-wrap items-center gap-2"><template v-for="i in [0, 1, 2]" :key="i"><span class="muted">{{ i + 1 }}º mês</span><input class="input w-20" type="number" min="0" max="100" step="5" :value="rampupVal(i)" @change="rampup(i, $event.target.value)"><span class="muted">%</span></template></div>
          <small class="muted block">Percentual da produção nos primeiros meses após a admissão (em seguida, 100%).</small>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Porte dos clientes</h2></div>
      <p class="muted mb-3 text-[13px]">O peso multiplica a demanda de cada cliente: um cliente de peso 2 equivale a dois clientes de peso 1. As quantidades por porte são lançadas em Empresas por Unidade.</p>
      <div class="flex flex-wrap gap-6">
        <label v-for="pt in cad.portes" :key="pt.codigo" class="text-[13px]"><span class="mb-1 block font-medium">{{ pt.nome }} ({{ pt.codigo }})</span><span class="muted mr-2">peso</span><input class="input w-24" type="number" min="0.1" max="20" step="0.1" :value="pt.peso" @change="peso(pt.codigo, $event.target.value)"></label>
      </div>
    </section>
  </fieldset>
</template>
