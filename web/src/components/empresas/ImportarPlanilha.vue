<script setup>
/* Importar a planilha do SGG (ou outra): arquivo → aba e colunas → como contar → prévia por unidade × mês → gravar.
   Cada linha da planilha é um documento (ou cliente) com data de vencimento; o importador conta, por unidade
   e mês, quantos clientes vencem — e substitui a demanda do ano das unidades presentes no arquivo. */
import { computed, reactive, ref, watch } from 'vue';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { usePreferenciasStore } from '../../stores/preferencias.js';
import { useUiStore } from '../../stores/ui.js';
import { lerPlanilha, detectarColunas, resumir, casarUnidades, montarLinhasRpc } from '../../services/importacao.js';
import { MESES, num } from '../../composables/useFormat.js';

const emit = defineEmits(['importado']);
const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const ui = useUiStore();

const aberto = ref(false);
const arquivoNome = ref('');
const abas = ref([]);
const abaSel = ref(0);
const mapa = reactive({ unidade: null, vencimento: null, cliente: null, condicao: null, porte: null });
const opcoes = reactive({ contarPor: 'cliente', ano: pref.ano, condicaoPadrao: 'mensal', portePadrao: 'P', usarFaixas: false, faixaP: 19, faixaM: 99 });
const mapaUnidades = reactive({});
const gravando = ref(false);
const ultimo = ref(null);

const aba = computed(() => abas.value[abaSel.value] || null);
const cabecalhos = computed(() => (aba.value ? aba.value.cabecalhos : []));
const CAMPOS = [
  { id: 'unidade', rotulo: 'Unidade', obrig: true, ajuda: 'em qual unidade o cliente é atendido' },
  { id: 'vencimento', rotulo: 'Data de vencimento', obrig: true, ajuda: 'a data que define o mês' },
  { id: 'cliente', rotulo: 'Cliente', obrig: false, ajuda: 'para contar cada cliente uma vez por mês' },
  { id: 'condicao', rotulo: 'Condição', obrig: false, ajuda: 'Mensal / Exclusiva TST (sem coluna: usa o padrão abaixo)' },
  { id: 'porte', rotulo: 'Porte', obrig: false, ajuda: 'P/M/G, pequeno/médio/grande ou nº de funcionários' },
];

async function escolher(ev) {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const { abas: lidas } = lerPlanilha(await f.arrayBuffer());
    if (!lidas.some(a => a.linhas.length)) { ui.toast('A planilha não tem linhas com dados.', 'error'); return; }
    abas.value = lidas; abaSel.value = lidas.findIndex(a => a.linhas.length);
    arquivoNome.value = f.name; ultimo.value = null;
    aplicarDeteccao();
  } catch (e) { ui.toast('Não foi possível ler o arquivo: ' + e.message, 'error'); }
}
function aplicarDeteccao() {
  const d = detectarColunas(cabecalhos.value);
  Object.assign(mapa, { unidade: d.unidade, vencimento: d.vencimento, cliente: d.cliente, condicao: d.condicao, porte: d.porte });
}
watch(abaSel, aplicarDeteccao);

const resumo = computed(() => {
  if (!aba.value) return null;
  const faixas = opcoes.usarFaixas ? { pequeno: Number(opcoes.faixaP), medio: Number(opcoes.faixaM) } : null;
  return resumir(aba.value.linhas, mapa, { contarPor: opcoes.contarPor, ano: Number(opcoes.ano), condicaoPadrao: opcoes.condicaoPadrao, portePadrao: opcoes.portePadrao, porteFaixas: faixas, codigosPorte: cad.portes.map(p => p.codigo) });
});
const nomesArquivo = computed(() => (resumo.value ? Object.keys(resumo.value.porUnidade) : []));
watch(nomesArquivo, nomes => {
  const auto = casarUnidades(nomes, cad.unidades);
  nomes.forEach(n => { if (mapaUnidades[n] === undefined) mapaUnidades[n] = auto[n]; });
}, { immediate: true });
// ano: quando o arquivo tem um só ano, usa ele
watch(() => resumo.value && resumo.value.anosEncontrados, anos => { if (anos && anos.length === 1 && Number(opcoes.ano) !== anos[0].ano) opcoes.ano = anos[0].ano; });

const totalMesUnidade = (nome, mes) => { const m = ((resumo.value || {}).porUnidade[nome] || {})[mes]; if (!m) return 0; return Object.values(m).reduce((s, portes) => s + Object.values(portes).reduce((a, b) => a + b, 0), 0); };
const totalUnidade = nome => { let s = 0; for (let m = 1; m <= 12; m++) s += totalMesUnidade(nome, m); return s; };
const atualMes = (nome, mes) => { const id = mapaUnidades[nome]; const u = id ? cad.unidadePorId[id] : null; const x = u ? ((u.mesesPorAno || {})[Number(opcoes.ano)] || {})[mes] : null; return x ? x.empresasVencidas + x.empresasExclusivaTst : 0; };
const semUnidade = computed(() => nomesArquivo.value.filter(n => !mapaUnidades[n]));
const linhasRpc = computed(() => (resumo.value ? montarLinhasRpc(resumo.value.porUnidade, mapaUnidades) : []));
const totalImportar = computed(() => linhasRpc.value.reduce((s, l) => s + l.quantidade, 0));
const porCondicao = computed(() => { const o = { mensal: 0, exclusiva_tst: 0 }; linhasRpc.value.forEach(l => { o[l.condicao] += l.quantidade; }); return o; });

async function gravar() {
  const unidadesAlvo = [...new Set(linhasRpc.value.map(l => l.unidade_id))].map(id => cad.unidadePorId[id].nome);
  const ok = await ui.confirmar({ titulo: `Importar demanda de ${opcoes.ano}`, mensagem: `Substituir os números de ${opcoes.ano} (Mensal e Exclusiva TST, todos os meses) de: ${unidadesAlvo.join(', ')} pelos ${num(totalImportar.value)} clientes da planilha? Clientes ativos não mudam. Isso vale para toda a equipe.`, textoConfirmar: 'Substituir', perigo: true });
  if (!ok) return;
  gravando.value = true;
  try {
    const r = await cad.substituirDemandaAno(Number(opcoes.ano), linhasRpc.value);
    ultimo.value = r;
    ui.toast(`Importado: ${num(totalImportar.value)} clientes em ${unidadesAlvo.length} unidade(s) de ${opcoes.ano}.`);
    if (Number(opcoes.ano) !== pref.ano) pref.definirAno(Number(opcoes.ano));
    emit('importado');
  } catch (e) { ui.erro(e); } finally { gravando.value = false; }
}
function fechar() { aberto.value = false; abas.value = []; arquivoNome.value = ''; ultimo.value = null; Object.keys(mapaUnidades).forEach(k => delete mapaUnidades[k]); }
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div><h2>Importar do SGG</h2><div class="muted text-[13px]">Traga a planilha de vencimentos (.xlsx ou .csv): o sistema conta, por unidade e mês, quantos clientes vencem.</div></div>
      <div class="flex gap-2">
        <label class="btn btn-primary cursor-pointer">Escolher planilha… <input type="file" accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden @change="escolher"></label>
        <button v-if="abas.length" class="btn btn-ghost" type="button" @click="fechar">Fechar</button>
      </div>
    </div>

    <template v-if="abas.length">
      <div class="grid gap-4 md:grid-cols-3">
        <div class="text-[13px]">
          <span class="mb-1 block font-medium">Arquivo</span>
          <div class="muted">{{ arquivoNome }}</div>
          <label v-if="abas.length > 1" class="mt-2 block"><span class="mb-1 block font-medium">Aba</span><select v-model="abaSel" class="input input-sm w-full"><option v-for="(a, i) in abas" :key="i" :value="i">{{ a.nome }} ({{ a.linhas.length }} linhas)</option></select></label>
          <div class="muted mt-1">{{ aba.linhas.length }} linhas · {{ cabecalhos.length }} colunas</div>
        </div>
        <div class="text-[13px] md:col-span-2">
          <span class="mb-1 block font-medium">Quais colunas usar</span>
          <div class="grid gap-2 sm:grid-cols-2">
            <label v-for="c in CAMPOS" :key="c.id" class="flex items-center gap-2"><span class="w-36 shrink-0" :title="c.ajuda">{{ c.rotulo }}<span v-if="c.obrig" class="text-danger">*</span></span>
              <select v-model="mapa[c.id]" class="input input-sm w-full"><option :value="null">— {{ c.obrig ? 'escolha' : 'não usar' }} —</option><option v-for="(h, i) in cabecalhos" :key="i" :value="i">{{ h || `(coluna ${i + 1})` }}</option></select>
            </label>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-4 text-[13px] md:grid-cols-4">
        <label><span class="mb-1 block font-medium">Ano a importar</span><select v-model="opcoes.ano" class="input input-sm w-full"><option v-for="a in cad.anosDisponiveis(Number(opcoes.ano))" :key="a" :value="a">{{ a }}</option></select>
          <small v-if="resumo && resumo.anosEncontrados.length" class="muted block">No arquivo: {{ resumo.anosEncontrados.map(a => `${a.ano} (${a.linhas})`).join(', ') }}</small></label>
        <label><span class="mb-1 block font-medium">Como contar</span><select v-model="opcoes.contarPor" class="input input-sm w-full"><option value="cliente">cada cliente uma vez por mês</option><option value="linha">cada linha (documento)</option></select>
          <small v-if="opcoes.contarPor === 'cliente' && mapa.cliente == null" class="block text-warn">Sem a coluna Cliente, cada linha conta uma vez.</small></label>
        <label v-if="mapa.condicao == null"><span class="mb-1 block font-medium">Condição (sem coluna)</span><select v-model="opcoes.condicaoPadrao" class="input input-sm w-full"><option value="mensal">Mensal</option><option value="exclusiva_tst">Exclusiva TST</option></select></label>
        <div v-if="mapa.porte == null"><span class="mb-1 block font-medium">Porte (sem coluna)</span><select v-model="opcoes.portePadrao" class="input input-sm w-full"><option v-for="p in cad.portes" :key="p.codigo" :value="p.codigo">{{ p.nome }}</option></select></div>
        <div v-else><label class="flex items-center gap-2"><input v-model="opcoes.usarFaixas" type="checkbox"> <span>A coluna de porte é nº de funcionários</span></label>
          <div v-if="opcoes.usarFaixas" class="mt-1 flex flex-wrap items-center gap-1"><span class="muted">Pequeno até</span><input v-model="opcoes.faixaP" class="input input-sm w-16" type="number" min="0"><span class="muted">· Médio até</span><input v-model="opcoes.faixaM" class="input input-sm w-16" type="number" min="0"><span class="muted">· acima: Grande</span></div>
        </div>
      </div>

      <div v-if="resumo && resumo.avisos.length" class="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-[12.5px] text-warn"><div v-for="(a, i) in resumo.avisos" :key="i">{{ a }}</div></div>

      <template v-if="resumo && nomesArquivo.length">
        <h3 class="mt-4 mb-2 text-[14px] font-semibold">Prévia — clientes que vencem por mês em {{ opcoes.ano }} <span class="muted font-normal">({{ num(resumo.linhasUsadas) }} de {{ num(resumo.totalLinhas) }} linhas usadas · Mensal {{ num(porCondicao.mensal) }} · Exclusiva TST {{ num(porCondicao.exclusiva_tst) }})</span></h3>
        <div class="table-wrap">
          <table class="table text-center [&_td]:px-1.5 [&_th]:px-1.5">
            <thead><tr><th class="text-left">No arquivo</th><th class="text-left">Unidade do cadastro</th><th v-for="m in MESES" :key="m">{{ m }}</th><th class="bg-page">Total</th></tr></thead>
            <tbody>
              <tr v-for="nome in nomesArquivo" :key="nome" :class="mapaUnidades[nome] ? '' : 'bg-danger-bg'">
                <td class="text-left font-medium">{{ nome }}</td>
                <td class="text-left"><select v-model="mapaUnidades[nome]" class="input input-sm"><option :value="null">— não importar —</option><option v-for="u in cad.unidades" :key="u.id" :value="u.id">{{ u.nome }}</option></select></td>
                <td v-for="mes in 12" :key="mes" :title="mapaUnidades[nome] ? `hoje: ${atualMes(nome, mes)}` : ''">
                  <strong>{{ totalMesUnidade(nome, mes) || '–' }}</strong>
                  <small v-if="mapaUnidades[nome] && atualMes(nome, mes) !== totalMesUnidade(nome, mes)" class="muted block text-[11px]">era {{ atualMes(nome, mes) }}</small>
                </td>
                <td class="bg-page font-semibold">{{ totalUnidade(nome) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="semUnidade.length" class="mt-2 text-[12.5px] text-danger-dark">Sem unidade do cadastro (não serão importadas): {{ semUnidade.join(', ') }}. Escolha a unidade na coluna ao lado ou cadastre-a em Unidades.</p>
        <div class="mt-3 flex items-center gap-3">
          <button class="btn btn-primary" type="button" :disabled="gravando || !linhasRpc.length" @click="gravar">{{ gravando ? 'Importando…' : `Importar ${num(totalImportar)} clientes para ${opcoes.ano}` }}</button>
          <span class="muted text-[12.5px]">Substitui Mensal e Exclusiva TST de {{ opcoes.ano }} nas unidades acima (todos os meses). Clientes ativos não mudam.</span>
        </div>
        <p v-if="ultimo" class="mt-2 text-[12.5px] text-ok">Feito: {{ ultimo.inseridas }} lançamentos gravados ({{ ultimo.apagadas }} anteriores substituídos).</p>
      </template>
    </template>
    <p v-else class="muted text-[13px]">Como funciona: cada linha da planilha deve ter a <strong>unidade</strong>, a <strong>data de vencimento</strong> e, se possível, o <strong>cliente</strong> (para contar cada cliente uma vez por mês), a <strong>condição</strong> (Mensal / Exclusiva TST) e o <strong>porte</strong>. O sistema reconhece as colunas pelos títulos e você confirma antes de gravar. Nada é alterado até clicar em Importar.</p>
  </section>
</template>
