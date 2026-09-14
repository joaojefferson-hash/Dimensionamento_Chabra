/* ==========================================================================
   Tela: Usuários — gestão de acessos (somente administradores)

   Todas as operações passam pela Edge Function `usuarios`, que valida o JWT
   do chamador e exige app_metadata.admin. O navegador nunca vê a chave secreta.
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
    criar: (email, senha, admin) => chamar('criar', { email, senha, admin }).then(r => r.usuario),
    redefinirSenha: (id, senha) => chamar('redefinirSenha', { id, senha }),
    definirAdmin: (id, admin) => chamar('definirAdmin', { id, admin }),
    remover: id => chamar('remover', { id }),
  };
})();

const ViewUsuarios = {
  id: 'usuarios',
  title: 'Usuários',
  adminOnly: true,
  usuarios: null,   // cache da última listagem
  erro: null,

  leave() {
    this.erro = null;
  },

  fmtData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  render(el) {
    const eu = Auth.user();
    el.innerHTML = `
      <header class="page-header">
        <h1>Usuários</h1>
        <p>Quem pode entrar no Chabra Dimensiona. Só administradores veem esta tela. Ao criar um usuário, informe a ele a senha inicial — ele pode trocá-la depois em <em>Senha</em>, no menu lateral.</p>
      </header>

      <section class="card">
        <h2>Novo usuário</h2>
        <form id="form-usuario" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>E-mail</span>
            <input class="input" type="email" name="email" required autocomplete="off" placeholder="nome@chabra.com.br">
          </label>
          <label class="field span-2">
            <span>Senha inicial</span>
            <div class="input-group">
              <input class="input" type="text" name="senha" required minlength="8" autocomplete="off" spellcheck="false" placeholder="Mínimo 8 caracteres">
              <button type="button" class="btn btn-ghost" data-action="gerar" title="Gerar senha aleatória">Gerar</button>
            </div>
            <small>Fica visível para você copiar e enviar ao colaborador.</small>
          </label>
          <label class="field span-2 field-check">
            <input type="checkbox" name="admin">
            <span>Administrador (pode gerenciar usuários)</span>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Criar usuário</button>
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
    `;

    const form = el.querySelector('#form-usuario');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.email.value.trim().toLowerCase();
      const senha = form.senha.value;
      const admin = form.admin.checked;
      if (!email) return;
      if (senha.length < 8) {
        UI.toast('A senha precisa ter pelo menos 8 caracteres.', 'error');
        form.senha.focus();
        return;
      }
      UI.busy(form, true);
      try {
        await UsuariosAPI.criar(email, senha, admin);
        UI.toast(`Usuário ${email} criado.`);
        form.reset();
        form.email.focus();
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
      if (!alvo) return;

      try {
        if (action === 'senha') {
          const senha = await UI.askPassword({
            title: 'Redefinir senha',
            description: `Nova senha para ${alvo.email}. Informe-a ao colaborador.`,
            confirmText: 'Redefinir',
          });
          if (senha === null) return;
          btn.disabled = true;
          await UsuariosAPI.redefinirSenha(id, senha);
          UI.toast('Senha redefinida.');
        } else if (action === 'admin') {
          const tornar = !alvo.admin;
          const ok = await UI.confirm({
            title: tornar ? 'Tornar administrador' : 'Remover administrador',
            message: tornar
              ? `${alvo.email} passará a gerenciar usuários (criar, remover, redefinir senhas).`
              : `${alvo.email} deixará de gerenciar usuários.`,
            confirmText: tornar ? 'Tornar admin' : 'Remover admin',
          });
          if (!ok) return;
          btn.disabled = true;
          await UsuariosAPI.definirAdmin(id, tornar);
          UI.toast(tornar ? 'Agora é administrador. A mudança vale no próximo login dele.' : 'Deixou de ser administrador. A mudança vale no próximo login dele.');
          await this.carregar(el);
        } else if (action === 'remover') {
          const ok = await UI.confirm({
            title: 'Remover usuário',
            message: `Remover o acesso de ${alvo.email}? Ele não conseguirá mais entrar no app.`,
            confirmText: 'Remover',
            danger: true,
          });
          if (!ok) return;
          btn.disabled = true;
          await UsuariosAPI.remover(id);
          UI.toast('Usuário removido.');
          await this.carregar(el);
        }
      } catch (err) {
        UI.toast(err.message, 'error');
        btn.disabled = false;
      }
    });

    this.carregar(el, eu);
  },

  /** Busca a lista no servidor e renderiza a tabela (não re-renderiza o formulário). */
  async carregar(el) {
    const box = el.querySelector('#usuarios-lista');
    const count = el.querySelector('#usuarios-count');
    if (!box) return;
    const eu = Auth.user();
    try {
      this.usuarios = await UsuariosAPI.listar();
      this.erro = null;
    } catch (err) {
      this.erro = err.message;
      box.innerHTML = `<div class="empty"><strong>Não foi possível carregar</strong>${UI.esc(err.message)}</div>`;
      if (count) count.textContent = '';
      return;
    }
    const lista = this.usuarios;
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
              <th>E-mail</th>
              <th>Papel</th>
              <th>Criado em</th>
              <th>Último acesso</th>
              <th class="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(u => {
              const souEu = eu && u.id === eu.id;
              return `
                <tr>
                  <td>${UI.esc(u.email || '—')}${souEu ? ' <span class="muted">(você)</span>' : ''}${u.confirmado ? '' : ' <span class="chip chip-gray">não confirmado</span>'}</td>
                  <td><span class="chip ${u.admin ? 'chip-green' : 'chip-gray'}">${u.admin ? 'Administrador' : 'Usuário'}</span></td>
                  <td>${this.fmtData(u.criadoEm)}</td>
                  <td>${this.fmtData(u.ultimoLogin)}</td>
                  <td class="actions">
                    <button type="button" class="btn-link" data-action="senha" data-id="${u.id}">Redefinir senha</button>
                    <button type="button" class="btn-link" data-action="admin" data-id="${u.id}" ${souEu ? 'disabled title="Você não pode alterar o seu próprio papel"' : ''}>${u.admin ? 'Remover admin' : 'Tornar admin'}</button>
                    <button type="button" class="btn-link danger" data-action="remover" data-id="${u.id}" ${souEu ? 'disabled title="Você não pode remover a si mesmo"' : ''}>Remover</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },
};
