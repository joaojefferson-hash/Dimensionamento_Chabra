/* ==========================================================================
   Tela: Programação Mensal — mês a mês, o que a equipe consegue e o que a
   carteira precisa (por unidade ou todas), com sinal de situação e quantas
   pessoas contratar (ou quantas sobram) em cada mês.

   Técnicos e administrativos ficam em grades separadas, cada uma com a sua
   tabela mês a mês, a leitura em frases e a grade unidade × mês só com sinais.
   O card "E se…?" permite simular pessoas a mais ou a menos (só no navegador).
   ========================================================================== */

const ViewProgramacaoMensal = {
  id: 'programacao-mensal',
  title: 'Programação Mensal',

  /** "contratar 2 técnicos" / "sobram 3 administrativos" / "técnicos ok" (texto puro, para tooltips). */
  textoPessoas(resumo, singular) {
    const plural = q => (q === 1 ? singular : singular + 's');
    if (resumo.faltam > 0) return `contratar ${resumo.faltam} ${plural(resumo.faltam)}`;
    if (resumo.sobram > 0) return `${resumo.sobram === 1 ? 'sobra' : 'sobram'} ${resumo.sobram} ${plural(resumo.sobram)}`;
    return `${singular}s ok`;
  },

  /**
   * Leitura mês a mês de uma função: "Mês a mês: contratar 2 em setembro e outubro, 3 em dezembro."
   * ou "Mês a mês: sobra 1 em setembro…". Vazio quando todos os meses estão ok.
   */
  leituraMensal(meses, funcao) {
    const singular = Calculo.FUNCAO_SINGULAR[funcao];
    const grupos = new Map(); // "contratar 2" → [meses]
    meses.forEach(m => {
      const r = m.funcoes[funcao];
      const chave = r.faltam > 0 ? `contratar ${r.faltam}` : r.sobram > 0 ? `sobra ${r.sobram}` : null;
      if (!chave) return;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(m.nomeLongo.toLowerCase());
    });
    if (!grupos.size) return '';
    const partes = [...grupos.entries()].map(([chave, lista]) => {
      const [verbo, q] = chave.split(' ');
      const n = Number(q);
      const rot = n === 1 ? singular : singular + 's';
      const quando = lista.length > 1 ? lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1] : lista[0];
      return `${verbo === 'sobra' ? (n === 1 ? 'sobra' : 'sobram') : 'contratar'} ${n} ${rot} em ${quando}`;
    });
    return `<span class="muted">Mês a mês: ${partes.join('; ')}.</span>`;
  },

  render(el) {
    const janela = Programacao.lerJanela();
    const filtros = Programacao.lerFiltros();
    const unidades = Store.unidades.list();
    const unidadeSel = unidades.some(u => u.id === filtros.unidade) ? filtros.unidade : '';
    const p = Store.parametros.get();
    const simulacoes = Programacao.lerSimulacao();
    const r = Calculo.calcular({ unidades, colaboradores: Store.colaboradores.list(), parametros: p, janela, simulacoes });
    const alvo = unidadeSel ? r.unidades.find(u => u.id === unidadeSel) : r.total;
    const titulo = unidadeSel ? alvo.nome : 'Todas as unidades';
    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const PLURAL = { [TEC]: 'técnicos', [ADM]: 'administrativos' };

    const celula = (b, e) => `<td class="num cel-${b.status}" title="${e.rotulo}: consegue ${Programacao.num(b.consegue)}, precisa ${Programacao.num(b.precisa)}">
        <strong>${Programacao.num(b.consegue)}</strong><small> de ${Programacao.num(b.precisa)}</small></td>`;

    /** Grade de um grupo (técnicos ou administrativos): tabela mês a mês + leitura + grade unidade × mês. */
    const gradeGrupo = f => {
      const entregas = Calculo.ENTREGAS_DA_FUNCAO[f];
      const singular = Calculo.FUNCAO_SINGULAR[f];
      const resumo = alvo.janela.funcoes[f];
      return `
      <section class="card grade-grupo ${Programacao.classeLinha(resumo.status)}">
        <div class="card-head">
          <div>
            <h2>${Calculo.FUNCAO_CURTA[f]}</h2>
            <div class="muted">${Programacao.pessoasTexto(alvo.pessoas[f], alvo.pessoasSimuladas[f], PLURAL[f])} · ${UI.esc(titulo)} · ${Programacao.descricaoJanela(janela)}</div>
          </div>
          ${Programacao.statusChip(resumo.status)}
        </div>
        <div class="table-wrap">
          <table class="table table-prog">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num">Dias úteis</th>
                <th class="num" title="Empresas que precisam de atendimento no mês (vencendo e a vencer, com o peso de cada situação)">Precisam</th>
                <th class="num" title="Pessoas do grupo contadas no mês (com a simulação, se houver)">Equipe</th>
                ${entregas.map(e => `<th class="num">${e.rotulo}</th>`).join('')}
                <th class="num th-pessoas" title="Quantas pessoas contratar (ou quantas sobram) para dar conta do mês">Contratar / sobra</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              ${alvo.meses.map(m => `
                <tr class="${Programacao.classeLinha(m.funcoes[f].status)}">
                  <td>${m.nomeLongo}</td>
                  <td class="num">${m.diasUteis}</td>
                  <td class="num">${Programacao.num(m.precisa)}${m.excecao ? ' <span class="chip chip-blue" title="Quantidade própria deste mês">mês</span>' : ''}</td>
                  <td class="num">${Programacao.numFte(m.pessoas[f])}</td>
                  ${entregas.map(e => celula(m.entregas[e.id], e)).join('')}
                  <td class="num col-pessoas">${Programacao.pessoasHTML(m.funcoes[f], singular)}</td>
                  <td>${Programacao.statusChip(m.funcoes[f].status)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="${Programacao.classeLinha(resumo.status)}">
                <th>Período (${alvo.janela.nMeses} ${alvo.janela.nMeses === 1 ? 'mês' : 'meses'})</th>
                <th class="num">${alvo.meses.reduce((s, m) => s + m.diasUteis, 0)}</th>
                <th class="num">${Programacao.num(alvo.janela.precisa)}</th>
                <th class="num" title="Média do período">${Programacao.numFte(resumo.pessoas)}</th>
                ${entregas.map(e => { const b = alvo.janela.entregas[e.id]; return `<th class="num cel-${b.status}">${Programacao.num(b.consegue)}<small> de ${Programacao.num(b.precisa)}</small></th>`; }).join('')}
                <th class="num col-pessoas" title="No período inteiro; para não faltar em nenhum mês, vale o maior valor mensal">${Programacao.pessoasHTML(resumo, singular)}</th>
                <th>${Programacao.statusChip(resumo.status)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="frases-resumo">
          <p class="rec-linha">${Programacao.statusDot(resumo.status)} ${Programacao.recomendacaoHTML(resumo.recomendacao)} ${ViewProgramacaoMensal.leituraMensal(alvo.meses, f)}</p>
        </div>

        ${!unidadeSel && r.unidades.length > 1 ? `
        <div class="card-head sub-head">
          <h3>${Calculo.FUNCAO_CURTA[f]} por unidade e mês</h3>
          <span class="muted">clique numa unidade para ver o detalhe</span>
        </div>
        <div class="table-wrap">
          <table class="table table-grade">
            <thead>
              <tr>
                <th>Unidade</th>
                <th class="num" title="Pessoas do grupo na unidade">Equipe</th>
                ${alvo.meses.map(m => `<th class="num">${m.nome}</th>`).join('')}
                <th class="num">Período</th>
              </tr>
            </thead>
            <tbody>
              ${r.unidades.map(u => `
                <tr>
                  <td><button type="button" class="btn-link" data-action="ver-unidade" data-id="${u.id}">${UI.esc(u.nome)}</button></td>
                  <td class="num">${Programacao.pessoasTexto(u.pessoas[f], u.pessoasSimuladas[f], '')}</td>
                  ${u.meses.map(m => `<td class="num">${Programacao.statusDot(m.funcoes[f].status, `${m.nomeLongo}: ${PLURAL[f]} dão conta de ${Programacao.num(m.funcoes[f].atendeEmpresas)} de ${Programacao.num(m.precisa)} empresas · ${ViewProgramacaoMensal.textoPessoas(m.funcoes[f], singular)}`)}</td>`).join('')}
                  <td class="num">${Programacao.pessoasHTML(u.janela.funcoes[f], singular)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </section>`;
    };

    el.innerHTML = `
      <header class="page-header">
        <h1>Programação Mensal</h1>
        <p>Mês a mês, para técnicos e para administrativos: quanto a equipe consegue entregar, quanto a carteira precisa e quantas pessoas contratar (ou quantas sobram) em cada mês. Em cada célula de entrega, o primeiro número é o que a equipe consegue e o segundo o que precisa.</p>
      </header>

      ${Programacao.barraHTML({ janela, ocupacaoAlvo: p.ocupacaoAlvo, unidades, unidadeSel })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a programação.</div></section>` : `

      ${Programacao.simulacaoHTML({ unidades, janela })}

      <section class="card resumo-prog">
        <div class="card-head">
          <div>
            <h2>${UI.esc(titulo)} · ${Programacao.descricaoJanela(janela)}</h2>
            <div class="linha-chefia">${Programacao.chefiaHTML(alvo.chefia)}</div>
          </div>
          <div class="right">
            <span class="muted">${Programacao.pessoasTexto(alvo.pessoas[TEC], alvo.pessoasSimuladas[TEC], 'técnicos')} · ${Programacao.pessoasTexto(alvo.pessoas[ADM], alvo.pessoasSimuladas[ADM], 'administrativos')}</span>
            ${Programacao.statusChip(alvo.janela.status)}
          </div>
        </div>
        ${Programacao.legendaHTML()}
      </section>

      <div class="grade-grupos">
        ${gradeGrupo(TEC)}
        ${gradeGrupo(ADM)}
      </div>

      ${Programacao.avisosHTML(r.avisos)}
      `}
    `;

    el.querySelectorAll('[data-action="ver-unidade"]').forEach(btn => btn.addEventListener('click', () => {
      Programacao.salvarFiltros({ ...Programacao.lerFiltros(), unidade: btn.dataset.id });
      App.render();
    }));

    Programacao.bindBarra(el, {
      onJanela: () => App.render(),
      onUnidade: id => { Programacao.salvarFiltros({ ...Programacao.lerFiltros(), unidade: id }); App.render(); },
    });
    Programacao.bindSimulacao(el, { unidades, janela, unidadeSel });
  },
};
