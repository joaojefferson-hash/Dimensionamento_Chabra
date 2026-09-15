/* ==========================================================================
   Tela: Empresas por Unidade — quantas empresas de cada unidade estão com
   documentos vencidos em cada mês (cada uma exige o atendimento completo:
   inspeção, relatório e finalização).

   Cada unidade tem um valor PADRÃO (vale para o ano todo) e pode ter valores
   diferentes em meses específicos: Padrão | Jan … Dez | Média. Digitar num
   mês grava o valor daquele mês; apagar a célula volta ao padrão. Tudo salva
   automaticamente.
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  CAMPO: 'empresasVencidas',

  /* ---------- helpers de valor ---------- */

  efetivo(u, mes) { const exc = (u.meses || {})[mes]; return exc ? exc[this.CAMPO] : u[this.CAMPO]; },
  media(u) { let s = 0; for (let m = 1; m <= 12; m++) s += this.efetivo(u, m); return s / 12; },
  fmt(v) { return Number.isInteger(v) ? String(v) : UI.fmt(v, 1); },

  render(el) {
    const unidades = Store.unidades.list();
    const MESES = Calculo.MESES;
    const nExc = u => Object.keys(u.meses || {}).length;

    const totalPadrao = unidades.reduce((s, u) => s + u[this.CAMPO], 0);
    const mediaMes = unidades.reduce((s, u) => s + this.media(u), 0);
    const somaMes = m => unidades.reduce((s, u) => s + this.efetivo(u, m), 0);
    const picoMes = unidades.length ? Math.max(...MESES.map((_, i) => somaMes(i + 1))) : 0;

    const linha = u => `
      <tr data-unidade="${u.id}">
        <td class="col-nome">
          <div class="nome-unidade">${UI.esc(u.nome)}</div>
          <div class="acoes-unidade" data-acoes="${u.id}">${nExc(u) ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de ${Store.ano} e usar o padrão o ano todo">usar padrão em ${Store.ano}</button>` : ''}</div>
        </td>
        <td class="col-padrao"><input type="number" class="input input-sm input-num input-padrao" min="0" step="1" inputmode="numeric" data-id="${u.id}" value="${u[this.CAMPO]}" aria-label="Padrão de ${UI.esc(u.nome)}"></td>
        ${MESES.map((m, i) => { const mes = i + 1; const exc = (u.meses || {})[mes]; return `
          <td class="${exc ? 'cel-excecao' : ''}"><input type="number" class="input input-sm input-num input-mes" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-mes="${mes}" value="${exc ? exc[this.CAMPO] : ''}" placeholder="${u[this.CAMPO]}" aria-label="${UI.esc(u.nome)} — ${Calculo.MESES_LONGO[i]}"></td>`; }).join('')}
        <td class="col-media" data-media>${this.fmt(this.media(u))}</td>
      </tr>`;

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Quantas empresas de cada unidade estão com <strong>documentos vencidos</strong> em cada mês do ano selecionado. Cada uma precisa do atendimento completo no mês: uma inspeção e um relatório (técnicos) e uma finalização (administrativos). Preencha o <em>padrão</em> (vale para todos os meses e anos) e, se algum mês for diferente, digite o número naquele mês. Tudo é salvo automaticamente.</p>
      </header>

      <div class="stats">
        <div class="stat"><div class="label">Unidades</div><div class="value">${unidades.length}</div></div>
        <div class="stat" title="Soma do padrão das unidades"><div class="label">Docs. vencidos (padrão)</div><div class="value" id="stat-padrao">${totalPadrao}</div></div>
        <div class="stat" title="Média dos 12 meses de ${Store.ano}, somando as unidades"><div class="label">Média por mês (${Store.ano})</div><div class="value" id="stat-media">${UI.fmt(mediaMes, 1)}</div></div>
        <div class="stat" title="Mês de ${Store.ano} com mais empresas com documentos vencidos, somando as unidades"><div class="label">Mês mais apertado (${Store.ano})</div><div class="value" id="stat-pico">${picoMes}</div></div>
      </div>

      ${unidades.length === 0 ? `
      <section class="card">
        <div class="empty">
          <strong>Nenhuma unidade cadastrada</strong>
          Cadastre as unidades primeiro para informar quantas empresas estão com documentos vencidos em cada uma.
          <br>
          <button type="button" class="btn btn-primary" data-action="go-unidades">Ir para Unidades</button>
        </div>
      </section>` : `
      <section class="card">
        <div class="card-head">
          <h2>Empresas com documentos vencidos, por mês · ${Store.ano}</h2>
          <div class="right">
            <label class="param-inline" data-local><span class="muted">Ano</span> ${Programacao.seletorAnoHTML('empresas-ano')}</label>
            <span class="muted">${UI.plural(unidades.length, 'unidade', 'unidades')}</span>
          </div>
        </div>
        <p class="muted">Os números dos meses são de <strong>${Store.ano}</strong> (troque o ano ao lado para planejar outro ano). A coluna <strong>Padrão</strong> vale para todos os meses e anos sem valor próprio; digite um número em um mês só quando ele for diferente. Célula em azul = mês com valor próprio; apague o número para voltar ao padrão.</p>
        <div class="table-wrap">
          <table class="table table-matriz">
            <thead>
              <tr>
                <th class="col-nome">Unidade</th>
                <th class="col-padrao">Padrão</th>
                ${MESES.map(m => `<th>${m}</th>`).join('')}
                <th class="col-media" title="Média dos 12 meses">Média</th>
              </tr>
            </thead>
            <tbody>
              ${unidades.map(linha).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th class="col-nome">Total das unidades</th>
                <th class="col-padrao" data-total-padrao>${this.fmt(totalPadrao)}</th>
                ${MESES.map((m, i) => `<th data-total-mes="${i + 1}">${this.fmt(somaMes(i + 1))}</th>`).join('')}
                <th class="col-media" data-total-media>${this.fmt(mediaMes)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="note">A programação usa o número de cada mês: para cada empresa com documentos vencidos, a equipe precisa fazer uma inspeção, um relatório e uma finalização naquele mês.</p>
      </section>`}
    `;

    el.querySelector('[data-action="go-unidades"]')?.addEventListener('click', () => App.navigate('unidades'));
    Programacao.bindSeletorAno(el.querySelector('#empresas-ano'));

    // ---- usar padrão o ano todo ----
    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action="limpar-mes"]');
      if (!btn) return;
      const u = Store.unidades.get(btn.dataset.id);
      const ok = await UI.confirm({ title: `Usar o padrão em ${Store.ano}`, message: `Apagar os valores próprios de ${Store.ano} de "${u ? u.nome : ''}"? Todos os meses de ${Store.ano} passam a usar o padrão.`, confirmText: 'Apagar' });
      if (!ok) return;
      try { await Store.empresasMes.limpar(btn.dataset.id); UI.toast('Meses voltaram ao padrão.'); }
      catch (err) { UI.toast(err.message, 'error'); }
    });

    const enterBlur = input => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    // ---- padrão da unidade ----
    el.querySelectorAll('input.input-padrao').forEach(input => {
      enterBlur(input);
      input.addEventListener('change', async () => {
        const valor = Math.max(0, Math.floor(UI.parseNum(input.value, 0)));
        input.value = valor;
        const anterior = Store.unidades.get(input.dataset.id);
        input.disabled = true;
        try {
          await Store.unidades.update(input.dataset.id, { [this.CAMPO]: valor }, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          if (anterior) input.value = anterior[this.CAMPO];
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, input.dataset.id);
        App.updateBadges();
      });
    });

    // ---- valor próprio de um mês ----
    el.querySelectorAll('input.input-mes').forEach(input => {
      enterBlur(input);
      input.addEventListener('change', async () => {
        const u = Store.unidades.get(input.dataset.id);
        if (!u) return;
        const mes = Number(input.dataset.mes);
        const vazio = input.value.trim() === '';
        const excAtual = (u.meses || {})[mes];
        let novo = null;
        if (!vazio) {
          novo = { [this.CAMPO]: Math.max(0, Math.floor(UI.parseNum(input.value, 0))) };
          input.value = novo[this.CAMPO];
        }
        input.disabled = true;
        try {
          await Store.empresasMes.definir(u.id, mes, novo, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          input.value = excAtual ? excAtual[this.CAMPO] : '';
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, u.id);
      });
    });
  },

  /** Recalcula, sem re-renderizar, a linha da unidade (azul, média) e os totais. */
  atualizarUnidade(el, unidadeId) {
    const unidades = Store.unidades.list();
    const u = unidades.find(x => x.id === unidadeId);
    if (u) {
      const tr = el.querySelector(`tr[data-unidade="${unidadeId}"]`);
      if (tr) {
        tr.querySelectorAll('input.input-mes').forEach(inp => {
          const exc = (u.meses || {})[Number(inp.dataset.mes)];
          inp.closest('td').classList.toggle('cel-excecao', !!exc);
          inp.placeholder = u[this.CAMPO];
          if (!exc) inp.value = '';
        });
        tr.querySelector('[data-media]').textContent = this.fmt(this.media(u));
      }
      const acoes = el.querySelector(`[data-acoes="${unidadeId}"]`);
      if (acoes) acoes.innerHTML = Object.keys(u.meses || {}).length ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de ${Store.ano} e usar o padrão o ano todo">usar padrão em ${Store.ano}</button>` : '';
    }
    const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
    const somaMes = m => unidades.reduce((s, x) => s + this.efetivo(x, m), 0);
    const totalPadrao = unidades.reduce((s, x) => s + x[this.CAMPO], 0);
    const mediaMes = unidades.reduce((s, x) => s + this.media(x), 0);
    set('[data-total-padrao]', this.fmt(totalPadrao));
    for (let m = 1; m <= 12; m++) set(`[data-total-mes="${m}"]`, this.fmt(somaMes(m)));
    set('[data-total-media]', this.fmt(mediaMes));
    set('#stat-padrao', totalPadrao);
    set('#stat-media', UI.fmt(mediaMes, 1));
    set('#stat-pico', Math.max(...Calculo.MESES.map((_, i) => somaMes(i + 1))));
  },
};
