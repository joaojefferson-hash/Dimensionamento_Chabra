/* ==========================================================================
   Tela: Empresas por Unidade — matriz unidade × mês.

   Cada unidade tem um valor PADRÃO por grau (baixo / médio / alto) e pode ter
   valores diferentes em meses específicos. A matriz mostra, para o grau
   escolhido, uma linha por unidade: Padrão | Jan … Dez | Média. Editar um mês
   grava a exceção daquele mês (os outros graus do mês ficam como estão);
   apagar a célula volta ao padrão. Tudo salva automaticamente.
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  GRAUS: [
    { campo: 'empresasBaixo', fator: 'fatorBaixo', rotulo: 'Baixo', ajuda: 'empresas simples, com poucos riscos' },
    { campo: 'empresasMedio', fator: 'fatorMedio', rotulo: 'Médio', ajuda: 'empresas de porte ou complexidade média' },
    { campo: 'empresasAlto',  fator: 'fatorAlto',  rotulo: 'Alto',  ajuda: 'empresas grandes ou com muitos riscos' },
  ],

  grauSel: 'empresasBaixo', // grau mostrado na matriz ('total' = só leitura)

  render(el) {
    const unidades = Store.unidades.list();
    const p = Store.parametros.get();
    const grau = this.GRAUS.find(g => g.campo === this.grauSel) || null; // null = total
    const MESES = Calculo.MESES;

    // valor efetivo de uma unidade num mês (1..12) para um campo
    const efetivo = (u, mes, campo) => { const exc = (u.meses || {})[mes]; return exc ? exc[campo] : u[campo]; };
    const totalMes = (u, mes) => efetivo(u, mes, 'empresasBaixo') + efetivo(u, mes, 'empresasMedio') + efetivo(u, mes, 'empresasAlto');
    const valorCelula = (u, mes) => (grau ? efetivo(u, mes, grau.campo) : totalMes(u, mes));
    const valorPadrao = u => (grau ? u[grau.campo] : u.empresas);
    const media = u => { let s = 0; for (let m = 1; m <= 12; m++) s += valorCelula(u, m); return s / 12; };
    const temExcecao = (u, mes) => !!(u.meses || {})[mes];
    const nExc = u => Object.keys(u.meses || {}).length;
    const fmt = v => (Number.isInteger(v) ? String(v) : UI.fmt(v, 1));

    const totais = { padrao: 0, meses: new Array(12).fill(0), media: 0 };
    unidades.forEach(u => {
      totais.padrao += valorPadrao(u);
      for (let m = 1; m <= 12; m++) totais.meses[m - 1] += valorCelula(u, m);
      totais.media += media(u);
    });
    const totalEmpresas = unidades.reduce((s, u) => s + u.empresas, 0);
    const totalPonderadas = unidades.reduce((s, u) => s + Calculo.empresasPonderadas(u, p), 0);

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Quantas empresas-cliente cada unidade atende em cada mês do ano. Preencha o <em>padrão</em> (vale para o ano todo) e, se algum mês for diferente, digite o número naquele mês. Tudo é salvo automaticamente.</p>
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
              <span>Grau ${g.rotulo}</span>
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
              ${this.GRAUS.map(g => `<button type="button" class="seg-btn ${this.grauSel === g.campo ? 'ativo' : ''}" data-action="grau" data-grau="${g.campo}">Grau ${g.rotulo}</button>`).join('')}
              <button type="button" class="seg-btn ${this.grauSel === 'total' ? 'ativo' : ''}" data-action="grau" data-grau="total">Total</button>
            </div>
          </div>
        </div>
        <p class="muted">${grau
          ? `Grau <strong>${grau.rotulo}</strong> (${grau.ajuda}). A coluna <strong>Padrão</strong> vale para todos os meses; digite um número em um mês só quando ele for diferente. Célula em azul = mês com valor próprio; apague o número para voltar ao padrão.`
          : 'Soma dos três graus em cada mês (somente leitura — escolha um grau para editar).'}</p>
        <div class="table-wrap">
          <table class="table table-matriz">
            <thead>
              <tr>
                <th>Unidade</th>
                <th class="num col-padrao">Padrão</th>
                ${MESES.map(m => `<th class="num">${m}</th>`).join('')}
                <th class="num" title="Média dos 12 meses">Média</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${unidades.map(u => `
                <tr data-unidade="${u.id}">
                  <td class="col-nome">${UI.esc(u.nome)}</td>
                  <td class="num col-padrao">${grau
                    ? `<input type="number" class="input input-sm input-num input-padrao" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-campo="${grau.campo}" value="${u[grau.campo]}" aria-label="Padrão de ${UI.esc(u.nome)}">`
                    : `<strong>${u.empresas}</strong>`}</td>
                  ${MESES.map((m, i) => { const mes = i + 1; const exc = temExcecao(u, mes); return grau
                    ? `<td class="num ${exc ? 'cel-excecao' : ''}"><input type="number" class="input input-sm input-num input-mes" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-mes="${mes}" data-campo="${grau.campo}" value="${exc ? efetivo(u, mes, grau.campo) : ''}" placeholder="${u[grau.campo]}" aria-label="${UI.esc(u.nome)} — ${Calculo.MESES_LONGO[i]}"></td>`
                    : `<td class="num ${exc ? 'cel-excecao' : ''}">${totalMes(u, mes)}</td>`; }).join('')}
                  <td class="num col-media" data-media>${fmt(media(u))}</td>
                  <td class="actions">${nExc(u) ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de mês e usar o padrão o ano todo">usar padrão</button>` : ''}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th class="num col-padrao" data-total-padrao>${fmt(totais.padrao)}</th>
                ${totais.meses.map((v, i) => `<th class="num" data-total-mes="${i + 1}">${fmt(v)}</th>`).join('')}
                <th class="num" data-total-media>${fmt(totais.media)}</th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="note">Os números da coluna Padrão são os mesmos usados quando o mês não tem valor próprio. A programação usa o número de cada mês.</p>
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

    // ---- seletor de grau / usar padrão ----
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

    // ---- padrão da unidade (grau selecionado) ----
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
        this.atualizarLinha(el, input.dataset.id);
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
        this.atualizarLinha(el, u.id);
      });
    });
  },

  /** Recalcula, sem re-renderizar, a linha da unidade (célula em azul, média) e os totais. */
  atualizarLinha(el, unidadeId) {
    const unidades = Store.unidades.list();
    const grau = this.GRAUS.find(g => g.campo === this.grauSel) || null;
    const efetivo = (u, mes, campo) => { const exc = (u.meses || {})[mes]; return exc ? exc[campo] : u[campo]; };
    const valor = (u, mes) => (grau ? efetivo(u, mes, grau.campo) : this.GRAUS.reduce((s, g) => s + efetivo(u, mes, g.campo), 0));
    const fmt = v => (Number.isInteger(v) ? String(v) : UI.fmt(v, 1));

    const u = unidades.find(x => x.id === unidadeId);
    const tr = el.querySelector(`tr[data-unidade="${unidadeId}"]`);
    if (u && tr) {
      let soma = 0;
      tr.querySelectorAll('input.input-mes').forEach(inp => {
        const mes = Number(inp.dataset.mes);
        const exc = (u.meses || {})[mes];
        inp.closest('td').classList.toggle('cel-excecao', !!exc);
        inp.placeholder = grau ? u[grau.campo] : '';
        if (!exc) inp.value = '';
      });
      for (let m = 1; m <= 12; m++) soma += valor(u, m);
      tr.querySelector('[data-media]').textContent = fmt(soma / 12);
      const n = Object.keys(u.meses || {}).length;
      tr.querySelector('td.actions').innerHTML = n ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar os valores próprios de mês e usar o padrão o ano todo">usar padrão</button>` : '';
    }
    // totais
    let padrao = 0, mediaT = 0;
    const meses = new Array(12).fill(0);
    unidades.forEach(x => {
      padrao += grau ? x[grau.campo] : x.empresas;
      let s = 0;
      for (let m = 1; m <= 12; m++) { const v = valor(x, m); meses[m - 1] += v; s += v; }
      mediaT += s / 12;
    });
    const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
    set('[data-total-padrao]', fmt(padrao));
    meses.forEach((v, i) => set(`[data-total-mes="${i + 1}"]`, fmt(v)));
    set('[data-total-media]', fmt(mediaT));
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
