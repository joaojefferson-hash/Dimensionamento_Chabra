<script setup>
/* Histórico — o que mudou nos cadastros: quem, quando, o quê (frases simples a partir de antes/depois). */
import { computed, onMounted, ref } from 'vue';
import { carregarHistorico } from '../services/api.js';
import { useCadastrosStore } from '../stores/cadastros.js';
import { useUiStore } from '../stores/ui.js';
import { MESES_LONGO, moeda, num } from '../composables/useFormat.js';

const cad = useCadastrosStore();
const ui = useUiStore();
const itens = ref([]);
const fim = ref(false);
const carregando = ref(false);
const filtro = ref('');

async function carregar(mais = false) {
  carregando.value = true;
  try {
    const antesDe = mais && itens.value.length ? itens.value[itens.value.length - 1].quando : null;
    const lote = await carregarHistorico({ antesDe, limite: 100 });
    itens.value = mais ? itens.value.concat(lote) : lote;
    fim.value = lote.length < 100;
  } catch (e) { ui.erro(e); } finally { carregando.value = false; }
}
onMounted(() => carregar());

const CAMPOS = {
  unidades: { nome: 'nome' },
  colaboradores: { nome: 'nome', funcao_id: 'função', empresas_dia: 'empresas por dia', inspecoes_dia: 'inspeções por dia', relatorios_dia: 'relatórios por dia', data_admissao: 'admissão', data_desligamento: 'desligamento', custo_mensal: 'custo mensal' },
  funcoes: { nome: 'nome', tipo_producao: 'tipo de produção', chefia: 'chefia de equipe', coordena: 'coordena', responde_para: 'responde para', ordem: 'ordem', custo_mensal: 'custo mensal' },
  demanda_mensal: { quantidade: 'quantidade' },
  unidade_mes: { clientes_ativos: 'clientes ativos' },
  unidade_empresas_mes: { empresas_vencidas: 'clientes Mensal', empresas_exclusiva_tst: 'clientes Exclusiva TST', clientes_ativos: 'clientes ativos' },
  portes: { nome: 'nome', peso: 'peso' },
  colaborador_unidades: { percentual: '% do tempo' },
  parametros: { ocupacao_alvo: 'folga para imprevistos', dias_uteis: 'dias úteis', prazo_dias: 'prazo para atender (dias)', rampup: 'ramp-up (%)' },
};
const fmtVal = (campo, v) => {
  if (v == null) return '—';
  if (campo === 'ocupacao_alvo') return `${num(100 - Number(v))}%`;
  if (campo === 'percentual') return `${num(Number(v), 1)}%`;
  if (campo === 'custo_mensal') return moeda(Number(v));
  if (campo === 'data_admissao' || campo === 'data_desligamento') { const [a, m, d] = String(v).split('-'); return `${d}/${m}/${a}`; }
  if (campo === 'funcao_id' || campo === 'responde_para') return (cad.funcaoPorId[String(v)] || {}).nome || 'função excluída';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) return num(Number(v), 2).replace(/,00$/, '');
  return String(v);
};
const diffs = (tabela, a, d) => Object.entries(CAMPOS[tabela] || {}).flatMap(([campo, rotulo]) => {
  const x = a ? a[campo] : undefined, y = d ? d[campo] : undefined;
  if (JSON.stringify(x) === JSON.stringify(y)) return [];
  if (campo === 'dias_uteis' && Array.isArray(x) && Array.isArray(y)) return [`dias úteis: ${x.map((v, i) => (v !== y[i] ? `${MESES_LONGO[i].toLowerCase()} ${v}→${y[i]}` : null)).filter(Boolean).join(', ')}`];
  return [`${rotulo}: ${fmtVal(campo, x)} → ${fmtVal(campo, y)}`];
});
const mesDe = r => (MESES_LONGO[Number(r.mes) - 1] || `mês ${r.mes}`).toLowerCase() + (r.ano ? `/${r.ano}` : '');
function frase(h) {
  const a = h.antes || null, d = h.depois || null, r = d || a || {};
  const uni = r.unidade_nome || 'unidade excluída', col = r.colaborador_nome || 'colaborador excluído';
  const mud = () => { const l = diffs(h.tabela, a, d); return l.length ? ' — ' + l.join('; ') : ''; };
  const op = h.operacao;
  switch (h.tabela) {
    case 'unidades': return op === 'insert' ? `Cadastrou a unidade ${r.nome}` : op === 'delete' ? `Excluiu a unidade ${r.nome}` : `Alterou a unidade ${r.nome}${mud()}`;
    case 'funcoes': return op === 'insert' ? `Cadastrou a função ${r.nome}` : op === 'delete' ? `Excluiu a função ${r.nome}` : `Alterou a função ${r.nome}${mud()}`;
    case 'colaboradores': return op === 'insert' ? `Cadastrou o colaborador ${r.nome}` : op === 'delete' ? `Excluiu o colaborador ${r.nome}` : `Alterou o colaborador ${r.nome}${mud()}`;
    case 'colaborador_unidades': return op === 'insert' ? `Alocou ${col} em ${uni} com ${fmtVal('percentual', r.percentual)} do tempo` : op === 'delete' ? `Removeu ${col} de ${uni}` : `Alterou a alocação de ${col} em ${uni}${mud()}`;
    case 'demanda_mensal': { const cond = r.condicao === 'exclusiva_tst' ? 'Exclusiva TST' : 'Mensal'; const pt = cad.portes.find(p => p.codigo === r.porte); const porte = pt ? pt.nome.toLowerCase() : r.porte;
      return op === 'insert' ? `Lançou ${d.quantidade} clientes ${cond} (${porte}) em ${mesDe(r)} de ${uni}` : op === 'delete' ? `Apagou os ${a.quantidade} clientes ${cond} (${porte}) de ${mesDe(r)} de ${uni}` : `Alterou ${cond} (${porte}) de ${mesDe(r)} de ${uni}${mud()}`; }
    case 'unidade_mes': return op === 'insert' ? `Registrou ${d.clientes_ativos} clientes ativos em ${mesDe(r)} de ${uni}` : op === 'delete' ? `Apagou os clientes ativos de ${mesDe(r)} de ${uni}` : `Alterou os clientes ativos de ${mesDe(r)} de ${uni}${mud()}`;
    case 'unidade_empresas_mes': return `${op === 'insert' ? 'Definiu' : op === 'delete' ? 'Apagou' : 'Alterou'} os números de ${mesDe(r)} de ${uni} (formato antigo)${op === 'update' ? mud() : ''}`;
    case 'portes': return `Alterou o porte ${r.nome || r.codigo}${mud()}`;
    case 'parametros': return `Alterou as configurações${mud() || ' (sem mudança visível)'}`;
    case 'backup': return `Importou um backup: ${r.unidades || 0} unidades, ${r.colaboradores || 0} colaboradores — substituiu todos os cadastros`;
    default: return `${op} em ${h.tabela}`;
  }
}
const cascata = h => h.operacao === 'delete' && h.antes && (['demanda_mensal', 'unidade_mes', 'unidade_empresas_mes'].includes(h.tabela) && h.antes.unidade_nome == null || h.tabela === 'colaborador_unidades' && (h.antes.unidade_nome == null || h.antes.colaborador_nome == null));
const linhas = computed(() => {
  const t = filtro.value.trim().toLocaleLowerCase('pt-BR');
  return itens.value.filter(h => !cascata(h)).map(h => ({ h, frase: frase(h), quem: h.usuario_nome || h.usuario_email || 'Sistema' }))
    .filter(x => !t || `${x.frase} ${x.quem}`.toLocaleLowerCase('pt-BR').includes(t));
});
const quando = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <header class="page-header"><h1>Histórico</h1><p>Tudo o que mudou nos cadastros: quem, quando, antes e depois. Registrado automaticamente pelo banco.</p></header>
  <section class="card">
    <div class="card-head"><h2>Alterações</h2><input v-model="filtro" class="input input-sm w-64" placeholder="Filtrar por texto ou pessoa…"></div>
    <p v-if="!linhas.length && !carregando" class="muted">Nada registrado{{ filtro ? ' com esse filtro' : '' }}.</p>
    <div v-else class="table-wrap">
      <table class="table">
        <thead><tr><th class="whitespace-nowrap">Quando</th><th>Quem</th><th>O quê</th></tr></thead>
        <tbody><tr v-for="x in linhas" :key="x.h.id"><td class="whitespace-nowrap text-muted">{{ quando(x.h.quando) }}</td><td class="whitespace-nowrap">{{ x.quem }}</td><td>{{ x.frase }}</td></tr></tbody>
      </table>
    </div>
    <button v-if="!fim" class="btn btn-ghost mt-3" type="button" :disabled="carregando" @click="carregar(true)">{{ carregando ? 'Carregando…' : 'Carregar mais' }}</button>
  </section>
</template>
