/* ==========================================================================
   Tela: Catálogo de Documentos SST — tipos de documento produzidos pela equipe
   ========================================================================== */

const ViewCatalogo = {
  id: 'catalogo',
  title: 'Catálogo de Documentos',
  oculta: true, // o modelo de produção diária não usa horas por documento; tela mantida para uma fase futura
  editingId: null,
  pendingFocus: false,

  leave() {
    this.editingId = null;
    this.pendingFocus = false;
  },

  /** Texto amigável para a periodicidade em meses. */
  descPeriodicidade(meses) {
    if (meses === 0) return 'Sob demanda';
    if (meses === 1) return 'Mensal';
    if (meses === 12) return 'Anual';
    if (meses % 12 === 0) return `A cada ${meses / 12} anos`;
    return `A cada ${meses} meses`;
  },

  render(el) {
    const documentos = Store.documentos.list();
    const editing = this.editingId ? Store.documentos.get(this.editingId) : null;
    if (this.editingId && !editing) this.editingId = null;

    el.innerHTML = `
      <header class="page-header">
        <h1>Catálogo de Documentos SST</h1>
        <p>Tipos de documento que a equipe produz, com o tempo médio de elaboração, a periodicidade de renovação e quem os produz. Esses parâmetros alimentam o cálculo de demanda das telas de Programação.</p>
      </header>

      <section class="card">
        <h2>${editing ? 'Editar tipo de documento' : 'Novo tipo de documento'}</h2>
        <form id="form-documento" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>Nome do documento</span>
            <input class="input" name="nome" required maxlength="100"
                   placeholder="Ex.: PCMSO, Ordem de Serviço"
                   value="${UI.esc(editing ? editing.nome : '')}">
          </label>
          <label class="field">
            <span>Tempo médio de elaboração (horas)</span>
            <input class="input" type="number" name="horas" required min="0" step="0.5" inputmode="decimal"
                   placeholder="Ex.: 8"
                   value="${editing ? editing.horas : ''}">
          </label>
          <label class="field">
            <span>Periodicidade de renovação (meses)</span>
            <input class="input" type="number" name="periodicidadeMeses" required min="0" step="1" inputmode="numeric"
                   placeholder="Ex.: 12"
                   value="${editing ? editing.periodicidadeMeses : ''}">
            <small>0 = sob demanda (sem renovação periódica; fica fora do cálculo de demanda).</small>
          </label>
          <label class="field span-2">
            <span>Produzido por</span>
            <select class="input" name="responsavel" required>
              ${Store.FUNCOES.map(f => `<option value="${UI.esc(f)}" ${(editing ? editing.responsavel : Store.FUNCOES[0]) === f ? 'selected' : ''}>${UI.esc(f)}</option>`).join('')}
            </select>
            <small>Define de qual capacidade (técnicos ou administrativos) a demanda deste documento é abatida.</small>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Adicionar documento'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>' : ''}
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Documentos cadastrados</h2>
          <div class="right">
            <span class="muted">${UI.plural(documentos.length, 'tipo', 'tipos')}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="restore" title="Reinsere os itens padrão que tenham sido removidos">Restaurar itens padrão</button>
          </div>
        </div>
        ${documentos.length === 0 ? `
          <div class="empty">
            <strong>Nenhum tipo de documento cadastrado</strong>
            Adicione um tipo acima ou restaure os itens padrão.
          </div>` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th class="num">Tempo médio (h)</th>
                  <th class="num">Renovação (meses)</th>
                  <th>Periodicidade</th>
                  <th>Produzido por</th>
                  <th class="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${documentos.map(d => `
                  <tr class="${d.id === this.editingId ? 'editing' : ''}">
                    <td>${UI.esc(d.nome)}</td>
                    <td class="num">${UI.fmt(d.horas)}</td>
                    <td class="num">${d.periodicidadeMeses}</td>
                    <td><span class="chip ${d.periodicidadeMeses === 0 ? 'chip-gray' : 'chip-green'}">${this.descPeriodicidade(d.periodicidadeMeses)}</span></td>
                    <td><span class="chip ${d.responsavel === Store.FUNCOES[1] ? 'chip-blue' : 'chip-green'}">${d.responsavel === Store.FUNCOES[1] ? 'Administrativo' : 'Técnico de SST'}</span></td>
                    <td class="actions">
                      <button type="button" class="btn-link" data-action="edit" data-id="${d.id}">Editar</button>
                      <button type="button" class="btn-link danger" data-action="delete" data-id="${d.id}">Excluir</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        <p class="note">Os valores pré-carregados (horas e periodicidade) são sugestões iniciais — ajuste conforme a realidade da equipe.</p>
      </section>
    `;

    const form = el.querySelector('#form-documento');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const horas = UI.parseNum(form.horas.value, NaN);
      const periodicidadeMeses = UI.parseNum(form.periodicidadeMeses.value, NaN);

      if (!nome) return;
      if (!Number.isFinite(horas) || horas < 0) {
        UI.toast('Informe um tempo médio válido (em horas).', 'error');
        form.horas.focus();
        return;
      }
      if (!Number.isFinite(periodicidadeMeses) || periodicidadeMeses < 0) {
        UI.toast('Informe uma periodicidade válida (em meses, 0 = sob demanda).', 'error');
        form.periodicidadeMeses.focus();
        return;
      }
      if (Store.nomeDuplicado('documentos', nome, this.editingId)) {
        UI.toast('Já existe um documento com esse nome.', 'error');
        form.nome.focus();
        return;
      }

      const dados = { nome, horas, periodicidadeMeses, responsavel: form.responsavel.value };
      UI.busy(form, true);
      try {
        if (this.editingId) {
          await Store.documentos.update(this.editingId, dados);
          this.editingId = null;
          this.pendingFocus = true;
          UI.toast('Documento atualizado.');
        } else {
          await Store.documentos.add(dados);
          this.pendingFocus = true;
          UI.toast('Documento adicionado.');
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
      } else if (action === 'restore') {
        btn.disabled = true;
        try {
          const n = await Store.restaurarDocumentosPadrao();
          UI.toast(n > 0 ? `${UI.plural(n, 'item padrão restaurado', 'itens padrão restaurados')}.` : 'Todos os itens padrão já estão no catálogo.', n > 0 ? 'success' : 'info');
        } catch (err) {
          UI.toast(err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      } else if (action === 'delete') {
        const d = Store.documentos.get(id);
        if (!d) return;
        const ok = await UI.confirm({
          title: 'Excluir documento',
          message: `Excluir o tipo de documento "${d.nome}" do catálogo?`,
          confirmText: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        try {
          await Store.documentos.remove(id);
          if (this.editingId === id) this.editingId = null;
          UI.toast('Documento excluído.');
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
