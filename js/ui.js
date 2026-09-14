/* ==========================================================================
   UI — utilitários de interface compartilhados pelas telas
   (escape de HTML, formatação, toast e diálogo de confirmação)
   ========================================================================== */

const UI = (() => {
  /** Escapa texto para uso seguro em innerHTML (conteúdo e atributos). */
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Formata número no padrão pt-BR (ex.: 1.234,5). */
  function fmt(n, digits = 1) {
    return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });
  }

  /** Converte valor de input em número, aceitando vírgula decimal. */
  function parseNum(value, fallback = 0) {
    const n = parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  /** Plural simples: plural(2, 'unidade', 'unidades') → "2 unidades". */
  function plural(n, singular, pluralForm) {
    return `${n} ${n === 1 ? singular : pluralForm}`;
  }

  /** Bloqueia um formulário enquanto uma gravação está em andamento. */
  function busy(form, on) {
    if (!form || !form.isConnected) return;
    form.classList.toggle('busy', on);
    form.querySelectorAll('button, input, select').forEach(el => { el.disabled = on; });
  }

  /** Mensagem rápida no canto inferior direito. type: success | error | info */
  function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, type === 'error' ? 4500 : 2800);
  }

  /** Diálogo de confirmação. Resolve true se o usuário confirmar. */
  function confirm({ title = 'Confirmar', message = '', confirmText = 'Confirmar', danger = false } = {}) {
    return new Promise(resolve => {
      const dlg = document.getElementById('confirm-dialog');
      const okBtn = document.getElementById('confirm-ok');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      okBtn.textContent = confirmText;
      okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

      const form = dlg.querySelector('form');
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        form.removeEventListener('submit', onSubmit);
        dlg.removeEventListener('close', onClose);
        resolve(value);
      };
      // submit responde no clique; close cobre Esc (o evento close pode atrasar em abas em segundo plano)
      const onSubmit = e => finish(!!e.submitter && e.submitter.value === 'ok');
      const onClose = () => finish(dlg.returnValue === 'ok');
      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('close', onClose);
      dlg.returnValue = '';
      dlg.showModal();
      okBtn.focus();
    });
  }

  /**
   * Diálogo para definir uma senha (nova + confirmação). Resolve com a senha
   * ou null se cancelado. Valida tamanho mínimo e igualdade antes de fechar.
   */
  function askPassword({ title = 'Definir senha', description = '', confirmText = 'Salvar', minLength = 8 } = {}) {
    return new Promise(resolve => {
      const dlg = document.getElementById('password-dialog');
      const form = dlg.querySelector('form');
      const erro = dlg.querySelector('#password-error');
      dlg.querySelector('#password-title').textContent = title;
      dlg.querySelector('#password-description').textContent = description;
      dlg.querySelector('#password-ok').textContent = confirmText;
      form.reset();
      form.senha.type = form.confirmar.type = 'password';
      erro.hidden = true;
      form.senha.minLength = minLength;

      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        form.removeEventListener('submit', onSubmit);
        dlg.removeEventListener('close', onClose);
        resolve(value);
      };
      const onSubmit = e => {
        const ok = e.submitter && e.submitter.value === 'ok';
        if (!ok) return finish(null); // Cancelar fecha via method=dialog
        e.preventDefault();
        const senha = form.senha.value;
        if (senha.length < minLength) { mostrar(`A senha precisa ter pelo menos ${minLength} caracteres.`); return; }
        if (senha !== form.confirmar.value) { mostrar('As senhas não conferem.'); return; }
        finish(senha);
        dlg.close('ok');
      };
      const onClose = () => finish(null);
      const mostrar = msg => { erro.textContent = msg; erro.hidden = false; form.senha.focus(); };

      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('close', onClose);
      dlg.returnValue = '';
      dlg.showModal();
      form.senha.focus();
    });
  }

  /** Senha aleatória legível (sem caracteres ambíguos) para cadastro inicial. */
  function gerarSenha(tamanho = 12) {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = new Uint8Array(tamanho);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('');
  }

  return { esc, fmt, parseNum, plural, busy, toast, confirm, askPassword, gerarSenha };
})();
