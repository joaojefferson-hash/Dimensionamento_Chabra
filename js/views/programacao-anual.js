/* ==========================================================================
   Tela: Programação Anual — consolidado da janela por unidade, com
   recomendação final (contratar / adequado / capacidade ociosa), detalhe por
   função, demanda por documento e capacidade nominal por colaborador.
   ========================================================================== */

const ViewProgramacaoAnual = {
  id: 'programacao-anual',
  title: 'Programação Anual',

  render(el) {
    const janela = Programacao.lerJanela();
    const filtros = Programacao.lerFiltros();
    const funcaoSel = Calculo.FUNCOES.includes(filtros.funcao) ? filtros.funcao : '';
    const p = Store.parametros.get();
    const unidades = Store.unidades.list();
    const documentos = Store.documentos.list();
    const colaboradores = Store.colaboradores.list();

    const r = Calculo.calcular({ unidades, documentos, colaboradores, parametros: p, janela });
    const bt = Programacao.blocoDe(r.total.janela, funcaoSel);
    const rotuloFuncao = funcaoSel ? Calculo.FUNCAO_CURTA[funcaoSel] : 'Total';
    const fracaoAno = r.janela.meses.length / 12;

    // demanda por documento na janela (todas as unidades)
    const porDoc = documentos.map(d => {
      const anual = unidades.reduce((s, u) => s + Calculo.demandaAnualDoc(u, d, p), 0);
      return { ...d, demandaJanela: anual * fracaoAno, sobDemanda: d.periodicidadeMeses <= 0 };
    }).sort((a, b) => b.demandaJanela - a.demandaJanela);
    const totalDoc = porDoc.reduce((s, d) => s + d.demandaJanela, 0);


    el.innerHTML = `
      <header class="page-header">
        <h1>Programação Anual</h1>
        <p>Consolidado da janela por unidade: a equipe alocada dá conta da carteira de empresas? Recomendação calculada sobre ${UI.fmt(p.ocupacaoAlvo, 0)}% da capacidade nominal (ocupação-alvo).</p>
      </header>

      ${Programacao.barraHTML({ janela, ocupacaoAlvo: p.ocupacaoAlvo, funcaoSel })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a programação.</div></section>` : `

      <div class="stats">
        <div class="stat"><div class="label">Capacidade · ${Programacao.descricaoJanela(janela)}</div><div class="value">${Programacao.fmtH(bt.capacidade)}<small>h</small></div></div>
        <div class="stat"><div class="label">Demanda</div><div class="value">${Programacao.fmtH(bt.demanda)}<small>h</small></div></div>
        <div class="stat"><div class="label">Gap</div><div class="value ${bt.status === 'deficit' ? 'neg' : ''}">${Programacao.fmtGap(bt.gap)}<small>h</small></div></div>
        <div class="stat"><div class="label">Ocupação</div><div class="value">${Programacao.fmtPct(bt.ocupacao)}</div></div>
        <div class="stat stat-wide"><div class="label">Recomendação geral · ${rotuloFuncao}</div><div class="value value-status">${Programacao.recomendacaoHTML(r.total.janela, funcaoSel)}</div></div>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Por unidade · ${rotuloFuncao} · ${Programacao.descricaoJanela(janela)}</h2>
          <span class="muted">${UI.plural(r.unidades.length, 'unidade', 'unidades')}</span>
        </div>
        <div class="table-wrap">
          <table class="table table-prog">
            <thead>
              <tr>
                <th>Unidade</th>
                <th class="num" title="Total de empresas (ponderadas pelos fatores de grau)">Empresas</th>
                <th class="num" title="Colaboradores equivalentes (soma dos percentuais alocados)">Colab. (FTE)</th>
                <th class="num">Capacidade (h)</th>
                <th class="num">Demanda (h)</th>
                <th class="num">Ocupação</th>
                <th class="num">Gap (h)</th>
                <th class="num" title="Gap ÷ capacidade média por colaborador (na visão Total, média mista da unidade)">Gap (colab.)</th>
                <th>Status</th>
                <th title="Na visão Total, combinação das necessidades por função">Recomendação</th>
              </tr>
            </thead>
            <tbody>
              ${r.unidades.map(u => {
                const b = Programacao.blocoDe(u.janela, funcaoSel);
                return `
                  <tr class="${Programacao.classeLinha(b.status)}">
                    <td>${UI.esc(u.nome)}</td>
                    <td class="num">${u.empresas} <span class="muted">(${UI.fmt(u.empresasPonderadas, 1)})</span></td>
                    <td class="num">${Programacao.fmtFte(b.colaboradores)}</td>
                    <td class="num">${Programacao.fmtH(b.capacidade)}</td>
                    <td class="num">${Programacao.fmtH(b.demanda)}</td>
                    <td class="num">${Programacao.fmtPct(b.ocupacao)}</td>
                    <td class="num">${Programacao.fmtGap(b.gap)}</td>
                    <td class="num">${Programacao.fmtColab(b.gapColab)}</td>
                    <td>${Programacao.statusChip(b.status)}</td>
                    <td>${Programacao.recomendacaoHTML(u.janela, funcaoSel)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="${Programacao.classeLinha(bt.status)}">
                <th>Total</th>
                <th class="num">${r.unidades.reduce((s, u) => s + u.empresas, 0)} <span class="muted">(${UI.fmt(r.unidades.reduce((s, u) => s + u.empresasPonderadas, 0), 1)})</span></th>
                <th class="num">${Programacao.fmtFte(bt.colaboradores)}</th>
                <th class="num">${Programacao.fmtH(bt.capacidade)}</th>
                <th class="num">${Programacao.fmtH(bt.demanda)}</th>
                <th class="num">${Programacao.fmtPct(bt.ocupacao)}</th>
                <th class="num">${Programacao.fmtGap(bt.gap)}</th>
                <th class="num">${Programacao.fmtColab(bt.gapColab)}</th>
                <th>${Programacao.statusChip(bt.status)}</th>
                <th>${Programacao.recomendacaoHTML(r.total.janela, funcaoSel)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        ${Programacao.legendaHTML()}
      </section>

      ${!funcaoSel ? `
      <section class="card">
        <div class="card-head">
          <h2>Recomendação por função</h2>
          <span class="muted">Técnicos produzem os documentos marcados como "Técnico de SST"; administrativos, os marcados como "Administrativo"</span>
        </div>
        <div class="table-wrap">
          <table class="table table-prog">
            <thead>
              <tr>
                <th>Unidade</th>
                ${Calculo.FUNCOES.map(f => `<th colspan="3" class="th-group">${Calculo.FUNCAO_CURTA[f]}</th>`).join('')}
              </tr>
              <tr class="sub">
                <th></th>
                ${Calculo.FUNCOES.map(() => '<th class="num">FTE</th><th class="num">Gap (h)</th><th>Recomendação</th>').join('')}
              </tr>
            </thead>
            <tbody>
              ${[...r.unidades, { nome: 'Total', janela: r.total.janela, total: true }].map(u => `
                <tr class="${u.total ? 'row-total' : ''}">
                  <td>${u.total ? '<strong>Total</strong>' : UI.esc(u.nome)}</td>
                  ${Calculo.FUNCOES.map(f => { const b = u.janela.porFuncao[f]; return `
                    <td class="num">${Programacao.fmtFte(b.colaboradores)}</td>
                    <td class="num cel-${b.status}">${Programacao.fmtGap(b.gap)}</td>
                    <td>${Programacao.recomendacaoHTML(u.janela, f)}</td>`; }).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}

      ${Programacao.avisosHTML(r.avisos)}

      <section class="card">
        <div class="card-head">
          <h2>Demanda por documento · ${Programacao.descricaoJanela(janela)}</h2>
          <span class="muted">todas as unidades</span>
        </div>
        ${porDoc.length === 0 ? '<div class="empty">Nenhum documento no catálogo.</div>' : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Documento</th><th>Produzido por</th><th class="num">Demanda (h)</th><th class="num">%</th><th class="barra-col"></th></tr>
            </thead>
            <tbody>
              ${porDoc.map(d => `
                <tr>
                  <td>${UI.esc(d.nome)}${d.sobDemanda ? ' <span class="chip chip-gray">sob demanda · fora do cálculo</span>' : ''}</td>
                  <td>${d.responsavel === Calculo.FUNCOES[1] ? 'Administrativo' : 'Técnico de SST'}</td>
                  <td class="num">${Programacao.fmtH(d.demandaJanela)}</td>
                  <td class="num">${totalDoc > 0 ? UI.fmt(d.demandaJanela / totalDoc * 100, 0) + '%' : '—'}</td>
                  <td class="barra-col"><div class="barra"><div class="barra-fill" style="width:${totalDoc > 0 ? Math.round(d.demandaJanela / totalDoc * 100) : 0}%"></div></div></td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr><th colspan="2">Total</th><th class="num">${Programacao.fmtH(totalDoc)}</th><th class="num">100%</th><th></th></tr></tfoot>
          </table>
        </div>`}
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Capacidade nominal por colaborador</h2>
          <span class="muted">produtividade individual = capacidade nominal (sem apontamento de produção real nesta fase)</span>
        </div>
        ${colaboradores.length === 0 ? '<div class="empty">Nenhum colaborador cadastrado.</div>' : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Colaborador</th><th>Função</th><th>Alocação</th>
                <th class="num" title="Capacidade mensal ÷ dias úteis de referência (${p.diasReferencia})">Horas/dia</th>
                <th class="num">Horas efetivas/mês</th>
                <th class="num">Capacidade na janela (h)</th>
              </tr>
            </thead>
            <tbody>
              ${colaboradores.map(c => {
                const nominal = { horasDia: Calculo.horasDia(c, p), capJanela: r.janela.meses.reduce((s, m) => s + Calculo.capacidadeMes(c, m, p), 0) };
                const totalAloc = Store.totalAlocado(c);
                return `
                  <tr>
                    <td>${UI.esc(c.nome)}</td>
                    <td>${c.funcao === Calculo.FUNCOES[1] ? 'Administrativo' : 'Técnico de SST'}</td>
                    <td>${totalAloc > 0 ? UI.esc(Store.descricaoAlocacoes(c)) : '<span class="chip chip-warn">sem unidade</span>'}</td>
                    <td class="num">${Programacao.fmtH1(nominal.horasDia)}</td>
                    <td class="num">${Programacao.fmtH(c.horasMes * c.eficiencia / 100)}</td>
                    <td class="num">${Programacao.fmtH(nominal.capJanela)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </section>
      `}
    `;

    Programacao.bindBarra(el, {
      onJanela: () => App.render(),
      onFuncao: f => { Programacao.salvarFiltros({ ...Programacao.lerFiltros(), funcao: f }); App.render(); },
    });
  },
};
