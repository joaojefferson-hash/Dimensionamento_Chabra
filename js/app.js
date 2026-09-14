/* ==========================================================================
   App — inicialização (config → sessão → dados), telas de login/carregando,
   navegação entre telas, contadores do menu e backup JSON
   ========================================================================== */

const App = (() => {
  const views = [ViewUnidades, ViewEmpresas, ViewCatalogo, ViewColaboradores];
  const content = document.getElementById('content');
  let current = null;
  let appReady = false;

  /* ---------- telas de estado (fora da app) ---------- */

  const SCREENS = ['loading', 'login', 'config', 'error'];

  function showScreen(name, message) {
    SCREENS.forEach(s => { document.getElementById(`screen-${s}`).hidden = s !== name; });
    document.querySelector('.app').hidden = name !== 'app';
    if (name === 'error') document.getElementById('error-message').textContent = message || 'Erro desconhecido.';
    if (name === 'login') {
      const form = document.getElementById('form-login');
      form.password.value = '';
      setTimeout(() => (form.email.value ? form.password : form.email).focus(), 0);
    }
  }

  /* ---------- navegação ---------- */

  function findView(id) {
    return views.find(v => v.id === id) || views[0];
  }

  function viewFromHash() {
    return findView((location.hash || '').replace(/^#\/?/, ''));
  }

  function navigate(id) {
    if (!appReady) return;
    const view = findView(id);
    if (current && current !== view && typeof current.leave === 'function') current.leave();
    current = view;

    const hash = '#/' + view.id;
    if (location.hash !== hash) location.hash = hash;

    document.title = `${view.title} · Chabra Dimensiona`;
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view.id);
      btn.setAttribute('aria-current', btn.dataset.view === view.id ? 'page' : 'false');
    });

    render();
    window.scrollTo(0, 0);
  }

  /** Re-renderiza a tela atual e atualiza os contadores do menu. */
  function render() {
    if (!appReady || !current) return;
    current.render(content);
    updateBadges();
  }

  function updateBadges() {
    const c = Store.counts();
    const porTela = { unidades: c.unidades, empresas: c.empresas, catalogo: c.documentos, colaboradores: c.colaboradores };
    document.querySelectorAll('[data-badge]').forEach(badge => {
      badge.textContent = porTela[badge.dataset.badge] ?? 0;
    });
  }

  /* ---------- sessão ---------- */

  async function enterApp() {
    showScreen('loading');
    try {
      await Store.loadAll();
    } catch (err) {
      showScreen('error', err.message);
      return;
    }
    appReady = true;
    const user = Auth.user();
    document.getElementById('user-email').textContent = user ? user.email : '';
    document.getElementById('user-email').title = user ? user.email : '';
    showScreen('app');
    navigate(viewFromHash().id);
    await oferecerMigracaoLocal();
  }

  function leaveApp() {
    if (current && typeof current.leave === 'function') current.leave();
    current = null;
    appReady = false;
    Store.clear();
    content.innerHTML = '';
    showScreen('login');
  }

  async function login(form) {
    const email = form.email.value.trim();
    const password = form.password.value;
    const errBox = document.getElementById('login-error');
    errBox.hidden = true;
    if (!email || !password) return;
    UI.busy(form, true);
    try {
      await Auth.signIn(email, password);
      // 'SIGNED_IN' em Auth.onChange chama enterApp()
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      UI.busy(form, false);
      form.password.focus();
      form.password.select();
    }
  }

  async function logout() {
    try {
      await Auth.signOut();
      // 'SIGNED_OUT' em Auth.onChange chama leaveApp()
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  /* ---------- migração dos dados locais (versão anterior, só localStorage) ---------- */

  async function oferecerMigracaoLocal() {
    const local = Store.lerDadosLocais();
    if (!local) return;
    const temDados = local.unidades.length > 0 || local.colaboradores.length > 0;
    const nuvem = Store.counts();
    const nuvemVazia = nuvem.unidades === 0 && nuvem.colaboradores === 0;

    if (temDados && nuvemVazia) {
      const resumo = resumoDados(local);
      const ok = await UI.confirm({
        title: 'Dados locais encontrados',
        message: `Este navegador tem dados da versão anterior (sem nuvem): ${resumo}.\n\nEnviar para a nuvem agora? O catálogo padrão será substituído pela sua versão local.`,
        confirmText: 'Enviar para a nuvem',
      });
      if (ok) {
        try {
          await Store.importar(local);
          UI.toast('Dados locais enviados para a nuvem.');
        } catch (err) {
          UI.toast(err.message, 'error');
          return; // mantém os dados locais para tentar de novo
        }
      }
    }
    // Não pergunta de novo; os dados ficam guardados em outra chave, por segurança.
    Store.arquivarDadosLocais();
  }

  function resumoDados(d) {
    return [
      UI.plural(d.unidades.length, 'unidade', 'unidades'),
      UI.plural(d.documentos.length, 'tipo de documento', 'tipos de documento'),
      UI.plural(d.colaboradores.length, 'colaborador', 'colaboradores'),
    ].join(', ');
  }

  /* ---------- backup ---------- */

  function exportJSON() {
    const data = new Date().toISOString().slice(0, 10);
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chabra-dimensiona_${data}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast('Backup exportado.');
  }

  async function importJSON(file) {
    let parsed;
    try {
      parsed = Store.parseImport(await file.text());
    } catch (err) {
      UI.toast(err.message || 'Arquivo inválido.', 'error');
      return;
    }

    const ok = await UI.confirm({
      title: 'Importar backup',
      message: `O arquivo "${file.name}" contém: ${resumoDados(parsed)}.\n\nTodos os dados atuais na nuvem serão substituídos, para toda a equipe. Continuar?`,
      confirmText: 'Importar e substituir',
      danger: true,
    });
    if (!ok) return;

    if (current && typeof current.leave === 'function') current.leave();
    try {
      await Store.importar(parsed); // recarrega e dispara store:change → re-render
      UI.toast('Dados importados com sucesso.');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  /* ---------- inicialização ---------- */

  async function init() {
    document.getElementById('nav').addEventListener('click', e => {
      const btn = e.target.closest('.nav-item');
      if (btn) navigate(btn.dataset.view);
    });

    window.addEventListener('hashchange', () => {
      const view = viewFromHash();
      if (appReady && view !== current) navigate(view.id);
    });

    document.addEventListener('store:change', render);

    // Ao voltar para a aba, recarrega se os dados estiverem velhos (outra máquina pode ter editado)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && appReady) {
        Store.reloadIfStale().catch(err => UI.toast(err.message, 'error'));
      }
    });

    document.getElementById('btn-export').addEventListener('click', exportJSON);
    const fileInput = document.getElementById('file-import');
    document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) importJSON(file).finally(() => { fileInput.value = ''; });
    });

    const formLogin = document.getElementById('form-login');
    formLogin.addEventListener('submit', e => { e.preventDefault(); login(formLogin); });
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-retry').addEventListener('click', () => (Auth.user() ? enterApp() : showScreen('login')));

    if (!Auth.configOk()) {
      showScreen('config');
      return;
    }

    showScreen('loading');
    let session;
    try {
      session = await Auth.init();
    } catch (err) {
      showScreen('error', err.message || 'Falha ao verificar a sessão.');
      return;
    }

    Auth.onChange((s, event) => {
      if (event === 'SIGNED_OUT') leaveApp();
      else if (event === 'SIGNED_IN' && !appReady) enterApp();
    });

    if (session) await enterApp();
    else showScreen('login');
  }

  return { navigate, render, updateBadges, init };
})();

App.init();
