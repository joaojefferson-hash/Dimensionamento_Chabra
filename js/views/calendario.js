/* ==========================================================================
   Tela: Calendário — dias úteis por mês (editáveis). A produção mensal de
   cada pessoa é o ritmo por dia × dias úteis do mês. Salva ao alterar.
   ========================================================================== */

const ViewCalendario = {
  id: 'calendario',
  title: 'Calendário',

  render(el) {
    const p = Store.parametros.get();
    const total = p.diasUteis.reduce((s, d) => s + d, 0);

    el.innerHTML = `
      <header class="page-header">
        <h1>Calendário de dias úteis</h1>
        <p>Quantos dias de trabalho tem cada mês. A programação multiplica o ritmo diário de cada pessoa pelos dias úteis do mês. Feriados não são calculados automaticamente — ajuste os números conforme a sua região.</p>
      </header>

      <div class="stats">
        <div class="stat"><div class="label">Dias úteis no ano</div><div class="value" id="cal-total">${total}</div></div>
        <div class="stat"><div class="label">Média por mês</div><div class="value" id="cal-media">${UI.fmt(total / 12, 1)}</div></div>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Dias úteis por mês</h2>
          <div class="right">
            <span class="saved-flag" id="cal-saved" aria-hidden="true">salvo ✓</span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="padrao" title="Dias de semana de 2026 menos feriados nacionais">Restaurar padrão 2026</button>
          </div>
        </div>
        <form id="form-calendario" class="calendario-grid" autocomplete="off">
          ${Calculo.MESES_LONGO.map((m, i) => `
            <label class="field cal-mes">
              <span>${m}</span>
              <input class="input input-num" type="number" name="mes${i}" data-mes="${i}" min="0" max="31" step="1" inputmode="numeric" value="${p.diasUteis[i]}">
            </label>`).join('')}
        </form>
        <p class="note">Exemplo: uma pessoa que faz 2 inspeções por dia, num mês de ${p.diasUteis[0]} dias úteis, faz até ${2 * p.diasUteis[0]} inspeções no mês.</p>
      </section>
    `;

    const piscar = () => {
      const flag = el.querySelector('#cal-saved');
      flag.classList.add('show');
      clearTimeout(flag._timer);
      flag._timer = setTimeout(() => flag.classList.remove('show'), 1500);
    };
    const atualizarResumo = () => {
      const q = Store.parametros.get();
      const t = q.diasUteis.reduce((s, d) => s + d, 0);
      el.querySelector('#cal-total').textContent = t;
      el.querySelector('#cal-media').textContent = UI.fmt(t / 12, 1);
    };

    const formCal = el.querySelector('#form-calendario');
    formCal.addEventListener('submit', e => e.preventDefault());
    formCal.querySelectorAll('input[data-mes]').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('change', async () => {
        const mes = Number(input.dataset.mes);
        const valor = Math.max(0, Math.min(31, Math.floor(UI.parseNum(input.value, 0))));
        input.value = valor;
        const dias = Store.parametros.get().diasUteis;
        dias[mes] = valor;
        input.disabled = true;
        try {
          await Store.parametros.update({ diasUteis: dias }, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          input.value = Store.parametros.get().diasUteis[mes];
          return;
        } finally {
          input.disabled = false;
        }
        atualizarResumo();
        piscar();
      });
    });

    el.querySelector('[data-action="padrao"]').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Restaurar padrão 2026',
        message: 'Substituir os 12 valores pelos dias de semana de 2026 menos os feriados nacionais?',
        confirmText: 'Restaurar',
      });
      if (!ok) return;
      try {
        await Store.parametros.update({ diasUteis: Store.DEFAULT_PARAMETROS.diasUteis.slice() });
        UI.toast('Calendário restaurado.');
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  },
};
