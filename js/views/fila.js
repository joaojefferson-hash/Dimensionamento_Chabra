/* ==========================================================================
   Tela: Fila de atendimento — a visão para a diretoria.

   Quanto a equipe produz por dia, quanto entra de empresas com documentos
   vencidos em cada mês e o que fica acumulado: o que não é atendido num mês
   passa para o seguinte (fila / backlog). A partir do mês atual, diz quantas
   pessoas contratar para atender a fila e as entradas dentro do prazo
   (padrão 60 dias) e quando a fila zera sem contratar.

   Técnicos e administrativos em grades separadas; o card "E se…?" simula
   contratações (só neste navegador).
   ========================================================================== */

const ViewFila = {
  id: 'fila',
  title: 'Fila de atendimento',

  render(el) {
    const mesAtual = Programacao.lerMesAtual();
    const janela = Programacao.lerJanela();
    const filtros = Programacao.lerFiltros();
    const unidades = Store.unidades.list();
    const unidadeSel = unidades.some(u => u.id === filtros.unidade) ? filtros.unidade : '';
    const p = Store.parametros.get();
    const prazoMeses = Math.max(1, Math.round(p.prazoDias / 30));
    const simulacoes = Programacao.lerSimulacao();
    const r = Calculo.calcular({ unidades, colaboradores: Store.colaboradores.list(), parametros: p, janela: { de: 0, ate: 11 }, simulacoes });
    const fila = Calculo.fila(r, { mesAtual, prazoMeses, periodo: janela });
    const noPeriodo = lista => lista.slice(janela.de, janela.ate + 1);
    const rotuloPeriodo = Programacao.descricaoJanela(janela);
    const alvo = unidadeSel ? fila.unidades.find(u => u.id === unidadeSel) : fila.total;
    const alvoCalc = unidadeSel ? r.unidades.find(u => u.id === unidadeSel) : r.total;
    const titulo = unidadeSel ? alvo.nome : 'Todas as unidades';
    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const PLURAL = { [TEC]: 'técnicos', [ADM]: 'administrativos' };
    /** "18,7 inspeções · 9,3 relatórios" / "12,7 finalizações" (produção por dia de cada entrega). */
    const producaoDiaTexto = (s, sep = ' · ') => Calculo.ENTREGAS_DA_FUNCAO[s.funcao].map(e => `${UI.fmt(s.producaoDiaPor[e.id] || 0, 1)} ${e.unidade}`).join(sep);
    const entregaGargalo = s => Calculo.ENTREGAS_DA_FUNCAO[s.funcao].find(e => e.id === s.gargaloId) || Calculo.ENTREGAS_DA_FUNCAO[s.funcao][0];
    const num = Programacao.num, fte = Programacao.numFte;
    const M = Calculo.MESES_LONGO;
    const mesesPrazo = Math.min(12, mesAtual + prazoMeses) - mesAtual;
    const rotuloPrazo = mesesPrazo === 1 ? M[mesAtual].toLowerCase() : `${M[mesAtual].toLowerCase()} a ${M[Math.min(11, mesAtual + prazoMeses - 1)].toLowerCase()}`;

    /** Frases do resumo de um grupo, em linguagem simples. */
    const frases = f => {
      const g = alvo.grupos[f], s = g.resumo;
      const singular = Calculo.FUNCAO_SINGULAR[f];
      const plural = q => (q === 1 ? singular : singular + 's');
      const out = [];
      const gargalo = entregaGargalo(s);
      out.push(`<strong>Produção de hoje:</strong> a equipe de ${PLURAL[f]} (${fte(s.pessoas)} ${s.pessoas === 1 ? 'pessoa' : 'pessoas'}) faz até <strong>${producaoDiaTexto(s, ' e ')} por dia</strong>, já descontando a folga de ${Math.round(100 - p.ocupacaoAlvo)}% para imprevistos${Calculo.ENTREGAS_DA_FUNCAO[f].length > 1 ? ` — o que limita são os ${gargalo.unidade}: ` : ' — '}${num(g.meses[mesAtual].consegue)} empresas atendidas em ${M[mesAtual].toLowerCase()}.`);
      out.push(s.filaHoje > 0.5
        ? `<strong>Fila hoje:</strong> em ${M[mesAtual].toLowerCase()} há <strong>${num(s.filaHoje)} empresas pendentes</strong> (o número lançado em Empresas por Unidade — o que ainda não foi atendido)${s.entramPrazo > 0.5 ? `; nos meses seguintes do prazo vencem mais ${num(s.entramPrazo)}` : ''}.`
        : `<strong>Fila hoje:</strong> não há empresas pendentes em ${M[mesAtual].toLowerCase()}${s.entramPrazo > 0.5 ? `; nos meses seguintes do prazo vencem ${num(s.entramPrazo)}` : ''}.`);
      if (s.pessoasPrazo > 0) {
        out.push(`<strong class="txt-deficit">Para zerar isso no prazo de ${p.prazoDias} dias (${rotuloPrazo}), faltam ${s.pessoasPrazo} ${plural(s.pessoasPrazo)}</strong> — há ${num(s.filaHoje + s.entramPrazo)} empresas para atender e a equipe consegue ${num(s.conseguePrazo)}.`);
      } else {
        out.push(`<strong class="txt-ok">A equipe dá conta de zerar a fila dentro do prazo de ${p.prazoDias} dias</strong> (${rotuloPrazo}: ${num(s.filaHoje + s.entramPrazo)} empresas contra ${num(s.conseguePrazo)} que a equipe consegue)${s.pessoasSobram > 0 ? ` — sobra o equivalente a ${s.pessoasSobram} ${plural(s.pessoasSobram)}` : ''}.`);
      }
      if (s.zeraEm !== null && s.filaDezembro <= 0.5) {
        out.push(s.zeraEm <= mesAtual && s.filaHoje <= 0.5
          ? `Sem contratar, a fila continua zerada até dezembro.`
          : `Sem contratar, a fila zera em <strong>${s.zeraEmNome.toLowerCase()}</strong> e fica zerada até dezembro.`);
      } else if (s.zeraEm !== null) {
        out.push(`Sem contratar, a fila zera em <strong>${s.zeraEmNome.toLowerCase()}</strong>, mas volta a acumular: dezembro termina com <strong>${num(s.filaDezembro)} empresas</strong> pendentes.`);
      } else {
        out.push(`<strong class="txt-deficit">Sem contratar, a fila não zera este ano</strong>: dezembro termina com <strong>${num(s.filaDezembro)} empresas</strong> pendentes.`);
      }
      const pr = g.periodo;
      if (pr.nMeses > 0) {
        const cabe = pr.pessoas === 0;
        out.push(`<strong>No período (${rotuloPeriodo}):</strong> de ${M[pr.contratarDe].toLowerCase()} em diante há <strong>${num(pr.aAtender)}</strong> empresas para atender (pendentes + o que vence) e a equipe consegue <strong>${num(pr.consegueFuturo)}</strong>; termina com <strong>${num(pr.filaFim)}</strong> pendentes. `
          + (cabe
            ? `<span class="txt-ok">A equipe dá conta do período</span>${pr.pessoasSobram > 0 ? ` — sobra o equivalente a ${pr.pessoasSobram} ${plural(pr.pessoasSobram)}` : ''}.`
            : `<span class="txt-deficit">Para a fila estar zerada no fim de ${M[pr.ate].toLowerCase()}, faltam ${pr.pessoas} ${plural(pr.pessoas)}</span> a partir de ${M[pr.contratarDe].toLowerCase()} (o que já passou não muda).`));
      }
      return out.map(t => `<p class="rec-linha">${t}</p>`).join('');
    };

    /** Gráfico de barras (uma série): fila no fim de cada mês; mês atual marcado; rótulos só no mês atual e no maior. */
    const grafico = f => {
      const meses = noPeriodo(alvo.grupos[f].meses);
      const max = Math.max(1, ...meses.map(m => m.filaFim));
      const idxMax = meses.reduce((a, m, i) => (m.filaFim > meses[a].filaFim ? i : a), 0);
      return `
        <div class="fila-grafico" role="img" aria-label="Fila no fim de cada mês, ${PLURAL[f]}">
          <div class="fila-grafico-titulo">Fila no fim de cada mês <span class="muted">(empresas pendentes · ${rotuloPeriodo})</span></div>
          <div class="fila-barras">
            ${meses.map((m, i) => {
              const h = Math.round((m.filaFim / max) * 100);
              const rotulo = (m.mes === mesAtual || (i === idxMax && m.filaFim > 0)) ? `<span class="fila-rotulo">${num(m.filaFim)}</span>` : '';
              return `
              <div class="fila-col ${m.mes < mesAtual ? 'passado' : ''} ${m.mes === mesAtual ? 'atual' : ''}" title="${m.nomeLongo}: ${num(m.filaFim)} pendentes no fim do mês${m.passado ? ' (lançado)' : ` (${num(m.pendentes)} para atender, ${num(m.atendidas)} atendidas)`}">
                <div class="fila-barra-area">${rotulo}<div class="fila-barra" style="height:${h}%"></div></div>
                <div class="fila-mes">${m.nome}</div>
              </div>`; }).join('')}
          </div>
          <div class="fila-legenda muted"><span><i class="fila-leg passado"></i>meses passados</span><span><i class="fila-leg atual"></i>mês atual</span><span><i class="fila-leg"></i>próximos meses</span></div>
        </div>`;
    };

    const gradeGrupo = f => {
      const g = alvo.grupos[f], s = g.resumo;
      const singular = Calculo.FUNCAO_SINGULAR[f];
      const plural = q => (q === 1 ? singular : singular + 's');
      return `
      <section class="card grade-grupo ${Programacao.classeLinha(s.status)}">
        <div class="card-head">
          <div>
            <h2>${Calculo.FUNCAO_CURTA[f]}</h2>
            <div class="muted">${Programacao.pessoasTexto(alvoCalc.pessoas[f], alvoCalc.pessoasSimuladas[f], PLURAL[f])} · ${UI.esc(titulo)} · mês atual: ${M[mesAtual]}</div>
          </div>
          ${Programacao.statusChip(s.status)}
        </div>

        <div class="stats stats-fila">
          <div class="stat" title="Produção da equipe de hoje, já com a folga para imprevistos"><div class="label">Produção por dia</div><div class="value value-lista">${Calculo.ENTREGAS_DA_FUNCAO[f].map(e => `<span>${UI.fmt(s.producaoDiaPor[e.id] || 0, 1)}<small> ${e.unidade}</small></span>`).join('')}</div></div>
          <div class="stat" title="Empresas pendentes em ${M[mesAtual]} (número lançado em Empresas por Unidade)"><div class="label">Fila hoje</div><div class="value ${s.filaHoje > 0.5 ? 'neg' : ''}">${num(s.filaHoje)}<small> empresas</small></div></div>
          <div class="stat" title="Empresas que vencem nos meses seguintes dentro do prazo (${rotuloPrazo})"><div class="label">Vencem até o prazo</div><div class="value">${num(s.entramPrazo)}<small> empresas</small></div></div>
          <div class="stat" title="Pessoas a contratar para atender a fila e as entradas dentro do prazo"><div class="label">Contratar para cumprir o prazo</div><div class="value ${s.pessoasPrazo > 0 ? 'neg' : 'txt-ok'}">${s.pessoasPrazo > 0 ? `${s.pessoasPrazo}<small> ${plural(s.pessoasPrazo)}</small>` : 'ninguém'}</div></div>
          <div class="stat" title="Como termina o ano sem contratar"><div class="label">Fila em dezembro</div><div class="value ${s.filaDezembro > 0.5 ? 'neg' : 'txt-ok'}">${num(s.filaDezembro)}<small> empresas</small></div></div>
        </div>
        <div class="stats stats-fila stats-periodo">
          <div class="stat stat-rotulo"><div class="label">Período</div><div class="value value-lista"><span>${UI.esc(rotuloPeriodo.charAt(0).toUpperCase() + rotuloPeriodo.slice(1))}</span></div></div>
          <div class="stat" title="Pendentes de ${M[g.periodo.contratarDe]} em diante mais o que vence até ${M[g.periodo.ate]}"><div class="label">A atender</div><div class="value ${g.periodo.aAtender > 0.5 ? 'neg' : ''}">${num(g.periodo.aAtender)}<small> empresas</small></div></div>
          <div class="stat" title="O que a equipe consegue atender de ${M[g.periodo.contratarDe]} até ${M[g.periodo.ate]} (já com a folga)"><div class="label">Equipe consegue</div><div class="value">${num(g.periodo.consegueFuturo)}<small> empresas</small></div></div>
          <div class="stat" title="Pessoas a contratar, a partir de ${M[g.periodo.contratarDe]}, para a fila estar zerada no fim de ${M[g.periodo.ate]}"><div class="label">Contratar até ${Calculo.MESES[g.periodo.ate].toLowerCase()}</div><div class="value ${g.periodo.pessoas > 0 ? 'neg' : 'txt-ok'}">${g.periodo.pessoas > 0 ? `${g.periodo.pessoas}<small> ${plural(g.periodo.pessoas)}</small>` : 'ninguém'}</div></div>
          <div class="stat" title="Como termina o período sem contratar"><div class="label">Fila no fim</div><div class="value ${g.periodo.filaFim > 0.5 ? 'neg' : 'txt-ok'}">${num(g.periodo.filaFim)}<small> empresas</small></div></div>
        </div>

        <div class="frases-resumo">${frases(f)}</div>

        ${grafico(f)}

        <div class="table-wrap">
          <table class="table table-prog table-fila">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num">Dias úteis</th>
                <th class="num" title="Pessoas do grupo no mês (com a simulação, se houver)">Equipe</th>
                <th class="num" title="Número lançado em Empresas por Unidade (Mensal + Exclusiva TST): nos meses passados e no atual, o que está pendente; nos seguintes, o que vence">Lançado</th>
                <th class="num" title="O que havia para atender no mês: nos meses seguintes, o que sobrou do mês anterior mais o que vence">Pendentes</th>
                <th class="num" title="O que a equipe consegue atender no mês (já com a folga)">Consegue</th>
                <th class="num">Atendidas</th>
                <th class="num" title="O que fica pendente no fim do mês (passa para o seguinte)">Ficam pendentes</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              ${noPeriodo(g.meses).map(m => `
                <tr class="${Programacao.classeLinha(m.status)} ${m.mes < mesAtual ? 'mes-passado' : ''} ${m.mes === mesAtual ? 'mes-atual' : ''}">
                  <td>${m.nomeLongo}${m.mes === mesAtual ? ' <span class="chip chip-blue">hoje</span>' : ''}</td>
                  <td class="num">${m.diasUteis}</td>
                  <td class="num">${fte(m.pessoas)}</td>
                  <td class="num">${num(m.informado)}</td>
                  <td class="num">${m.passado ? '<span class="muted">—</span>' : num(m.pendentes)}</td>
                  <td class="num">${num(m.consegue)}</td>
                  <td class="num">${m.passado ? '<span class="muted">—</span>' : num(m.atendidas)}</td>
                  <td class="num"><strong>${num(m.filaFim)}</strong></td>
                  <td>${Programacao.statusChip(m.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="note">O número lançado em Empresas por Unidade é o que está <strong>pendente</strong> no mês. Meses passados (esmaecidos) são histórico: mostram o que ficou pendente. No mês atual a equipe atende o que consegue e o resto passa adiante; nos meses seguintes, o que sobrou soma-se ao que vence. Situação: <strong>dá conta</strong> = zerado no fim do mês; <strong>no limite</strong> = fica menos de um mês de trabalho; <strong>precisa contratar</strong> = fica mais de um mês de trabalho (prazo de ${p.prazoDias} dias em risco).</p>

        ${!unidadeSel && fila.unidades.length > 1 ? `
        <div class="card-head sub-head">
          <h3>${Calculo.FUNCAO_CURTA[f]} por unidade</h3>
          <span class="muted">clique numa unidade para ver o detalhe</span>
        </div>
        <p class="muted">Uma linha por unidade. <strong>Equipe</strong> = ${PLURAL[f]} da unidade hoje (em pessoas inteiras). <strong>Fila hoje</strong> = empresas pendentes em ${M[mesAtual].toLowerCase()} (número lançado). <strong>Contratar em ${p.prazoDias} dias</strong> = pessoas a mais para zerar a fila e o que vence nos próximos ${p.prazoDias} dias. <strong>Contratar até ${M[g.periodo.ate].toLowerCase()}</strong> = pessoas a mais, a partir de ${M[g.periodo.contratarDe].toLowerCase()}, para a fila estar zerada no fim do período. As colunas dos meses mostram quantas empresas <strong>ficam pendentes no fim de cada mês</strong> (passados = histórico lançado; futuros = sem contratar). Verde = zero; amarelo = menos de um mês de trabalho; vermelho = mais de um mês.</p>
        <div class="table-wrap">
          <table class="table table-grade table-fila-unidades">
            <thead>
              <tr>
                <th rowspan="2">Unidade</th>
                <th rowspan="2" class="num" title="${PLURAL[f]} da unidade hoje, em pessoas inteiras">Equipe</th>
                <th rowspan="2" class="num" title="Empresas acumuladas no início de ${M[mesAtual]}">Fila hoje</th>
                <th rowspan="2" class="num" title="Pessoas a contratar para atender a fila e as entradas dos próximos ${p.prazoDias} dias">Contratar em ${p.prazoDias} dias</th>
                <th rowspan="2" class="num" title="Pessoas a contratar, a partir de ${M[g.periodo.contratarDe]}, para a fila estar zerada no fim de ${M[g.periodo.ate]}">Contratar até ${Calculo.MESES[g.periodo.ate].toLowerCase()}</th>
                <th colspan="${noPeriodo(g.meses).length}" class="th-group">Empresas pendentes no fim de cada mês (sem contratar)</th>
              </tr>
              <tr class="sub">
                ${noPeriodo(g.meses).map(m => `<th class="num">${m.nome}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${fila.unidades.map(u => { const gu = u.grupos[f], su = gu.resumo; return `
                <tr>
                  <td><button type="button" class="btn-link" data-action="ver-unidade" data-local data-id="${u.id}">${UI.esc(u.nome)}</button></td>
                  <td class="num">${fte(su.pessoas)}</td>
                  <td class="num ${su.filaHoje > 0.5 ? 'txt-deficit' : ''}">${num(su.filaHoje)}</td>
                  <td class="num">${su.pessoasPrazo > 0 ? `<span class="delta delta-falta">contratar ${su.pessoasPrazo}</span>` : '<span class="delta delta-ok">ok</span>'}</td>
                  <td class="num">${gu.periodo.pessoas > 0 ? `<span class="delta delta-falta">contratar ${gu.periodo.pessoas}</span>` : '<span class="delta delta-ok">ok</span>'}</td>
                  ${noPeriodo(gu.meses).map(m => `<td class="num cel-${m.status}" title="${m.nomeLongo}: ${m.passado ? `${num(m.informado)} pendentes (lançado)` : `${num(m.pendentes)} para atender, ${num(m.atendidas)} atendidas`}">${num(m.filaFim)}</td>`).join('')}
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </section>`;
    };

    el.innerHTML = `
      <header class="page-header">
        <h1>Fila de atendimento</h1>
        <p>Quanto a equipe produz por dia e quantas empresas estão pendentes (o número lançado em Empresas por Unidade é o que ainda não foi atendido). A partir do mês atual, o que a equipe não dá conta passa para o mês seguinte e soma-se ao que vence; a tela mostra quantas pessoas contratar para zerar tudo dentro do prazo.</p>
      </header>

      ${Programacao.barraHTML({ janela, ocupacaoAlvo: p.ocupacaoAlvo, unidades, unidadeSel, mesAtual, prazoDias: p.prazoDias })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a fila.</div></section>` : `

      ${Programacao.simulacaoHTML({ unidades, janela: { de: mesAtual, ate: 11 } })}

      <section class="card resumo-prog">
        <div class="card-head">
          <div>
            <h2>${UI.esc(titulo)} · hoje é ${M[mesAtual].toLowerCase()}</h2>
            <div class="linha-chefia">${Programacao.chefiaHTML(alvoCalc.chefia)}</div>
          </div>
          <div class="right">
            <span class="muted">${Programacao.pessoasTexto(alvoCalc.pessoas[TEC], alvoCalc.pessoasSimuladas[TEC], 'técnicos')} · ${Programacao.pessoasTexto(alvoCalc.pessoas[ADM], alvoCalc.pessoasSimuladas[ADM], 'administrativos')}</span>
          </div>
        </div>
        <p class="muted">Cada empresa com documentos vencidos precisa de uma inspeção e um relatório (técnicos) e de uma finalização (administrativos). Prazo para atender: <strong>${p.prazoDias} dias</strong> (${prazoMeses} ${prazoMeses === 1 ? 'mês' : 'meses'}). Os números a partir de ${M[mesAtual].toLowerCase()} são o plano; os anteriores explicam a fila de hoje.</p>
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
      onMesAtual: () => App.render(),
    });
    Programacao.bindSimulacao(el, { unidades, janela: { de: mesAtual, ate: 11 }, unidadeSel });
  },
};
