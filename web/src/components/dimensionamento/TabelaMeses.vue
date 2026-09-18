<script setup>
/* Os 12 meses do alvo (unidade ou total): vencem, pendente no fim do mês, hoje → ideal por área,
   conclusão (passado: "deveria ter contratado…"; mês atual e seguintes: "contratar…") com R$. */
import { computed } from 'vue';
import Calculo from '../../engine/calculo.js';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { usePreferenciasStore } from '../../stores/preferencias.js';
import { useDimensionamentoStore } from '../../stores/dimensionamento.js';
import { useFormat } from '../../composables/useFormat.js';

const cad = useCadastrosStore();
const pref = usePreferenciasStore();
const dim = useDimensionamentoStore();
const { num, numFte, moeda, qtdFuncao, mesMin } = useFormat();
const FUNCOES = Calculo.FUNCOES;
const ROTULO = { [Calculo.TEC]: 'Técnicos', [Calculo.ADM]: 'Administrativos' };

const meses = computed(() => dim.alvo.meses);
const classe = s => 'row-' + (s === 'atencao' || s === 'deficit' ? s : 'ok');

const contratar = m => FUNCOES.map(f => (m.funcoes[f].faltam > 0 ? qtdFuncao(f, m.funcoes[f].faltam) : null)).filter(Boolean);
const custoDe = (m, campo) => FUNCOES.reduce((s, f) => s + (m.funcoes[f].custo ? m.funcoes[f].custo[campo] : 0), 0);
const conclusao = m => {
  const partes = contratar(m);
  const passado = m.mes < pref.mesAtual;
  if (partes.length) return { falta: true, texto: `${passado ? 'Contratação necessária (não realizada)' : 'Contratação necessária'}: ${partes.join(' e ')}`, custo: custoDe(m, 'contratar') };
  return { falta: false, texto: 'Equipe suficiente', limite: m.status === 'atencao', custoSobra: custoDe(m, 'sobra') };
};
/** Em "Todas as unidades": em qual unidade falta. */
const onde = m => {
  if (!dim.varias) return '';
  return dim.resultado.unidades.map(u => { const p = contratar(u.meses[m.mes]); return p.length ? `${u.nome} (${p.join(', ')})` : null; }).filter(Boolean).join(' · ');
};
const notaDistribuicao = g => {
  if (!dim.varias || (g.faltam <= 0 && g.sobram <= 0)) return '';
  return [g.faltam > 0 ? `déficit de ${g.faltam} onde há demanda` : null, g.sobram > 0 ? `excedente de ${g.sobram} em outras unidades` : null].filter(Boolean).join(' · ');
};
const tipArea = (m, f) => {
  const g = m.funcoes[f];
  const det = Calculo.ENTREGAS_DA_FUNCAO[f].map(e => `${num(m.entregas[e.id].consegue)} ${e.unidade}`).join(', ');
  return `${m.nomeLongo}: produção de ${det} (${m.diasUteis} dias úteis); demanda de ${num(m.precisa)} · ${g.faltam > 0 ? `déficit de ${g.faltam}` : g.sobram > 0 ? `excedente de ${g.sobram}` : 'equipe suficiente'}`;
};
const pendente = mes => {
  const a = dim.filaAlvo[Calculo.TEC].meses[mes], b = dim.filaAlvo[Calculo.ADM].meses[mes];
  const v = dim.backlogMes(mes); // soma das filas das três etapas (núcleo do motor)
  const tip = Math.abs(a.filaFim - b.filaFim) > 0.5 ? `Técnicos: ${num(a.filaFim)} · Administrativos: ${num(b.filaFim)} (exibido o maior)`
    : mes < pref.mesAtual ? `${num(a.filaInicio)} pendências anteriores${mes === 0 && a.filaInicio > 0.5 ? ` (provenientes de ${pref.ano - 1})` : ''} + ${num(a.informado)} vencimentos do mês (nos meses passados o valor lançado já corresponde ao que permanece em aberto)`
    : `${num(a.filaInicio)} pendências anteriores + ${num(a.informado)} vencimentos − ${num(a.atendidas)} atendimentos`;
  return { v, tip };
};
const idealMax = f => Math.max(0, ...meses.value.map(m => m.funcoes[f].ideal));
const algumFalta = f => meses.value.some(m => m.funcoes[f].faltam > 0);
const ano = computed(() => {
  const partes = FUNCOES.filter(algumFalta).map(f => qtdFuncao(f, idealMax(f)));
  const j = dim.alvo.janela.funcoes;
  const custo = FUNCOES.reduce((s, f) => s + (j[f].custo ? j[f].custo.contratar : 0), 0);
  const sobra = FUNCOES.reduce((s, f) => s + (j[f].custo ? j[f].custo.sobra : 0), 0);
  const custos = [custo > 0 ? `custo das contratações ≈ ${moeda(custo)} no ano` : null, sobra > 0 ? `custo do excedente ≈ ${moeda(sobra)} no ano` : null].filter(Boolean);
  return { partes, custos, pendenteDez: dim.backlogMes(11) };
});
const p = computed(() => cad.parametros);
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div>
        <h2>{{ dim.titulo }} · mês a mês · {{ pref.ano }}</h2>
        <div class="muted text-[13px]"><template v-if="pref.mesAtual > 0">Até {{ mesMin(pref.mesAtual - 1) }}: realizado. De </template><template v-else>De </template>{{ mesMin(pref.mesAtual) }} em diante: projeção com a equipe atual.</div>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#2f9e6b]"></i>equipe suficiente</span>
        <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#e0a800]"></i>margem reduzida</span>
        <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#c0392b]"></i>contratação necessária</span>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Mês</th>
            <th class="num" title="Demanda do mês: clientes Mensal + Exclusiva TST com vencimento, cada um ponderado pelo porte">Vencimentos</th>
            <th class="num bg-warn-bg" title="Pendências ao fim do mês: pendências anteriores + vencimentos − atendimentos da equipe">Pendências ao fim do mês</th>
            <th v-for="f in FUNCOES" :key="f" class="num" :title="`${ROTULO[f]}: equipe atual → quadro ideal para os vencimentos do mês (pessoas inteiras)`">{{ ROTULO[f] }}<small class="block font-normal normal-case tracking-normal text-muted">atual → ideal</small></th>
            <th>Conclusão</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in meses" :key="m.mes" :class="[classe(m.status), m.mes < pref.mesAtual ? 'text-muted' : '', m.mes === pref.mesAtual ? 'font-semibold' : '']">
            <td>{{ m.nomeLongo }} <span v-if="m.mes === pref.mesAtual" class="chip chip-blue">mês atual</span></td>
            <td class="num">{{ num(m.precisa) }}</td>
            <td class="num bg-warn-bg" :title="pendente(m.mes).tip"><strong>{{ num(pendente(m.mes).v) }}</strong></td>
            <td v-for="f in FUNCOES" :key="f" class="num max-w-[190px]" :title="tipArea(m, f)">
              {{ numFte(m.pessoas[f]) }} <span class="seta">→</span> <strong :class="m.funcoes[f].faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ m.funcoes[f].ideal }}</strong>
              <div v-if="notaDistribuicao(m.funcoes[f])" class="whitespace-normal text-[11.5px] font-normal leading-tight text-muted">{{ notaDistribuicao(m.funcoes[f]) }}</div>
            </td>
            <td class="min-w-[260px] whitespace-normal">
              <template v-if="conclusao(m).falta">
                <strong class="txt-deficit">{{ conclusao(m).texto }}</strong>
                <span v-if="conclusao(m).custo > 0" class="muted" title="Custo mensal das contratações necessárias (salário + encargos)"> ≈ {{ moeda(conclusao(m).custo) }}/mês</span>
              </template>
              <template v-else>
                <span class="txt-ok">{{ conclusao(m).texto }}</span><span v-if="conclusao(m).limite" class="muted"> · margem reduzida</span>
                <span v-if="conclusao(m).custoSobra > 0" class="muted" title="Custo mensal do excedente (pessoas inteiras)"> excedente ≈ {{ moeda(conclusao(m).custoSobra) }}/mês</span>
              </template>
              <div v-if="onde(m)" class="mt-0.5 text-[12px] font-normal text-muted">{{ onde(m) }}</div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="row-ok font-semibold">
            <th>Ano de {{ pref.ano }}</th>
            <th class="num">{{ num(dim.alvo.janela.precisa) }}</th>
            <th class="num bg-warn-bg" title="Pendências ao fim de dezembro, sem contratações">{{ num(ano.pendenteDez) }}</th>
            <th v-for="f in FUNCOES" :key="f" class="num" title="Maior quadro ideal do ano">{{ numFte(dim.alvo.pessoas[f]) }} <span class="seta">→</span> <strong :class="algumFalta(f) ? 'txt-deficit' : 'txt-ok'">{{ idealMax(f) }}</strong></th>
            <th class="whitespace-normal normal-case tracking-normal text-[13px] text-ink">
              <template v-if="ano.partes.length">Quadro necessário para atender todos os meses: <strong>{{ ano.partes.join(' e ') }}</strong></template>
              <span v-else class="txt-ok">A equipe atual atende todos os meses</span>
              <span v-if="ano.custos.length" class="muted font-normal"> ({{ ano.custos.join(' · ') }})</span>
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="note">Quadro ideal = número de pessoas (inteiras) necessário para atender os vencimentos do mês, com cada cliente ponderado pelo porte e descontada a margem para imprevistos de {{ Math.round(100 - p.ocupacaoAlvo) }}%. Colaboradores com data de admissão têm produção reduzida nos primeiros meses (período de adaptação: {{ p.rampup.length ? p.rampup.map(v => v + '%').join(' → ') + ' → 100%' : 'desativado' }}). As pendências são acumuladas: o que não é atendido em um mês passa para o seguinte.
      <template v-if="dim.temCusto"> Os valores em R$ consideram o custo mensal de cada função (salário + encargos).</template><template v-else> Para visualizar o impacto em R$, cadastre o custo mensal nas Funções.</template>
      Margem para imprevistos, prazo, período de adaptação, pesos dos portes e dias úteis são definidos no Calendário.</p>
  </section>
</template>
