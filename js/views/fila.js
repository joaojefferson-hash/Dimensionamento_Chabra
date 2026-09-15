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
        ? `<strong>Fila hoje:</strong> no início de ${M[mesAtual].toLowerCase()} há <strong>${num(s.filaHoje)} empresas</strong> acumuladas (o que não foi atendido de janeiro a ${M[Math.max(0, mesAtual - 1)].toLowerCase()}); entram mais ${num(s.entramHoje)} em ${M[mesAtual].toLowerCase()}.`
        : `<strong>Fila hoje:</strong> não há acumulado no início de ${M[mesAtual].toLowerCase()}; entram ${num(s.entramHoje)} empresas no mês.`);
      if (s.pessoasPrazo > 0) {
        out.push(`<strong class="txt-deficit">Para atender tudo no prazo de ${p.prazoDias} dias (${rotuloPrazo}), faltam ${s.pessoasPrazo} ${plural(s.pessoasPrazo)}</strong> — a fila mais as entradas do período somam ${num(s.filaHoje + s.entramPrazo)} empresas e a equipe consegue ${num(s.conseguePrazo)}.`);
      } else {
        out.push(`<strong class="txt-ok">A equipe dá conta da fila e das entradas dentro do prazo de ${p.prazoDias} dias</strong> (${rotuloPrazo}: ${num(s.filaHoje + s.entramPrazo)} empresas contra ${num(s.conseguePrazo)} que a equipe consegue)${s.pessoasSobram > 0 ? ` — sobra o equivalente a ${s.pessoasSobram} ${plural(s.pessoasSobram)}` : ''}.`);
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
        out.push(`<strong>No período (${rotuloPeriodo}):</strong> ${pr.filaInicio > 0.5 ? `começa com <strong>${num(pr.filaInicio)}</strong> na fila, ` : ''}entram <strong>${num(pr.entram)}</strong> empresas e a equipe consegue atender <strong>${num(pr.consegue)}</strong>; termina com <strong>${num(pr.filaFim)}</strong> na fila. `
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
              <div class="fila-col ${m.mes < mesAtual ? 'passado' : ''} ${m.mes === mesAtual ? 'atual' : ''}" title="${m.nomeLongo}: ${num(m.filaFim)} pendentes no fim do mês (entraram ${num(m.entram)}, atendidas ${num(m.atendidas)})">
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
          <div class="stat" title="Acumulado de janeiro até o mês anterior ao atual"><div class="label">Fila hoje</div><div class="value ${s.filaHoje > 0.5 ? 'neg' : ''}">${num(s.filaHoje)}<small> empresas</small></div></div>
          <div class="stat" title="Empresas com documentos vencidos que entram de ${rotuloPrazo}"><div class="label">Entram em ${p.prazoDias} dias</div><div class="value">${num(s.entramPrazo)}<small> empresas</small></div></div>
          <div class="stat" title="Pessoas a contratar para atender a fila e as entradas dentro do prazo"><div class="label">Contratar para cumprir o prazo</div><div class="value ${s.pessoasPrazo > 0 ? 'neg' : 'txt-ok'}">${s.pessoasPrazo > 0 ? `${s.pessoasPrazo}<small> ${plural(s.pessoasPrazo)}</small>` : 'ninguém'}</div></div>
          <div class="stat" title="Como termina o ano sem contratar"><div class="label">Fila em dezembro</div><div class="value ${s.filaDezembro > 0.5 ? 'neg' : 'txt-ok'}">${num(s.filaDezembro)}<small> empresas</small></div></div>
        </div>
        <div class="stats stats-fila stats-periodo">
          <div class="stat stat-rotulo"><div class="label">Período</div><div class="value value-lista"><span>${UI.esc(rotuloPeriodo.charAt(0).toUpperCase() + rotuloPeriodo.slice(1))}</span></div></div>
          <div class="stat" title="Fila no início do primeiro mês do período"><div class="label">Fila no início</div><div class="value ${g.periodo.filaInicio > 0.5 ? 'neg' : ''}">${num(g.periodo.filaInicio)}<small> empresas</small></div></div>
          <div class="stat" title="Empresas que entram no período"><div class="label">Entram no período</div><div class="value">${num(g.periodo.entram)}<small> empresas</small></div></div>
          <div class="stat" title="O que a equipe consegue atender no período (já com a folga)"><div class="label">Equipe consegue</div><div class="value">${num(g.periodo.consegue)}<small> empresas</small></div></div>
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
                <th class="num" title="Clientes (Mensal + Exclusiva TST) com documentos vencidos que entram no mês">Entram</th>
                <th class="num" title="Acumulado dos meses anteriores">Fila no início</th>
                <th class="num" title="O que a equipe consegue atender no mês (já com a folga)">Consegue</th>
                <th class="num">Atendidas</th>
                <th class="num" title="O que passa para o mês seguinte">Fila no fim</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              ${noPeriodo(g.meses).map(m => `
                <tr class="${Programacao.classeLinha(m.status)} ${m.mes < mesAtual ? 'mes-passado' : ''} ${m.mes === mesAtual ? 'mes-atual' : ''}">
                  <td>${m.nomeLongo}${m.mes === mesAtual ? ' <span class="chip chip-blue">hoje</span>' : ''}</td>
                  <td class="num">${m.diasUteis}</td>
                  <td class="num">${fte(m.pessoas)}</td>
                  <td class="num">${num(m.entram)}</td>
                  <td class="num">${num(m.filaInicio)}</td>
                  <td class="num">${num(m.consegue)}</td>
                  <td class="num">${num(m.atendidas)}</td>
                  <td class="num"><strong>${num(m.filaFim)}</strong></td>
                  <td>${Programacao.statusChip(m.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="note">A tabela mostra o período escolhido (${rotuloPeriodo}); a fila do primeiro mês já traz o acumulado dos meses anteriores. Situação do mês: <strong>dá conta</strong> = fila zerada no fim do mês; <strong>no limite</strong> = sobrou menos de um mês de entradas; <strong>precisa contratar</strong> = sobrou mais de um mês de entradas (o prazo de ${p.prazoDias} dias fica em risco). Meses passados aparecem esmaecidos.</p>

        ${!unidadeSel && fila.unidades.length > 1 ? `
        <div class="card-head sub-head">
          <h3>${Calculo.FUNCAO_CURTA[f]} por unidade</h3>
          <span class="muted">clique numa unidade para ver o detalhe</span>
        </div>
        <p class="muted">Uma linha por unidade. <strong>Equipe</strong> = ${PLURAL[f]} da unidade hoje (em pessoas inteiras). <strong>Fila hoje</strong> = empresas acumuladas no início de ${M[mesAtual].toLowerCase()}. <strong>Contratar em ${p.prazoDias} dias</strong> = pessoas a mais para atender a fila e as entradas dos próximos ${p.prazoDias} dias. <strong>Contratar até ${M[g.periodo.ate].toLowerCase()}</strong> = pessoas a mais para a fila estar zerada no fim do período (a partir de ${M[g.periodo.contratarDe].toLowerCase()}). As colunas dos meses mostram quantas empresas <strong>ficam pendentes no fim de cada mês</strong> sem contratar (verde = zero; amarelo = menos de um mês de entradas; vermelho = mais de um mês).</p>
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
                  ${noPeriodo(gu.meses).map(m => `<td class="num cel-${m.status}" title="${m.nomeLongo}: entram ${num(m.entram)}, atendidas ${num(m.atendidas)}">${num(m.filaFim)}</td>`).join('')}
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </section>`;
    };

    el.innerHTML = `
      <header class="page-header">
        <h1>Fila de atendimento</h1>
        <p>Quanto a equipe produz por dia, quanto entra de empresas com documentos vencidos em cada mês e o que fica acumulado. O que não é atendido num mês passa para o seguinte. A partir do mês atual, mostra quantas pessoas contratar para atender tudo dentro do prazo.</p>
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
