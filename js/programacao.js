/* ==========================================================================
   Programacao — utilitários compartilhados pelas telas Programação Mensal e
   Programação Anual: período (salvo no navegador), barra de opções, frases
   em linguagem simples e sinais de situação (verde / amarelo / vermelho).
   ========================================================================== */

const Programacao = (() => {
  const KEY_JANELA = 'chabra-dimensiona:janela';
  const KEY_FILTROS = 'chabra-dimensiona:filtros-programacao';

  /* ---------- período (de/até em meses 0..11), por navegador ---------- */

  function lerJanela() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY_JANELA));
      if (j && Number.isInteger(j.de) && Number.isInteger(j.ate) && j.de >= 0 && j.ate <= 11 && j.de <= j.ate) return j;
    } catch (_) { /* ignora */ }
    return { de: 0, ate: 11 };
  }
  function salvarJanela(j) { try { localStorage.setItem(KEY_JANELA, JSON.stringify(j)); } catch (_) { /* ignora */ } }
  function lerFiltros() { try { return JSON.parse(localStorage.getItem(KEY_FILTROS)) || {}; } catch (_) { return {}; } }
  function salvarFiltros(f) { try { localStorage.setItem(KEY_FILTROS, JSON.stringify(f)); } catch (_) { /* ignora */ } }

  function descricaoJanela(j) {
    if (j.de === 0 && j.ate === 11) return 'ano completo';
    if (j.de === j.ate) return Calculo.MESES_LONGO[j.de];
    return `${Calculo.MESES_LONGO[j.de]} a ${Calculo.MESES_LONGO[j.ate]}`;
  }

  /* ---------- barra de opções ---------- */

  /** HTML da barra. opções: { janela, ocupacaoAlvo, unidades?, unidadeSel? } */
  function barraHTML({ janela, ocupacaoAlvo, unidades = null, unidadeSel = '' }) {
    const opcoesMes = sel => Calculo.MESES_LONGO.map((m, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${m}</option>`).join('');
    const folga = Math.round((100 - ocupacaoAlvo) * 10) / 10;
    return `
      <form class="barra-params" id="barra-params" autocomplete="off">
        <div class="param">
          <span class="param-label">Período</span>
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
          <span class="param-label">Folga para imprevistos</span>
          <div class="param-inline">
            <input class="input input-sm input-num input-pct" type="number" name="folga" min="0" max="90" step="1" inputmode="numeric" value="${folga}" aria-label="Folga para imprevistos (%)">
            <span class="muted">%</span>
            <span class="param-ajuda" title="Parte do tempo da equipe reservada para imprevistos (faltas, retrabalho, urgências). Com 15%, contamos que cada pessoa entrega até 85% do que declarou.">?</span>
          </div>
        </div>
      </form>`;
  }

  /** Liga os eventos da barra. callbacks: { onJanela(j), onUnidade(id) }. A folga é salva no Supabase (vale para toda a equipe). */
  function bindBarra(el, { onJanela, onUnidade }) {
    const form = el.querySelector('#barra-params');
    if (!form) return;
    form.addEventListener('submit', e => e.preventDefault());

    const aplicarJanela = () => {
      let de = Number(form.de.value), ate = Number(form.ate.value);
      if (de > ate) [de, ate] = [ate, de];
      salvarJanela({ de, ate });
      onJanela({ de, ate });
    };
    form.de.addEventListener('change', aplicarJanela);
    form.ate.addEventListener('change', aplicarJanela);
    form.querySelector('[data-action="ano-completo"]').addEventListener('click', () => { salvarJanela({ de: 0, ate: 11 }); onJanela({ de: 0, ate: 11 }); });
    if (form.unidade && onUnidade) form.unidade.addEventListener('change', () => onUnidade(form.unidade.value));

    const folga = form.folga;
    folga.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); folga.blur(); } });
    folga.addEventListener('change', async () => {
      const v = UI.parseNum(folga.value, NaN);
      if (!(v >= 0 && v <= 90)) {
        UI.toast('A folga deve ficar entre 0% e 90%.', 'error');
        folga.value = Math.round(100 - Store.parametros.get().ocupacaoAlvo);
        return;
      }
      folga.disabled = true;
      try {
        await Store.parametros.update({ ocupacaoAlvo: 100 - v }); // dispara store:change → re-render
      } catch (err) {
        UI.toast(err.message, 'error');
        folga.value = Math.round(100 - Store.parametros.get().ocupacaoAlvo);
        folga.disabled = false;
      }
    });
  }

  /* ---------- formatação e sinais ---------- */

  const num = v => (Number.isFinite(v) ? UI.fmt(v, 0) : '—');
  const numFte = v => (!Number.isFinite(v) ? '—' : Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : UI.fmt(v, 1));

  const STATUS = {
    ok:      { rotulo: 'Dá conta',         classe: 'status-ok' },
    atencao: { rotulo: 'No limite',        classe: 'status-atencao' },
    deficit: { rotulo: 'Precisa contratar', classe: 'status-deficit' },
  };
  function statusChip(status) {
    const s = STATUS[status] || STATUS.ok;
    return `<span class="status ${s.classe}">${s.rotulo}</span>`;
  }
  function statusDot(status, titulo = '') {
    const s = STATUS[status] || STATUS.ok;
    return `<span class="dot dot-${status}" title="${UI.esc(titulo || s.rotulo)}" aria-label="${s.rotulo}"></span>`;
  }
  const classeLinha = status => 'row-' + (STATUS[status] ? status : 'ok');

  /** Frase "consegue X, precisa Y" de uma entrega, por mês (valores médios quando é um período). */
  function fraseEntrega(entrega, bloco, porMes = true) {
    const consegue = porMes && bloco.porMes ? bloco.porMes.consegue : bloco.consegue;
    const precisa = porMes && bloco.porMes ? bloco.porMes.precisa : bloco.precisa;
    const sufixo = porMes ? ' por mês' : '';
    const freq = Store.parametros.get()[entrega.freq];
    const periodoTxt = f => (f >= 12 && f % 12 === 0 ? `${f / 12} ${f === 12 ? 'ano' : 'anos'}` : `${UI.fmt(f, 1)} meses`);
    const nota = freq && freq !== 1 ? ` <span class="muted">(${entrega.singular} por empresa a cada ${periodoTxt(freq)})</span>` : '';
    return `A equipe consegue até <strong>${num(consegue)}</strong> ${entrega.unidade}${sufixo}; a carteira precisa de <strong>${num(precisa)}</strong>.${nota}`;
  }

  function recomendacaoHTML(rec) {
    return `<span class="rec rec-${rec.tipo}">${rec.texto}</span>`;
  }

  function legendaHTML() {
    return `
      <div class="legenda">
        <span><span class="status status-ok">Dá conta</span> a equipe atende a carteira</span>
        <span><span class="status status-atencao">No limite</span> atende, mas com menos de ${Math.round(Calculo.MARGEM_ATENCAO * 100)}% de sobra</span>
        <span><span class="status status-deficit">Precisa contratar</span> a carteira é maior do que a equipe consegue</span>
      </div>`;
  }

  /** Linha "Chefia: Fulano (Supervisor ADM) · Beltrano (Supervisor Geral)" de uma unidade (ou do total). */
  function chefiaHTML(lista) {
    const l = Array.isArray(lista) ? lista : [];
    if (l.length === 0) return '<span class="chefia chefia-vazia" title="Nenhuma pessoa com função de chefia está nesta unidade">Chefia: <em>não definida</em></span>';
    const grupo = ch => (ch.coordena === 'tecnicos' ? ' · técnicos' : ch.coordena === 'administrativos' ? ' · administrativos' : '');
    return `<span class="chefia" title="Pessoas com função de chefia alocadas nesta unidade">Chefia: ${l.map(ch => `<strong>${UI.esc(ch.nome)}</strong>${ch.funcao ? ` <span class="muted">(${UI.esc(ch.funcao)}${grupo(ch)})</span>` : ''}`).join(' · ')}</span>`;
  }

  function avisosHTML(avisos) {
    const itens = [];
    if (avisos.colabSemProducao && avisos.colabSemProducao.length) itens.push(`<strong>Fora das contas (função sem produção):</strong> ${avisos.colabSemProducao.map(UI.esc).join(', ')}.`);
    if (avisos.colabSemUnidade.length) itens.push(`<strong>Sem unidade (não entram na programação):</strong> ${avisos.colabSemUnidade.map(UI.esc).join(', ')}. Em Colaboradores, marque onde cada um atua.`);
    if (avisos.colabParcial && avisos.colabParcial.length) itens.push(`<strong>Parte do tempo sem unidade:</strong> ${avisos.colabParcial.map(UI.esc).join(', ')} — só a parte marcada conta.`);
    if (avisos.unidadesSemColab.length) itens.push(`<strong>Unidades com empresas e sem equipe:</strong> ${avisos.unidadesSemColab.map(UI.esc).join(', ')}.`);
    if (avisos.unidadesSemFuncao && avisos.unidadesSemFuncao.length) itens.push(`<strong>Unidades sem alguém da função:</strong> ${avisos.unidadesSemFuncao.map(x => `${UI.esc(x.unidade)} (sem ${Calculo.FUNCAO_CURTA[x.funcao].toLowerCase()})`).join(', ')}.`);
    if (!itens.length) return '';
    return `<div class="alert alert-warn"><ul>${itens.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }

  return {
    lerJanela, salvarJanela, lerFiltros, salvarFiltros, descricaoJanela,
    barraHTML, bindBarra,
    num, numFte, statusChip, statusDot, classeLinha, fraseEntrega, recomendacaoHTML, legendaHTML, avisosHTML, chefiaHTML,
  };
})();
