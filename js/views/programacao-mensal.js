/* ==========================================================================
   Tela: Programação Mensal — mês a mês, o que a equipe consegue e o que a
   carteira precisa (por unidade ou todas), com sinal de situação e quantas
   pessoas contratar (ou quantas sobram) em cada mês.

   Os meses que já passaram (antes do "mês atual", o mesmo da Fila) viram o
   HISTÓRICO DE PROJEÇÃO: com a equipe de hoje, em cada mês deveria ter
   contratado? Em qual área (técnicos / administrativos)? Do mês atual em
   diante é o PLANO: técnicos e administrativos em grades separadas, cada uma
   com a sua tabela mês a mês, a leitura em frases e a grade unidade × mês.
   O card "E se…?" permite simular pessoas a mais ou a menos (só no navegador)
   — inclusive a partir de um mês passado, para testar o histórico.
   ========================================================================== */

const ViewProgramacaoMensal = {
  id: 'programacao-mensal',
  title: 'Programação Mensal',

  /** "faltam 2 técnicos" / "sobram 3 administrativos" / "técnicos ok" (texto puro, para tooltips). */
  textoPessoas(resumo, singular) {
    const plural = q => (q === 1 ? singular : singular + 's');
    if (resumo.faltam > 0) return `${resumo.faltam === 1 ? 'falta' : 'faltam'} ${resumo.faltam} ${plural(resumo.faltam)}`;
    if (resumo.sobram > 0) return `${resumo.sobram === 1 ? 'sobra' : 'sobram'} ${resumo.sobram} ${plural(resumo.sobram)}`;
    return `${singular}s ok`;
  },

  /** Conclusão de um mês passado: "Deveria ter contratado 1 técnico e 2 administrativos" / "Não precisava contratar". */
  conclusaoMes(m) {
    const partes = [Calculo.TEC, Calculo.ADM].map(f => {
      const q = m.funcoes[f].faltam;
      return q > 0 ? `${q} ${q === 1 ? Calculo.FUNCAO_SINGULAR[f] : Calculo.FUNCAO_SINGULAR[f] + 's'}` : null;
    }).filter(Boolean);
    return partes.length
      ? { precisava: true, html: `<strong class="txt-deficit">Deveria ter contratado ${partes.join(' e ')}</strong>` }
      : { precisava: false, html: `<span class="txt-ok">Não precisava contratar</span>` };
  },

  /**
   * Leitura mês a mês de uma função, sempre em relação à equipe de hoje (não acumula):
   * "Mês a mês: faltam 2 em setembro, outubro e novembro; sobra 1 em dezembro.
   *  Contratando 2 administrativos a partir de setembro, nenhum mês do ano fica descoberto."
   * Vazio quando todos os meses estão ok.
   */
  leituraMensal(meses, funcao) {
    const singular = Calculo.FUNCAO_SINGULAR[funcao];
    const plural = q => (q === 1 ? singular : singular + 's');
    const grupos = new Map(); // "falta 2" → [meses]
    let pico = 0, primeiroComFalta = null;
    meses.forEach(m => {
      const r = m.funcoes[funcao];
      const chave = r.faltam > 0 ? `falta ${r.faltam}` : r.sobram > 0 ? `sobra ${r.sobram}` : null;
      if (r.faltam > pico) pico = r.faltam;
      if (r.faltam > 0 && !primeiroComFalta) primeiroComFalta = m.nomeLongo.toLowerCase();
      if (!chave) return;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(m.nomeLongo.toLowerCase());
    });
    if (!grupos.size) return '';
    const lista = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0]);
    const partes = [...grupos.entries()].map(([chave, l]) => {
      const [tipo, q] = chave.split(' ');
      const n = Number(q);
      return `${tipo === 'sobra' ? (n === 1 ? 'sobra' : 'sobram') : (n === 1 ? 'falta' : 'faltam')} ${n} ${plural(n)} em ${lista(l)}`;
    });
    const conclusao = pico > 0
      ? ` <strong>Contratando ${pico} ${plural(pico)} a partir de ${primeiroComFalta}, nenhum mês até dezembro fica descoberto</strong> — os números de cada mês são em relação à equipe de hoje e não somam entre si.`
      : '';
    return `<span class="muted">Mês a mês: ${partes.join('; ')}.${conclusao}</span>`;
  },

  render(el) {
    const janelaAno = { de: 0, ate: 11 };
    const mesAtual = Programacao.lerMesAtual(); // o mesmo "mês atual" da Fila e da coluna Acumulado
    const janela = { de: mesAtual, ate: 11 };   // plano: do mês atual em diante (sem seletor de período na mensal)
    const filtros = Programacao.lerFiltros();
    const unidades = Store.unidades.list();
    const unidadeSel = unidades.some(u => u.id === filtros.unidade) ? filtros.unidade : '';
    const p = Store.parametros.get();
    const simulacoes = Programacao.lerSimulacao();
    const colaboradores = Store.colaboradores.list();
    const rAno = Calculo.calcular({ unidades, colaboradores, parametros: p, janela: janelaAno, simulacoes }); // histórico (meses passados)
    const r = mesAtual === 0 ? rAno : Calculo.calcular({ unidades, colaboradores, parametros: p, janela, simulacoes }); // plano
    const alvo = unidadeSel ? r.unidades.find(u => u.id === unidadeSel) : r.total;
    const alvoAno = unidadeSel ? rAno.unidades.find(u => u.id === unidadeSel) : rAno.total;
    const passados = alvoAno.meses.filter(m => m.mes < mesAtual);
    const titulo = unidadeSel ? alvo.nome : 'Todas as unidades';
    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const PLURAL = { [TEC]: 'técnicos', [ADM]: 'administrativos' };
    const singularOuPlural = (f, q) => `${q} ${q === 1 ? Calculo.FUNCAO_SINGULAR[f] : Calculo.FUNCAO_SINGULAR[f] + 's'}`;
    const lista = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0]);

    /** Histórico de projeção: meses antes do mês atual — deveria ter contratado? em qual área? (com a equipe de hoje) */
    const historicoHTML = () => {
      if (!passados.length) return '';
      const de = passados[0].nomeLongo.toLowerCase(), ate = passados[passados.length - 1].nomeLongo.toLowerCase();
      const rotulo = passados.length === 1 ? de : `${de} a ${ate}`;
      const porGrupo = [TEC, ADM].map(f => {
        const meses = passados.filter(m => m.funcoes[f].faltam > 0);
        return { f, meses, pico: Math.max(0, ...meses.map(m => m.funcoes[f].faltam)) };
      });
      const mesesComFalta = passados.filter(m => ViewProgramacaoMensal.conclusaoMes(m).precisava);
      const frase = !mesesComFalta.length
        ? `De ${rotulo}, com a equipe de hoje, a equipe dava conta em todos os meses — <strong class="txt-ok">não precisava contratar</strong>.`
        : `De ${rotulo}, com a equipe de hoje, <strong class="txt-deficit">precisava contratar em ${mesesComFalta.length} de ${passados.length} ${passados.length === 1 ? 'mês' : 'meses'}</strong>: ${porGrupo.filter(g => g.meses.length).map(g => `<strong>${PLURAL[g.f]}</strong> em ${lista(g.meses.map(m => m.nomeLongo.toLowerCase()))} (no máximo ${singularOuPlural(g.f, g.pico)} num mês)`).join('; ')}.${mesesComFalta.length < passados.length ? ' Nos outros meses a equipe dava conta.' : ''}`;
      // com todas as unidades: onde faltava, em cada mês
      const ondeHTML = m => {
        if (unidadeSel || rAno.unidades.length < 2) return '';
        const l = rAno.unidades.map(u => {
          const mu = u.meses[m.mes];
          const partes = [TEC, ADM].map(f => (mu.funcoes[f].faltam > 0 ? singularOuPlural(f, mu.funcoes[f].faltam) : null)).filter(Boolean);
          return partes.length ? `${UI.esc(u.nome)} (${partes.join(', ')})` : null;
        }).filter(Boolean);
        return l.length ? `<div class="muted onde">${l.join(' · ')}</div>` : '';
      };
      const celGrupo = (m, f) => {
        const g = m.funcoes[f];
        return `<td class="num cel-${g.status}" title="${m.nomeLongo}: ${PLURAL[f]} dão conta de ${Programacao.num(g.atendeEmpresas)} de ${Programacao.num(m.precisa)} empresas · ${ViewProgramacaoMensal.textoPessoas(g, Calculo.FUNCAO_SINGULAR[f])}"><strong>${Programacao.num(g.atendeEmpresas)}</strong><small> de ${Programacao.num(m.precisa)}</small><div class="col-pessoas">${Programacao.pessoasHTML(g, Calculo.FUNCAO_SINGULAR[f])}</div></td>`;
      };
      return `
      <section class="card historico-projecao">
        <div class="card-head">
          <div>
            <h2>Histórico de projeção · ${rotulo}</h2>
            <div class="muted">Em cada mês que já passou: com a equipe de hoje, deveria ter contratado? Em qual área? · ${UI.esc(titulo)}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table table-prog table-historico">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num" title="Clientes Mensal + Exclusiva TST que venceram no mês">Vencem</th>
                <th class="num" title="Empresas que os técnicos dariam conta no mês (o que limita: a menor entre inspeções e relatórios) e quantos faltavam ou sobravam">Técnicos</th>
                <th class="num" title="Empresas que os administrativos finalizariam no mês e quantos faltavam ou sobravam">Administrativos</th>
                <th>Conclusão</th>
              </tr>
            </thead>
            <tbody>
              ${passados.map(m => `
                <tr class="${Programacao.classeLinha(Calculo.piorStatus([m.funcoes[TEC].status, m.funcoes[ADM].status]))}">
                  <td>${m.nomeLongo}</td>
                  <td class="num">${Programacao.num(m.precisa)}</td>
                  ${celGrupo(m, TEC)}${celGrupo(m, ADM)}
                  <td class="col-conclusao">${ViewProgramacaoMensal.conclusaoMes(m).html}${ondeHTML(m)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="frases-resumo"><p>${frase}</p></div>
        <p class="note">Projeção feita com a equipe de hoje (e com a simulação "E se…?", se houver — simule uma pessoa a partir de um mês passado para ver se teria resolvido). O que ficou em aberto nesses meses não some: está na <strong>Fila de atendimento</strong> e na coluna "Acumulado" de Empresas por Unidade.</p>
      </section>`;
    };

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
                <th class="num" title="Clientes Mensal + Exclusiva TST com documentos vencidos no mês — cada um precisa de inspeção, relatório e finalização">Clientes</th>
                <th class="num" title="Pessoas do grupo contadas no mês (com a simulação, se houver)">Equipe</th>
                ${entregas.map(e => `<th class="num">${e.rotulo}</th>`).join('')}
                <th class="num th-pessoas" title="Quantas pessoas faltam (ou sobram) para dar conta do mês, em relação à equipe de hoje. Não é acumulado: contratar o maior valor cobre todos os meses.">Faltam / sobram</th>
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
                <th>${mesAtual === 0 ? `Ano de ${Store.ano}` : Programacao.descricaoJanela(janela)}</th>
                <th class="num">${alvo.meses.reduce((s, m) => s + m.diasUteis, 0)}</th>
                <th class="num">${Programacao.num(alvo.janela.precisa)}</th>
                <th class="num" title="Média do período">${Programacao.numFte(resumo.pessoas)}</th>
                ${entregas.map(e => { const b = alvo.janela.entregas[e.id]; return `<th class="num cel-${b.status}">${Programacao.num(b.consegue)}<small> de ${Programacao.num(b.precisa)}</small></th>`; }).join('')}
                <th class="num col-pessoas" title="Conta do período inteiro (meses folgados compensam meses apertados). Para não faltar em nenhum mês, vale o maior valor mensal.">${Programacao.pessoasHTML(resumo, singular)}</th>
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
                  <td><button type="button" class="btn-link" data-action="ver-unidade" data-local data-id="${u.id}">${UI.esc(u.nome)}</button></td>
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
        <p>Mês a mês, para técnicos e para administrativos: quanto a equipe consegue entregar, quanto a carteira precisa e quantas pessoas faltam (ou sobram) em cada mês — sempre em relação à equipe de hoje. Os meses que já passaram viram o <strong>histórico de projeção</strong> (deveria ter contratado? em qual área?); do mês atual em diante é o <strong>plano</strong>. Em cada célula de entrega, o primeiro número é o que a equipe consegue e o segundo o que precisa.</p>
      </header>

      ${Programacao.barraHTML({ ocupacaoAlvo: p.ocupacaoAlvo, unidades, unidadeSel, mesAtual })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a programação.</div></section>` : `

      ${Programacao.simulacaoHTML({ unidades, janela: janelaAno })}

      ${historicoHTML()}

      <section class="card resumo-prog">
        <div class="card-head">
          <div>
            <h2>${passados.length ? 'Plano · ' : ''}${UI.esc(titulo)} · ${Programacao.descricaoJanela(janela)}</h2>
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
      onUnidade: id => { Programacao.salvarFiltros({ ...Programacao.lerFiltros(), unidade: id }); App.render(); },
      onMesAtual: () => App.render(),
    });
    Programacao.bindSimulacao(el, { unidades, janela: janelaAno, unidadeSel });
  },
};
