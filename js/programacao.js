/* ==========================================================================
   Programacao — utilitários compartilhados pelas telas Programação Mensal e
   Programação Anual: seletor de janela (persistido por navegador), barra de
   parâmetros, formatação de indicadores e chips de status.
   ========================================================================== */

const Programacao = (() => {
  const KEY_JANELA = 'chabra-dimensiona:janela';
  const KEY_FILTROS = 'chabra-dimensiona:filtros-programacao';

  /* ---------- janela (de/até em meses 0..11), por navegador ---------- */

  function lerJanela() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY_JANELA));
      if (j && Number.isInteger(j.de) && Number.isInteger(j.ate) && j.de >= 0 && j.ate <= 11 && j.de <= j.ate) return j;
    } catch (_) { /* ignora */ }
    return { de: 0, ate: 11 };
  }

  function salvarJanela(j) {
    try { localStorage.setItem(KEY_JANELA, JSON.stringify(j)); } catch (_) { /* ignora */ }
  }

  function lerFiltros() {
    try { return JSON.parse(localStorage.getItem(KEY_FILTROS)) || {}; } catch (_) { return {}; }
  }

  function salvarFiltros(f) {
    try { localStorage.setItem(KEY_FILTROS, JSON.stringify(f)); } catch (_) { /* ignora */ }
  }

  function descricaoJanela(j) {
    if (j.de === 0 && j.ate === 11) return 'Ano completo';
    if (j.de === j.ate) return Calculo.MESES_LONGO[j.de];
    return `${Calculo.MESES_LONGO[j.de]} a ${Calculo.MESES_LONGO[j.ate]}`;
  }

  /* ---------- barra de parâmetros ---------- */

  /**
   * HTML da barra. opções: { janela, ocupacaoAlvo, unidades?, unidadeSel?, funcaoSel? }
   * - unidades: se informado, mostra o seletor de unidade ('' = todas)
   * - funcaoSel: '' (total) | nome da função
   */
  function barraHTML({ janela, ocupacaoAlvo, unidades = null, unidadeSel = '', funcaoSel = '' }) {
    const opcoesMes = sel => Calculo.MESES_LONGO.map((m, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${m}</option>`).join('');
    return `
      <form class="barra-params" id="barra-params" autocomplete="off">
        <div class="param">
          <span class="param-label">Janela</span>
          <div class="param-inline">
            <select class="input input-sm" name="de" aria-label="Mês inicial">${opcoesMes(janela.de)}</select>
            <span class="muted">a</span>
            <select class="input input-sm" name="ate" aria-label="Mês final">${opcoesMes(janela.ate)}</select>
            <button type="button" class="btn btn-ghost btn-sm" data-action="ano-completo" ${janela.de === 0 && janela.ate === 11 ? 'disabled' : ''}>Ano completo</button>
          </div>
        </div>
        ${unidades ? `
        <div class="param">
          <span class="param-label">Unidade</span>
          <select class="input input-sm" name="unidade">
            <option value="" ${!unidadeSel ? 'selected' : ''}>Todas as unidades</option>
            ${unidades.map(u => `<option value="${u.id}" ${u.id === unidadeSel ? 'selected' : ''}>${UI.esc(u.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="param">
          <span class="param-label">Função</span>
          <select class="input input-sm" name="funcao">
            <option value="" ${!funcaoSel ? 'selected' : ''}>Total (todas)</option>
            ${Calculo.FUNCOES.map(f => `<option value="${UI.esc(f)}" ${f === funcaoSel ? 'selected' : ''}>${Calculo.FUNCAO_CURTA[f]}</option>`).join('')}
          </select>
        </div>
        <div class="param">
          <span class="param-label">Ocupação-alvo</span>
          <div class="param-inline">
            <input class="input input-sm input-num input-pct" type="number" name="ocupacaoAlvo" min="1" max="100" step="1" inputmode="numeric" value="${ocupacaoAlvo}" aria-label="Ocupação-alvo (%)">
            <span class="muted">%</span>
            <span class="saved-flag" id="alvo-saved" aria-hidden="true">salvo ✓</span>
          </div>
        </div>
      </form>`;
  }

  /**
   * Liga os eventos da barra. callbacks: { onJanela(j), onUnidade(id), onFuncao(f) }
   * A ocupação-alvo é salva no Supabase (parâmetro compartilhado) e re-renderiza via store:change.
   */
  function bindBarra(el, { onJanela, onUnidade, onFuncao }) {
    const form = el.querySelector('#barra-params');
    if (!form) return;
    form.addEventListener('submit', e => e.preventDefault());

    const aplicarJanela = () => {
      let de = Number(form.de.value), ate = Number(form.ate.value);
      if (de > ate) [de, ate] = [ate, de];
      const j = { de, ate };
      salvarJanela(j);
      onJanela(j);
    };
    form.de.addEventListener('change', aplicarJanela);
    form.ate.addEventListener('change', aplicarJanela);
    form.querySelector('[data-action="ano-completo"]').addEventListener('click', () => {
      salvarJanela({ de: 0, ate: 11 });
      onJanela({ de: 0, ate: 11 });
    });
    if (form.unidade && onUnidade) form.unidade.addEventListener('change', () => onUnidade(form.unidade.value));
    if (form.funcao && onFuncao) form.funcao.addEventListener('change', () => onFuncao(form.funcao.value));

    const alvo = form.ocupacaoAlvo;
    alvo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); alvo.blur(); } });
    alvo.addEventListener('change', async () => {
      const v = UI.parseNum(alvo.value, NaN);
      if (!(v > 0 && v <= 100)) {
        UI.toast('A ocupação-alvo deve estar entre 1% e 100%.', 'error');
        alvo.value = Store.parametros.get().ocupacaoAlvo;
        return;
      }
      alvo.disabled = true;
      try {
        await Store.parametros.update({ ocupacaoAlvo: v }); // dispara store:change → re-render
      } catch (err) {
        UI.toast(err.message, 'error');
        alvo.value = Store.parametros.get().ocupacaoAlvo;
        alvo.disabled = false;
      }
    });
  }

  /* ---------- formatação ---------- */

  const fmtH = h => (Number.isFinite(h) ? UI.fmt(h, 0) : '—');
  const fmtH1 = h => (Number.isFinite(h) ? UI.fmt(h, 1) : '—');
  const fmtPct = x => (x === Infinity ? '∞' : Number.isFinite(x) ? UI.fmt(x * 100, 0) + '%' : '—');
  const fmtColab = g => {
    if (!Number.isFinite(g)) return '—';
    const s = UI.fmt(Math.abs(g), 1);
    return g < -1e-9 ? `−${s}` : g > 1e-9 ? `+${s}` : '0';
  };
  /** Colaboradores equivalentes (FTE): inteiro sem decimais; senão 1 casa. */
  const fmtFte = v => (!Number.isFinite(v) ? '—' : Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : UI.fmt(v, 1));
  const fmtGap = h => {
    if (!Number.isFinite(h)) return '—';
    const s = UI.fmt(Math.abs(h), 0);
    return h < -0.5 ? `−${s}` : h > 0.5 ? `+${s}` : '0';
  };

  const STATUS = {
    ok: { rotulo: 'Suficiente', classe: 'status-ok' },
    atencao: { rotulo: 'Próximo do limite', classe: 'status-atencao' },
    deficit: { rotulo: 'Déficit', classe: 'status-deficit' },
  };

  function statusChip(status) {
    const s = STATUS[status] || STATUS.ok;
    return `<span class="status ${s.classe}">${s.rotulo}</span>`;
  }

  function classeLinha(status) {
    return 'row-' + (STATUS[status] ? status : 'ok');
  }

  /** Seleciona o bloco (total ou de uma função) de um item com { total, porFuncao }. */
  function blocoDe(item, funcao) {
    return funcao ? item.porFuncao[funcao] : item.total;
  }

  /**
   * Recomendação para um item { total, porFuncao }: com função selecionada, a dela;
   * na visão Total, a combinação por função (técnico não produz documento
   * administrativo, então as necessidades não se compensam entre funções).
   */
  function recomendacaoHTML(item, funcao) {
    const rec = r => `<span class="rec rec-${r.tipo}">${r.texto}</span>`;
    if (funcao) return rec(item.porFuncao[funcao].recomendacao);
    const partes = Calculo.FUNCOES
      .map(f => item.porFuncao[f].recomendacao)
      .filter(r => r.tipo !== 'adequado');
    if (partes.length === 0) return rec({ tipo: 'adequado', texto: 'Quadro adequado' });
    return partes.map(rec).join('<span class="muted"> · </span>');
  }

  function legendaHTML() {
    return `
      <div class="legenda">
        <span><span class="status status-ok">Suficiente</span> demanda cabe na capacidade planejável</span>
        <span><span class="status status-atencao">Próximo do limite</span> folga menor que ${Math.round(Calculo.MARGEM_ATENCAO * 100)}%</span>
        <span><span class="status status-deficit">Déficit</span> demanda maior que a capacidade planejável</span>
      </div>`;
  }

  function avisosHTML(avisos) {
    const itens = [];
    if (avisos.docsSobDemanda.length) itens.push(`<strong>Fora do cálculo (sob demanda):</strong> ${avisos.docsSobDemanda.map(UI.esc).join(', ')}. Defina uma periodicidade no Catálogo para incluí-los.`);
    if (avisos.colabSemUnidade.length) itens.push(`<strong>Sem unidade (não contam na capacidade):</strong> ${avisos.colabSemUnidade.map(UI.esc).join(', ')}. Informe a alocação em Colaboradores.`);
    if (avisos.colabParcial && avisos.colabParcial.length) itens.push(`<strong>Alocação parcial (só a parte alocada conta):</strong> ${avisos.colabParcial.map(UI.esc).join(', ')}.`);
    if (avisos.unidadesSemColab.length) itens.push(`<strong>Unidades com empresas e sem colaboradores:</strong> ${avisos.unidadesSemColab.map(UI.esc).join(', ')}.`);
    if (!itens.length) return '';
    return `<div class="alert alert-warn"><ul>${itens.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }

  return {
    lerJanela, salvarJanela, lerFiltros, salvarFiltros, descricaoJanela,
    barraHTML, bindBarra,
    fmtH, fmtH1, fmtPct, fmtColab, fmtGap, fmtFte, statusChip, classeLinha, blocoDe, recomendacaoHTML, legendaHTML, avisosHTML,
  };
})();
