<script setup>
/* Importar a planilha do SGG (ou outra): arquivo → aba e colunas → como contar → prévia por unidade × mês → gravar.
   Cada linha da planilha é um documento (ou cliente) com data de vencimento; o importador conta, por unidade
   e mês, quantos clientes vencem — e substitui a demanda do ano das unidades presentes no arquivo. */
import { computed, reactive, ref, watch } from 'vue';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { usePreferenciasStore } from '../../stores/preferencias.js';
import { useUiStore } from '../../stores/ui.js';
import { lerPlanilha, detectarColunas, resumir, casarUnidades, montarLinhasRpc, valoresDistintos, situacaoExcluida } from '../../services/importacao.js';
import { MESES, num } from '../../composables/useFormat.js';

const emit = defineEmits(['importado']);
const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const ui = useUiStore();

const aberto = ref(false);
const arquivoNome = ref('');
const abas = ref([]);
const abaSel = ref(0);
const mapa = reactive({ unidade: null, vencimento: null, cliente: null, clienteId: null, condicao: null, porte: null, situacao: null });
const situacoesSel = ref(null); // valores da coluna Situação que entram (null = sem filtro)
const opcoes = reactive({ unidadeId: '', condicao: 'mensal', contarPor: 'cliente', portePadrao: 'P', usarFaixas: false, faixaP: 19, faixaM: 99 });
const ano = computed(() => pref.ano); // o ano da página (seletor no topo da tela) vale para a importação
// condição: '' = pela coluna do arquivo (quando há), 'mensal' ou 'exclusiva_tst' para o arquivo inteiro
const condicaoFixa = computed(() => (opcoes.condicao === '' && mapa.condicao != null ? null : (opcoes.condicao || 'mensal')));
const unidadeFixa = computed(() => (cad.unidadePorId[opcoes.unidadeId] || null));
const mapaUnidades = reactive({});
const porteCliente = reactive({}); // { [codigo|nome]: porte } escolhido nesta importação (pré-preenchido pelo cadastro)
const gravando = ref(false);
const ultimo = ref(null);

const aba = computed(() => abas.value[abaSel.value] || null);
const cabecalhos = computed(() => (aba.value ? aba.value.cabecalhos : []));
const CAMPOS = [
  { id: 'unidade', rotulo: 'Unidade (coluna)', obrig: false, ajuda: 'apenas quando o arquivo contém várias unidades; ignorada quando há unidade selecionada acima' },
  { id: 'vencimento', rotulo: 'Data de vencimento', obrig: true, ajuda: 'data que define o mês de referência' },
  { id: 'cliente', rotulo: 'Cliente (nome)', obrig: false, ajuda: 'permite contar cada cliente uma única vez por mês' },
  { id: 'clienteId', rotulo: 'Código do cliente', obrig: false, ajuda: 'identifica cada estabelecimento (dois códigos = dois atendimentos); sem código, utiliza-se o nome' },
  { id: 'condicao', rotulo: 'Condição', obrig: false, ajuda: 'Mensal / Exclusiva TST (sem coluna, utiliza-se a condição selecionada abaixo)' },
  { id: 'porte', rotulo: 'Porte', obrig: false, ajuda: 'P/M/G, pequeno/médio/grande ou nº de funcionários' },
  { id: 'situacao', rotulo: 'Situação', obrig: false, ajuda: 'permite desconsiderar registros renovados / em dia' },
];

async function escolher(ev) {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const { abas: lidas } = lerPlanilha(await f.arrayBuffer());
    if (!lidas.some(a => a.linhas.length)) { ui.toast('A planilha não contém linhas com dados.', 'error'); return; }
    abas.value = lidas; abaSel.value = lidas.findIndex(a => a.linhas.length);
    arquivoNome.value = f.name; ultimo.value = null;
    Object.keys(porteCliente).forEach(k => delete porteCliente[k]);
    aplicarDeteccao();
    // porte já conhecido de cada cliente (pelo código do SGG)
    if (mapa.clienteId != null) abas.value[abaSel.value].linhas.forEach(l => { const c = String(l[mapa.clienteId] ?? '').trim(); const p = cad.clientesPorte[c]; if (c && p && !porteCliente[c]) porteCliente[c] = p.porte; });
    // unidade: a que está filtrada na Projeção; senão, a única do cadastro; senão, pela coluna do arquivo
    if (!opcoes.unidadeId) opcoes.unidadeId = cad.unidades.some(u => u.id === pref.unidadeSel) ? pref.unidadeSel : (cad.unidades.length === 1 ? cad.unidades[0].id : '');
  } catch (e) { ui.toast('Não foi possível ler o arquivo: ' + e.message, 'error'); }
}
function aplicarDeteccao() {
  const d = detectarColunas(cabecalhos.value);
  Object.assign(mapa, { unidade: d.unidade, vencimento: d.vencimento, cliente: d.cliente, clienteId: d.clienteId, condicao: d.condicao, porte: d.porte, situacao: d.situacao });
}
watch(abaSel, aplicarDeteccao);
const situacoes = computed(() => (aba.value && mapa.situacao != null ? valoresDistintos(aba.value.linhas, mapa.situacao) : []));
// ao (re)detectar a coluna de situação, marca tudo menos renovado/em dia/cancelado
watch(situacoes, lista => { situacoesSel.value = lista.length ? lista.filter(x => !situacaoExcluida(x.valor)).map(x => x.valor) : null; }, { immediate: true });
function alternarSituacao(valor, on) { const s = new Set(situacoesSel.value || []); if (on) s.add(valor); else s.delete(valor); situacoesSel.value = [...s]; }

const resumo = computed(() => {
  if (!aba.value) return null;
  const faixas = opcoes.usarFaixas ? { pequeno: Number(opcoes.faixaP), medio: Number(opcoes.faixaM) } : null;
  return resumir(aba.value.linhas, mapa, { contarPor: opcoes.contarPor, ano: ano.value, portePadrao: opcoes.portePadrao, porteFaixas: faixas, codigosPorte: cad.portes.map(p => p.codigo), situacoes: mapa.situacao != null ? situacoesSel.value : null, unidadeFixa: unidadeFixa.value ? unidadeFixa.value.nome : null, condicaoFixa: condicaoFixa.value, porteCliente });
});
const nomesArquivo = computed(() => (resumo.value ? Object.keys(resumo.value.porUnidade) : []));
watch([nomesArquivo, unidadeFixa], ([nomes, fixa]) => {
  const auto = casarUnidades(nomes, cad.unidades);
  nomes.forEach(n => { if (fixa) mapaUnidades[n] = fixa.id; else if (mapaUnidades[n] === undefined) mapaUnidades[n] = auto[n]; });
}, { immediate: true });
/** Anos do arquivo diferentes do ano da página (para avisar e oferecer a troca). */
const outrosAnos = computed(() => (resumo.value ? resumo.value.anosEncontrados.filter(a => a.ano !== ano.value) : []));
const linhasNoAno = computed(() => { const a = resumo.value && resumo.value.anosEncontrados.find(x => x.ano === ano.value); return a ? a.linhas : 0; });

const totalMesUnidade = (nome, mes) => { const m = ((resumo.value || {}).porUnidade[nome] || {})[mes]; if (!m) return 0; return Object.values(m).reduce((s, portes) => s + Object.values(portes).reduce((a, b) => a + b, 0), 0); };
const totalUnidade = nome => { let s = 0; for (let m = 1; m <= 12; m++) s += totalMesUnidade(nome, m); return s; };
/** Esforço equivalente do mês (cada cliente × peso do porte); mostrado quando difere da contagem. */
const ponderadoMesUnidade = (nome, mes) => { const m = ((resumo.value || {}).porUnidade[nome] || {})[mes]; if (!m) return 0; return Object.values(m).reduce((s, portes) => s + Object.entries(portes).reduce((a, [p, q]) => a + q * (cad.pesosPorte[p] || 1), 0), 0); };
const atualMes = (nome, mes) => {
  const id = mapaUnidades[nome]; const u = id ? cad.unidadePorId[id] : null; const x = u ? ((u.mesesPorAno || {})[ano.value] || {})[mes] : null;
  if (!x) return 0;
  return condicaoFixa.value === 'mensal' ? x.empresasVencidas : condicaoFixa.value === 'exclusiva_tst' ? x.empresasExclusivaTst : x.empresasVencidas + x.empresasExclusivaTst;
};
const rotuloCond = c => (c === 'exclusiva_tst' ? 'Exclusiva TST' : c === 'mensal' ? 'Mensal' : '—');
/** O que a importação substitui: só a condição fixa, ou as duas quando a condição vem da coluna. */
const rotuloCondFixa = computed(() => (condicaoFixa.value ? rotuloCond(condicaoFixa.value) : null));
const escopoTxt = computed(() => (rotuloCondFixa.value ? `os lançamentos ${rotuloCondFixa.value}` : 'os lançamentos Mensal e Exclusiva TST'));
const preservaTxt = computed(() => (condicaoFixa.value === 'mensal' ? 'Exclusiva TST e Clientes ativos não são alterados.' : condicaoFixa.value === 'exclusiva_tst' ? 'Mensal e Clientes ativos não são alterados.' : 'Clientes ativos não são alterados.'));
const semUnidade = computed(() => nomesArquivo.value.filter(n => !mapaUnidades[n]));
const linhasRpc = computed(() => (resumo.value ? montarLinhasRpc(resumo.value.porUnidade, mapaUnidades) : []));
const totalImportar = computed(() => linhasRpc.value.reduce((s, l) => s + l.quantidade, 0));
const porCondicao = computed(() => { const o = { mensal: 0, exclusiva_tst: 0 }; linhasRpc.value.forEach(l => { o[l.condicao] += l.quantidade; }); return o; });
/* lista de empresas: o que entra, em que mês, e o que ficou de fora (e por quê) */
const mostrarEmpresas = ref(false);
const filtroEmpresas = ref('');
const empresas = computed(() => {
  if (!resumo.value) return [];
  const t = filtroEmpresas.value.trim().toLocaleLowerCase('pt-BR');
  return resumo.value.detalhes
    .map((d, i) => ({ ...d, i }))
    .filter(d => !t || `${d.cliente} ${d.codigo} ${d.unidade} ${d.situacao}`.toLocaleLowerCase('pt-BR').includes(t))
    .sort((a, b) => (b.usada - a.usada) || ((a.mes || 99) - (b.mes || 99)) || a.cliente.localeCompare(b.cliente, 'pt-BR'));
});
const foraCount = computed(() => (resumo.value ? resumo.value.detalhes.filter(d => !d.usada).length : 0));
const salvandoPorte = ref(false);
/** Porte escolhido na lista: muda a prévia na hora e fica guardado para as próximas importações. */
async function escolherPorte(d, porte) {
  if (!d.chave) return;
  porteCliente[d.chave] = porte;
  if (!d.codigo) return; // sem código não dá para guardar com segurança
  salvandoPorte.value = true;
  try { await cad.salvarClientesPorte([{ codigo: d.codigo, nome: d.cliente, porte }]); }
  catch (e) { ui.erro(e); }
  finally { salvandoPorte.value = false; }
}
const nomePorte = c => { const p = cad.portes.find(x => x.codigo === c); return p ? p.nome : c; };
const fmtData = d => (d ? d.toLocaleDateString('pt-BR') : '—');

async function gravar() {
  const unidadesAlvo = [...new Set(linhasRpc.value.map(l => l.unidade_id))].map(id => cad.unidadePorId[id].nome);
  const ok = await ui.confirmar({ titulo: `Importar demanda de ${ano.value}`, mensagem: `Substituir ${escopoTxt.value} de ${ano.value} (todos os meses) de: ${unidadesAlvo.join(', ')} pelos ${num(totalImportar.value)} clientes da planilha? ${preservaTxt.value} A alteração se aplica a todos os usuários.`, textoConfirmar: 'Substituir', perigo: true });
  if (!ok) return;
  gravando.value = true;
  try {
    const r = await cad.substituirDemandaAno(ano.value, linhasRpc.value, condicaoFixa.value);
    ultimo.value = r;
    ui.toast(`Importação concluída: ${num(totalImportar.value)} clientes em ${unidadesAlvo.length} unidade(s) de ${ano.value}.`);
    emit('importado');
  } catch (e) { ui.erro(e); } finally { gravando.value = false; }
}
function fechar() { aberto.value = false; abas.value = []; arquivoNome.value = ''; ultimo.value = null; opcoes.unidadeId = ''; opcoes.condicao = 'mensal'; Object.keys(mapaUnidades).forEach(k => delete mapaUnidades[k]); }
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div><h2>Importar do SGG</h2><div class="muted text-[13px]">Selecione a planilha de vencimentos (.xlsx ou .csv): o sistema contabiliza, por unidade e mês, a quantidade de clientes com vencimento.</div></div>
      <div class="flex gap-2">
        <label class="btn btn-primary cursor-pointer">Selecionar planilha… <input type="file" accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden @change="escolher"></label>
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
          <span class="mb-1 block font-medium">Colunas utilizadas</span>
          <div class="grid gap-2 sm:grid-cols-2">
            <label v-for="c in CAMPOS" :key="c.id" class="flex items-center gap-2"><span class="w-36 shrink-0" :title="c.ajuda">{{ c.rotulo }}<span v-if="c.obrig" class="text-danger">*</span></span>
              <select v-model="mapa[c.id]" class="input input-sm w-full"><option :value="null">— {{ c.obrig ? 'selecione' : 'não utilizar' }} —</option><option v-for="(h, i) in cabecalhos" :key="i" :value="i">{{ h || `(coluna ${i + 1})` }}</option></select>
            </label>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-4 text-[13px] md:grid-cols-5">
        <label><span class="mb-1 block font-medium">Unidade do cadastro</span>
          <select v-model="opcoes.unidadeId" class="input input-sm w-full"><option value="">— pela coluna do arquivo —</option><option v-for="u in cad.unidades" :key="u.id" :value="u.id">{{ u.nome }}</option></select>
          <small class="muted block">{{ unidadeFixa ? 'Todas as linhas são atribuídas a esta unidade.' : (mapa.unidade != null ? 'Cada linha é atribuída à unidade indicada na coluna "' + cabecalhos[mapa.unidade] + '".' : 'Selecione a unidade: o arquivo não possui coluna de unidade.') }}</small></label>
        <label><span class="mb-1 block font-medium">Condição</span>
          <select v-model="opcoes.condicao" class="input input-sm w-full">
            <option v-if="mapa.condicao != null" value="">— pela coluna "{{ cabecalhos[mapa.condicao] }}" —</option>
            <option value="mensal">Mensal</option>
            <option value="exclusiva_tst">Exclusiva TST</option>
          </select>
          <small class="muted block">{{ opcoes.condicao === '' && mapa.condicao != null ? 'Texto contendo "Exclusiva"/"TST" é classificado como Exclusiva TST; os demais, como Mensal.' : 'Todas as linhas são atribuídas a esta condição.' }}</small></label>
        <label><span class="mb-1 block font-medium">Critério de contagem</span><select v-model="opcoes.contarPor" class="input input-sm w-full"><option value="cliente">cada cliente uma única vez por mês</option><option value="linha">cada linha (documento)</option></select>
          <small v-if="opcoes.contarPor === 'cliente' && mapa.cliente == null && mapa.clienteId == null" class="block text-warn">Sem coluna de cliente, cada linha é contada uma vez.</small>
          <small v-else-if="opcoes.contarPor === 'cliente'" class="muted block">Identificação pelo {{ mapa.clienteId != null ? 'código' : 'nome' }}.</small></label>
        <div v-if="situacoes.length" class="md:col-span-5"><span class="mb-1 block font-medium">Situações consideradas</span>
          <div class="flex flex-wrap gap-3"><label v-for="s in situacoes" :key="s.valor" class="flex items-center gap-1"><input type="checkbox" :checked="(situacoesSel || []).includes(s.valor)" @change="alternarSituacao(s.valor, $event.target.checked)"> {{ s.valor }} <span class="muted">({{ s.n }})</span></label></div>
        </div>
        <div v-if="mapa.porte == null"><span class="mb-1 block font-medium">Porte (sem coluna)</span><select v-model="opcoes.portePadrao" class="input input-sm w-full"><option v-for="p in cad.portes" :key="p.codigo" :value="p.codigo">{{ p.nome }}</option></select></div>
        <div v-else><label class="flex items-center gap-2"><input v-model="opcoes.usarFaixas" type="checkbox"> <span>A coluna de porte contém o número de funcionários</span></label>
          <div v-if="opcoes.usarFaixas" class="mt-1 flex flex-wrap items-center gap-1"><span class="muted">Pequeno até</span><input v-model="opcoes.faixaP" class="input input-sm w-16" type="number" min="0"><span class="muted">· Médio até</span><input v-model="opcoes.faixaM" class="input input-sm w-16" type="number" min="0"><span class="muted">· acima: Grande</span></div>
        </div>
      </div>

      <div v-if="resumo && outrosAnos.length" class="mt-3 rounded-lg px-3 py-2 text-[12.5px]" :class="linhasNoAno ? 'bg-warn-bg text-warn' : 'bg-danger-bg text-danger-dark'">
        O ano selecionado no topo da tela é <strong>{{ ano }}</strong>{{ linhasNoAno ? ` (${linhasNoAno} linhas do arquivo)` : ', e o arquivo não contém vencimentos nesse ano' }}. O arquivo também contém:
        <button v-for="a in outrosAnos" :key="a.ano" class="btn-link ml-2 font-semibold" type="button" @click="pref.definirAno(a.ano)">{{ a.ano }} ({{ a.linhas }} linhas) — usar {{ a.ano }}</button>
      </div>
      <div v-if="resumo && resumo.avisos.length" class="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-[12.5px] text-warn"><div v-for="(a, i) in resumo.avisos" :key="i">{{ a }}</div></div>

      <template v-if="resumo && nomesArquivo.length">
        <h3 class="mt-4 mb-2 text-[14px] font-semibold">Prévia — vencimentos por mês em {{ ano }} <span class="muted font-normal">({{ num(resumo.linhasUsadas) }} de {{ num(resumo.totalLinhas) }} linhas consideradas · Mensal {{ num(porCondicao.mensal) }} · Exclusiva TST {{ num(porCondicao.exclusiva_tst) }})</span></h3>
        <div class="table-wrap">
          <table class="table table-grade text-center [&_td]:px-1.5 [&_th]:px-1.5">
            <thead><tr><th class="text-left">{{ unidadeFixa ? 'Unidade' : 'No arquivo' }}</th><th v-if="!unidadeFixa" class="text-left">Unidade do cadastro</th><th v-for="m in MESES" :key="m">{{ m }}</th><th class="bg-page">Total</th></tr></thead>
            <tbody>
              <tr v-for="nome in nomesArquivo" :key="nome" :class="mapaUnidades[nome] ? '' : 'bg-danger-bg'">
                <td class="text-left font-medium">{{ nome }}</td>
                <td v-if="!unidadeFixa" class="text-left"><select v-model="mapaUnidades[nome]" class="input input-sm"><option :value="null">— não importar —</option><option v-for="u in cad.unidades" :key="u.id" :value="u.id">{{ u.nome }}</option></select></td>
                <td v-for="mes in 12" :key="mes" :title="mapaUnidades[nome] ? `valor atual${rotuloCondFixa ? ' (' + rotuloCondFixa + ')' : ''}: ${atualMes(nome, mes)}` : ''">
                  <strong>{{ totalMesUnidade(nome, mes) || '–' }}</strong><small v-if="Math.abs(ponderadoMesUnidade(nome, mes) - totalMesUnidade(nome, mes)) > 0.05" class="muted" title="Demanda equivalente: cada cliente ponderado pelo porte"> ({{ num(ponderadoMesUnidade(nome, mes), 1) }})</small>
                  <small v-if="mapaUnidades[nome] && atualMes(nome, mes) !== totalMesUnidade(nome, mes)" class="muted block text-[11px]">atual: {{ atualMes(nome, mes) }}</small>
                </td>
                <td class="bg-page font-semibold">{{ totalUnidade(nome) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="semUnidade.length" class="mt-2 text-[12.5px] text-danger-dark">Sem unidade do cadastro (não serão importadas): {{ semUnidade.join(', ') }}. Selecione a unidade correspondente na coluna ao lado, selecione uma unidade única acima ou cadastre-a em Unidades.</p>
        <div class="mt-3 flex items-center gap-3">
          <button class="btn btn-primary" type="button" :disabled="gravando || !linhasRpc.length" @click="gravar">{{ gravando ? 'Importando…' : `Importar ${num(totalImportar)} clientes para ${ano}` }}</button>
          <span class="muted text-[12.5px]">Substitui {{ escopoTxt }} de {{ ano }} nas unidades acima (todos os meses). {{ preservaTxt }}</span>
        </div>
        <p v-if="ultimo" class="mt-2 text-[12.5px] text-ok">Concluído: {{ ultimo.inseridas }} lançamentos gravados ({{ ultimo.apagadas }} anteriores substituídos).</p>
      </template>
      <div v-if="resumo && resumo.detalhes.length" class="mt-3">
          <button class="btn-link text-[13px]" type="button" @click="mostrarEmpresas = !mostrarEmpresas">{{ mostrarEmpresas ? 'Ocultar' : 'Exibir' }} as {{ resumo.detalhes.length }} empresas do arquivo{{ foraCount ? ` (${foraCount} não consideradas)` : '' }}</button>
          <div v-if="mostrarEmpresas" class="mt-2">
            <div class="mb-2 flex flex-wrap items-center gap-3">
              <input v-model="filtroEmpresas" class="input input-sm w-72" placeholder="Filtrar por empresa, código ou situação…">
              <span class="muted text-[12.5px]">Na coluna Porte, selecione o porte de cada empresa: a prévia é atualizada imediatamente e a seleção é armazenada pelo código do cliente para as próximas importações.{{ salvandoPorte ? ' Salvando…' : '' }}</span>
            </div>
            <div class="table-wrap max-h-[420px] overflow-y-auto">
              <table class="table table-grade">
                <thead><tr><th>Empresa</th><th>Código</th><th v-if="!unidadeFixa">Unidade</th><th>Vencimento</th><th>Mês</th><th>Condição</th><th title="Selecione o porte da empresa: a prévia é atualizada imediatamente e a seleção é armazenada para as próximas importações">Porte</th><th>Situação</th><th>Considerada</th></tr></thead>
                <tbody>
                  <tr v-for="d in empresas" :key="d.i" :class="d.usada ? '' : 'text-muted'">
                    <td class="font-medium">{{ d.cliente || '—' }}</td>
                    <td class="muted">{{ d.codigo || '—' }}</td>
                    <td v-if="!unidadeFixa">{{ d.unidade || '—' }}</td>
                    <td class="whitespace-nowrap">{{ fmtData(d.data) }}</td>
                    <td>{{ d.mes ? MESES[d.mes - 1] + (d.ano && ano !== d.ano ? '/' + d.ano : '') : '—' }}</td>
                    <td>{{ rotuloCond(d.condicao) }}</td>
                    <td><select v-if="d.chave" class="input input-sm" :value="d.porte" :title="d.codigo ? 'Armazenado para este cliente' : 'Sem código: válido apenas nesta importação'" @change="escolherPorte(d, $event.target.value)"><option v-for="p in cad.portes" :key="p.codigo" :value="p.codigo">{{ p.nome }}</option></select><span v-else>{{ nomePorte(d.porte) }}</span></td>
                    <td>{{ d.situacao || '—' }}</td>
                    <td><span v-if="d.usada" class="chip bg-ok-bg text-ok">sim</span><span v-else class="chip bg-page text-muted" :title="d.motivo">não · {{ d.motivo }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </template>
    <p v-else class="muted text-[13px]">Cada linha da planilha deve conter a <strong>unidade</strong>, a <strong>data de vencimento</strong> e, preferencialmente, o <strong>cliente</strong> (para contar cada cliente uma única vez por mês), a <strong>condição</strong> (Mensal / Exclusiva TST) e o <strong>porte</strong>. O sistema identifica as colunas pelos títulos e apresenta uma prévia para conferência. Nenhum dado é alterado até a confirmação em Importar.</p>
  </section>
</template>
