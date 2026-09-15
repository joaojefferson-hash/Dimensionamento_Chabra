/* ==========================================================================
   Store de dimensionamento — só derivações (computed) sobre cadastros +
   preferências, passando pelo motor puro. Nenhum estado próprio: muda um
   número em qualquer cadastro, a tela recalcula sozinha.
   ========================================================================== */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import Calculo from '../engine/calculo.js';
import { useCadastrosStore } from './cadastros.js';
import { usePreferenciasStore } from './preferencias.js';

export const useDimensionamentoStore = defineStore('dimensionamento', () => {
  const cad = useCadastrosStore();
  const pref = usePreferenciasStore();

  const parametrosMotor = computed(() => ({ ...cad.parametros, pesosPorte: cad.pesosPorte }));
  const prazoMeses = computed(() => Math.max(1, Math.round(cad.parametros.prazoDias / 30)));

  /** Resultado do ano inteiro (todas as unidades + total), com a simulação. */
  const resultado = computed(() => Calculo.calcular({
    unidades: cad.unidadesDoAno(pref.ano),
    colaboradores: cad.colaboradoresCompletos,
    parametros: parametrosMotor.value,
    simulacoes: pref.simulacoes,
    janela: { de: 0, ate: 11 },
    ano: pref.ano,
  }));
  /** Pendentes mês a mês (o passado acumula sem descontar; do mês atual em diante a equipe atende). */
  const fila = computed(() => Calculo.fila(resultado.value, { mesAtual: pref.mesAtual, prazoMeses: prazoMeses.value }));

  const unidadeSelValida = computed(() => (cad.unidades.some(u => u.id === pref.unidadeSel) ? pref.unidadeSel : ''));
  /** Alvo da tela: a unidade escolhida ou o total. */
  const alvo = computed(() => (unidadeSelValida.value ? resultado.value.unidades.find(u => u.id === unidadeSelValida.value) : resultado.value.total));
  const filaAlvo = computed(() => (unidadeSelValida.value ? fila.value.unidades.find(u => u.id === unidadeSelValida.value).grupos : fila.value.total.grupos));
  const titulo = computed(() => (unidadeSelValida.value ? alvo.value.nome : 'Todas as unidades'));
  const varias = computed(() => !unidadeSelValida.value && resultado.value.unidades.length > 1);
  const temCusto = computed(() => Calculo.FUNCOES.some(f => resultado.value.total.meses.some(m => m.funcoes[f].custo && m.funcoes[f].custo.pessoa > 0)));

  /** "Hoje": pendentes e, por área, equipe → ideal, contratar para zerar no prazo, produção por dia. */
  const hoje = computed(() => {
    const t = pref.mesAtual;
    const pend = filaAlvo.value[Calculo.TEC].meses[t];
    const areas = Calculo.FUNCOES.map(f => {
      const m = alvo.value.meses[t];
      const g = m.funcoes[f];
      const res = filaAlvo.value[f].resumo;
      return {
        funcao: f, rotulo: Calculo.FUNCAO_CURTA[f], singular: Calculo.FUNCAO_SINGULAR[f],
        pessoas: m.pessoas[f], ideal: g.ideal, faltam: g.faltam, sobram: g.sobram, status: g.status, emRampup: g.emRampup || 0,
        custoPessoa: g.custo ? g.custo.pessoa : 0,
        contratarPrazo: res.pessoasPrazo, custoContratarPrazo: g.custo ? res.pessoasPrazo * g.custo.pessoa : 0,
        producaoDia: Calculo.ENTREGAS_DA_FUNCAO[f].map(e => ({ id: e.id, unidade: e.unidade, valor: res.producaoDiaPor[e.id] || 0 })),
      };
    });
    return { mes: t, pendentes: pend.pendentes, deAntes: pend.filaInicio, vencem: pend.informado, areas };
  });

  return { resultado, fila, alvo, filaAlvo, titulo, varias, temCusto, hoje, prazoMeses, unidadeSelValida };
});
