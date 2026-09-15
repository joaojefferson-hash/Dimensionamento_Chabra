/* ==========================================================================
   Tela: Dimensionamento — a única tela de resultado.

   Entra: quantas empresas vencem em cada mês (Empresas por Unidade) e quantas
   pessoas há em cada área, com o ritmo por dia (Colaboradores).
   Sai, por mês e para hoje: a equipe dá conta? qual o quadro ideal? quanto
   ficou pendente? quantos contratar, e em qual área?

   Blocos: barra (ano · unidade · mês atual) → "Hoje" (3 números) → tabela dos
   12 meses (o passado diz "deveria", o futuro diz "contratar") → uma linha por
   unidade (quando "Todas") → "E se…?" fechado → avisos de cadastro.
   ========================================================================== */

const ViewDimensionamento = {
  id: 'dimensionamento',
  title: 'Dimensionamento',

  render(el) {
    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const M = Calculo.MESES_LONGO;
    const num = Programacao.num, numFte = Programacao.numFte;
    const filtros = Programacao.lerFiltros();
    const unidades = Store.unidades.list();
    const unidadeSel = unidades.some(u => u.id === filtros.unidade) ? filtros.unidade : '';
    const p = Store.parametros.get();
    const mesAtual = Programacao.lerMesAtual();
    const prazoMeses = Math.max(1, Math.round(p.prazoDias / 30));
    const simulacoes = Programacao.lerSimulacao();
    const janela = { de: 0, ate: 11 };

    const r = Calculo.calcular({ unidades, colaboradores: Store.colaboradores.list(), parametros: p, janela, simulacoes });
    const fila = Calculo.fila(r, { mesAtual, prazoMeses });
    const alvo = unidadeSel ? r.unidades.find(u => u.id === unidadeSel) : r.total;
    const filaAlvo = unidadeSel ? fila.unidades.find(u => u.id === unidadeSel).grupos : fila.total.grupos;
    const titulo = unidadeSel ? alvo.nome : 'Todas as unidades';
    const PLURAL = { [TEC]: 'técnicos', [ADM]: 'administrativos' };
    const qtd = (f, q) => `${q} ${q === 1 ? Calculo.FUNCAO_SINGULAR[f] : Calculo.FUNCAO_SINGULAR[f] + 's'}`;
    const lista = l => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0] || '');
    const varias = !unidadeSel && r.unidades.length > 1;
    /** No total, a sobra de uma unidade não cobre a falta de outra: "faltam 2 onde precisa · sobram 2 em outras unidades". */
    const notaDistribuicao = g => {
      if (!varias || (g.faltam <= 0 && g.sobram <= 0)) return '';
      const partes = [];
      if (g.faltam > 0) partes.push(`faltam ${g.faltam} onde precisa`);
      if (g.sobram > 0) partes.push(`sobram ${g.sobram} em outras unidades`);
      return `<div class="muted onde" title="Cada unidade tem a sua equipe: quem sobra numa não atende a fila de outra">${partes.join(' · ')}</div>`;
    };
    const fimPrazo = Math.min(11, mesAtual + prazoMeses - 1);
    const rotuloPrazo = fimPrazo === mesAtual ? M[mesAtual].toLowerCase() : `${M[mesAtual].toLowerCase()} a ${M[fimPrazo].toLowerCase()}`;

    /* ---------- hoje ---------- */
    const hojeFila = filaAlvo[TEC].meses[mesAtual]; // pendentes de hoje: igual para as duas áreas (o passado não desconta ninguém)
    const cardArea = f => {
      const m = alvo.meses[mesAtual];
      const g = m.funcoes[f];
      const res = filaAlvo[f].resumo;
      const producao = Calculo.ENTREGAS_DA_FUNCAO[f].map(e => `${UI.fmt(res.producaoDiaPor[e.id] || 0, 1)} ${e.unidade}`).join(' · ');
      const zerar = res.pessoasPrazo > 0
        ? `<span class="txt-deficit">+${qtd(f, res.pessoasPrazo)}</span>`
        : `<span class="txt-ok">a equipe dá conta</span>`;
      return `
        <div class="stat stat-area ${Programacao.classeLinha(g.status)}">
          <div class="label">${Calculo.FUNCAO_CURTA[f]}</div>
          <div class="value">${numFte(m.pessoas[f])}<small> hoje</small> <span class="seta">→</span> <span class="${g.faltam > 0 ? 'txt-deficit' : 'txt-ok'}">${g.ideal}</span><small> ideal em ${M[mesAtual].toLowerCase()}</small></div>
          ${notaDistribuicao(g)}
          <div class="stat-detalhe">Para zerar o pendente em ${p.prazoDias} dias (${rotuloPrazo}): <strong>${zerar}</strong></div>
          <div class="stat-detalhe muted" title="Ritmo da equipe por dia, já com a folga de ${Math.round(100 - p.ocupacaoAlvo)}%">Produz por dia: ${producao}</div>
        </div>`;
    };
    const hojeHTML = `
      <div class="stats stats-hoje">
        <div class="stat ${hojeFila.pendentes > 0.5 ? 'row-deficit' : 'row-ok'}">
          <div class="label">Pendentes hoje · ${M[mesAtual].toLowerCase()}</div>
          <div class="value ${hojeFila.pendentes > 0.5 ? 'neg' : ''}">${num(hojeFila.pendentes)}<small> empresas</small></div>
          <div class="stat-detalhe">${hojeFila.filaInicio > 0.5 ? `<strong>${num(hojeFila.filaInicio)}</strong> ficaram de meses anteriores + ${num(hojeFila.informado)} que vencem em ${M[mesAtual].toLowerCase()}.` : `Tudo o que vence em ${M[mesAtual].toLowerCase()}; nada ficou de meses anteriores.`}</div>
        </div>
        ${cardArea(TEC)}
        ${cardArea(ADM)}
      </div>`;

    /* ---------- tabela dos 12 meses ---------- */
    const contratarTexto = m => [TEC, ADM].map(f => (m.funcoes[f].faltam > 0 ? qtd(f, m.funcoes[f].faltam) : null)).filter(Boolean);
    const conclusao = m => {
      const partes = contratarTexto(m);
      const passado = m.mes < mesAtual;
      if (partes.length) return `<strong class="txt-deficit">${passado ? 'Deveria ter contratado' : 'Contratar'} ${partes.join(' e ')}</strong>`;
      const limite = m.status === 'atencao';
      return `<span class="txt-ok">${passado ? 'Não precisava contratar' : 'Dá conta'}</span>${limite ? '<span class="muted"> · no limite</span>' : ''}`;
    };
    const ondeHTML = m => {
      if (!varias) return '';
      const l = r.unidades.map(u => {
        const partes = contratarTexto(u.meses[m.mes]);
        return partes.length ? `${UI.esc(u.nome)} (${partes.join(', ')})` : null;
      }).filter(Boolean);
      return l.length ? `<div class="muted onde">${l.join(' · ')}</div>` : '';
    };
    const celArea = (m, f) => {
      const g = m.funcoes[f];
      const detalhe = Calculo.ENTREGAS_DA_FUNCAO[f].map(e => `${num(m.entregas[e.id].consegue)} ${e.unidade}`).join(', ');
      const tip = `${m.nomeLongo}: ${PLURAL[f]} fazem ${detalhe} (${m.diasUteis} dias úteis); precisa ${num(m.precisa)} · ${g.faltam > 0 ? `faltam ${g.faltam}` : g.sobram > 0 ? `sobram ${g.sobram}` : 'dá conta'}`;
      return `<td class="num cel-${g.status}" title="${UI.esc(tip)}">${numFte(m.pessoas[f])} <span class="seta">→</span> <strong class="${g.faltam > 0 ? 'txt-deficit' : 'txt-ok'}">${g.ideal}</strong>${notaDistribuicao(g)}</td>`;
    };
    const pendenteCel = mes => {
      const a = filaAlvo[TEC].meses[mes], b = filaAlvo[ADM].meses[mes];
      const v = Math.max(a.filaFim, b.filaFim);
      const tip = Math.abs(a.filaFim - b.filaFim) > 0.5
        ? `Técnicos: ${num(a.filaFim)} · Administrativos: ${num(b.filaFim)} (mostra o maior)`
        : mes < mesAtual ? `${num(a.filaInicio)} que já estavam em aberto + ${num(a.informado)} que venceram (o passado não desconta a equipe: o número lançado já é o que ficou em aberto)` : `${num(a.filaInicio)} de antes + ${num(a.informado)} que vencem − ${num(a.atendidas)} atendidas`;
      return `<td class="num col-pendente" title="${UI.esc(tip)}"><strong>${num(v)}</strong></td>`;
    };
    const idealMax = f => Math.max(0, ...alvo.meses.map(m => m.funcoes[f].ideal));
    const algumFalta = f => alvo.meses.some(m => m.funcoes[f].faltam > 0);
    const conclusaoAno = () => {
      const partes = [TEC, ADM].filter(algumFalta).map(f => qtd(f, idealMax(f)));
      return partes.length
        ? `Para não faltar em nenhum mês: <strong>${partes.join(' e ')}</strong>`
        : `<span class="txt-ok">A equipe de hoje dá conta de todos os meses</span>`;
    };
    const tabelaHTML = `
      <section class="card">
        <div class="card-head">
          <div>
            <h2>${UI.esc(titulo)} · mês a mês · ${Store.ano}</h2>
            <div class="muted">Até ${M[Math.max(0, mesAtual - 1)].toLowerCase()}${mesAtual > 0 ? ' é o que já passou' : ''}${mesAtual > 0 ? '; de ' : 'De '}${M[mesAtual].toLowerCase()} em diante é o plano, com a equipe de hoje.</div>
          </div>
          <div class="legenda-mini"><span class="dot dot-ok"></span> dá conta <span class="dot dot-atencao"></span> no limite <span class="dot dot-deficit"></span> precisa contratar</div>
        </div>
        <div class="table-wrap">
          <table class="table table-prog table-dimensionamento">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num" title="Clientes Mensal + Exclusiva TST que vencem no mês (Empresas por Unidade)">Vencem</th>
                <th class="num col-pendente" title="O que fica em aberto no fim do mês: o que veio de antes + o que vence − o que a equipe atende. Nos meses passados o número lançado já é o que ficou em aberto.">Pendente no fim do mês</th>
                <th class="num" title="Técnicos hoje → quadro ideal para o que vence no mês (pessoas inteiras). Passe o mouse para ver inspeções e relatórios.">Técnicos<br><small>hoje → ideal</small></th>
                <th class="num" title="Administrativos hoje → quadro ideal para o que vence no mês (pessoas inteiras)">Administrativos<br><small>hoje → ideal</small></th>
                <th>Conclusão</th>
              </tr>
            </thead>
            <tbody>
              ${alvo.meses.map(m => `
                <tr class="${Programacao.classeLinha(m.status)} ${m.mes < mesAtual ? 'mes-passado' : ''} ${m.mes === mesAtual ? 'mes-atual' : ''}">
                  <td>${m.nomeLongo}${m.mes === mesAtual ? ' <span class="chip chip-blue">hoje</span>' : ''}</td>
                  <td class="num">${num(m.precisa)}</td>
                  ${pendenteCel(m.mes)}
                  ${celArea(m, TEC)}
                  ${celArea(m, ADM)}
                  <td class="col-conclusao">${conclusao(m)}${ondeHTML(m)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th>Ano de ${Store.ano}</th>
                <th class="num">${num(alvo.janela.precisa)}</th>
                <th class="num col-pendente" title="Pendentes no fim de dezembro, sem contratar"><strong>${num(Math.max(filaAlvo[TEC].meses[11].filaFim, filaAlvo[ADM].meses[11].filaFim))}</strong></th>
                <th class="num" title="O maior quadro ideal do ano">${numFte(alvo.pessoas[TEC])} <span class="seta">→</span> <strong class="${algumFalta(TEC) ? 'txt-deficit' : 'txt-ok'}">${idealMax(TEC)}</strong></th>
                <th class="num" title="O maior quadro ideal do ano">${numFte(alvo.pessoas[ADM])} <span class="seta">→</span> <strong class="${algumFalta(ADM) ? 'txt-deficit' : 'txt-ok'}">${idealMax(ADM)}</strong></th>
                <th class="col-conclusao">${conclusaoAno()}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="note">Quadro ideal = pessoas inteiras para dar conta do que vence no mês, com a folga de ${Math.round(100 - p.ocupacaoAlvo)}% para imprevistos. O pendente vai somando: o que a equipe não faz num mês passa para o seguinte. Folga, prazo e dias úteis ficam no Calendário.</p>
      </section>`;

    /* ---------- por unidade (quando "Todas") ---------- */
    const porUnidadeHTML = () => {
      if (!varias) return '';
      const linha = u => {
        const fu = fila.unidades.find(x => x.id === u.id).grupos;
        const m = u.meses[mesAtual];
        const hoje = fu[TEC].meses[mesAtual];
        const area = f => {
          const g = m.funcoes[f];
          const res = fu[f].resumo;
          return `<td class="num cel-${g.status}">${numFte(m.pessoas[f])} <span class="seta">→</span> <strong class="${g.faltam > 0 ? 'txt-deficit' : 'txt-ok'}">${g.ideal}</strong>${res.pessoasPrazo > 0 ? `<div class="muted onde">+${res.pessoasPrazo} para zerar em ${p.prazoDias} dias</div>` : ''}</td>`;
        };
        return `
          <tr class="${Programacao.classeLinha(m.status)}">
            <td><button type="button" class="btn-link" data-action="ver-unidade" data-local data-id="${u.id}">${UI.esc(u.nome)}</button></td>
            <td class="num col-pendente"><strong>${num(hoje.pendentes)}</strong></td>
            ${area(TEC)}${area(ADM)}
            <td class="col-conclusao">${conclusao(m)}</td>
          </tr>`;
      };
      return `
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Por unidade · hoje (${M[mesAtual].toLowerCase()})</h2>
            <div class="muted">clique numa unidade para ver o mês a mês dela</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table table-prog table-dimensionamento">
            <thead>
              <tr>
                <th>Unidade</th>
                <th class="num col-pendente" title="Empresas em aberto hoje: o que vence no mês + o que ficou dos anteriores">Pendentes hoje</th>
                <th class="num">Técnicos<br><small>hoje → ideal</small></th>
                <th class="num">Administrativos<br><small>hoje → ideal</small></th>
                <th>Conclusão para ${M[mesAtual].toLowerCase()}</th>
              </tr>
            </thead>
            <tbody>${r.unidades.map(linha).join('')}</tbody>
          </table>
        </div>
      </section>`;
    };

    /* ---------- "e se…?" fechado ---------- */
    const simHTML = `
      <details class="detalhes-simulacao" ${simulacoes.length ? 'open' : ''}>
        <summary>E se…? Simular contratações ou desligamentos${simulacoes.length ? ` <span class="chip chip-blue">simulando: ${simulacoes.map(s => UI.esc(Programacao.descricaoSimulacao(s, unidades))).join(' · ')}</span>` : ''}</summary>
        ${Programacao.simulacaoHTML({ unidades, janela })}
      </details>`;

    el.innerHTML = `
      <header class="page-header">
        <h1>Dimensionamento</h1>
        <p>Com as empresas que vencem em cada mês e a equipe de hoje: dá conta? Qual o quadro ideal? Quanto fica pendente? Quantos contratar, e em qual área?</p>
      </header>

      ${Programacao.barraHTML({ ocupacaoAlvo: p.ocupacaoAlvo, unidades, unidadeSel, mesAtual, folga: false })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver o dimensionamento.</div></section>` : `
      <div class="linha-chefia linha-chefia-solta">${Programacao.chefiaHTML(alvo.chefia)}</div>
      ${hojeHTML}
      ${tabelaHTML}
      ${porUnidadeHTML()}
      ${simHTML}
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
    Programacao.bindSimulacao(el, { unidades, janela: { de: mesAtual, ate: 11 }, unidadeSel });
  },
};
