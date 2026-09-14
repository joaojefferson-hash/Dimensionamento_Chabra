/* ==========================================================================
   Tela: Empresas por Unidade — quantidade de empresas-cliente por unidade
   (edição inline, salva automaticamente ao alterar o campo)
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  render(el) {
    const unidades = Store.unidades.list();
    const total = unidades.reduce((soma, u) => soma + u.empresas, 0);

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Informe quantas empresas-cliente cada unidade atende. Não é um cadastro individual de empresas — apenas a quantidade, que pode ser ajustada a qualquer momento. As alterações são salvas automaticamente.</p>
      </header>

      <div class="stats">
        <div class="stat">
          <div class="label">Unidades</div>
          <div class="value">${unidades.length}</div>
        </div>
        <div class="stat">
          <div class="label">Empresas-cliente (total)</div>
          <div class="value" id="empresas-total-stat">${total}</div>
        </div>
      </div>

      <section class="card">
        ${unidades.length === 0 ? `
          <div class="empty">
            <strong>Nenhuma unidade cadastrada</strong>
            Cadastre as unidades primeiro para informar a quantidade de empresas de cada uma.
            <br>
            <button type="button" class="btn btn-primary" data-action="go-unidades">Ir para Unidades</button>
          </div>` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th class="num">Empresas-cliente</th>
                </tr>
              </thead>
              <tbody>
                ${unidades.map(u => `
                  <tr>
                    <td>${UI.esc(u.nome)}</td>
                    <td class="num">
                      <input type="number" class="input input-sm input-num" min="0" step="1"
                             inputmode="numeric" data-id="${u.id}" value="${u.empresas}"
                             aria-label="Empresas-cliente de ${UI.esc(u.nome)}">
                      <span class="saved-flag" aria-hidden="true">salvo ✓</span>
                    </td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th class="num" id="empresas-total">${total}</th>
                </tr>
              </tfoot>
            </table>
          </div>`}
      </section>
    `;

    el.querySelector('[data-action="go-unidades"]')
      ?.addEventListener('click', () => App.navigate('unidades'));

    el.querySelectorAll('input[data-id]').forEach(input => {
      // Enter confirma o valor sem sair da tela
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });

      input.addEventListener('change', () => {
        const valor = Math.max(0, Math.floor(UI.parseNum(input.value, 0)));
        input.value = valor;
        Store.unidades.update(input.dataset.id, { empresas: valor }, { silent: true });

        const novoTotal = Store.counts().empresas;
        el.querySelector('#empresas-total').textContent = novoTotal;
        el.querySelector('#empresas-total-stat').textContent = novoTotal;
        App.updateBadges();

        const flag = input.nextElementSibling;
        flag.classList.add('show');
        clearTimeout(flag._timer);
        flag._timer = setTimeout(() => flag.classList.remove('show'), 1500);
      });
    });
  },
};
