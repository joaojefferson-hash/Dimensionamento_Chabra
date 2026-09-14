/* ==========================================================================
   Tela: Colaboradores — equipe (técnicos de segurança e administrativos)
   ========================================================================== */

const ViewColaboradores = {
  id: 'colaboradores',
  title: 'Colaboradores',
  editingId: null,
  pendingFocus: false,

  leave() {
    this.editingId = null;
    this.pendingFocus = false;
  },

  render(el) {
    const colaboradores = Store.colaboradores.list();
    const editing = this.editingId ? Store.colaboradores.get(this.editingId) : null;
    if (this.editingId && !editing) this.editingId = null;

    const [FUNCAO_TST, FUNCAO_ADM] = Store.FUNCOES;
    const tecnicos = colaboradores.filter(c => c.funcao === FUNCAO_TST).length;
    const administrativos = colaboradores.filter(c => c.funcao === FUNCAO_ADM).length;
    const horasEfetivas = c => c.horasMes * (c.eficiencia / 100);
    const capacidadeTotal = colaboradores.reduce((soma, c) => soma + horasEfetivas(c), 0);

    const funcaoAtual = editing ? editing.funcao : FUNCAO_TST;
    const horasMesAtual = editing ? editing.horasMes : Store.DEFAULT_COLABORADOR.horasMes;
    const eficienciaAtual = editing ? editing.eficiencia : Store.DEFAULT_COLABORADOR.eficiencia;

    el.innerHTML = `
      <header class="page-header">
        <h1>Colaboradores</h1>
        <p>Equipe que produz os documentos SST. A capacidade produtiva é o total de horas úteis por mês; o fator de eficiência indica a parcela realmente dedicada à produção.</p>
      </header>

      <div class="stats">
        <div class="stat">
          <div class="label">Colaboradores</div>
          <div class="value">${colaboradores.length}</div>
        </div>
        <div class="stat">
          <div class="label">Técnicos de SST</div>
          <div class="value">${tecnicos}</div>
        </div>
        <div class="stat">
          <div class="label">Administrativos</div>
          <div class="value">${administrativos}</div>
        </div>
        <div class="stat">
          <div class="label">Capacidade efetiva</div>
          <div class="value">${UI.fmt(capacidadeTotal)}<small>h/mês</small></div>
        </div>
      </div>

      <section class="card">
        <h2>${editing ? 'Editar colaborador' : 'Novo colaborador'}</h2>
        <form id="form-colaborador" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>Nome</span>
            <input class="input" name="nome" required maxlength="100"
                   placeholder="Nome do colaborador"
                   value="${UI.esc(editing ? editing.nome : '')}">
          </label>
          <label class="field span-2">
            <span>Função</span>
            <select class="input" name="funcao" required>
              ${Store.FUNCOES.map(f => `<option value="${UI.esc(f)}" ${f === funcaoAtual ? 'selected' : ''}>${UI.esc(f)}</option>`).join('')}
            </select>
          </label>
          <label class="field span-2">
            <span>Capacidade produtiva (horas úteis por mês)</span>
            <input class="input" type="number" name="horasMes" required min="0" step="1" inputmode="decimal"
                   value="${horasMesAtual}">
            <small>Ex.: 8 h/dia × 20 dias úteis = 160 h.</small>
          </label>
          <label class="field span-2">
            <span>Fator de eficiência (%)</span>
            <input class="input" type="number" name="eficiencia" required min="1" max="100" step="1" inputmode="numeric"
                   value="${eficienciaAtual}">
            <small>Padrão 80%: parcela das horas efetivamente dedicada à produção de documentos.</small>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Adicionar colaborador'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>' : ''}
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Equipe cadastrada</h2>
          <span class="muted">${UI.plural(colaboradores.length, 'colaborador', 'colaboradores')}</span>
        </div>
        ${colaboradores.length === 0 ? `
          <div class="empty">
            <strong>Nenhum colaborador cadastrado</strong>
            Use o formulário acima para adicionar o primeiro membro da equipe.
          </div>` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th class="num">Horas/mês</th>
                  <th class="num">Eficiência</th>
                  <th class="num">Horas efetivas/mês</th>
                  <th class="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${colaboradores.map(c => `
                  <tr class="${c.id === this.editingId ? 'editing' : ''}">
                    <td>${UI.esc(c.nome)}</td>
                    <td><span class="chip ${c.funcao === FUNCAO_TST ? 'chip-green' : 'chip-blue'}">${c.funcao === FUNCAO_TST ? 'Técnico de SST' : 'Administrativo'}</span></td>
                    <td class="num">${UI.fmt(c.horasMes)}</td>
                    <td class="num">${UI.fmt(c.eficiencia)}%</td>
                    <td class="num">${UI.fmt(horasEfetivas(c))}</td>
                    <td class="actions">
                      <button type="button" class="btn-link" data-action="edit" data-id="${c.id}">Editar</button>
                      <button type="button" class="btn-link danger" data-action="delete" data-id="${c.id}">Excluir</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <th colspan="4">Capacidade efetiva total</th>
                  <th class="num">${UI.fmt(capacidadeTotal)} h</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>`}
      </section>
    `;

    const form = el.querySelector('#form-colaborador');

    form.addEventListener('submit', e => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const funcao = form.funcao.value;
      const horasMes = UI.parseNum(form.horasMes.value, NaN);
      const eficiencia = UI.parseNum(form.eficiencia.value, NaN);

      if (!nome) return;
      if (!Number.isFinite(horasMes) || horasMes < 0) {
        UI.toast('Informe uma capacidade produtiva válida (horas por mês).', 'error');
        form.horasMes.focus();
        return;
      }
      if (!Number.isFinite(eficiencia) || eficiencia < 1 || eficiencia > 100) {
        UI.toast('O fator de eficiência deve estar entre 1% e 100%.', 'error');
        form.eficiencia.focus();
        return;
      }

      const dados = { nome, funcao, horasMes, eficiencia };
      this.pendingFocus = true;
      if (this.editingId) {
        Store.colaboradores.update(this.editingId, dados);
        this.editingId = null;
        UI.toast('Colaborador atualizado.');
      } else {
        Store.colaboradores.add(dados);
        UI.toast('Colaborador adicionado.');
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
        const c = Store.colaboradores.get(id);
        if (!c) return;
        const ok = await UI.confirm({
          title: 'Excluir colaborador',
          message: `Excluir "${c.nome}" da equipe?`,
          confirmText: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        if (this.editingId === id) this.editingId = null;
        Store.colaboradores.remove(id);
        UI.toast('Colaborador excluído.');
      }
    });

    if (this.pendingFocus) {
      this.pendingFocus = false;
      form.nome.focus();
      if (editing) form.nome.select();
    }
  },
};
