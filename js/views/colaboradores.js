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
    const unidades = Store.unidades.list();
    // alocações do formulário: em edição, as do colaborador; novo com 1 unidade só → 100% nela
    const alocAtual = editing ? (editing.alocacoes || []) : (unidades.length === 1 ? [{ unidadeId: unidades[0].id, percentual: 100 }] : []);
    const pctDe = uid => { const a = alocAtual.find(x => x.unidadeId === uid); return a ? a.percentual : 0; };
    const semUnidade = colaboradores.filter(c => Store.totalAlocado(c) <= 0).length;
    const parciais = colaboradores.filter(c => { const t = Store.totalAlocado(c); return t > 0 && t < 99.999; }).length;
    const fmtPct = v => (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.', ','));
    const horasMesAtual = editing ? editing.horasMes : Store.DEFAULT_COLABORADOR.horasMes;
    const eficienciaAtual = editing ? editing.eficiencia : Store.DEFAULT_COLABORADOR.eficiencia;

    el.innerHTML = `
      <header class="page-header">
        <h1>Colaboradores</h1>
        <p>Equipe que produz os documentos SST. A capacidade produtiva é o total de horas úteis por mês; o fator de eficiência indica a parcela realmente dedicada à produção. Um colaborador pode atuar em mais de uma unidade — informe o percentual da capacidade dedicado a cada uma.</p>
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
      ${semUnidade > 0 ? `<p class="alert alert-warn">${UI.plural(semUnidade, 'colaborador está', 'colaboradores estão')} sem unidade e não ${semUnidade === 1 ? 'entra' : 'entram'} no cálculo de capacidade. Edite e informe a alocação.${parciais > 0 ? ` ${UI.plural(parciais, 'colaborador tem', 'colaboradores têm')} alocação parcial (menos de 100%).` : ''}</p>` : (parciais > 0 ? `<p class="alert alert-warn">${UI.plural(parciais, 'colaborador tem', 'colaboradores têm')} alocação parcial (menos de 100%): a parte livre não conta na capacidade.</p>` : '')}

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
          <div class="field span-2">
            <span>Alocação por unidade (% da capacidade)</span>
            ${unidades.length === 0 ? '<p class="note">Cadastre uma unidade primeiro. Colaborador sem unidade não entra na capacidade de nenhuma programação.</p>' : `
            <div class="alocacoes" id="alocacoes">
              ${unidades.map(u => { const pct = pctDe(u.id); return `
                <label class="aloc-linha">
                  <input type="checkbox" class="aloc-check" data-unidade="${u.id}" ${pct > 0 ? 'checked' : ''}>
                  <span class="aloc-nome">${UI.esc(u.nome)}</span>
                  <span class="aloc-pct">
                    <input class="input input-sm input-num aloc-input" type="number" data-unidade="${u.id}" min="0" max="100" step="1" inputmode="decimal" value="${pct > 0 ? fmtPct(pct).replace(',', '.') : ''}" ${pct > 0 ? '' : 'disabled'} aria-label="Percentual em ${UI.esc(u.nome)}">
                    <span class="muted">%</span>
                  </span>
                </label>`; }).join('')}
              <div class="aloc-rodape">
                <span class="muted">Total: <strong id="aloc-total">0</strong>% <span id="aloc-aviso" class="aloc-aviso"></span></span>
                <button type="button" class="btn btn-ghost btn-sm" data-action="dividir">Dividir igualmente</button>
              </div>
            </div>
            <small>A soma pode ser menor que 100% (o restante fica como não alocado), mas não maior.</small>`}
          </div>
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
                  <th>Alocação</th>
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
                    <td>${(() => { const t = Store.totalAlocado(c); if (t <= 0) return '<span class="chip chip-warn">sem unidade</span>'; const d = UI.esc(Store.descricaoAlocacoes(c)); return t < 99.999 ? `${d} <span class="chip chip-warn" title="Restante não alocado">${fmtPct(Math.round((100 - t) * 10) / 10)}% livre</span>` : d; })()}</td>
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
                  <th colspan="5">Capacidade efetiva total</th>
                  <th class="num">${UI.fmt(capacidadeTotal)} h</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>`}
      </section>
    `;

    const form = el.querySelector('#form-colaborador');

    // ---- editor de alocação ----
    const lerAlocacoes = () => [...el.querySelectorAll('.aloc-input')]
      .filter(inp => !inp.disabled)
      .map(inp => ({ unidadeId: inp.dataset.unidade, percentual: Math.round(UI.parseNum(inp.value, 0) * 100) / 100 }))
      .filter(a => a.percentual > 0);
    const atualizarTotalAloc = () => {
      const total = el.querySelector('#aloc-total');
      if (!total) return;
      const soma = lerAlocacoes().reduce((s, a) => s + a.percentual, 0);
      total.textContent = fmtPct(Math.round(soma * 10) / 10);
      const aviso = el.querySelector('#aloc-aviso');
      aviso.textContent = soma > 100.0001 ? '— acima de 100%' : soma > 0 && soma < 99.999 ? `— ${fmtPct(Math.round((100 - soma) * 10) / 10)}% não alocado` : '';
      aviso.classList.toggle('erro', soma > 100.0001);
    };
    el.querySelectorAll('.aloc-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const inp = el.querySelector(`.aloc-input[data-unidade="${chk.dataset.unidade}"]`);
        inp.disabled = !chk.checked;
        if (chk.checked) {
          if (!(UI.parseNum(inp.value, 0) > 0)) {
            const soma = lerAlocacoes().reduce((s, a) => s + a.percentual, 0);
            inp.value = Math.max(0, Math.min(100, 100 - soma));
          }
          inp.focus(); inp.select();
        } else {
          inp.value = '';
        }
        atualizarTotalAloc();
      });
    });
    el.querySelectorAll('.aloc-input').forEach(inp => inp.addEventListener('input', atualizarTotalAloc));
    el.querySelector('[data-action="dividir"]')?.addEventListener('click', () => {
      const ativos = [...el.querySelectorAll('.aloc-check')].filter(c => c.checked);
      if (ativos.length === 0) { UI.toast('Marque as unidades primeiro.', 'info'); return; }
      const parte = Math.floor(10000 / ativos.length) / 100;
      ativos.forEach((c, i) => {
        const inp = el.querySelector(`.aloc-input[data-unidade="${c.dataset.unidade}"]`);
        inp.value = i === ativos.length - 1 ? Math.round((100 - parte * (ativos.length - 1)) * 100) / 100 : parte;
      });
      atualizarTotalAloc();
    });
    atualizarTotalAloc();

    form.addEventListener('submit', async e => {
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

      const alocacoes = lerAlocacoes();
      const somaAloc = alocacoes.reduce((s, a) => s + a.percentual, 0);
      if (somaAloc > 100.0001) {
        UI.toast(`A soma das alocações não pode passar de 100% (atual: ${fmtPct(Math.round(somaAloc * 10) / 10)}%).`, 'error');
        return;
      }
      if (alocacoes.length === 0 && Store.unidades.list().length > 0) {
        const ok = await UI.confirm({ title: 'Sem alocação', message: 'Este colaborador não está alocado a nenhuma unidade e não contará na capacidade de nenhuma programação. Salvar mesmo assim?', confirmText: 'Salvar' });
        if (!ok) return;
      }
      const dados = { nome, funcao, horasMes, eficiencia, alocacoes };
      UI.busy(form, true);
      try {
        if (this.editingId) {
          await Store.colaboradores.update(this.editingId, dados);
          this.editingId = null;
          this.pendingFocus = true;
          UI.toast('Colaborador atualizado.');
        } else {
          await Store.colaboradores.add(dados);
          this.pendingFocus = true;
          UI.toast('Colaborador adicionado.');
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
        const c = Store.colaboradores.get(id);
        if (!c) return;
        const ok = await UI.confirm({
          title: 'Excluir colaborador',
          message: `Excluir "${c.nome}" da equipe?`,
          confirmText: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        try {
          await Store.colaboradores.remove(id);
          if (this.editingId === id) this.editingId = null;
          UI.toast('Colaborador excluído.');
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
