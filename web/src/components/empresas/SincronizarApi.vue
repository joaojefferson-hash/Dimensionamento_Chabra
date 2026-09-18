<script setup>
/* Sincronização com a API de documentos SST: prévia, aplicação e o registro das últimas
   execuções. A chamada passa pela Edge Function (credenciais no servidor). Só administrador. */
import { computed, onMounted, ref } from 'vue';
import { previa as pedirPrevia, sincronizar, ultimasSincronizacoes } from '../../services/sincronizacao.js';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { usePreferenciasStore } from '../../stores/preferencias.js';
import { useUiStore } from '../../stores/ui.js';
import { num } from '../../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const ui = useUiStore();
const emit = defineEmits(['sincronizado']);

const ocupado = ref(false);
const resultado = ref(null);     // prévia ou aplicação
const historico = ref([]);
const erro = ref('');
const aberto = ref(false);

const ano = computed(() => pref.ano);
const semCodigoApi = computed(() => cad.unidades.filter(u => !u.codigoApi).map(u => u.nome));

async function carregarHistorico() {
  try { historico.value = await ultimasSincronizacoes(8); } catch (_) { historico.value = []; }
}
onMounted(carregarHistorico);

async function executar(aplicar) {
  ocupado.value = true; erro.value = '';
  try {
    resultado.value = aplicar ? await sincronizar(ano.value) : await pedirPrevia(ano.value);
    if (aplicar) {
      ui.toast(`Sincronização concluída: ${num(resultado.value.resumo.demanda)} vencimentos e ${num(resultado.value.resumo.atendidas)} atendimentos em ${resultado.value.resumo.unidadesAplicadas} unidade(s).`);
      await cad.carregar();
      emit('sincronizado');
    }
    await carregarHistorico();
  } catch (e) {
    erro.value = e.message;
  } finally {
    ocupado.value = false;
  }
}
const quando = v => (v ? new Date(v).toLocaleString('pt-BR') : '—');
const rotuloCobertura = c => ({ ok: 'atualizada', parcial: 'parcial', desatualizado: 'desatualizada', falha: 'falha na origem', indisponivel: 'indisponível' }[c] || c || '—');
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div>
        <h2>Sincronizar com a API de documentos</h2>
        <div class="muted text-[13px]">Busca os vencimentos (PGR, LTCAT, LI e LP) e os atendimentos direto do sistema de gestão, por unidade. Substitui a importação manual nas unidades cobertas pela API.</div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-ghost" type="button" :disabled="ocupado" @click="executar(false)">{{ ocupado ? 'Consultando…' : 'Ver prévia' }}</button>
        <button class="btn btn-primary" type="button" :disabled="ocupado" @click="executar(true)">Sincronizar {{ ano }}</button>
      </div>
    </div>

    <p v-if="erro" class="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger-dark">{{ erro }}</p>

    <template v-if="resultado">
      <p class="mb-2 text-[13px]" :class="resultado.aplicado ? 'text-ok' : 'muted'">
        <strong>{{ resultado.aplicado ? 'Sincronizado' : 'Prévia (nada foi gravado)' }}:</strong>
        {{ num(resultado.resumo.demanda) }} vencimentos e {{ num(resultado.resumo.atendidas) }} atendimentos em {{ resultado.resumo.unidadesAplicadas }} unidade(s) de {{ resultado.ano }}.
        <template v-if="resultado.resumo.semClassificacao"> {{ num(resultado.resumo.semClassificacao) }} empresa(s) sem porte classificado entraram como Pequeno/Mensal.</template>
      </p>
      <div class="table-wrap">
        <table class="table table-grade">
          <thead><tr><th>Unidade</th><th>Cobertura</th><th>Atualizada em</th><th class="num">Documentos</th><th class="num">Vencimentos</th><th class="num">Atendimentos</th><th>Observação</th></tr></thead>
          <tbody>
            <tr v-for="u in resultado.unidades" :key="u.codigo_api" :class="u.aplicar ? (u.cobertura === 'ok' ? 'row-ok' : 'row-atencao') : 'row-deficit'">
              <td class="font-medium">{{ u.unidade || u.codigo_api }}</td>
              <td>{{ rotuloCobertura(u.cobertura) }}</td>
              <td class="whitespace-nowrap muted">{{ quando(u.ultima_varredura_em) }}</td>
              <td class="num">{{ num(u.documentos) }}</td>
              <td class="num">{{ u.aplicar ? num(u.demanda ?? u.totalDemanda) : '—' }}</td>
              <td class="num">{{ u.aplicar ? num(u.atendidas ?? u.totalAtendidas) : '—' }}</td>
              <td class="whitespace-normal text-[12.5px]">{{ u.mensagem || (u.aplicar ? 'gravado' : '—') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="(resultado.naoClassificados || []).length" class="note">
        <strong>Sem porte classificado ({{ resultado.naoClassificados.length }}):</strong>
        {{ resultado.naoClassificados.slice(0, 8).map(e => e.nome || e.cnpj).join(' · ') }}<template v-if="resultado.naoClassificados.length > 8"> e outras</template>.
        Elas entram como Pequeno/Mensal até serem classificadas na importação de planilha (coluna Porte).
      </p>
    </template>

    <div v-if="semCodigoApi.length" class="note">
      <strong>Fora da API:</strong> {{ semCodigoApi.join(', ') }} — continuam pela importação de planilha ou lançamento manual.
    </div>

    <details class="mt-3 text-[13px]" :open="aberto">
      <summary class="cursor-pointer font-semibold" @click="aberto = !aberto">Últimas sincronizações</summary>
      <p v-if="!historico.length" class="muted mt-2">Nenhuma sincronização registrada.</p>
      <div v-else class="table-wrap mt-2">
        <table class="table">
          <thead><tr><th>Quando</th><th>Ano</th><th>Unidade</th><th>Cobertura</th><th class="num">Vencimentos</th><th class="num">Atendimentos</th><th>Resultado</th></tr></thead>
          <tbody>
            <tr v-for="(h, i) in historico" :key="i">
              <td class="whitespace-nowrap">{{ quando(h.executado_em) }}</td>
              <td>{{ h.ano }}</td>
              <td>{{ h.codigo_api }}</td>
              <td>{{ rotuloCobertura(h.cobertura) }}</td>
              <td class="num">{{ num(h.demanda_gravada) }}</td>
              <td class="num">{{ num(h.atendidas_gravadas) }}</td>
              <td :class="h.aplicada ? 'txt-ok' : 'muted'">{{ h.aplicada ? 'gravado' : (h.mensagem || 'não gravado') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
