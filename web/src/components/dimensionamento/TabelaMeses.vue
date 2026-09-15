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
  if (partes.length) return { falta: true, texto: `${passado ? 'Deveria ter contratado' : 'Contratar'} ${partes.join(' e ')}`, custo: custoDe(m, 'contratar') };
  return { falta: false, texto: passado ? 'Não precisava contratar' : 'Dá conta', limite: m.status === 'atencao', custoSobra: custoDe(m, 'sobra') };
};
/** Em "Todas as unidades": em qual unidade falta. */
const onde = m => {
  if (!dim.varias) return '';
  return dim.resultado.unidades.map(u => { const p = contratar(u.meses[m.mes]); return p.length ? `${u.nome} (${p.join(', ')})` : null; }).filter(Boolean).join(' · ');
};
const notaDistribuicao = g => {
  if (!dim.varias || (g.faltam <= 0 && g.sobram <= 0)) return '';
  return [g.faltam > 0 ? `faltam ${g.faltam} onde precisa` : null, g.sobram > 0 ? `sobram ${g.sobram} em outras unidades` : null].filter(Boolean).join(' · ');
};
const tipArea = (m, f) => {
  const g = m.funcoes[f];
  const det = Calculo.ENTREGAS_DA_FUNCAO[f].map(e => `${num(m.entregas[e.id].consegue)} ${e.unidade}`).join(', ');
  return `${m.nomeLongo}: ${ROTULO[f].toLowerCase()} fazem ${det} (${m.diasUteis} dias úteis); precisa ${num(m.precisa)} · ${g.faltam > 0 ? `faltam ${g.faltam}` : g.sobram > 0 ? `sobram ${g.sobram}` : 'dá conta'}`;
};
const pendente = mes => {
  const a = dim.filaAlvo[Calculo.TEC].meses[mes], b = dim.filaAlvo[Calculo.ADM].meses[mes];
  const v = Math.max(a.filaFim, b.filaFim);
  const tip = Math.abs(a.filaFim - b.filaFim) > 0.5 ? `Técnicos: ${num(a.filaFim)} · Administrativos: ${num(b.filaFim)} (mostra o maior)`
    : mes < pref.mesAtual ? `${num(a.filaInicio)} que já estavam em aberto${mes === 0 && a.filaInicio > 0.5 ? ` (vindos de ${pref.ano - 1})` : ''} + ${num(a.informado)} que venceram (o passado não desconta a equipe: o número lançado já é o que ficou em aberto)`
    : `${num(a.filaInicio)} de antes + ${num(a.informado)} que vencem − ${num(a.atendidas)} atendidas`;
  return { v, tip };
};
const idealMax = f => Math.max(0, ...meses.value.map(m => m.funcoes[f].ideal));
const algumFalta = f => meses.value.some(m => m.funcoes[f].faltam > 0);
const ano = computed(() => {
  const partes = FUNCOES.filter(algumFalta).map(f => qtdFuncao(f, idealMax(f)));
  const j = dim.alvo.janela.funcoes;
  const custo = FUNCOES.reduce((s, f) => s + (j[f].custo ? j[f].custo.contratar : 0), 0);
  const sobra = FUNCOES.reduce((s, f) => s + (j[f].custo ? j[f].custo.sobra : 0), 0);
  const custos = [custo > 0 ? `cobrir o que falta ≈ ${moeda(custo)} no ano` : null, sobra > 0 ? `sobra ≈ ${moeda(sobra)} no ano` : null].filter(Boolean);
  return { partes, custos, pendenteDez: Math.max(dim.filaAlvo[Calculo.TEC].meses[11].filaFim, dim.filaAlvo[Calculo.ADM].meses[11].filaFim) };
});
const p = computed(() => cad.parametros);
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div>
        <h2>{{ dim.titulo }} · mês a mês · {{ pref.ano }}</h2>
        <div class="muted text-[13px]"><template v-if="pref.mesAtual > 0">Até {{ mesMin(pref.mesAtual - 1) }} é o que já passou; de </template><template v-else>De </template>{{ mesMin(pref.mesAtual) }} em diante é o plano, com a equipe de hoje.</div>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#2f9e6b]"></i>dá conta</span>
        <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#e0a800]"></i>no limite</span>
        <span><i class="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#c0392b]"></i>precisa contratar</span>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Mês</th>
            <th class="num" title="Esforço do mês: clientes Mensal + Exclusiva TST que vencem, cada um valendo o peso do seu porte">Vencem</th>
            <th class="num bg-warn-bg" title="O que fica em aberto no fim do mês: o que veio de antes + o que vence − o que a equipe atende">Pendente no fim do mês</th>
            <th v-for="f in FUNCOES" :key="f" class="num" :title="`${ROTULO[f]} hoje → quadro ideal para o que vence no mês (pessoas inteiras)`">{{ ROTULO[f] }}<small class="block font-normal normal-case tracking-normal text-muted">hoje → ideal</small></th>
            <th>Conclusão</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in meses" :key="m.mes" :class="[classe(m.status), m.mes < pref.mesAtual ? 'text-muted' : '', m.mes === pref.mesAtual ? 'font-semibold' : '']">
            <td>{{ m.nomeLongo }} <span v-if="m.mes === pref.mesAtual" class="chip chip-blue">hoje</span></td>
            <td class="num">{{ num(m.precisa) }}</td>
            <td class="num bg-warn-bg" :title="pendente(m.mes).tip"><strong>{{ num(pendente(m.mes).v) }}</strong></td>
            <td v-for="f in FUNCOES" :key="f" class="num max-w-[190px]" :title="tipArea(m, f)">
              {{ numFte(m.pessoas[f]) }} <span class="seta">→</span> <strong :class="m.funcoes[f].faltam > 0 ? 'txt-deficit' : 'txt-ok'">{{ m.funcoes[f].ideal }}</strong>
              <div v-if="notaDistribuicao(m.funcoes[f])" class="whitespace-normal text-[11.5px] font-normal leading-tight text-muted">{{ notaDistribuicao(m.funcoes[f]) }}</div>
            </td>
            <td class="min-w-[260px] whitespace-normal">
              <template v-if="conclusao(m).falta">
                <strong class="txt-deficit">{{ conclusao(m).texto }}</strong>
                <span v-if="conclusao(m).custo > 0" class="muted" title="Custo mensal de quem falta (salário + encargos)"> ≈ {{ moeda(conclusao(m).custo) }}/mês</span>
              </template>
              <template v-else>
                <span class="txt-ok">{{ conclusao(m).texto }}</span><span v-if="conclusao(m).limite" class="muted"> · no limite</span>
                <span v-if="conclusao(m).custoSobra > 0" class="muted" title="Custo mensal das pessoas inteiras que sobram"> sobra ≈ {{ moeda(conclusao(m).custoSobra) }}/mês</span>
              </template>
              <div v-if="onde(m)" class="mt-0.5 text-[12px] font-normal text-muted">{{ onde(m) }}</div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="row-ok font-semibold">
            <th>Ano de {{ pref.ano }}</th>
            <th class="num">{{ num(dim.alvo.janela.precisa) }}</th>
            <th class="num bg-warn-bg" title="Pendentes no fim de dezembro, sem contratar">{{ num(ano.pendenteDez) }}</th>
            <th v-for="f in FUNCOES" :key="f" class="num" title="O maior quadro ideal do ano">{{ numFte(dim.alvo.pessoas[f]) }} <span class="seta">→</span> <strong :class="algumFalta(f) ? 'txt-deficit' : 'txt-ok'">{{ idealMax(f) }}</strong></th>
            <th class="whitespace-normal normal-case tracking-normal text-[13px] text-ink">
              <template v-if="ano.partes.length">Para não faltar em nenhum mês: <strong>{{ ano.partes.join(' e ') }}</strong></template>
              <span v-else class="txt-ok">A equipe de hoje dá conta de todos os meses</span>
              <span v-if="ano.custos.length" class="muted font-normal"> ({{ ano.custos.join(' · ') }})</span>
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="note">Quadro ideal = pessoas inteiras para dar conta do que vence no mês (cada cliente vale o peso do seu porte), com a folga de {{ Math.round(100 - p.ocupacaoAlvo) }}% para imprevistos. Quem tem data de admissão produz menos nos primeiros meses (ramp-up {{ p.rampup.length ? p.rampup.map(v => v + '%').join(' → ') + ' → 100%' : 'desligado' }}). O pendente vai somando: o que a equipe não faz num mês passa para o seguinte.
      <template v-if="dim.temCusto"> Os valores em R$ usam o custo mensal de cada função (salário + encargos).</template><template v-else> Para ver o impacto em R$, cadastre o custo mensal nas Funções.</template>
      Folga, prazo, ramp-up, pesos dos portes e dias úteis ficam no Calendário.</p>
  </section>
</template>
