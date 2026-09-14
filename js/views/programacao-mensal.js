/* ==========================================================================
   Tela: Programação Mensal — mês a mês, capacidade × demanda × gap
   (por unidade ou consolidado), com destaque visual de status.
   ========================================================================== */

const ViewProgramacaoMensal = {
  id: 'programacao-mensal',
  title: 'Programação Mensal',

  render(el) {
    const janela = Programacao.lerJanela();
    const filtros = Programacao.lerFiltros();
    const unidades = Store.unidades.list();
    const unidadeSel = unidades.some(u => u.id === filtros.unidade) ? filtros.unidade : '';
    const funcaoSel = Calculo.FUNCOES.includes(filtros.funcao) ? filtros.funcao : '';
    const p = Store.parametros.get();

    const r = Calculo.calcular({
      unidades, documentos: Store.documentos.list(), colaboradores: Store.colaboradores.list(), parametros: p, janela,
    });

    const alvo = unidadeSel ? r.unidades.find(u => u.id === unidadeSel) : r.total;
    const tituloAlvo = unidadeSel ? alvo.nome : 'Todas as unidades';
    const rotuloFuncao = funcaoSel ? Calculo.FUNCAO_CURTA[funcaoSel] : 'Total';
    const bj = Programacao.blocoDe(alvo.janela, funcaoSel);

    el.innerHTML = `
      <header class="page-header">
        <h1>Programação Mensal</h1>
        <p>Capacidade de produção e demanda de documentos mês a mês. O gap é calculado sobre a capacidade planejável (${UI.fmt(p.ocupacaoAlvo, 0)}% da capacidade nominal) e convertido em número de colaboradores pela capacidade média da equipe.</p>
      </header>

      ${Programacao.barraHTML({ janela, ocupacaoAlvo: p.ocupacaoAlvo, unidades, unidadeSel, funcaoSel })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a programação.</div></section>` : `

      <div class="stats">
        <div class="stat"><div class="label">Capacidade na janela</div><div class="value">${Programacao.fmtH(bj.capacidade)}<small>h</small></div></div>
        <div class="stat"><div class="label">Demanda na janela</div><div class="value">${Programacao.fmtH(bj.demanda)}<small>h</small></div></div>
        <div class="stat"><div class="label">Gap</div><div class="value ${bj.status === 'deficit' ? 'neg' : ''}">${Programacao.fmtGap(bj.gap)}<small>h</small></div></div>
        <div class="stat"><div class="label">Ocupação</div><div class="value">${Programacao.fmtPct(bj.ocupacao)}</div></div>
        <div class="stat"><div class="label">Situação</div><div class="value value-status">${Programacao.statusChip(bj.status)}</div></div>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>${UI.esc(tituloAlvo)} · ${rotuloFuncao} · ${Programacao.descricaoJanela(janela)}</h2>
          <span class="muted">${Programacao.fmtFte(bj.colaboradores)} colaborador${bj.colaboradores === 1 ? '' : 'es'} (FTE) alocado${bj.colaboradores === 1 ? '' : 's'}</span>
        </div>
        <div class="table-wrap">
          <table class="table table-prog">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num">Dias úteis</th>
                <th class="num" title="Empresas-cliente no mês (ponderadas pelos fatores de grau)">Empresas</th>
                <th class="num">Capacidade (h)</th>
                <th class="num">Demanda (h)</th>
                <th class="num">Ocupação</th>
                <th class="num">Gap (h)</th>
                <th class="num" title="Gap ÷ capacidade média por colaborador">Gap (colab.)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${alvo.meses.map(m => {
                const b = Programacao.blocoDe(m, funcaoSel);
                return `
                  <tr class="${Programacao.classeLinha(b.status)}">
                    <td>${m.nomeLongo}</td>
                    <td class="num">${m.diasUteis}</td>
                    <td class="num">${m.empresas} <span class="muted">(${UI.fmt(m.empresasPonderadas, 1)})</span>${m.empresasExcecao ? ' <span class="chip chip-blue" title="Quantidade específica deste mês">mês</span>' : ''}</td>
                    <td class="num">${Programacao.fmtH(b.capacidade)}</td>
                    <td class="num">${Programacao.fmtH(b.demanda)}</td>
                    <td class="num">${Programacao.fmtPct(b.ocupacao)}</td>
                    <td class="num">${Programacao.fmtGap(b.gap)}</td>
                    <td class="num">${Programacao.fmtColab(b.gapColab)}</td>
                    <td>${Programacao.statusChip(b.status)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="${Programacao.classeLinha(bj.status)}">
                <th>Janela (${alvo.meses.length} ${alvo.meses.length === 1 ? 'mês' : 'meses'})</th>
                <th class="num">${alvo.meses.reduce((s, m) => s + m.diasUteis, 0)}</th>
                <th class="num" title="Média na janela">${Programacao.fmtFte(alvo.meses.reduce((s, m) => s + m.empresas, 0) / Math.max(1, alvo.meses.length))} <span class="muted">(${UI.fmt(alvo.meses.reduce((s, m) => s + m.empresasPonderadas, 0) / Math.max(1, alvo.meses.length), 1)})</span></th>
                <th class="num">${Programacao.fmtH(bj.capacidade)}</th>
                <th class="num">${Programacao.fmtH(bj.demanda)}</th>
                <th class="num">${Programacao.fmtPct(bj.ocupacao)}</th>
                <th class="num">${Programacao.fmtGap(bj.gap)}</th>
                <th class="num">${Programacao.fmtColab(bj.gapColab)}</th>
                <th>${Programacao.statusChip(bj.status)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        ${Programacao.legendaHTML()}
      </section>

      ${!unidadeSel && r.unidades.length > 1 ? `
      <section class="card">
        <div class="card-head">
          <h2>Gap por unidade × mês (h)</h2>
          <span class="muted">${rotuloFuncao}</span>
        </div>
        <div class="table-wrap">
          <table class="table table-grade">
            <thead>
              <tr>
                <th>Unidade</th>
                ${alvo.meses.map(m => `<th class="num">${m.nome}</th>`).join('')}
                <th class="num">Janela</th>
              </tr>
            </thead>
            <tbody>
              ${r.unidades.map(u => `
                <tr>
                  <td>${UI.esc(u.nome)}</td>
                  ${u.meses.map(m => { const b = Programacao.blocoDe(m, funcaoSel); return `<td class="num cel-${b.status}" title="${m.nomeLongo}: capacidade ${Programacao.fmtH(b.capacidade)} h · demanda ${Programacao.fmtH(b.demanda)} h">${Programacao.fmtGap(b.gap)}</td>`; }).join('')}
                  ${(() => { const b = Programacao.blocoDe(u.janela, funcaoSel); return `<td class="num cel-${b.status}"><strong>${Programacao.fmtGap(b.gap)}</strong></td>`; })()}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>` : ''}

      ${Programacao.avisosHTML(r.avisos)}
      `}
    `;

    Programacao.bindBarra(el, {
      onJanela: () => App.render(),
      onUnidade: id => { Programacao.salvarFiltros({ ...Programacao.lerFiltros(), unidade: id }); App.render(); },
      onFuncao: f => { Programacao.salvarFiltros({ ...Programacao.lerFiltros(), funcao: f }); App.render(); },
    });
  },
};
