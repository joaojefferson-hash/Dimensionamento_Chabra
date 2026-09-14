/* ==========================================================================
   Tela: Programação Mensal — mês a mês, o que a equipe consegue e o que a
   carteira precisa (por unidade ou todas), com sinal de situação. Também a
   grade unidade × mês só com os sinais.
   ========================================================================== */

const ViewProgramacaoMensal = {
  id: 'programacao-mensal',
  title: 'Programação Mensal',

  render(el) {
    const janela = Programacao.lerJanela();
    const filtros = Programacao.lerFiltros();
    const unidades = Store.unidades.list();
    const unidadeSel = unidades.some(u => u.id === filtros.unidade) ? filtros.unidade : '';
    const p = Store.parametros.get();
    const r = Calculo.calcular({ unidades, colaboradores: Store.colaboradores.list(), parametros: p, janela });
    const alvo = unidadeSel ? r.unidades.find(u => u.id === unidadeSel) : r.total;
    const titulo = unidadeSel ? alvo.nome : 'Todas as unidades';
    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const ENT = Calculo.ENTREGAS;

    const celula = (b, e) => `<td class="num cel-${b.status}" title="${e.rotulo}: consegue ${Programacao.num(b.consegue)}, precisa ${Programacao.num(b.precisa)}">
        <strong>${Programacao.num(b.consegue)}</strong><small> de ${Programacao.num(b.precisa)}</small></td>`;

    el.innerHTML = `
      <header class="page-header">
        <h1>Programação Mensal</h1>
        <p>Mês a mês: quanto a equipe consegue entregar e quanto a carteira precisa. Em cada célula, o primeiro número é o que a equipe consegue e o segundo o que precisa.</p>
      </header>

      ${Programacao.barraHTML({ janela, ocupacaoAlvo: p.ocupacaoAlvo, unidades, unidadeSel })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a programação.</div></section>` : `

      <section class="card">
        <div class="card-head">
          <div>
            <h2>${UI.esc(titulo)} · ${Programacao.descricaoJanela(janela)}</h2>
            <div class="linha-chefia">${Programacao.chefiaHTML(alvo.chefia)}</div>
          </div>
          <div class="right">
            <span class="muted">${Programacao.numFte(alvo.pessoas[TEC])} técnicos · ${Programacao.numFte(alvo.pessoas[ADM])} administrativos</span>
            ${Programacao.statusChip(alvo.janela.status)}
          </div>
        </div>
        <div class="table-wrap">
          <table class="table table-prog">
            <thead>
              <tr>
                <th rowspan="2">Mês</th>
                <th rowspan="2" class="num">Dias úteis</th>
                <th rowspan="2" class="num" title="Empresas que precisam de atendimento no mês (vencendo e a vencer, com o peso de cada situação)">Precisam</th>
                <th colspan="2" class="th-group">Técnicos</th>
                <th class="th-group">Administrativos</th>
                <th rowspan="2">Situação</th>
              </tr>
              <tr class="sub">
                ${ENT.map(e => `<th class="num">${e.rotulo}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${alvo.meses.map(m => `
                <tr class="${Programacao.classeLinha(m.status)}">
                  <td>${m.nomeLongo}</td>
                  <td class="num">${m.diasUteis}</td>
                  <td class="num">${Programacao.num(m.precisa)}${m.excecao ? ' <span class="chip chip-blue" title="Quantidade própria deste mês">mês</span>' : ''}</td>
                  ${ENT.map(e => celula(m.entregas[e.id], e)).join('')}
                  <td>${Programacao.statusChip(m.status)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="${Programacao.classeLinha(alvo.janela.status)}">
                <th>Período (${alvo.janela.nMeses} ${alvo.janela.nMeses === 1 ? 'mês' : 'meses'})</th>
                <th class="num">${alvo.meses.reduce((s, m) => s + m.diasUteis, 0)}</th>
                <th class="num">${Programacao.num(alvo.janela.precisa)}</th>
                ${ENT.map(e => { const b = alvo.janela.entregas[e.id]; return `<th class="num cel-${b.status}">${Programacao.num(b.consegue)}<small> de ${Programacao.num(b.precisa)}</small></th>`; }).join('')}
                <th>${Programacao.statusChip(alvo.janela.status)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="frases-resumo">
          ${[TEC, ADM].map(f => `<p class="rec-linha">${Programacao.statusDot(alvo.janela.funcoes[f].status)} ${Programacao.recomendacaoHTML(alvo.janela.funcoes[f].recomendacao)}</p>`).join('')}
        </div>
        ${Programacao.legendaHTML()}
      </section>

      ${!unidadeSel && r.unidades.length > 1 ? `
      <section class="card">
        <div class="card-head">
          <h2>Situação por unidade e mês</h2>
          <span class="muted">clique numa unidade para ver o detalhe</span>
        </div>
        <div class="table-wrap">
          <table class="table table-grade">
            <thead>
              <tr>
                <th>Unidade</th>
                ${alvo.meses.map(m => `<th class="num">${m.nome}</th>`).join('')}
                <th class="num">Período</th>
              </tr>
            </thead>
            <tbody>
              ${r.unidades.map(u => `
                <tr>
                  <td><button type="button" class="btn-link" data-action="ver-unidade" data-id="${u.id}">${UI.esc(u.nome)}</button></td>
                  ${u.meses.map(m => `<td class="num">${Programacao.statusDot(m.status, `${m.nomeLongo}: técnicos ${Programacao.num(m.funcoes[TEC].atendeEmpresas)} / administrativos ${Programacao.num(m.funcoes[ADM].atendeEmpresas)} de ${Programacao.num(m.precisa)} empresas`)}</td>`).join('')}
                  <td class="num">${Programacao.statusChip(u.janela.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}

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
  },
};
