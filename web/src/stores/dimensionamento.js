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
import { num } from '../composables/useFormat.js';

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
  /** Anos que têm lançamento em alguma unidade, do mais antigo para o mais novo. */
  const anosComLancamento = computed(() => {
    const anos = new Set();
    cad.unidades.forEach(u => Object.entries(u.mesesPorAno || {}).forEach(([ano, meses]) => {
      if (meses && Object.keys(meses).length) anos.add(Number(ano));
    }));
    return [...anos].sort((x, y) => x - y);
  });
  /** Atendimentos informados de um ano: { [unidadeId]: { 1..12: { P, M, G } } }. */
  const atendidasDoAno = ano => {
    const out = {};
    cad.unidades.forEach(u => {
      const meses = (u.mesesPorAno || {})[ano] || {};
      Object.entries(meses).forEach(([mes, v]) => {
        const porte = v && v.atendidasPorte ? v.atendidasPorte : null;
        if (porte && Object.keys(porte).length) { out[u.id] = out[u.id] || {}; out[u.id][Number(mes)] = { ...porte }; }
      });
    });
    return out;
  };
  /**
   * O que ficou em aberto NÃO zera na virada do ano: a fila atravessa todos os anos com
   * lançamento, do mais antigo até o ano anterior ao escolhido, carregando as coortes
   * (e, portanto, a idade do backlog). Um documento vencido em 2025 continua vencido em 2026.
   */
  const filaInicial = computed(() => {
    const anteriores = anosComLancamento.value.filter(a => a < pref.ano);
    if (!anteriores.length) return null;
    const hojeAno = new Date().getFullYear();
    let carga = null;
    anteriores.forEach(ano => {
      const unidadesDoAno = cad.unidadesDoAno(ano);
      const r = Calculo.calcular({ unidades: unidadesDoAno, colaboradores: cad.colaboradoresCompletos, parametros: parametrosMotor.value, simulacoes: [], janela: { de: 0, ate: 11 }, ano });
      // ano já encerrado: tudo é passado; ano corrente: até o mês escolhido na barra
      const mesAtualDoAno = ano < hojeAno ? 12 : ano === hojeAno ? pref.mesAtual : 0;
      const f = Calculo.fluxo(r, {
        mesAtual: mesAtualDoAno, prazoMeses: prazoMeses.value, filaInicial: carga,
        atendidas: atendidasDoAno(ano), parametros: parametrosMotor.value, ano,
      });
      const out = {};
      f.unidades.forEach(u => { out[u.id] = u.resumo.filaFinal; });
      carga = out;
    });
    return carga;
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
        pessoas: m.pessoas[f], cabecas: m.cabecas ? m.cabecas[f] : 0, ideal: g.ideal, faltam: g.faltam, sobram: g.sobram, status: g.status, emRampup: g.emRampup || 0,
        custoPessoa: g.custo ? g.custo.pessoa : 0,
        contratarPrazo: res.pessoasPrazo, custoContratarPrazo: g.custo ? res.pessoasPrazo * g.custo.pessoa : 0,
        producaoDia: Calculo.ENTREGAS_DA_FUNCAO[f].map(e => ({ id: e.id, unidade: e.unidade, valor: res.producaoDiaPor[e.id] || 0 })),
      };
    });
    // o que veio de anos anteriores: a fila de janeiro, antes de qualquer vencimento deste ano
    const janeiro = fluxoAlvo.value.meses[0];
    const deAnoAnterior = janeiro ? janeiro.backlogInicio : 0;
    return {
      mes: t, pendentes: pend.pendentes, deAntes: pend.filaInicio, vencem: pend.informado,
      deAnoAnterior, anoAnterior: pref.ano - 1,
      anosAnteriores: anosComLancamento.value.filter(a => a < pref.ano),
      areas,
    };
  });

  /** A equipe alocada no alvo da tela (unidade escolhida, ou todas), no mês da barra: gente de
      verdade, com o que cada um contribui. Fonte única das listas de conferência das telas. */
  const equipeDoMes = computed(() => {
    const unidadeId = unidadeSelValida.value;
    const data = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '');
    return cad.colaboradoresCompletos
      .map(c => {
        const alocs = (c.alocacoes || []).filter(a => (!unidadeId || a.unidadeId === unidadeId) && Number(a.percentual) > 0);
        if (!alocs.length) return null;
        const fracao = alocs.reduce((s, a) => s + Number(a.percentual), 0) / 100;
        const presenca = Calculo.presencaNoMes(c, pref.ano, pref.mesAtual);
        const entregas = Calculo.ENTREGAS_DA_FUNCAO[c.tipoProducao] || [];
        return {
          id: c.id, nome: c.nome, funcao: c.funcao, tipoProducao: c.tipoProducao, chefia: c.chefia,
          fracao, presenca, equivalente: fracao * presenca,
          unidades: alocs.map(a => a.unidadeNome).filter(Boolean),
          producao: c.tipoProducao === Calculo.TEC ? `${num(c.inspecoesDia, 1)} inspeções · ${num(c.relatoriosDia, 1)} relatórios/dia`
            : c.tipoProducao === Calculo.ADM ? `${num(c.empresasDia, 1)} empresas/dia` : 'sem produção',
          semProducao: entregas.length > 0 && entregas.every(e => Number(c[e.campo] || 0) <= 0),
          admissao: data(c.dataAdmissao), desligamento: data(c.dataDesligamento),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.tipoProducao.localeCompare(b.tipoProducao) || a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  return { resultado, fila, fluxo, fluxoAlvo, equipeDoMes, backlogMes, backlogCenarioMes, filaInicial, anosComLancamento, atendidasDoAno, alvo, filaAlvo, titulo, varias, temCusto, hoje, prazoMeses, unidadeSelValida, evolucao, evolucaoAlvo, atendidasInformadas, temAtendidas };
});
