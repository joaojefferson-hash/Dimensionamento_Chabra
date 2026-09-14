/* ==========================================================================
   Tela: Calendário — dias úteis por mês (editáveis) e dias úteis de referência
   da capacidade mensal cadastrada. Alimenta a capacidade mensal do motor.
   Salva automaticamente ao alterar cada campo.
   ========================================================================== */

const ViewCalendario = {
  id: 'calendario',
  title: 'Calendário',

  render(el) {
    const p = Store.parametros.get();
    const total = p.diasUteis.reduce((s, d) => s + d, 0);
    const exemplo = Store.DEFAULT_COLABORADOR.horasMes / p.diasReferencia;

    el.innerHTML = `
      <header class="page-header">
        <h1>Calendário de dias úteis</h1>
        <p>Informe os dias úteis de cada mês. A capacidade mensal de cada colaborador é <em>dias úteis × horas produtivas/dia × eficiência</em>. Sem cálculo automático de feriados por enquanto — ajuste manualmente conforme a sua região.</p>
      </header>

      <div class="stats">
        <div class="stat"><div class="label">Dias úteis no ano</div><div class="value" id="cal-total">${total}</div></div>
        <div class="stat"><div class="label">Média por mês</div><div class="value" id="cal-media">${UI.fmt(total / 12, 1)}</div></div>
        <div class="stat"><div class="label">Dias de referência</div><div class="value" id="cal-ref">${p.diasReferencia}</div></div>
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
      </section>

      <section class="card">
        <h2>Dias úteis de referência</h2>
        <form id="form-referencia" class="form-grid" autocomplete="off">
          <label class="field">
            <span>Dias úteis equivalentes à capacidade mensal cadastrada</span>
            <input class="input input-num" type="number" name="diasReferencia" min="1" max="31" step="1" inputmode="numeric" value="${p.diasReferencia}">
            <small>A capacidade mensal do colaborador (ex.: 160 h) equivale a este nº de dias. Horas produtivas/dia = capacidade mensal ÷ referência.</small>
          </label>
          <div class="field span-2">
            <span>Exemplo</span>
            <p class="note" id="cal-exemplo">Colaborador com ${Store.DEFAULT_COLABORADOR.horasMes} h/mês → ${UI.fmt(exemplo, 2)} h/dia. Em um mês de ${p.diasUteis[0]} dias úteis e eficiência ${Store.DEFAULT_COLABORADOR.eficiencia}%: ${UI.fmt(p.diasUteis[0] * exemplo * Store.DEFAULT_COLABORADOR.eficiencia / 100, 1)} h de capacidade.</p>
          </div>
        </form>
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
      el.querySelector('#cal-ref').textContent = q.diasReferencia;
      const ex = Store.DEFAULT_COLABORADOR.horasMes / q.diasReferencia;
      el.querySelector('#cal-exemplo').textContent =
        `Colaborador com ${Store.DEFAULT_COLABORADOR.horasMes} h/mês → ${UI.fmt(ex, 2)} h/dia. Em um mês de ${q.diasUteis[0]} dias úteis e eficiência ${Store.DEFAULT_COLABORADOR.eficiencia}%: ${UI.fmt(q.diasUteis[0] * ex * Store.DEFAULT_COLABORADOR.eficiencia / 100, 1)} h de capacidade.`;
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
        await Store.parametros.update({ diasUteis: Store.DEFAULT_PARAMETROS.diasUteis.slice() }); // re-render
        UI.toast('Calendário restaurado.');
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });

    const formRef = el.querySelector('#form-referencia');
    formRef.addEventListener('submit', e => e.preventDefault());
    const ref = formRef.diasReferencia;
    ref.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ref.blur(); } });
    ref.addEventListener('change', async () => {
      const valor = Math.floor(UI.parseNum(ref.value, 0));
      if (!(valor >= 1 && valor <= 31)) {
        UI.toast('Informe entre 1 e 31 dias.', 'error');
        ref.value = Store.parametros.get().diasReferencia;
        return;
      }
      ref.disabled = true;
      try {
        await Store.parametros.update({ diasReferencia: valor }, { silent: true });
      } catch (err) {
        UI.toast(err.message, 'error');
        ref.value = Store.parametros.get().diasReferencia;
        return;
      } finally {
        ref.disabled = false;
      }
      atualizarResumo();
      piscar();
    });
  },
};
