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

      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      };
      dlg.addEventListener('close', onClose);
      dlg.returnValue = '';
      dlg.showModal();
      okBtn.focus();
    });
  }

  return { esc, fmt, parseNum, plural, toast, confirm };
})();
