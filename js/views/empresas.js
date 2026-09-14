/* ==========================================================================
   Tela: Empresas por Unidade — matriz unidade × mês, com os três graus.

   Cada unidade tem um valor PADRÃO por grau (baixo / médio / alto) e pode ter
   valores diferentes em meses específicos. A matriz mostra, por unidade, uma
   linha para cada grau (+ a linha Total da unidade): Padrão | Jan … Dez | Média.
   Editar um mês grava a exceção daquele mês (os outros graus do mês ficam
   como estão); apagar a célula volta ao padrão. Tudo salva automaticamente.
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  GRAUS: [
    { campo: 'empresasBaixo', fator: 'fatorBaixo', rotulo: 'Baixo', classe: 'grau-baixo', ajuda: 'empresas simples, com poucos riscos' },
    { campo: 'empresasMedio', fator: 'fatorMedio', rotulo: 'Médio', classe: 'grau-medio', ajuda: 'empresas de porte ou complexidade média' },
    { campo: 'empresasAlto',  fator: 'fatorAlto',  rotulo: 'Alto',  classe: 'grau-alto',  ajuda: 'empresas grandes ou com muitos riscos' },
  ],

  grauSel: 'todos', // 'todos' | campo de um grau

  /* ---------- helpers de valor ---------- */

  efetivo(u, mes, campo) { const exc = (u.meses || {})[mes]; return exc ? exc[campo] : u[campo]; },
  totalMes(u, mes) { return this.GRAUS.reduce((s, g) => s + this.efetivo(u, mes, g.campo), 0); },
  media(u, campo) { let s = 0; for (let m = 1; m <= 12; m++) s += campo ? this.efetivo(u, m, campo) : this.totalMes(u, m); return s / 12; },
  fmt(v) { return Number.isInteger(v) ? String(v) : UI.fmt(v, 1); },

  render(el) {
    const unidades = Store.unidades.list();
    const p = Store.parametros.get();
    const grausMostrados = this.grauSel === 'todos' ? this.GRAUS : this.GRAUS.filter(g => g.campo === this.grauSel);
    const mostrarTotalUnidade = this.grauSel === 'todos';
    const MESES = Calculo.MESES;
    const nExc = u => Object.keys(u.meses || {}).length;

    const totalEmpresas = unidades.reduce((s, u) => s + u.empresas, 0);
    const totalPonderadas = unidades.reduce((s, u) => s + Calculo.empresasPonderadas(u, p), 0);

    // rodapé: soma das unidades para os graus mostrados
    const somaPadrao = unidades.reduce((s, u) => s + grausMostrados.reduce((t, g) => t + u[g.campo], 0), 0);
    const somaMes = m => unidades.reduce((s, u) => s + grausMostrados.reduce((t, g) => t + this.efetivo(u, m, g.campo), 0), 0);
    const somaMedia = unidades.reduce((s, u) => s + grausMostrados.reduce((t, g) => t + this.media(u, g.campo), 0), 0);

    const linhaGrau = (u, g, primeira, nLinhas) => `
      <tr data-unidade="${u.id}" data-campo="${g.campo}">
        ${primeira ? `<td class="col-nome" rowspan="${nLinhas}">
          <div class="nome-unidade">${UI.esc(u.nome)}</div>
          <div class="acoes-unidade" data-acoes="${u.id}">${nExc(u) ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de mês e usar o padrão o ano todo">usar padrão o ano todo</button>` : ''}</div>
        </td>` : ''}
        <td class="col-grau"><span class="chip-grau ${g.classe}" title="${g.ajuda}">${g.rotulo}</span></td>
        <td class="col-padrao"><input type="number" class="input input-sm input-num input-padrao" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-campo="${g.campo}" value="${u[g.campo]}" aria-label="Padrão grau ${g.rotulo} de ${UI.esc(u.nome)}"></td>
        ${MESES.map((m, i) => { const mes = i + 1; const exc = (u.meses || {})[mes]; return `
          <td class="${exc ? 'cel-excecao' : ''}"><input type="number" class="input input-sm input-num input-mes" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-mes="${mes}" data-campo="${g.campo}" value="${exc ? exc[g.campo] : ''}" placeholder="${u[g.campo]}" aria-label="${UI.esc(u.nome)} grau ${g.rotulo} — ${Calculo.MESES_LONGO[i]}"></td>`; }).join('')}
        <td class="col-media" data-media>${this.fmt(this.media(u, g.campo))}</td>
      </tr>`;

    const linhaTotalUnidade = u => `
      <tr class="linha-total-unidade" data-unidade="${u.id}" data-total>
        <td class="col-grau"><strong>Total</strong></td>
        <td class="col-padrao" data-padrao-total><strong>${u.empresas}</strong></td>
        ${MESES.map((m, i) => `<td data-mes-total="${i + 1}"><strong>${this.totalMes(u, i + 1)}</strong></td>`).join('')}
        <td class="col-media" data-media><strong>${this.fmt(this.media(u, null))}</strong></td>
      </tr>`;

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Quantas empresas-cliente cada unidade atende em cada mês do ano, separadas por grau de dificuldade. Preencha o <em>padrão</em> (vale para o ano todo) e, se algum mês for diferente, digite o número naquele mês. Tudo é salvo automaticamente.</p>
      </header>

      <div class="stats">
        <div class="stat"><div class="label">Unidades</div><div class="value">${unidades.length}</div></div>
        <div class="stat"><div class="label">Empresas no padrão</div><div class="value" id="stat-empresas">${totalEmpresas}</div></div>
        <div class="stat" title="Empresas contadas com o peso do grau (ex.: uma de grau alto vale 1,6)"><div class="label">Com peso do grau</div><div class="value" id="stat-ponderadas">${UI.fmt(totalPonderadas, 1)}</div></div>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Peso de cada grau de dificuldade</h2>
          <span class="muted">Quanto mais difícil a empresa, mais trabalho ela dá</span>
        </div>
        <form id="form-fatores" class="fatores" autocomplete="off">
          ${this.GRAUS.map(g => `
            <label class="field">
              <span><span class="chip-grau ${g.classe}">${g.rotulo}</span></span>
              <input class="input input-sm input-num" type="number" name="${g.fator}" min="0.1" step="0.05" inputmode="decimal" value="${p[g.fator]}">
              <small>${g.ajuda}</small>
            </label>`).join('')}
          <span class="saved-flag" id="fatores-saved" aria-hidden="true">salvo ✓</span>
        </form>
        <p class="note">Sugestão: Baixo 1,0 · Médio 1,3 · Alto 1,6 — ou seja, uma empresa de grau alto dá o trabalho de 1,6 empresa de grau baixo.</p>
      </section>

      ${unidades.length === 0 ? `
      <section class="card">
        <div class="empty">
          <strong>Nenhuma unidade cadastrada</strong>
          Cadastre as unidades primeiro para informar a quantidade de empresas de cada uma.
          <br>
          <button type="button" class="btn btn-primary" data-action="go-unidades">Ir para Unidades</button>
        </div>
      </section>` : `
      <section class="card">
        <div class="card-head">
          <h2>Empresas por mês</h2>
          <div class="right">
            <span class="muted">Mostrar:</span>
            <div class="seg" role="tablist">
              <button type="button" class="seg-btn ${this.grauSel === 'todos' ? 'ativo' : ''}" data-action="grau" data-grau="todos">Todos os graus</button>
              ${this.GRAUS.map(g => `<button type="button" class="seg-btn ${this.grauSel === g.campo ? 'ativo' : ''}" data-action="grau" data-grau="${g.campo}">Só ${g.rotulo}</button>`).join('')}
            </div>
          </div>
        </div>
        <p class="muted">Cada unidade tem uma linha por grau. A coluna <strong>Padrão</strong> vale para todos os meses; digite um número em um mês só quando ele for diferente. Célula em azul = mês com valor próprio; apague o número para voltar ao padrão.</p>
        <div class="table-wrap">
          <table class="table table-matriz">
            <thead>
              <tr>
                <th class="col-nome">Unidade</th>
                <th class="col-grau">Grau</th>
                <th class="col-padrao">Padrão</th>
                ${MESES.map(m => `<th>${m}</th>`).join('')}
                <th class="col-media" title="Média dos 12 meses">Média</th>
              </tr>
            </thead>
            <tbody>
              ${unidades.map(u => {
                const nLinhas = grausMostrados.length + (mostrarTotalUnidade ? 1 : 0);
                return grausMostrados.map((g, i) => linhaGrau(u, g, i === 0, nLinhas)).join('') + (mostrarTotalUnidade ? linhaTotalUnidade(u) : '');
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
        <p class="note">Os números da coluna Padrão são os mesmos usados quando o mês não tem valor próprio. A programação usa o número de cada mês, com o peso de cada grau.</p>
      </section>`}
    `;

    el.querySelector('[data-action="go-unidades"]')?.addEventListener('click', () => App.navigate('unidades'));

    // ---- pesos ----
    const formFatores = el.querySelector('#form-fatores');
    formFatores.addEventListener('submit', e => e.preventDefault());
    formFatores.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('change', async () => {
        const valor = UI.parseNum(input.value, NaN);
        if (!(valor > 0)) {
          UI.toast('O peso precisa ser maior que zero.', 'error');
          input.value = Store.parametros.get()[input.name];
          return;
        }
        input.disabled = true;
        try {
          await Store.parametros.update({ [input.name]: valor }, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          input.value = Store.parametros.get()[input.name];
          return;
        } finally {
          input.disabled = false;
        }
        const st = el.querySelector('#stat-ponderadas');
        if (st) st.textContent = UI.fmt(Store.unidades.list().reduce((s, u) => s + Calculo.empresasPonderadas(u, Store.parametros.get()), 0), 1);
        this.piscar(el.querySelector('#fatores-saved'));
      });
    });

    // ---- seletor / usar padrão ----
    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'grau') {
        this.grauSel = btn.dataset.grau;
        App.render();
      } else if (btn.dataset.action === 'limpar-mes') {
        const u = Store.unidades.get(btn.dataset.id);
        const ok = await UI.confirm({ title: 'Usar o padrão o ano todo', message: `Apagar os valores próprios de mês de "${u ? u.nome : ''}"? Todos os meses passam a usar o padrão.`, confirmText: 'Apagar' });
        if (!ok) return;
        try { await Store.empresasMes.limpar(btn.dataset.id); UI.toast('Meses voltaram ao padrão.'); }
        catch (err) { UI.toast(err.message, 'error'); }
      }
    });

    const enterBlur = input => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    // ---- padrão da unidade (por grau) ----
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
          if (anterior) input.value = anterior[input.dataset.campo];
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, input.dataset.id);
        App.updateBadges();
      });
    });

    // ---- valor próprio de um mês (por grau) ----
    el.querySelectorAll('input.input-mes').forEach(input => {
      enterBlur(input);
      input.addEventListener('change', async () => {
        const u = Store.unidades.get(input.dataset.id);
        if (!u) return;
        const mes = Number(input.dataset.mes);
        const campo = input.dataset.campo;
        const vazio = input.value.trim() === '';
        const excAtual = (u.meses || {})[mes];
        let novo = null;
        if (!vazio) {
          const base = excAtual || { empresasBaixo: u.empresasBaixo, empresasMedio: u.empresasMedio, empresasAlto: u.empresasAlto };
          novo = { ...base, [campo]: Math.max(0, Math.floor(UI.parseNum(input.value, 0))) };
          input.value = novo[campo];
        } else if (excAtual) {
          // apagou este grau: se os outros graus do mês ainda diferem do padrão, mantém a exceção com o padrão neste grau
          const resto = { ...excAtual, [campo]: u[campo] };
          const igualPadrao = this.GRAUS.every(g => resto[g.campo] === u[g.campo]);
          novo = igualPadrao ? null : resto;
        }
        input.disabled = true;
        try {
          await Store.empresasMes.definir(u.id, mes, novo, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          input.value = excAtual ? excAtual[campo] : '';
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, u.id);
      });
    });
  },

  /** Recalcula, sem re-renderizar, as linhas da unidade (azul, médias, total) e o rodapé. */
  atualizarUnidade(el, unidadeId) {
    const unidades = Store.unidades.list();
    const u = unidades.find(x => x.id === unidadeId);
    if (u) {
      el.querySelectorAll(`tr[data-unidade="${unidadeId}"][data-campo]`).forEach(tr => {
        const campo = tr.dataset.campo;
        tr.querySelectorAll('input.input-mes').forEach(inp => {
          const exc = (u.meses || {})[Number(inp.dataset.mes)];
          inp.closest('td').classList.toggle('cel-excecao', !!exc);
          inp.placeholder = u[campo];
          if (!exc) inp.value = '';
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
      if (acoes) acoes.innerHTML = Object.keys(u.meses || {}).length ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de mês e usar o padrão o ano todo">usar padrão o ano todo</button>` : '';
    }
    // rodapé (graus mostrados)
    const grausMostrados = this.grauSel === 'todos' ? this.GRAUS : this.GRAUS.filter(g => g.campo === this.grauSel);
    const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
    set('[data-total-padrao]', this.fmt(unidades.reduce((s, x) => s + grausMostrados.reduce((t, g) => t + x[g.campo], 0), 0)));
    for (let m = 1; m <= 12; m++) set(`[data-total-mes="${m}"]`, this.fmt(unidades.reduce((s, x) => s + grausMostrados.reduce((t, g) => t + this.efetivo(x, m, g.campo), 0), 0)));
    set('[data-total-media]', this.fmt(unidades.reduce((s, x) => s + grausMostrados.reduce((t, g) => t + this.media(x, g.campo), 0), 0)));
    set('#stat-empresas', unidades.reduce((s, x) => s + x.empresas, 0));
    set('#stat-ponderadas', UI.fmt(unidades.reduce((s, x) => s + Calculo.empresasPonderadas(x, Store.parametros.get()), 0), 1));
  },

  piscar(flag) {
    if (!flag) return;
    flag.classList.add('show');
    clearTimeout(flag._timer);
    flag._timer = setTimeout(() => flag.classList.remove('show'), 1500);
  },
};
