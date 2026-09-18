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
  /**
   * O que ficou em aberto no ano anterior entra em janeiro: calcula a fila do ano anterior
   * (todo passado se já terminou; até o mês atual se for o ano corrente) e pega dezembro.
   */
  const filaInicial = computed(() => {
    const anoAnterior = pref.ano - 1;
    const unidadesAnt = cad.unidadesDoAno(anoAnterior);
    if (!unidadesAnt.some(u => Object.keys(u.meses).length)) return null;
    const hojeAno = new Date().getFullYear();
    const mesAtualAnt = anoAnterior < hojeAno ? 12 : anoAnterior === hojeAno ? pref.mesAtual : 0;
    const rAnt = Calculo.calcular({ unidades: unidadesAnt, colaboradores: cad.colaboradoresCompletos, parametros: parametrosMotor.value, simulacoes: [], janela: { de: 0, ate: 11 }, ano: anoAnterior });
    const atendidasAnt = {};
    cad.unidades.forEach(u => {
      const meses = (u.mesesPorAno || {})[anoAnterior] || {};
      Object.entries(meses).forEach(([mes, v]) => {
        const porte = v && v.atendidasPorte ? v.atendidasPorte : null;
        if (porte && Object.keys(porte).length) { atendidasAnt[u.id] = atendidasAnt[u.id] || {}; atendidasAnt[u.id][Number(mes)] = { ...porte }; }
      });
    });
    const fAnt = Calculo.fluxo(rAnt, { mesAtual: mesAtualAnt, prazoMeses: prazoMeses.value, atendidas: atendidasAnt, parametros: parametrosMotor.value, ano: anoAnterior });
    // carrega as coortes por etapa: a idade do backlog atravessa a virada de ano
    const out = {};
    fAnt.unidades.forEach(u => { out[u.id] = u.resumo.filaFinal; });
    return out;
  });
  /** Pendentes mês a mês (o passado acumula sem descontar; do mês atual em diante a equipe atende). */
  // a mesma conta em todas as telas: fila() e evolucao() são adaptadores do mesmo núcleo (Calculo.fluxo)
  const opcoesFluxo = computed(() => ({
    mesAtual: pref.mesAtual, prazoMeses: prazoMeses.value, filaInicial: filaInicial.value,
    atendidas: atendidasInformadas.value, parametros: parametrosMotor.value, ano: pref.ano,
  }));
  const fila = computed(() => Calculo.fila(resultado.value, opcoesFluxo.value));
  /** Núcleo completo: etapas da cadeia, coortes, idade do backlog, QLP e custos. */
  const fluxo = computed(() => Calculo.fluxo(resultado.value, opcoesFluxo.value));
  const fluxoAlvo = computed(() => (unidadeSelValida.value ? fluxo.value.unidades.find(u => u.id === unidadeSelValida.value) : fluxo.value.total));
  /** Backlog da unidade em um mês (soma das filas das três etapas da cadeia) — fonte única. */
  const backlogMes = mes => fluxoAlvo.value.meses[mes].backlog;
  const backlogCenarioMes = mes => fluxoAlvo.value.meses[mes].backlogCenario;

  const unidadeSelValida = computed(() => (cad.unidades.some(u => u.id === pref.unidadeSel) ? pref.unidadeSel : ''));
  /** Alvo da tela: a unidade escolhida ou o total. */
  const alvo = computed(() => (unidadeSelValida.value ? resultado.value.unidades.find(u => u.id === unidadeSelValida.value) : resultado.value.total));
  const filaAlvo = computed(() => (unidadeSelValida.value ? fila.value.unidades.find(u => u.id === unidadeSelValida.value).grupos : fila.value.total.grupos));
  const titulo = computed(() => (unidadeSelValida.value ? alvo.value.nome : 'Todas as unidades'));
  const varias = computed(() => !unidadeSelValida.value && resultado.value.unidades.length > 1);
  const temCusto = computed(() => Calculo.FUNCOES.some(f => resultado.value.total.meses.some(m => m.funcoes[f].custo && m.funcoes[f].custo.pessoa > 0)));

  /** Empresas concluídas informadas: { [unidadeId]: { 1..12: { P, M, G } } } — mesma unidade da demanda. */
  const atendidasInformadas = computed(() => {
    const out = {};
    cad.unidades.forEach(u => {
      const meses = (u.mesesPorAno || {})[pref.ano] || {};
      Object.entries(meses).forEach(([mes, v]) => {
        const porte = v && v.atendidasPorte ? v.atendidasPorte : null;
        if (porte && Object.keys(porte).length) { out[u.id] = out[u.id] || {}; out[u.id][Number(mes)] = { ...porte }; }
      });
    });
    return out;
  });
  /** Evolução mês a mês (controle histórico): fila, capacidade, quadro necessário e admissões sugeridas. */
  const evolucao = computed(() => Calculo.evolucao(resultado.value, opcoesFluxo.value));
  /** Evolução da unidade escolhida (ou o total). */
  const evolucaoAlvo = computed(() => (unidadeSelValida.value
    ? evolucao.value.unidades.find(u => u.id === unidadeSelValida.value).areas
    : evolucao.value.total.areas));
  /** Há atendimentos informados no ano? (sem eles, o histórico só acumula) */
  const temAtendidas = computed(() => Object.keys(atendidasInformadas.value).length > 0);

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
    const deAnoAnterior = unidadeSelValida.value
      ? (filaInicial.value && filaInicial.value[unidadeSelValida.value] ? filaInicial.value[unidadeSelValida.value][Calculo.TEC] : 0)
      : fila.value.filaInicial[Calculo.TEC];
    return { mes: t, pendentes: pend.pendentes, deAntes: pend.filaInicio, vencem: pend.informado, deAnoAnterior, anoAnterior: pref.ano - 1, areas };
  });

  return { resultado, fila, fluxo, fluxoAlvo, backlogMes, backlogCenarioMes, filaInicial, alvo, filaAlvo, titulo, varias, temCusto, hoje, prazoMeses, unidadeSelValida, evolucao, evolucaoAlvo, atendidasInformadas, temAtendidas };
});
