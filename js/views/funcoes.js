/* ==========================================================================
   Tela: Funções — cadastro das funções da equipe.
   Cada função diz o que a pessoa entrega (técnico / administrativo / sem
   produção) e se é chefia de equipe. Quem não tem produção fica fora das
   contas; quem é chefia aparece como responsável pelas unidades em que está.
   ========================================================================== */

const ViewFuncoes = {
  id: 'funcoes',
  title: 'Funções',
  editingId: null,
  pendingFocus: false,

  leave() {
    this.editingId = null;
    this.pendingFocus = false;
  },

  render(el) {
    const funcoes = Store.funcoes.list();
    const colaboradores = Store.colaboradores.list();
    const editing = this.editingId ? Store.funcoes.get(this.editingId) : null;
    if (this.editingId && !editing) this.editingId = null;
    const tipoAtual = editing ? editing.tipoProducao : 'tecnico';
    const chefias = funcoes.filter(f => f.chefia && (!editing || f.id !== editing.id));
    const nomeFuncao = id => { const f = id ? Store.funcoes.get(id) : null; return f ? f.nome : ''; };
    const coordenaTexto = f => { const c = Store.COORDENA.find(x => x.id === f.coordena); return c ? c.rotulo.toLowerCase() : 'toda a equipe'; };
    const pessoasDe = f => colaboradores.filter(c => c.funcaoId === f.id).length;
    const tipoInfo = id => Store.TIPOS_PRODUCAO.find(t => t.id === id) || Store.TIPOS_PRODUCAO[2];
    const corTipo = id => (id === Calculo.TEC ? 'chip-green' : id === Calculo.ADM ? 'chip-blue' : 'chip-gray');

    el.innerHTML = `
      <header class="page-header">
        <h1>Funções</h1>
        <p>Cadastre as funções da equipe e diga o que cada uma entrega. Funções sem produção (como supervisores) não entram nas contas da programação; se forem chefia, aparecem como responsáveis pelas unidades em que a pessoa estiver.</p>
      </header>

      <section class="card">
        <h2>${editing ? 'Editar função' : 'Nova função'}</h2>
        <form id="form-funcao" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>Nome da função</span>
            <input class="input" name="nome" required maxlength="80" placeholder="Ex.: Supervisor TST Externo"
                   value="${UI.esc(editing ? editing.nome : '')}">
          </label>
          <label class="field span-2">
            <span>Custo mensal de uma pessoa (R$)</span>
            <input class="input input-num" type="number" name="custoMensal" min="0" step="100" inputmode="decimal" placeholder="0" value="${editing && editing.custoMensal > 0 ? editing.custoMensal : ''}">
            <small>Salário + encargos, em média. Com isso o Dimensionamento mostra quanto custa contratar quem falta e quanto custa a sobra. Deixe vazio para não mostrar valores.</small>
          </label>
          <div class="field span-4">
            <span>O que essa função entrega?</span>
            <div class="tipo-opcoes">
              ${Store.TIPOS_PRODUCAO.map(t => `
                <label class="tipo-opcao">
                  <input type="radio" name="tipoProducao" value="${t.id}" ${t.id === tipoAtual ? 'checked' : ''}>
                  <span><strong>${UI.esc(t.rotulo)}</strong><small>${UI.esc(t.descricao)}</small></span>
                </label>`).join('')}
            </div>
            <small>Isso define as perguntas feitas ao cadastrar o colaborador e em qual grupo ele entra na programação.</small>
          </div>
          <label class="field span-4 check-linha">
            <span class="check-inline"><input type="checkbox" name="chefia" ${editing && editing.chefia ? 'checked' : ''}> Chefia de equipe</span>
            <small>Marque para quem lidera pessoas. Na programação, o nome aparece como chefia das unidades em que a pessoa está — mesmo sem produção própria.</small>
          </label>
          <div class="span-4 campos-chefia" ${editing && editing.chefia ? '' : 'hidden'}>
            <div class="form-grid">
              <div class="field span-2">
                <span>Quem essa chefia coordena?</span>
                <div class="tipo-opcoes">
                  ${Store.COORDENA.map(c => `
                    <label class="tipo-opcao">
                      <input type="radio" name="coordena" value="${c.id}" ${(editing ? editing.coordena : 'todos') === c.id ? 'checked' : ''}>
                      <span><strong>${UI.esc(c.rotulo)}</strong><small>${UI.esc(c.descricao)}</small></span>
                    </label>`).join('')}
                </div>
                <small>No organograma, cada pessoa fica embaixo da chefia mais próxima que coordena o grupo dela na unidade.</small>
              </div>
              <label class="field span-2">
                <span>Responde para</span>
                <select class="input" name="respondePara">
                  <option value="">Ninguém — é o topo</option>
                  ${chefias.map(f => `<option value="${f.id}" ${editing && editing.respondeParaId === f.id ? 'selected' : ''}>${UI.esc(f.nome)}</option>`).join('')}
                </select>
                <small>A função de chefia acima desta. Ex.: Supervisor ADM responde para o Supervisor Geral, que responde para o Gerente.</small>
              </label>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Adicionar função'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>' : ''}
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Funções cadastradas</h2>
          <span class="muted">${UI.plural(funcoes.length, 'função', 'funções')}</span>
        </div>
        ${funcoes.length === 0 ? `
          <div class="empty">
            <strong>Nenhuma função cadastrada</strong>
            Use o formulário acima para adicionar a primeira função.
          </div>` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Função</th>
                  <th>O que entrega</th>
                  <th>Chefia</th>
                  <th>Coordena · responde para</th>
                  <th class="num" title="Custo médio mensal de uma pessoa (salário + encargos)">Custo/mês</th>
                  <th class="num">Pessoas</th>
                  <th class="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${funcoes.map((f, i) => { const n = pessoasDe(f); const t = tipoInfo(f.tipoProducao); return `
                  <tr class="${f.id === this.editingId ? 'editing' : ''}">
                    <td>${UI.esc(f.nome)}</td>
                    <td><span class="chip ${corTipo(f.tipoProducao)}">${UI.esc(t.rotulo)}</span> <span class="muted">${UI.esc(t.descricao)}</span></td>
                    <td>${f.chefia ? '<span class="chip chip-chefia">Chefia</span>' : '<span class="muted">—</span>'}</td>
                    <td class="muted">${f.chefia ? `${coordenaTexto(f)} · ${f.respondeParaId ? `responde para <strong>${UI.esc(nomeFuncao(f.respondeParaId) || 'função excluída')}</strong>` : 'topo'}` : '—'}</td>
                    <td class="num ${f.custoMensal > 0 ? '' : 'muted'}">${f.custoMensal > 0 ? UI.moeda(f.custoMensal) : '—'}</td>
                    <td class="num">${n}</td>
                    <td class="actions">
                      <button type="button" class="btn-link" data-action="subir" data-id="${f.id}" title="Mover para cima" ${i === 0 ? 'disabled' : ''}>▲</button>
                      <button type="button" class="btn-link" data-action="descer" data-id="${f.id}" title="Mover para baixo" ${i === funcoes.length - 1 ? 'disabled' : ''}>▼</button>
                      <button type="button" class="btn-link" data-action="edit" data-id="${f.id}">Editar</button>
                      <button type="button" class="btn-link danger" data-action="delete" data-id="${f.id}" ${n > 0 ? `title="Em uso por ${UI.plural(n, 'pessoa', 'pessoas')}"` : ''}>Excluir</button>
                    </td>
                  </tr>`; }).join('')}
              </tbody>
            </table>
          </div>`}
      </section>
    `;

    const form = el.querySelector('#form-funcao');
    form.chefia.addEventListener('change', () => { el.querySelector('.campos-chefia').hidden = !form.chefia.checked; });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      if (!nome) return;
      if (Store.nomeDuplicado('funcoes', nome, this.editingId)) {
        UI.toast('Já existe uma função com esse nome.', 'error');
        form.nome.focus();
        return;
      }
      const tipoProducao = form.tipoProducao.value;
      const chefia = form.chefia.checked;
      const coordena = chefia ? form.coordena.value : 'todos';
      const respondeParaId = chefia ? (form.respondePara.value || null) : null;
      const custoMensal = Math.max(0, UI.parseNum(form.custoMensal.value, 0) || 0);
      // não pode responder para si mesma nem fechar um ciclo (A → B → A)
      for (let cur = respondeParaId, passos = 0; cur && passos < 50; passos++) {
        if (cur === this.editingId) { UI.toast('Essa escolha de "Responde para" fecharia um ciclo: a função acabaria respondendo para ela mesma.', 'error'); return; }
        const f = Store.funcoes.get(cur);
        cur = f ? f.respondeParaId : null;
      }
      UI.busy(form, true);
      try {
        if (this.editingId) {
          const antes = Store.funcoes.get(this.editingId);
          await Store.funcoes.update(this.editingId, { nome, tipoProducao, chefia, coordena, respondeParaId, custoMensal });
          this.editingId = null;
          this.pendingFocus = true;
          const n = antes ? pessoasDe(antes) : 0;
          UI.toast(antes && antes.tipoProducao !== tipoProducao && n > 0
            ? `Função atualizada. ${UI.plural(n, 'pessoa passa', 'pessoas passam')} a contar como ${tipoInfo(tipoProducao).rotulo.toLowerCase()} na programação.`
            : 'Função atualizada.');
        } else {
          const ordem = funcoes.reduce((m, f) => Math.max(m, f.ordem), 0) + 1;
          await Store.funcoes.add({ nome, tipoProducao, chefia, coordena, respondeParaId, ordem, custoMensal });
          this.pendingFocus = true;
          UI.toast('Função adicionada.');
        }
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        UI.busy(form, false);
      }
    });

    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const { action, id } = btn.dataset;

      if (action === 'cancel') {
        this.editingId = null;
        App.render();
      } else if (action === 'edit') {
        this.editingId = id;
        this.pendingFocus = true;
        App.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'subir' || action === 'descer') {
        const lista = Store.funcoes.list();
        const i = lista.findIndex(f => f.id === id);
        const j = action === 'subir' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= lista.length) return;
        // renumera a lista inteira com a troca feita, para a ordem ficar sempre limpa
        const nova = lista.slice();
        [nova[i], nova[j]] = [nova[j], nova[i]];
        try {
          const pendentes = nova.map((f, k) => ({ f, ordem: k + 1 })).filter(x => x.f.ordem !== x.ordem);
          for (let k = 0; k < pendentes.length; k++) {
            await Store.funcoes.update(pendentes[k].f.id, { ordem: pendentes[k].ordem }, { silent: k < pendentes.length - 1 });
          }
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      } else if (action === 'delete') {
        const f = Store.funcoes.get(id);
        if (!f) return;
        const n = pessoasDe(f);
        if (n > 0) {
          UI.toast(`"${f.nome}" está em uso por ${UI.plural(n, 'pessoa', 'pessoas')}. Mude a função dessas pessoas em Colaboradores antes de excluir.`, 'error');
          return;
        }
        const ok = await UI.confirm({
          title: 'Excluir função',
          message: `Excluir a função "${f.nome}"?`,
          confirmText: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        try {
          await Store.funcoes.remove(id);
          if (this.editingId === id) this.editingId = null;
          UI.toast('Função excluída.');
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
