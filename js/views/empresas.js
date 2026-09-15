/* ==========================================================================
   Tela: Empresas por Unidade — quantos clientes de cada unidade estão com
   documentos vencidos em cada mês do ano selecionado, em duas condições:
   Mensal e Exclusiva TST (as duas exigem o atendimento completo: inspeção,
   relatório e finalização — a separação é para enxergar cada uma).

   Cada unidade tem, por condição, um valor PADRÃO (vale para todos os anos e
   meses) e pode ter valores diferentes em meses específicos:
   Padrão | Jan … Dez | Média, mais a linha Total da unidade. Digitar num mês
   grava o valor daquele mês (a outra condição do mês fica como está); apagar
   a célula volta ao padrão. Tudo salva automaticamente.
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  get CONDICOES() { return Store.CONDICOES; },
  condSel: 'todas', // 'todas' | campo de uma condição

  /* ---------- helpers de valor ---------- */

  efetivo(u, mes, campo) { const exc = (u.meses || {})[mes]; return exc ? (exc[campo] || 0) : (u[campo] || 0); },
  totalMes(u, mes) { return this.CONDICOES.reduce((s, c) => s + this.efetivo(u, mes, c.campo), 0); },
  media(u, campo) { let s = 0; for (let m = 1; m <= 12; m++) s += campo ? this.efetivo(u, m, campo) : this.totalMes(u, m); return s / 12; },
  fmt(v) { return Number.isInteger(v) ? String(v) : UI.fmt(v, 1); },

  render(el) {
    const unidades = Store.unidades.list();
    const MESES = Calculo.MESES;
    const ano = Store.ano;
    const conds = this.condSel === 'todas' ? this.CONDICOES : this.CONDICOES.filter(c => c.campo === this.condSel);
    const mostrarTotal = this.condSel === 'todas';
    const nExc = u => Object.keys(u.meses || {}).length;

    const somaPadrao = unidades.reduce((s, u) => s + conds.reduce((t, c) => t + (u[c.campo] || 0), 0), 0);
    const somaMes = m => unidades.reduce((s, u) => s + conds.reduce((t, c) => t + this.efetivo(u, m, c.campo), 0), 0);
    const somaMedia = unidades.reduce((s, u) => s + conds.reduce((t, c) => t + this.media(u, c.campo), 0), 0);
    const mediaTotal = unidades.reduce((s, u) => s + this.media(u, null), 0);
    const mediaPor = campo => unidades.reduce((s, u) => s + this.media(u, campo), 0);
    const picoMes = unidades.length ? Math.max(...MESES.map((_, i) => unidades.reduce((s, u) => s + this.totalMes(u, i + 1), 0))) : 0;

    const linhaCond = (u, c, primeira, nLinhas) => `
      <tr data-unidade="${u.id}" data-campo="${c.campo}">
        ${primeira ? `<td class="col-nome" rowspan="${nLinhas}">
          <div class="nome-unidade">${UI.esc(u.nome)}</div>
          <div class="acoes-unidade" data-acoes="${u.id}">${nExc(u) ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de ${ano} e usar o padrão o ano todo">usar padrão em ${ano}</button>` : ''}</div>
        </td>` : ''}
        <td class="col-grau"><span class="chip-grau ${c.classe}" title="${c.ajuda}">${c.rotulo}</span></td>
        <td class="col-padrao"><input type="number" class="input input-sm input-num input-padrao" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-campo="${c.campo}" value="${u[c.campo] || 0}" aria-label="Padrão ${c.rotulo} de ${UI.esc(u.nome)}"></td>
        ${MESES.map((m, i) => { const mes = i + 1; const exc = (u.meses || {})[mes]; return `
          <td class="${exc ? 'cel-excecao' : ''}"><input type="number" class="input input-sm input-num input-mes" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-mes="${mes}" data-campo="${c.campo}" value="${exc ? (exc[c.campo] || 0) : ''}" placeholder="${u[c.campo] || 0}" aria-label="${UI.esc(u.nome)} ${c.rotulo} — ${Calculo.MESES_LONGO[i]}"></td>`; }).join('')}
        <td class="col-media" data-media>${this.fmt(this.media(u, c.campo))}</td>
      </tr>`;

    const linhaTotal = u => `
      <tr class="linha-total-unidade" data-unidade="${u.id}" data-total>
        <td class="col-grau"><strong>Total</strong></td>
        <td class="col-padrao" data-padrao-total><strong>${u.empresas}</strong></td>
        ${MESES.map((m, i) => `<td data-mes-total="${i + 1}"><strong>${this.totalMes(u, i + 1)}</strong></td>`).join('')}
        <td class="col-media" data-media><strong>${this.fmt(this.media(u, null))}</strong></td>
      </tr>`;

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Quantos clientes de cada unidade estão com <strong>documentos vencidos</strong> em cada mês do ano selecionado, separados por condição: <strong>Mensal</strong> e <strong>Exclusiva TST</strong>. Os dois exigem o atendimento completo no mês: uma inspeção e um relatório (técnicos) e uma finalização (administrativos). Preencha o <em>padrão</em> (vale para todos os meses e anos) e, se algum mês for diferente, digite o número naquele mês. Tudo é salvo automaticamente.</p>
      </header>

      <div class="stats">
        <div class="stat"><div class="label">Unidades</div><div class="value">${unidades.length}</div></div>
        <div class="stat" title="Média dos 12 meses de ${ano}, somando as unidades"><div class="label">Clientes por mês (${ano})</div><div class="value" id="stat-media">${UI.fmt(mediaTotal, 1)}</div></div>
        <div class="stat" title="Média mensal de ${ano} por condição"><div class="label">Mensal · Exclusiva TST</div><div class="value value-lista" id="stat-cond">${this.CONDICOES.map(c => `<span>${UI.fmt(mediaPor(c.campo), 1)}<small> ${c.rotulo.toLowerCase()}</small></span>`).join('')}</div></div>
        <div class="stat" title="Mês de ${ano} com mais clientes com documentos vencidos, somando as unidades"><div class="label">Mês mais apertado (${ano})</div><div class="value" id="stat-pico">${picoMes}</div></div>
      </div>

      ${unidades.length === 0 ? `
      <section class="card">
        <div class="empty">
          <strong>Nenhuma unidade cadastrada</strong>
          Cadastre as unidades primeiro para informar quantos clientes estão com documentos vencidos em cada uma.
          <br>
          <button type="button" class="btn btn-primary" data-action="go-unidades">Ir para Unidades</button>
        </div>
      </section>` : `
      <section class="card">
        <div class="card-head">
          <h2>Clientes com documentos vencidos, por mês · ${ano}</h2>
          <div class="right" data-local>
            <span class="muted">Mostrar:</span>
            <div class="seg" role="tablist">
              <button type="button" class="seg-btn ${this.condSel === 'todas' ? 'ativo' : ''}" data-action="cond" data-cond="todas">Todas</button>
              ${this.CONDICOES.map(c => `<button type="button" class="seg-btn ${this.condSel === c.campo ? 'ativo' : ''}" data-action="cond" data-cond="${c.campo}">Só ${c.rotulo}</button>`).join('')}
            </div>
            <label class="param-inline"><span class="muted">Ano</span> ${Programacao.seletorAnoHTML('empresas-ano')}</label>
          </div>
        </div>
        <p class="muted">Cada unidade tem uma linha por condição. Os números dos meses são de <strong>${ano}</strong> (troque o ano ao lado para planejar outro ano). A coluna <strong>Padrão</strong> vale para todos os meses e anos sem valor próprio; digite um número em um mês só quando ele for diferente. Célula em azul = mês com valor próprio; apague o número para voltar ao padrão.</p>
        <div class="table-wrap">
          <table class="table table-matriz">
            <thead>
              <tr>
                <th class="col-nome">Unidade</th>
                <th class="col-grau">Condição</th>
                <th class="col-padrao">Padrão</th>
                ${MESES.map(m => `<th>${m}</th>`).join('')}
                <th class="col-media" title="Média dos 12 meses">Média</th>
              </tr>
            </thead>
            <tbody>
              ${unidades.map(u => {
                const nLinhas = conds.length + (mostrarTotal ? 1 : 0);
                return conds.map((c, i) => linhaCond(u, c, i === 0, nLinhas)).join('') + (mostrarTotal ? linhaTotal(u) : '');
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th class="col-nome" colspan="2">Total das unidades</th>
                <th class="col-padrao" data-total-padrao>${this.fmt(somaPadrao)}</th>
                ${MESES.map((m, i) => `<th data-total-mes="${i + 1}">${this.fmt(somaMes(i + 1))}</th>`).join('')}
                <th class="col-media" data-total-media>${this.fmt(somaMedia)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="note">A programação usa a soma das duas condições em cada mês: para cada cliente com documentos vencidos, a equipe precisa fazer uma inspeção, um relatório e uma finalização naquele mês.</p>
      </section>`}
    `;

    el.querySelector('[data-action="go-unidades"]')?.addEventListener('click', () => App.navigate('unidades'));
    Programacao.bindSeletorAno(el.querySelector('#empresas-ano'));

    // ---- seletor de condição / usar padrão ----
    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'cond') {
        this.condSel = btn.dataset.cond;
        App.render();
      } else if (btn.dataset.action === 'limpar-mes') {
        const u = Store.unidades.get(btn.dataset.id);
        const ok = await UI.confirm({ title: `Usar o padrão em ${ano}`, message: `Apagar os valores próprios de ${ano} de "${u ? u.nome : ''}"? Todos os meses de ${ano} passam a usar o padrão.`, confirmText: 'Apagar' });
        if (!ok) return;
        try { await Store.empresasMes.limpar(btn.dataset.id); UI.toast('Meses voltaram ao padrão.'); }
        catch (err) { UI.toast(err.message, 'error'); }
      }
    });

    const enterBlur = input => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    // ---- padrão da unidade (por condição) ----
    el.querySelectorAll('input.input-padrao').forEach(input => {
      enterBlur(input);
      input.addEventListener('change', async () => {
        const valor = Math.max(0, Math.floor(UI.parseNum(input.value, 0)));
        input.value = valor;
        const anterior = Store.unidades.get(input.dataset.id);
        input.disabled = true;
        try {
          await Store.unidades.update(input.dataset.id, { [input.dataset.campo]: valor }, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          if (anterior) input.value = anterior[input.dataset.campo] || 0;
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, input.dataset.id);
        App.updateBadges();
      });
    });

    // ---- valor próprio de um mês (por condição) ----
    el.querySelectorAll('input.input-mes').forEach(input => {
      enterBlur(input);
      input.addEventListener('change', async () => {
        const u = Store.unidades.get(input.dataset.id);
        if (!u) return;
        const mes = Number(input.dataset.mes);
        const campo = input.dataset.campo;
        const vazio = input.value.trim() === '';
        const excAtual = (u.meses || {})[mes];
        const padrao = {};
        this.CONDICOES.forEach(c => { padrao[c.campo] = u[c.campo] || 0; });
        let novo = null;
        if (!vazio) {
          novo = { ...(excAtual || padrao), [campo]: Math.max(0, Math.floor(UI.parseNum(input.value, 0))) };
          input.value = novo[campo];
        } else if (excAtual) {
          // apagou esta condição: se a outra ainda difere do padrão, mantém o mês com o padrão nesta
          const resto = { ...excAtual, [campo]: padrao[campo] };
          const igualPadrao = this.CONDICOES.every(c => (resto[c.campo] || 0) === padrao[c.campo]);
          novo = igualPadrao ? null : resto;
        }
        input.disabled = true;
        try {
          await Store.empresasMes.definir(u.id, mes, novo, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          input.value = excAtual ? (excAtual[campo] || 0) : '';
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, u.id);
      });
    });
  },

  /** Recalcula, sem re-renderizar, as linhas da unidade (azul, médias, total) e os totais. */
  atualizarUnidade(el, unidadeId) {
    const unidades = Store.unidades.list();
    const u = unidades.find(x => x.id === unidadeId);
    const ano = Store.ano;
    if (u) {
      el.querySelectorAll(`tr[data-unidade="${unidadeId}"][data-campo]`).forEach(tr => {
        const campo = tr.dataset.campo;
        tr.querySelectorAll('input.input-mes').forEach(inp => {
          const exc = (u.meses || {})[Number(inp.dataset.mes)];
          inp.closest('td').classList.toggle('cel-excecao', !!exc);
          inp.placeholder = u[campo] || 0;
          if (!exc) inp.value = ''; else inp.value = exc[campo] || 0;
        });
        tr.querySelector('[data-media]').textContent = this.fmt(this.media(u, campo));
      });
      const trTotal = el.querySelector(`tr[data-unidade="${unidadeId}"][data-total]`);
      if (trTotal) {
        trTotal.querySelector('[data-padrao-total]').innerHTML = `<strong>${u.empresas}</strong>`;
        for (let m = 1; m <= 12; m++) trTotal.querySelector(`[data-mes-total="${m}"]`).innerHTML = `<strong>${this.totalMes(u, m)}</strong>`;
        trTotal.querySelector('[data-media]').innerHTML = `<strong>${this.fmt(this.media(u, null))}</strong>`;
      }
      const acoes = el.querySelector(`[data-acoes="${unidadeId}"]`);
      if (acoes) acoes.innerHTML = Object.keys(u.meses || {}).length ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de ${ano} e usar o padrão o ano todo">usar padrão em ${ano}</button>` : '';
    }
    const conds = this.condSel === 'todas' ? this.CONDICOES : this.CONDICOES.filter(c => c.campo === this.condSel);
    const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
    set('[data-total-padrao]', this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + (x[c.campo] || 0), 0), 0)));
    for (let m = 1; m <= 12; m++) set(`[data-total-mes="${m}"]`, this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + this.efetivo(x, m, c.campo), 0), 0)));
    set('[data-total-media]', this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + this.media(x, c.campo), 0), 0)));
    set('#stat-media', UI.fmt(unidades.reduce((s, x) => s + this.media(x, null), 0), 1));
    const statCond = el.querySelector('#stat-cond');
    if (statCond) statCond.innerHTML = this.CONDICOES.map(c => `<span>${UI.fmt(unidades.reduce((s, x) => s + this.media(x, c.campo), 0), 1)}<small> ${c.rotulo.toLowerCase()}</small></span>`).join('');
    set('#stat-pico', Math.max(...Calculo.MESES.map((_, i) => unidades.reduce((s, x) => s + this.totalMes(x, i + 1), 0))));
  },
};
