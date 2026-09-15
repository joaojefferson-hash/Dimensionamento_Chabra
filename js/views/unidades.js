/* ==========================================================================
   Tela: Unidades — CRUD de unidades/filiais
   ========================================================================== */

const ViewUnidades = {
  id: 'unidades',
  title: 'Unidades',
  editingId: null,
  pendingFocus: false,

  leave() {
    this.editingId = null;
    this.pendingFocus = false;
  },

  render(el) {
    const unidades = Store.unidades.list();
    const editing = this.editingId ? Store.unidades.get(this.editingId) : null;
    if (this.editingId && !editing) this.editingId = null;

    el.innerHTML = `
      <header class="page-header">
        <h1>Unidades</h1>
        <p>Cadastre as unidades ou filiais da consultoria. Quantas empresas de cada uma estão com documentos vencidos é informado na tela <em>Empresas por Unidade</em>.</p>
      </header>

      <section class="card">
        <h2>${editing ? 'Editar unidade' : 'Nova unidade'}</h2>
        <form id="form-unidade" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>Nome da unidade</span>
            <input class="input" name="nome" required maxlength="80"
                   placeholder="Ex.: Matriz, Filial Campinas"
                   value="${UI.esc(editing ? editing.nome : '')}">
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Adicionar unidade'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>' : ''}
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Unidades cadastradas</h2>
          <span class="muted">${UI.plural(unidades.length, 'unidade', 'unidades')}</span>
        </div>
        ${unidades.length === 0 ? `
          <div class="empty">
            <strong>Nenhuma unidade cadastrada</strong>
            Use o formulário acima para adicionar a primeira unidade.
          </div>` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th class="num" title="Padrão (Mensal + Exclusiva TST); a variação por mês fica em Empresas por Unidade">Clientes (padrão)</th>
                  <th class="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${unidades.map(u => `
                  <tr class="${u.id === this.editingId ? 'editing' : ''}">
                    <td>${UI.esc(u.nome)}</td>
                    <td class="num">${u.empresas}</td>
                    <td class="actions">
                      <button type="button" class="btn-link" data-action="edit" data-id="${u.id}">Editar</button>
                      <button type="button" class="btn-link danger" data-action="delete" data-id="${u.id}">Excluir</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
      </section>
    `;

    const form = el.querySelector('#form-unidade');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      if (!nome) return;
      if (Store.nomeDuplicado('unidades', nome, this.editingId)) {
        UI.toast('Já existe uma unidade com esse nome.', 'error');
        form.nome.focus();
        return;
      }
      UI.busy(form, true);
      try {
        if (this.editingId) {
          await Store.unidades.update(this.editingId, { nome });
          this.editingId = null;
          this.pendingFocus = true;
          UI.toast('Unidade atualizada.');
        } else {
          await Store.unidades.add({ nome, empresas: 0 });
          this.pendingFocus = true;
          UI.toast('Unidade adicionada.');
        }
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        UI.busy(form, false);
      }
    });

    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === 'cancel') {
        this.editingId = null;
        App.render();
      } else if (action === 'edit') {
        this.editingId = id;
        this.pendingFocus = true;
        App.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'delete') {
        const u = Store.unidades.get(id);
        if (!u) return;
        const extra = u.empresas > 0
          ? `\n\nEsta unidade tem ${UI.plural(u.empresas, 'empresa com documentos vencidos', 'empresas com documentos vencidos')} no padrão; esse número (e a variação por mês) será perdido.`
          : '';
        const ok = await UI.confirm({
          title: 'Excluir unidade',
          message: `Excluir a unidade "${u.nome}"?${extra}`,
          confirmText: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        try {
          await Store.unidades.remove(id);
          if (this.editingId === id) this.editingId = null;
          UI.toast('Unidade excluída.');
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      }
    });

    if (this.pendingFocus) {
      this.pendingFocus = false;
      form.nome.focus();
      if (editing) form.nome.select();
    }
  },
};
