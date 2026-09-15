/* ==========================================================================
   Tela: Calendário — dias úteis por mês (editáveis) e os dois parâmetros do
   dimensionamento: folga para imprevistos (%) e prazo para atender (dias).
   A produção mensal de cada pessoa é o ritmo por dia × dias úteis do mês. Salva ao alterar.
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

      <section class="card">
        <div class="card-head">
          <h2>Parâmetros do dimensionamento</h2>
          <span class="saved-flag" id="par-saved" aria-hidden="true">salvo ✓</span>
        </div>
        <form id="form-parametros" class="form-parametros" autocomplete="off">
          <label class="field">
            <span>Folga para imprevistos</span>
            <div class="param-inline">
              <input class="input input-num input-pct" type="number" name="folga" min="0" max="90" step="1" inputmode="numeric" value="${Math.round(100 - p.ocupacaoAlvo)}">
              <span class="muted">%</span>
            </div>
            <small class="muted">Parte do tempo da equipe reservada para faltas, retrabalho e urgências. Com 15%, contamos que cada pessoa entrega até 85% do que declarou.</small>
          </label>
          <label class="field">
            <span>Prazo para atender</span>
            <div class="param-inline">
              <input class="input input-num input-pct" type="number" name="prazoDias" min="1" max="365" step="1" inputmode="numeric" value="${p.prazoDias}">
              <span class="muted">dias</span>
            </div>
            <small class="muted">Quantos dias uma empresa tem para receber os documentos depois que vencem. O Dimensionamento diz quantas pessoas contratar para zerar o pendente nesse prazo.</small>
          </label>
          <div class="field">
            <span>Ramp-up de quem é contratado</span>
            <div class="param-inline">
              <span class="muted">1º mês</span><input class="input input-num input-pct" type="number" name="rampup0" min="0" max="100" step="5" inputmode="numeric" value="${p.rampup[0] != null ? p.rampup[0] : 100}"><span class="muted">%</span>
              <span class="muted">2º mês</span><input class="input input-num input-pct" type="number" name="rampup1" min="0" max="100" step="5" inputmode="numeric" value="${p.rampup[1] != null ? p.rampup[1] : 100}"><span class="muted">%</span>
              <span class="muted">3º mês</span><input class="input input-num input-pct" type="number" name="rampup2" min="0" max="100" step="5" inputmode="numeric" value="${p.rampup[2] != null ? p.rampup[2] : 100}"><span class="muted">%</span>
            </div>
            <small class="muted">Quanto uma pessoa nova produz nos primeiros meses de casa (depois, 100%). Vale para quem tem data de admissão e para as contratações simuladas no "E se…?".</small>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Porte dos clientes</h2>
          <span class="saved-flag" id="porte-saved" aria-hidden="true">salvo ✓</span>
        </div>
        <p class="muted">O peso multiplica o esforço de cada cliente: um cliente de peso 2 exige o trabalho de dois pequenos (inspeção, relatório e finalização). Os números por porte são lançados em Empresas por Unidade.</p>
        <form id="form-portes" class="form-portes" autocomplete="off">
          ${Store.portes.list().map(pt => `
            <label class="field">
              <span>${UI.esc(pt.nome)} (${UI.esc(pt.codigo)})</span>
              <div class="param-inline">
                <span class="muted">peso</span>
                <input class="input input-num input-pct" type="number" name="peso-${UI.esc(pt.codigo)}" data-porte="${UI.esc(pt.codigo)}" min="0.1" max="20" step="0.1" inputmode="decimal" value="${pt.peso}">
              </div>
            </label>`).join('')}
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
    };

    // ---- parâmetros: folga e prazo ----
    const formPar = el.querySelector('#form-parametros');
    formPar.addEventListener('submit', e => e.preventDefault());
    const piscarPar = () => {
      const flag = el.querySelector('#par-saved');
      flag.classList.add('show');
      clearTimeout(flag._timer);
      flag._timer = setTimeout(() => flag.classList.remove('show'), 1500);
    };
    const ligarParametro = (input, { valida, erro, aplicar, atual }) => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('change', async () => {
        const v = Math.round(UI.parseNum(input.value, NaN));
        if (!valida(v)) { UI.toast(erro, 'error'); input.value = atual(); return; }
        input.disabled = true;
        try { await Store.parametros.update(aplicar(v), { silent: true }); piscarPar(); }
        catch (err) { UI.toast(err.message, 'error'); input.value = atual(); }
        finally { input.disabled = false; }
      });
    };
    ligarParametro(formPar.folga, { valida: v => v >= 0 && v <= 90, erro: 'A folga deve ficar entre 0% e 90%.', aplicar: v => ({ ocupacaoAlvo: 100 - v }), atual: () => Math.round(100 - Store.parametros.get().ocupacaoAlvo) });
    ligarParametro(formPar.prazoDias, { valida: v => v >= 1 && v <= 365, erro: 'O prazo deve ficar entre 1 e 365 dias.', aplicar: v => ({ prazoDias: v }), atual: () => Store.parametros.get().prazoDias });
    [0, 1, 2].forEach(i => ligarParametro(formPar[`rampup${i}`], {
      valida: v => v >= 0 && v <= 100, erro: 'O ramp-up deve ficar entre 0% e 100%.',
      aplicar: v => { const r = [0, 1, 2].map(k => (k === i ? v : (Store.parametros.get().rampup[k] != null ? Store.parametros.get().rampup[k] : 100))); while (r.length && r[r.length - 1] >= 100) r.pop(); return { rampup: r }; },
      atual: () => (Store.parametros.get().rampup[i] != null ? Store.parametros.get().rampup[i] : 100),
    }));

    // ---- pesos dos portes ----
    const formPortes = el.querySelector('#form-portes');
    formPortes.addEventListener('submit', e => e.preventDefault());
    formPortes.querySelectorAll('input[data-porte]').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('change', async () => {
        const v = UI.parseNum(input.value, NaN);
        const atual = () => (Store.portes.get(input.dataset.porte) || { peso: 1 }).peso;
        if (!(v >= 0.1 && v <= 20)) { UI.toast('O peso deve ficar entre 0,1 e 20.', 'error'); input.value = atual(); return; }
        input.disabled = true;
        try { await Store.portes.atualizar(input.dataset.porte, { peso: v }); const flag = el.querySelector('#porte-saved'); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1500); }
        catch (err) { UI.toast(err.message, 'error'); input.value = atual(); }
        finally { input.disabled = false; }
      });
    });

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
