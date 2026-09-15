/* ==========================================================================
   Programacao — utilitários compartilhados pelas telas Programação Mensal e
   Programação Anual: período (salvo no navegador), barra de opções, frases
   em linguagem simples e sinais de situação (verde / amarelo / vermelho).
   ========================================================================== */

const Programacao = (() => {
  const KEY_JANELA = 'chabra-dimensiona:janela';
  const KEY_FILTROS = 'chabra-dimensiona:filtros-programacao';
  const KEY_SIM = 'chabra-dimensiona:simulacao';
  const KEY_MES_ATUAL = 'chabra-dimensiona:mes-atual';

  /** Mês atual da fila (0..11), por navegador; padrão = mês do calendário. */
  function lerMesAtual() {
    try { const v = Number(localStorage.getItem(KEY_MES_ATUAL)); if (Number.isInteger(v) && v >= 0 && v <= 11 && localStorage.getItem(KEY_MES_ATUAL) !== null) return v; } catch (_) { /* ignora */ }
    return new Date().getMonth();
  }
  function salvarMesAtual(m) { try { localStorage.setItem(KEY_MES_ATUAL, String(m)); } catch (_) { /* ignora */ } }

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

  /**
   * HTML da barra. opções: { janela?, ocupacaoAlvo, unidades?, unidadeSel?, mesAtual?, prazoDias? }
   * Com `janela` mostra o período (de/até); com `mesAtual` mostra o mês atual; com `prazoDias` o prazo para atender.
   */
  function barraHTML({ janela = null, ocupacaoAlvo, unidades = null, unidadeSel = '', mesAtual = null, prazoDias = null }) {
    const opcoesMes = sel => Calculo.MESES_LONGO.map((m, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${m}</option>`).join('');
    const folga = Math.round((100 - ocupacaoAlvo) * 10) / 10;
    return `
      <form class="barra-params" id="barra-params" autocomplete="off">
        ${janela ? `
        <div class="param">
          <span class="param-label">Período</span>
          <div class="param-inline" data-local>
            <select class="input input-sm" name="de" aria-label="Mês inicial">${opcoesMes(janela.de)}</select>
            <span class="muted">a</span>
            <select class="input input-sm" name="ate" aria-label="Mês final">${opcoesMes(janela.ate)}</select>
            <button type="button" class="btn btn-ghost btn-sm" data-action="ano-completo" ${janela.de === 0 && janela.ate === 11 ? 'disabled' : ''}>Ano completo</button>
          </div>
        </div>` : ''}
        ${mesAtual !== null ? `
        <div class="param">
          <span class="param-label">Mês atual</span>
          <div class="param-inline" data-local>
            <select class="input input-sm" name="mesAtual" aria-label="Mês atual">${opcoesMes(mesAtual)}</select>
            <span class="param-ajuda" title="A fila de hoje é o que se acumulou de janeiro até o mês anterior a este. O que entra e o que a equipe consegue são contados deste mês em diante.">?</span>
          </div>
        </div>` : ''}
        ${unidades ? `
        <div class="param">
          <span class="param-label">Unidade</span>
          <select class="input input-sm" name="unidade" data-local>
            <option value="" ${!unidadeSel ? 'selected' : ''}>Todas as unidades</option>
            ${unidades.map(u => `<option value="${u.id}" ${u.id === unidadeSel ? 'selected' : ''}>${UI.esc(u.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
        ${prazoDias !== null ? `
        <div class="param">
          <span class="param-label">Prazo para atender</span>
          <div class="param-inline">
            <input class="input input-sm input-num input-pct" type="number" name="prazoDias" min="1" max="365" step="1" inputmode="numeric" value="${prazoDias}" aria-label="Prazo para atender (dias)">
            <span class="muted">dias</span>
            <span class="param-ajuda" title="Quantos dias a empresa tem para receber os documentos depois que vencem (ou depois de entrar). Vale para toda a equipe.">?</span>
          </div>
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

  /** Liga os eventos da barra. callbacks: { onJanela(j), onUnidade(id), onMesAtual(m) }. Folga e prazo são salvos no Supabase (valem para toda a equipe). */
  function bindBarra(el, { onJanela, onUnidade, onMesAtual }) {
    const form = el.querySelector('#barra-params');
    if (!form) return;
    form.addEventListener('submit', e => e.preventDefault());

    if (form.de && form.ate && onJanela) {
      const aplicarJanela = () => {
        let de = Number(form.de.value), ate = Number(form.ate.value);
        if (de > ate) [de, ate] = [ate, de];
        salvarJanela({ de, ate });
        onJanela({ de, ate });
      };
      form.de.addEventListener('change', aplicarJanela);
      form.ate.addEventListener('change', aplicarJanela);
      form.querySelector('[data-action="ano-completo"]').addEventListener('click', () => { salvarJanela({ de: 0, ate: 11 }); onJanela({ de: 0, ate: 11 }); });
    }
    if (form.mesAtual && onMesAtual) form.mesAtual.addEventListener('change', () => { salvarMesAtual(Number(form.mesAtual.value)); onMesAtual(Number(form.mesAtual.value)); });
    if (form.unidade && onUnidade) form.unidade.addEventListener('change', () => onUnidade(form.unidade.value));
    if (form.prazoDias) {
      const prazo = form.prazoDias;
      prazo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); prazo.blur(); } });
      prazo.addEventListener('change', async () => {
        const v = Math.round(UI.parseNum(prazo.value, NaN));
        if (!(v >= 1 && v <= 365)) { UI.toast('O prazo deve ficar entre 1 e 365 dias.', 'error'); prazo.value = Store.parametros.get().prazoDias; return; }
        prazo.disabled = true;
        try { await Store.parametros.update({ prazoDias: v }); }
        catch (err) { UI.toast(err.message, 'error'); prazo.value = Store.parametros.get().prazoDias; prazo.disabled = false; }
      });
    }

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

  /* ---------- simulação "e se…" (só neste navegador; não mexe no cadastro) ---------- */

  function lerSimulacao() {
    try { const s = JSON.parse(localStorage.getItem(KEY_SIM)); return Array.isArray(s) ? s : []; } catch (_) { return []; }
  }
  function salvarSimulacao(lista) { try { localStorage.setItem(KEY_SIM, JSON.stringify(lista)); } catch (_) { /* ignora */ } }

  /** Ritmo por dia sugerido para uma pessoa simulada: média do grupo na unidade; senão da equipe; senão o padrão. */
  function ritmoSugerido(grupo, unidadeId) {
    const todos = Store.colaboradores.list().filter(c => c.tipoProducao === grupo);
    const naUnidade = todos.filter(c => (c.alocacoes || []).some(a => a.unidadeId === unidadeId && a.percentual > 0));
    const ref = naUnidade.length ? naUnidade : todos;
    const media = campo => (ref.length ? Math.round((ref.reduce((s, c) => s + Number(c[campo] || 0), 0) / ref.length) * 10) / 10 : Calculo.COLAB_PADRAO[campo]);
    return grupo === Calculo.ADM
      ? { empresasDia: media('empresasDia') }
      : { inspecoesDia: media('inspecoesDia'), relatoriosDia: media('relatoriosDia') };
  }

  /** Texto curto de uma simulação: "+2 técnicos em Teresópolis (set–dez)". */
  function descricaoSimulacao(s, unidades) {
    const u = unidades.find(x => x.id === s.unidadeId);
    const q = Math.round(Number(s.quantidade) || 0);
    const sing = Calculo.FUNCAO_SINGULAR[s.grupo] || 'pessoa';
    const rot = Math.abs(q) === 1 ? sing : sing + 's';
    const quando = s.de === 0 && s.ate === 11 ? 'ano todo' : s.ate === 11 ? `a partir de ${Calculo.MESES[s.de].toLowerCase()}` : s.de === s.ate ? `só em ${Calculo.MESES[s.de].toLowerCase()}` : `${Calculo.MESES[s.de].toLowerCase()}–${Calculo.MESES[s.ate].toLowerCase()}`;
    return `${q > 0 ? '+' : '−'}${Math.abs(q)} ${rot} em ${u ? u.nome : '?'} (${quando})`;
  }

  /** Card da simulação: linhas editáveis (unidade, grupo, quantidade, meses, ritmo). */
  function simulacaoHTML({ unidades, janela }) {
    const sims = lerSimulacao();
    if (!unidades.length) return '';
    const opcoesMes = sel => Calculo.MESES.map((m, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${m}</option>`).join('');
    const linha = (s, i) => `
      <tr data-sim="${i}">
        <td><select class="input input-sm" name="unidadeId" aria-label="Unidade">${unidades.map(u => `<option value="${u.id}" ${u.id === s.unidadeId ? 'selected' : ''}>${UI.esc(u.nome)}</option>`).join('')}</select></td>
        <td><select class="input input-sm" name="grupo" aria-label="Grupo">
          <option value="${Calculo.TEC}" ${s.grupo === Calculo.TEC ? 'selected' : ''}>Técnicos</option>
          <option value="${Calculo.ADM}" ${s.grupo === Calculo.ADM ? 'selected' : ''}>Administrativos</option>
        </select></td>
        <td><input class="input input-sm input-num sim-qtd" type="number" name="quantidade" step="1" inputmode="numeric" value="${Math.round(Number(s.quantidade) || 0)}" aria-label="Pessoas a mais (positivo) ou a menos (negativo)" title="Positivo = contratar; negativo = desligar"></td>
        <td><div class="param-inline"><span class="muted">a partir de</span><select class="input input-sm" name="de" aria-label="Mês em que a pessoa entra">${opcoesMes(s.de)}</select><span class="muted">até</span><select class="input input-sm" name="ate" aria-label="Último mês da pessoa na equipe" title="Deixe em Dez para a pessoa ficar na equipe até o fim do ano">${opcoesMes(s.ate)}</select></div></td>
        <td><div class="param-inline sim-ritmo">
          ${s.grupo === Calculo.ADM
            ? `<input class="input input-sm input-num" type="number" name="empresasDia" min="0" step="0.5" inputmode="decimal" value="${s.empresasDia}" aria-label="Empresas finalizadas por dia"><span class="muted">empresas/dia</span>`
            : `<input class="input input-sm input-num" type="number" name="inspecoesDia" min="0" step="0.5" inputmode="decimal" value="${s.inspecoesDia}" aria-label="Inspeções por dia"><span class="muted">insp.</span>
               <input class="input input-sm input-num" type="number" name="relatoriosDia" min="0" step="0.5" inputmode="decimal" value="${s.relatoriosDia}" aria-label="Relatórios por dia"><span class="muted">relat./dia</span>`}
        </div></td>
        <td class="actions"><button type="button" class="btn-link danger" data-action="sim-remover" data-sim="${i}">Remover</button></td>
      </tr>`;
    return `
      <section class="card card-simulacao ${sims.length ? 'ativa' : ''}" data-local>
        <div class="card-head">
          <h2>E se…? Simular pessoas a mais ou a menos</h2>
          <div class="right">
            <span class="muted">só neste navegador — não mexe no cadastro</span>
            ${sims.length ? '<button type="button" class="btn btn-ghost btn-sm" data-action="sim-limpar">Limpar simulação</button>' : ''}
          </div>
        </div>
        <p class="muted">Teste contratações (quantidade positiva) ou desligamentos (negativa) numa unidade. A pessoa entra no mês escolhido e <strong>fica na equipe até o mês final</strong> (por padrão, dezembro) — ou seja, quem é contratado em setembro também conta em outubro, novembro e dezembro. As programações abaixo passam a contar com essas pessoas${sims.length ? '' : ' assim que você adicionar uma linha'}.</p>
        ${sims.length ? `
        <form class="sim-form" id="form-simulacao" autocomplete="off">
          <div class="table-wrap">
            <table class="table table-sim">
              <thead><tr><th>Unidade</th><th>Grupo</th><th class="num">Pessoas (+/−)</th><th>Na equipe</th><th>Ritmo por dia de cada pessoa</th><th class="actions"></th></tr></thead>
              <tbody>${sims.map(linha).join('')}</tbody>
            </table>
          </div>
        </form>` : ''}
        <div class="sim-rodape">
          <button type="button" class="btn btn-ghost btn-sm" data-action="sim-adicionar">+ Adicionar pessoas para simular</button>
          ${sims.length ? `<span class="muted">Simulando: ${sims.map(s => UI.esc(descricaoSimulacao(s, unidades))).join(' · ')}</span>` : ''}
        </div>
      </section>`;
  }

  /** Liga os eventos do card da simulação (cada mudança salva e re-renderiza a tela). */
  function bindSimulacao(el, { unidades, janela, unidadeSel = '' }) {
    const card = el.querySelector('.card-simulacao');
    if (!card) return;
    const form = card.querySelector('#form-simulacao');
    if (form) form.addEventListener('submit', e => e.preventDefault());
    card.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const sims = lerSimulacao();
      if (btn.dataset.action === 'sim-adicionar') {
        const unidadeId = unidades.some(u => u.id === unidadeSel) ? unidadeSel : unidades[0].id;
        // entra no primeiro mês do período e fica até dezembro (contratação, não temporário)
        sims.push({ unidadeId, grupo: Calculo.TEC, quantidade: 1, de: janela.de, ate: 11, ...ritmoSugerido(Calculo.TEC, unidadeId) });
      } else if (btn.dataset.action === 'sim-remover') {
        sims.splice(Number(btn.dataset.sim), 1);
      } else if (btn.dataset.action === 'sim-limpar') {
        sims.length = 0;
      } else return;
      salvarSimulacao(sims);
      App.render();
    });
    card.querySelectorAll('tr[data-sim]').forEach(tr => {
      const i = Number(tr.dataset.sim);
      tr.querySelectorAll('input, select').forEach(campo => {
        campo.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); campo.blur(); } });
        campo.addEventListener('change', () => {
          const sims = lerSimulacao();
          const s = sims[i];
          if (!s) return;
          if (campo.name === 'quantidade') {
            const q = Math.round(UI.parseNum(campo.value, 0));
            if (q === 0) { UI.toast('Informe quantas pessoas a mais (positivo) ou a menos (negativo).', 'error'); campo.value = s.quantidade; return; }
            s.quantidade = q;
          } else if (campo.name === 'de' || campo.name === 'ate') {
            s[campo.name] = Number(campo.value);
            if (s.de > s.ate) [s.de, s.ate] = [s.ate, s.de];
          } else if (campo.name === 'grupo' || campo.name === 'unidadeId') {
            s[campo.name] = campo.value;
            Object.assign(s, ritmoSugerido(s.grupo, s.unidadeId)); // ritmo sugerido acompanha o grupo/unidade
          } else {
            const v = UI.parseNum(campo.value, NaN);
            if (!(v >= 0)) { UI.toast('Informe um ritmo por dia válido (zero ou mais).', 'error'); campo.value = s[campo.name]; return; }
            s[campo.name] = v;
          }
          salvarSimulacao(sims);
          App.render();
        });
      });
    });
  }

  /** "11 técnicos (+2 simulados)" — contagem real com o saldo da simulação ao lado. */
  function pessoasTexto(reais, simuladas, plural) {
    const s = Math.round((simuladas || 0) * 10) / 10;
    const extra = s ? ` <span class="sim-saldo" title="Pessoas da simulação (não estão no cadastro)">(${s > 0 ? '+' : '−'}${numFte(Math.abs(s))} ${Math.abs(s) === 1 ? 'simulado' : 'simulados'})</span>` : '';
    return `${numFte(reais)} ${plural}${extra}`;
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
    return `A equipe consegue até <strong>${num(consegue)}</strong> ${entrega.unidade}${sufixo}; a carteira precisa de <strong>${num(precisa)}</strong>.`;
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

  /**
   * Quantas pessoas faltam (ou sobram) num mês ou período, SEMPRE em relação à equipe
   * de hoje — não é acumulado: contratar o maior valor mensal cobre todos os meses.
   * A partir do resumo de uma função ({ status, faltam, sobram }). Curto, para caber numa célula.
   */
  function pessoasHTML(resumo, singular) {
    if (!resumo) return '';
    const plural = q => (q === 1 ? singular : singular + 's');
    const nota = 'em relação à equipe de hoje (não é acumulado com os outros meses)';
    if (resumo.faltam > 0) return `<span class="delta delta-falta" title="Faltam aproximadamente ${resumo.faltam} ${plural(resumo.faltam)} para dar conta do mês, ${nota}">${resumo.faltam === 1 ? 'falta' : 'faltam'} ${resumo.faltam}</span>`;
    if (resumo.sobram > 0) return `<span class="delta delta-sobra" title="Sobra o equivalente a ${resumo.sobram} ${plural(resumo.sobram)} no mês, ${nota}">${resumo.sobram === 1 ? 'sobra' : 'sobram'} ${resumo.sobram}</span>`;
    if (resumo.status === 'atencao') return '<span class="delta delta-limite" title="Dá conta, mas com menos de 10% de sobra">no limite</span>';
    if (resumo.status === 'deficit') return `<span class="delta delta-falta" title="Falta menos de uma pessoa inteira, ${nota}">falta 1</span>`;
    return '<span class="delta delta-ok" title="A equipe dá conta do mês">ok</span>';
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
    num, numFte, statusChip, statusDot, classeLinha, fraseEntrega, recomendacaoHTML, legendaHTML, avisosHTML, chefiaHTML, pessoasHTML,
    lerSimulacao, salvarSimulacao, simulacaoHTML, bindSimulacao, descricaoSimulacao, pessoasTexto, lerMesAtual, salvarMesAtual,
  };
})();
