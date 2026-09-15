/* ==========================================================================
   Tela: Usuários — gestão de acessos (somente administradores)

   Todas as operações passam pela Edge Function `usuarios`, que valida o JWT
   do chamador e exige app_metadata.admin. O navegador nunca vê a chave secreta.
   Nome/sobrenome ficam em user_metadata (exibição); o papel fica em app_metadata.
   ========================================================================== */

const UsuariosAPI = (() => {
  async function chamar(action, params = {}) {
    const { data, error } = await db.functions.invoke('usuarios', { body: { action, ...params } });
    if (error) {
      let msg = error.message || 'Falha ao chamar o servidor.';
      // FunctionsHttpError: o corpo traz a mensagem amigável da função
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body && body.error) msg = body.error;
        } catch (_) { /* mantém msg */ }
      }
      if (/failed to fetch|networkerror|load failed/i.test(msg)) msg = 'Sem conexão com o servidor. Verifique a internet.';
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  return {
    listar: () => chamar('listar').then(r => r.usuarios),
    criar: dados => chamar('criar', dados).then(r => r.usuario),
    editar: (id, nome, sobrenome) => chamar('editar', { id, nome, sobrenome }).then(r => r.usuario),
    redefinirSenha: (id, senha) => chamar('redefinirSenha', { id, senha }),
    definirPapel: (id, papel) => chamar('definirPapel', { id, papel }),
    remover: id => chamar('remover', { id }),
  };
})();

const ViewUsuarios = {
  id: 'usuarios',
  title: 'Usuários',
  adminOnly: true,
  usuarios: null,   // cache da última listagem
  editingId: null,

  leave() {
    this.editingId = null;
  },

  fmtData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  render(el) {
    const editing = this.editingId && this.usuarios ? this.usuarios.find(u => u.id === this.editingId) : null;
    if (this.editingId && !editing) this.editingId = null;

    el.innerHTML = `
      <header class="page-header">
        <h1>Usuários</h1>
        <p>Quem pode entrar no Chabra Dimensiona. Só administradores veem esta tela. O nome aparece no programa no lugar do e-mail. Ao criar um usuário, informe a ele a senha inicial — ele pode trocá-la depois em <em>Senha</em>, no menu lateral.</p>
      </header>

      <section class="card">
        <h2>${editing ? 'Editar usuário' : 'Novo usuário'}</h2>
        <form id="form-usuario" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>Nome</span>
            <input class="input" name="nome" required maxlength="60" autocomplete="off" placeholder="Ex.: Ana"
                   value="${UI.esc(editing ? editing.nome : '')}">
          </label>
          <label class="field span-2">
            <span>Sobrenome</span>
            <input class="input" name="sobrenome" required maxlength="60" autocomplete="off" placeholder="Ex.: Souza"
                   value="${UI.esc(editing ? editing.sobrenome : '')}">
          </label>
          <label class="field span-2">
            <span>E-mail</span>
            <input class="input" type="email" name="email" ${editing ? 'disabled' : 'required'} autocomplete="off" placeholder="nome@chabra.com.br"
                   value="${UI.esc(editing ? editing.email || '' : '')}">
            ${editing ? '<small>O e-mail de acesso não pode ser alterado por aqui.</small>' : ''}
          </label>
          ${editing ? '' : `
          <label class="field span-2">
            <span>Senha inicial</span>
            <div class="input-group">
              <input class="input" type="text" name="senha" required minlength="8" autocomplete="off" spellcheck="false" placeholder="Mínimo 8 caracteres">
              <button type="button" class="btn btn-ghost" data-action="gerar" title="Gerar senha aleatória">Gerar</button>
            </div>
            <small>Fica visível para você copiar e enviar ao colaborador.</small>
          </label>
          <div class="field span-4">
            <span>Papel (o que essa pessoa pode fazer)</span>
            <div class="tipo-opcoes">
              ${Object.entries(Auth.PAPEIS).map(([id, p]) => `
                <label class="tipo-opcao">
                  <input type="radio" name="papel" value="${id}" ${id === 'leitura' ? 'checked' : ''}>
                  <span><strong>${UI.esc(p.rotulo)}</strong><small>${UI.esc(p.descricao)}</small></span>
                </label>`).join('')}
            </div>
          </div>`}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Criar usuário'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>' : ''}
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Usuários cadastrados</h2>
          <div class="right">
            <span class="muted" id="usuarios-count"></span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="recarregar">Atualizar</button>
          </div>
        </div>
        <div id="usuarios-lista"><div class="empty">Carregando usuários…</div></div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Backup dos dados</h2>
          <span class="muted">os dados ficam na nuvem, compartilhados com toda a equipe</span>
        </div>
        <p class="muted">Exporte um arquivo JSON com todos os cadastros quando quiser guardar uma cópia. Importar um arquivo <strong>substitui todos os dados atuais</strong>, para toda a equipe — use só para restaurar um backup.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" data-action="exportar">Exportar JSON</button>
          <button type="button" class="btn btn-ghost" data-action="importar">Importar JSON…</button>
          <input type="file" id="file-import" accept="application/json,.json" hidden>
        </div>
      </section>
    `;

    const form = el.querySelector('#form-usuario');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const sobrenome = form.sobrenome.value.trim();
      if (!nome) { form.nome.focus(); return; }

      UI.busy(form, true);
      try {
        if (this.editingId) {
          await UsuariosAPI.editar(this.editingId, nome, sobrenome);
          this.editingId = null;
          UI.toast('Usuário atualizado.');
          App.render();
          return;
        }
        const email = form.email.value.trim().toLowerCase();
        const senha = form.senha.value;
        const papel = form.papel.value;
        if (!email) { form.email.focus(); return; }
        if (senha.length < 8) {
          UI.toast('A senha precisa ter pelo menos 8 caracteres.', 'error');
          form.senha.focus();
          return;
        }
        await UsuariosAPI.criar({ nome, sobrenome, email, senha, papel });
        UI.toast(`Usuário ${nome} ${sobrenome} criado.`);
        form.reset();
        form.nome.focus();
        await this.carregar(el);
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
      const alvo = id && this.usuarios ? this.usuarios.find(u => u.id === id) : null;

      if (action === 'gerar') {
        form.senha.value = UI.gerarSenha(12);
        form.senha.focus();
        form.senha.select();
        return;
      }
      if (action === 'recarregar') {
        await this.carregar(el);
        return;
      }
      if (action === 'cancel') {
        this.editingId = null;
        App.render();
        return;
      }
      if (!alvo) return;

      if (action === 'edit') {
        this.editingId = id;
        App.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const f = el.querySelector('#form-usuario');
        if (f) { f.nome.focus(); f.nome.select(); }
        return;
      }

      try {
        if (action === 'senha') {
          const senha = await UI.askPassword({
            title: 'Redefinir senha',
            description: `Nova senha para ${alvo.nomeCompleto} (${alvo.email}). Informe-a ao colaborador.`,
            confirmText: 'Redefinir',
          });
          if (senha === null) return;
          btn.disabled = true;
          await UsuariosAPI.redefinirSenha(id, senha);
          UI.toast('Senha redefinida.');
        } else if (action === 'remover') {
          const ok = await UI.confirm({
            title: 'Remover usuário',
            message: `Remover o acesso de ${alvo.nomeCompleto} (${alvo.email})? Ele não conseguirá mais entrar no app.`,
            confirmText: 'Remover',
            danger: true,
          });
          if (!ok) return;
          btn.disabled = true;
          await UsuariosAPI.remover(id);
          if (this.editingId === id) this.editingId = null;
          UI.toast('Usuário removido.');
          await this.carregar(el);
        }
      } catch (err) {
        UI.toast(err.message, 'error');
        btn.disabled = false;
      }
    });

    // ---- backup (exportar / importar) ----
    const fileInput = el.querySelector('#file-import');
    el.querySelector('[data-action="exportar"]').addEventListener('click', () => App.exportJSON());
    el.querySelector('[data-action="importar"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) App.importJSON(file).finally(() => { fileInput.value = ''; });
    });

    // Em modo edição a lista já está em cache: só desenha. Senão, busca no servidor.
    if (editing) this.desenharLista(el);
    else this.carregar(el);
  },

  /** Busca a lista no servidor e desenha a tabela (não re-renderiza o formulário). */
  async carregar(el) {
    const box = el.querySelector('#usuarios-lista');
    if (!box) return;
    try {
      this.usuarios = await UsuariosAPI.listar();
    } catch (err) {
      box.innerHTML = `<div class="empty"><strong>Não foi possível carregar</strong>${UI.esc(err.message)}</div>`;
      const count = el.querySelector('#usuarios-count');
      if (count) count.textContent = '';
      return;
    }
    this.desenharLista(el);
  },

  desenharLista(el) {
    const box = el.querySelector('#usuarios-lista');
    const count = el.querySelector('#usuarios-count');
    if (!box) return;
    const eu = Auth.user();
    const lista = this.usuarios || [];
    if (count) count.textContent = UI.plural(lista.length, 'usuário', 'usuários');
    if (lista.length === 0) {
      box.innerHTML = '<div class="empty"><strong>Nenhum usuário</strong></div>';
      return;
    }
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Último acesso</th>
              <th class="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(u => {
              const souEu = eu && u.id === eu.id;
              const semNome = !u.nome;
              return `
                <tr class="${u.id === this.editingId ? 'editing' : ''}">
                  <td>${semNome ? '<span class="muted">(sem nome)</span>' : UI.esc(u.nomeCompleto)}${souEu ? ' <span class="muted">(você)</span>' : ''}</td>
                  <td>${UI.esc(u.email || '—')}${u.confirmado ? '' : ' <span class="chip chip-gray">não confirmado</span>'}</td>
                  <td>${souEu
                    ? `<span class="chip ${u.papel === 'admin' ? 'chip-green' : u.papel === 'supervisor' ? 'chip-blue' : 'chip-gray'}">${UI.esc(Auth.PAPEIS[u.papel].rotulo)}</span>`
                    : `<select class="input input-sm sel-papel" data-id="${u.id}" aria-label="Papel de ${UI.esc(u.nomeCompleto)}" title="${UI.esc(Auth.PAPEIS[u.papel].descricao)}">
                        ${Object.entries(Auth.PAPEIS).map(([id, p]) => `<option value="${id}" ${id === u.papel ? 'selected' : ''}>${UI.esc(p.rotulo)}</option>`).join('')}
                      </select>`}</td>
                  <td>${this.fmtData(u.ultimoLogin)}</td>
                  <td class="actions">
                    <button type="button" class="btn-link" data-action="edit" data-id="${u.id}">Editar</button>
                    <button type="button" class="btn-link" data-action="senha" data-id="${u.id}">Senha</button>
                    <button type="button" class="btn-link danger" data-action="remover" data-id="${u.id}" ${souEu ? 'disabled title="Você não pode remover a si mesmo"' : ''}>Remover</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // troca de papel direto na lista (vale no próximo login da pessoa)
    box.querySelectorAll('select.sel-papel').forEach(sel => {
      sel.addEventListener('change', async () => {
        const alvo = lista.find(u => u.id === sel.dataset.id);
        const novo = sel.value;
        if (!alvo || novo === alvo.papel) return;
        const ok = await UI.confirm({
          title: 'Mudar papel',
          message: `${alvo.nomeCompleto} passa a ser "${Auth.PAPEIS[novo].rotulo}": ${Auth.PAPEIS[novo].descricao}.\n\nA mudança vale no próximo login dessa pessoa.`,
          confirmText: 'Mudar',
        });
        if (!ok) { sel.value = alvo.papel; return; }
        sel.disabled = true;
        try {
          await UsuariosAPI.definirPapel(alvo.id, novo);
          UI.toast(`Papel alterado para ${Auth.PAPEIS[novo].rotulo}. Vale no próximo login de ${alvo.nome || alvo.email}.`);
          await this.carregar(el);
        } catch (err) {
          UI.toast(err.message, 'error');
          sel.value = alvo.papel;
          sel.disabled = false;
        }
      });
    });
  },
};
