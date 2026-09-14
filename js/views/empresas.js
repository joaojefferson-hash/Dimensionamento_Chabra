/* ==========================================================================
   Tela: Empresas por Unidade — quantidade de empresas-cliente por unidade,
   segmentada por grau de dificuldade (baixo / médio / alto).
   Edição inline, salva automaticamente ao alterar o campo.
   Os fatores de tempo por grau (parâmetros do motor) também são editados aqui.
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  GRAUS: [
    { campo: 'empresasBaixo', fator: 'fatorBaixo', rotulo: 'Baixo' },
    { campo: 'empresasMedio', fator: 'fatorMedio', rotulo: 'Médio' },
    { campo: 'empresasAlto',  fator: 'fatorAlto',  rotulo: 'Alto' },
  ],

  render(el) {
    const unidades = Store.unidades.list();
    const p = Store.parametros.get();
    const totais = this.totais(unidades, p);

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Informe quantas empresas-cliente cada unidade atende, por grau de dificuldade. Não é um cadastro individual de empresas — apenas quantidades, salvas automaticamente. O grau multiplica o tempo de elaboração dos documentos no cálculo de demanda.</p>
      </header>

      <div class="stats">
        <div class="stat"><div class="label">Unidades</div><div class="value">${unidades.length}</div></div>
        <div class="stat"><div class="label">Empresas-cliente (total)</div><div class="value" id="empresas-total-stat">${totais.empresas}</div></div>
        <div class="stat"><div class="label">Empresas ponderadas</div><div class="value" id="empresas-ponderadas-stat">${UI.fmt(totais.ponderadas, 1)}</div></div>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Fator de tempo por grau de dificuldade</h2>
          <span class="muted">Multiplica o tempo médio de cada documento</span>
        </div>
        <form id="form-fatores" class="fatores" autocomplete="off">
          ${this.GRAUS.map(g => `
            <label class="field">
              <span>Grau ${g.rotulo}</span>
              <input class="input input-sm input-num" type="number" name="${g.fator}" min="0.1" step="0.05" inputmode="decimal" value="${p[g.fator]}">
            </label>`).join('')}
          <span class="saved-flag" id="fatores-saved" aria-hidden="true">salvo ✓</span>
        </form>
        <p class="note">Padrão sugerido: Baixo 1,0 · Médio 1,3 · Alto 1,6. Ex.: uma empresa de grau alto conta como 1,6 empresa de grau baixo na demanda.</p>
      </section>

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
                  ${this.GRAUS.map(g => `<th class="num">Grau ${g.rotulo}</th>`).join('')}
                  <th class="num">Total</th>
                  <th class="num" title="Soma ponderada pelos fatores de grau">Ponderadas</th>
                </tr>
              </thead>
              <tbody>
                ${unidades.map(u => `
                  <tr data-unidade="${u.id}">
                    <td>${UI.esc(u.nome)}</td>
                    ${this.GRAUS.map(g => `
                      <td class="num">
                        <input type="number" class="input input-sm input-num input-grau" min="0" step="1" inputmode="numeric"
                               data-id="${u.id}" data-campo="${g.campo}" value="${u[g.campo]}"
                               aria-label="Empresas de grau ${g.rotulo} — ${UI.esc(u.nome)}">
                      </td>`).join('')}
                    <td class="num" data-total>${u.empresas}</td>
                    <td class="num" data-ponderadas>${UI.fmt(this.ponderadas(u, p), 1)} <span class="saved-flag" aria-hidden="true">salvo ✓</span></td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  ${this.GRAUS.map(g => `<th class="num" data-total-grau="${g.campo}">${totais[g.campo]}</th>`).join('')}
                  <th class="num" id="empresas-total">${totais.empresas}</th>
                  <th class="num" id="empresas-ponderadas">${UI.fmt(totais.ponderadas, 1)}</th>
                </tr>
              </tfoot>
            </table>
          </div>`}
      </section>
    `;

    el.querySelector('[data-action="go-unidades"]')
      ?.addEventListener('click', () => App.navigate('unidades'));

    // ---- fatores (parâmetros) ----
    const formFatores = el.querySelector('#form-fatores');
    formFatores.addEventListener('submit', e => e.preventDefault());
    formFatores.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('change', async () => {
        const valor = UI.parseNum(input.value, NaN);
        if (!(valor > 0)) {
          UI.toast('O fator precisa ser maior que zero.', 'error');
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
        this.atualizarTotais(el);
        this.piscar(el.querySelector('#fatores-saved'));
      });
    });

    // ---- quantidades por grau ----
    el.querySelectorAll('input.input-grau').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
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
        this.atualizarTotais(el);
        App.updateBadges();
        this.piscar(input.closest('tr').querySelector('.saved-flag'));
      });
    });
  },

  ponderadas(u, p) {
    return u.empresasBaixo * p.fatorBaixo + u.empresasMedio * p.fatorMedio + u.empresasAlto * p.fatorAlto;
  },

  totais(unidades, p) {
    const t = { empresasBaixo: 0, empresasMedio: 0, empresasAlto: 0, empresas: 0, ponderadas: 0 };
    unidades.forEach(u => {
      t.empresasBaixo += u.empresasBaixo;
      t.empresasMedio += u.empresasMedio;
      t.empresasAlto += u.empresasAlto;
      t.empresas += u.empresas;
      t.ponderadas += this.ponderadas(u, p);
    });
    return t;
  },

  /** Atualiza totais e ponderadas na tabela sem re-renderizar (mantém o foco nos inputs). */
  atualizarTotais(el) {
    const p = Store.parametros.get();
    const unidades = Store.unidades.list();
    unidades.forEach(u => {
      const tr = el.querySelector(`tr[data-unidade="${u.id}"]`);
      if (!tr) return;
      tr.querySelector('[data-total]').textContent = u.empresas;
      const cel = tr.querySelector('[data-ponderadas]');
      cel.firstChild.textContent = UI.fmt(this.ponderadas(u, p), 1) + ' ';
    });
    const t = this.totais(unidades, p);
    this.GRAUS.forEach(g => { const th = el.querySelector(`[data-total-grau="${g.campo}"]`); if (th) th.textContent = t[g.campo]; });
    const set = (id, v) => { const x = el.querySelector('#' + id); if (x) x.textContent = v; };
    set('empresas-total', t.empresas);
    set('empresas-total-stat', t.empresas);
    set('empresas-ponderadas', UI.fmt(t.ponderadas, 1));
    set('empresas-ponderadas-stat', UI.fmt(t.ponderadas, 1));
  },

  piscar(flag) {
    if (!flag) return;
    flag.classList.add('show');
    clearTimeout(flag._timer);
    flag._timer = setTimeout(() => flag.classList.remove('show'), 1500);
  },
};
