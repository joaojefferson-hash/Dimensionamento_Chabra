/* ==========================================================================
   App — navegação entre telas, contadores do menu e backup JSON
   ========================================================================== */

const App = (() => {
  const views = [ViewUnidades, ViewEmpresas, ViewCatalogo, ViewColaboradores];
  const content = document.getElementById('content');
  let current = null;

  function findView(id) {
    return views.find(v => v.id === id) || views[0];
  }

  function viewFromHash() {
    return findView((location.hash || '').replace(/^#\/?/, ''));
  }

  function navigate(id) {
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
    if (!current) return;
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

    const resumo = [
      UI.plural(parsed.unidades.length, 'unidade', 'unidades'),
      UI.plural(parsed.documentos.length, 'tipo de documento', 'tipos de documento'),
      UI.plural(parsed.colaboradores.length, 'colaborador', 'colaboradores'),
    ].join(', ');

    const ok = await UI.confirm({
      title: 'Importar backup',
      message: `O arquivo "${file.name}" contém: ${resumo}.\n\nTodos os dados atuais deste navegador serão substituídos. Continuar?`,
      confirmText: 'Importar e substituir',
      danger: true,
    });
    if (!ok) return;

    if (current && typeof current.leave === 'function') current.leave();
    Store.replace(parsed); // dispara store:change → re-render
    UI.toast('Dados importados com sucesso.');
  }

  /* ---------- inicialização ---------- */

  function init() {
    document.getElementById('nav').addEventListener('click', e => {
      const btn = e.target.closest('.nav-item');
      if (btn) navigate(btn.dataset.view);
    });

    window.addEventListener('hashchange', () => {
      const view = viewFromHash();
      if (view !== current) navigate(view.id);
    });

    document.addEventListener('store:change', render);
    document.addEventListener('store:error', () => {
      UI.toast('Não foi possível salvar no navegador (armazenamento indisponível ou cheio).', 'error');
    });

    document.getElementById('btn-export').addEventListener('click', exportJSON);

    const fileInput = document.getElementById('file-import');
    document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) importJSON(file).finally(() => { fileInput.value = ''; });
    });

    navigate(viewFromHash().id);
  }

  return { navigate, render, updateBadges, init };
})();

App.init();
