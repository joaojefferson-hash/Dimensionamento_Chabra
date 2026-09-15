/* ==========================================================================
   Tela: Empresas por Unidade — quantos clientes de cada unidade têm documentos
   VENCENDO em cada mês do ano selecionado, por condição (Mensal, Exclusiva TST)
   e por porte (Pequeno, Médio, Grande — o porte multiplica o esforço).

   Por unidade: linha Clientes ativos (informativo) + uma linha por condição +
   linha Total. Colunas: Jan … Dez | Acumulado até o mês atual (= Pendentes
   hoje) | Total do ano | Média.

   Seletor "Porte": digita-se um porte de cada vez (P, M ou G); em "Todos" as
   células mostram a soma dos portes (só leitura) e o Total traz o esforço
   equivalente (Σ quantidade × peso) quando difere da contagem.
   Célula vazia conta como zero. Tudo salva automaticamente.
   ========================================================================== */

const ViewEmpresas = {
  id: 'empresas',
  title: 'Empresas por Unidade',

  get CONDICOES() { return Store.CONDICOES; },
  get INFORMATIVOS() { return Store.INFORMATIVOS; },
  /** Todos os campos gravados por mês (condições + informativos). */
  get CAMPOS() { return [...Store.INFORMATIVOS, ...Store.CONDICOES]; },
  condSel: 'todas', // 'todas' | campo de uma condição | campo do informativo
  PORTE_KEY: 'chabra-dimensiona:empresas-porte',
  get porteSel() { try { return localStorage.getItem(this.PORTE_KEY) || 'P'; } catch (_) { return 'P'; } },
  set porteSel(v) { try { localStorage.setItem(this.PORTE_KEY, v); } catch (_) { /* ignora */ } },

  /* ---------- helpers de valor ---------- */

  condicaoDe(campo) { const c = this.CONDICOES.find(x => x.campo === campo); return c ? c.condicao : null; },
  /** Valor de um campo num mês: condição → quantidade do porte selecionado (ou a soma dos portes em "todos"); informativo → o número do mês. */
  efetivo(u, mes, campo, porte = this.porteSel) {
    const exc = (u.meses || {})[mes];
    if (!exc) return 0;
    const cond = this.condicaoDe(campo);
    if (!cond) return exc[campo] || 0;
    if (porte === 'todos') return exc[campo] || 0;
    return ((exc.demanda || {})[cond] || {})[porte] || 0;
  },
  totalMes(u, mes, porte = this.porteSel) { return this.CONDICOES.reduce((s, c) => s + this.efetivo(u, mes, c.campo, porte), 0); },
  /** Esforço equivalente do mês: Σ quantidade × peso do porte (todos os portes). */
  ponderadoMes(u, mes) {
    const exc = (u.meses || {})[mes];
    if (!exc || !exc.demanda) return 0;
    const pesos = Store.portes.pesos();
    let s = 0;
    Object.values(exc.demanda).forEach(porPorte => Object.entries(porPorte || {}).forEach(([porte, q]) => { s += q * (pesos[porte] || 1); }));
    return s;
  },
  somaAno(u, campo, porte = this.porteSel) { let s = 0; for (let m = 1; m <= 12; m++) s += campo ? this.efetivo(u, m, campo, porte) : this.totalMes(u, m, porte); return s; },
  media(u, campo, porte = this.porteSel) { return this.somaAno(u, campo, porte) / 12; },
  /** Acumulado até o mês atual (0..11): soma de janeiro até esse mês — o que venceu e ainda está em aberto + o que vence neste mês (= Pendentes hoje). */
  acumulado(u, campo, mesAtual, porte = this.porteSel) { let s = 0; for (let m = 1; m <= mesAtual + 1; m++) s += campo ? this.efetivo(u, m, campo, porte) : this.totalMes(u, m, porte); return s; },
  fmt(v) { return Number.isInteger(v) ? String(v) : UI.fmt(v, 1); },
  /** "P 20 · M 3 · G 2" — detalhe por porte de uma condição num mês. */
  detalhePortes(u, mes, campo) {
    const cond = this.condicaoDe(campo);
    const exc = (u.meses || {})[mes];
    if (!cond || !exc) return '';
    return Store.portes.list().map(p => { const q = ((exc.demanda || {})[cond] || {})[p.codigo] || 0; return q ? `${p.codigo} ${q}` : null; }).filter(Boolean).join(' · ');
  },

  render(el) {
    const unidades = Store.unidades.list();
    const MESES = Calculo.MESES;
    const ano = Store.ano;
    const mesAtual = Programacao.lerMesAtual(); // o mesmo "mês atual" do Dimensionamento
    const mesAtualNome = MESES[mesAtual];
    const tituloAcum = `Soma de janeiro até ${Calculo.MESES_LONGO[mesAtual].toLowerCase()}: o que venceu e ainda está em aberto nos meses passados + o que vence neste mês. São os "Pendentes hoje" do Dimensionamento (o mês atual é escolhido lá).`;
    const conds = this.condSel === 'todas' ? this.CONDICOES : this.CAMPOS.filter(c => c.campo === this.condSel);
    const mostrarTotal = this.condSel === 'todas';
    const ativos = this.INFORMATIVOS[0];
    const portes = Store.portes.list();
    const porteSel = portes.some(p => p.codigo === this.porteSel) ? this.porteSel : (this.porteSel === 'todos' ? 'todos' : (portes[0] ? portes[0].codigo : 'P'));
    const porteObj = portes.find(p => p.codigo === porteSel) || null;
    const somaPortes = porteSel === 'todos';
    const nExc = u => Object.keys(u.meses || {}).length;
    const pesoTxt = p => UI.fmt(p.peso, 1);

    const somaMes = m => unidades.reduce((s, u) => s + conds.reduce((t, c) => t + this.efetivo(u, m, c.campo, porteSel), 0), 0);
    const somaMedia = unidades.reduce((s, u) => s + conds.reduce((t, c) => t + this.media(u, c.campo, porteSel), 0), 0);
    const somaAnoTodas = unidades.reduce((s, u) => s + conds.reduce((t, c) => t + this.somaAno(u, c.campo, porteSel), 0), 0);
    const mediaAtivos = unidades.reduce((s, u) => s + this.media(u, ativos.campo), 0);
    const somaAtivosMes = m => unidades.reduce((s, u) => s + this.efetivo(u, m, ativos.campo), 0);

    /** Célula de um mês: input (porte escolhido ou informativo) ou soma só leitura (porte "todos"). */
    const celula = (u, c, i, informativo) => {
      const mes = i + 1;
      const exc = (u.meses || {})[mes];
      const v = this.efetivo(u, mes, c.campo, porteSel);
      if (!informativo && somaPortes) {
        return `<td class="cel-soma ${v ? 'cel-excecao' : ''}" data-cel="${mes}" title="${UI.esc(this.detalhePortes(u, mes, c.campo) || 'nenhum cliente')}">${v || '<span class="muted">–</span>'}</td>`;
      }
      return `<td class="${v ? 'cel-excecao' : ''}" data-cel="${mes}"><input type="number" class="input input-sm input-num input-mes" min="0" step="1" inputmode="numeric" data-id="${u.id}" data-mes="${mes}" data-campo="${c.campo}" value="${v || ''}" placeholder="–" aria-label="${UI.esc(u.nome)} ${c.rotulo}${porteObj && !informativo ? ' ' + porteObj.nome : ''} — ${Calculo.MESES_LONGO[i]}" title="${!informativo && exc ? UI.esc(this.detalhePortes(u, mes, c.campo)) : ''}"></td>`;
    };

    const linhaCond = (u, c, primeira, nLinhas, informativo = false) => `
      <tr data-unidade="${u.id}" data-campo="${c.campo}" class="${primeira ? 'inicio-unidade' : ''} ${informativo ? 'linha-informativa' : ''}">
        ${primeira ? `<td class="col-nome" rowspan="${nLinhas}">
          <div class="nome-unidade">${UI.esc(u.nome)}</div>
          <div class="acoes-unidade" data-acoes="${u.id}">${nExc(u) ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar todos os números de ${ano} desta unidade (voltam a zero)">limpar ${ano}</button>` : ''}</div>
        </td>` : ''}
        <td class="col-grau"><span class="chip-grau ${c.classe}" title="${c.ajuda}">${c.rotulo}</span></td>
        ${MESES.map((m, i) => celula(u, c, i, informativo)).join('')}
        <td class="col-acum" data-acum>${informativo ? '<span class="muted">—</span>' : this.fmt(this.acumulado(u, c.campo, mesAtual, porteSel))}</td>
        <td class="col-soma" data-soma>${this.fmt(this.somaAno(u, c.campo, porteSel))}</td>
        <td class="col-media" data-media>${this.fmt(this.media(u, c.campo, porteSel))}</td>
      </tr>`;

    const totalCel = (u, mes) => {
      const t = this.totalMes(u, mes, porteSel);
      const pond = somaPortes ? this.ponderadoMes(u, mes) : 0;
      return `<strong>${t}</strong>${somaPortes && Math.abs(pond - t) > 0.05 ? ` <small class="muted" title="Esforço equivalente: cada cliente vale o peso do seu porte">(${UI.fmt(pond, 1)})</small>` : ''}`;
    };
    const linhaTotal = u => `
      <tr class="linha-total-unidade" data-unidade="${u.id}" data-total>
        <td class="col-grau"><strong>Total</strong>${somaPortes ? ' <small class="muted">(equivalente)</small>' : ''}</td>
        ${MESES.map((m, i) => `<td data-mes-total="${i + 1}">${totalCel(u, i + 1)}</td>`).join('')}
        <td class="col-acum" data-acum><strong>${this.fmt(this.acumulado(u, null, mesAtual, porteSel))}</strong></td>
        <td class="col-soma" data-soma><strong>${this.fmt(this.somaAno(u, null, porteSel))}</strong></td>
        <td class="col-media" data-media><strong>${this.fmt(this.media(u, null, porteSel))}</strong></td>
      </tr>`;

    el.innerHTML = `
      <header class="page-header">
        <h1>Empresas por Unidade</h1>
        <p>Quantos clientes de cada unidade têm <strong>documentos vencendo em cada mês</strong> do ano selecionado, por condição (<strong>Mensal</strong> e <strong>Exclusiva TST</strong>) e por <strong>porte</strong> (${portes.map(p => `${p.nome} = peso ${pesoTxt(p)}`).join(', ')} — o porte multiplica o esforço). Cada cliente exige uma inspeção e um relatório (técnicos) e uma finalização (administrativos). <strong>Preencha em cada mês só os documentos que vencem naquele mês</strong> — nos meses que já passaram, os que venceram ali e ainda estão em aberto; o acumulado o Dimensionamento calcula. A linha <strong>Clientes ativos</strong> é só o registro de quantos clientes a unidade tinha no mês. Célula vazia conta como zero; tudo é salvo automaticamente.</p>
      </header>

      ${unidades.length === 0 ? `
      <section class="card">
        <div class="empty">
          <strong>Nenhuma unidade cadastrada</strong>
          Cadastre as unidades primeiro para informar quantos clientes vencem em cada uma.
          <br>
          <button type="button" class="btn btn-primary" data-action="go-unidades">Ir para Unidades</button>
        </div>
      </section>` : `
      <section class="card">
        <div class="card-head">
          <h2>Clientes que vencem, por mês · ${ano}</h2>
          <div class="right" data-local>
            <span class="muted">Mostrar:</span>
            <div class="seg" role="tablist">
              <button type="button" class="seg-btn ${this.condSel === 'todas' ? 'ativo' : ''}" data-action="cond" data-cond="todas">Todas</button>
              ${this.CONDICOES.map(c => `<button type="button" class="seg-btn ${this.condSel === c.campo ? 'ativo' : ''}" data-action="cond" data-cond="${c.campo}">Só ${c.rotulo}</button>`).join('')}
              <button type="button" class="seg-btn ${this.condSel === ativos.campo ? 'ativo' : ''}" data-action="cond" data-cond="${ativos.campo}">Só ${ativos.rotulo}</button>
            </div>
            <span class="muted">Porte:</span>
            <div class="seg seg-porte" role="tablist" title="Digite um porte de cada vez. Em Todos, as células mostram a soma dos portes.">
              ${portes.map(p => `<button type="button" class="seg-btn ${porteSel === p.codigo ? 'ativo' : ''}" data-action="porte" data-porte="${p.codigo}" title="${UI.esc(p.nome)} — peso ${pesoTxt(p)}">${UI.esc(p.nome)}</button>`).join('')}
              <button type="button" class="seg-btn ${somaPortes ? 'ativo' : ''}" data-action="porte" data-porte="todos">Todos</button>
            </div>
            <label class="param-inline"><span class="muted">Ano</span> ${Programacao.seletorAnoHTML('empresas-ano')}</label>
          </div>
        </div>
        <p class="muted">${somaPortes
          ? `Mostrando a <strong>soma dos portes</strong> (só leitura). Para digitar, escolha um porte acima. A linha Total mostra entre parênteses o esforço equivalente quando há clientes de porte médio ou grande.`
          : `Digitando o porte <strong>${UI.esc(porteObj ? porteObj.nome : porteSel)}</strong> (peso ${porteObj ? pesoTxt(porteObj) : '1'}). Em cada mês, digite só o que vence naquele mês (nos passados, o que venceu e ainda está em aberto). Clientes de outro porte: troque o porte acima.`}
          A linha <strong>Clientes ativos</strong> é só informativa. Os números são de <strong>${ano}</strong>.</p>
        <div class="table-wrap">
          <table class="table table-matriz ${somaPortes ? 'modo-soma' : ''}">
            <thead>
              <tr>
                <th class="col-nome">Unidade</th>
                <th class="col-grau">Condição</th>
                ${MESES.map((m, i) => `<th class="${i < mesAtual ? 'th-mes-passado' : i === mesAtual ? 'th-mes-atual' : ''}" title="${i < mesAtual ? 'Mês passado: o que venceu e ainda está em aberto' : i === mesAtual ? 'Mês atual' : ''}">${m}</th>`).join('')}
                <th class="col-acum" title="${UI.esc(tituloAcum)}">Acumulado até ${mesAtualNome.toLowerCase()}</th>
                <th class="col-soma" title="Soma dos 12 meses de ${ano}">Total ${ano}</th>
                <th class="col-media" title="Média dos 12 meses">Média</th>
              </tr>
            </thead>
            <tbody>
              ${unidades.map(u => {
                if (this.condSel === ativos.campo) return linhaCond(u, ativos, true, 1, true).replace(/<tr /, '<tr data-fim ');
                const nLinhas = conds.length + (mostrarTotal ? 2 : 0);
                const infos = mostrarTotal ? linhaCond(u, ativos, true, nLinhas, true) : '';
                return infos + conds.map((c, i) => linhaCond(u, c, !mostrarTotal && i === 0, nLinhas)).join('').replace(/<tr /, mostrarTotal ? '<tr ' : '<tr data-fim ') + (mostrarTotal ? linhaTotal(u) : '');
              }).join('')}
            </tbody>
            <tfoot>
              ${mostrarTotal ? `
              <tr class="linha-informativa">
                <th class="col-nome" colspan="2">${ativos.rotulo} (todas)</th>
                ${MESES.map((m, i) => `<th data-ativos-mes="${i + 1}">${this.fmt(somaAtivosMes(i + 1))}</th>`).join('')}
                <th class="col-acum"><span class="muted">—</span></th>
                <th class="col-soma" data-ativos-soma>${this.fmt(unidades.reduce((s, u) => s + this.somaAno(u, ativos.campo), 0))}</th>
                <th class="col-media" data-ativos-media>${this.fmt(mediaAtivos)}</th>
              </tr>` : ''}
              <tr>
                <th class="col-nome" colspan="2">${this.condSel === ativos.campo ? `${ativos.rotulo} (todas)` : 'Total das unidades'}</th>
                ${MESES.map((m, i) => `<th data-total-mes="${i + 1}">${this.fmt(somaMes(i + 1))}</th>`).join('')}
                <th class="col-acum" data-total-acum>${this.condSel === ativos.campo ? '<span class="muted">—</span>' : this.fmt(unidades.reduce((s, u) => s + conds.reduce((t, c) => t + this.acumulado(u, c.campo, mesAtual, porteSel), 0), 0))}</th>
                <th class="col-soma" data-total-soma>${this.fmt(somaAnoTodas)}</th>
                <th class="col-media" data-total-media>${this.fmt(somaMedia)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="note">O Dimensionamento usa a soma das duas condições em cada mês, com cada cliente valendo o peso do seu porte (${portes.map(p => `${p.codigo} ${pesoTxt(p)}`).join(' · ')}; os pesos ficam no Calendário). O que ficou em aberto vai somando mês a mês: a coluna <strong>Acumulado até ${mesAtualNome.toLowerCase()}</strong> é essa soma de janeiro até o mês atual (os "Pendentes hoje" do <strong>Dimensionamento</strong>, onde o mês atual é escolhido).</p>
      </section>`}
    `;

    el.querySelector('[data-action="go-unidades"]')?.addEventListener('click', () => App.navigate('unidades'));
    Programacao.bindSeletorAno(el.querySelector('#empresas-ano'));

    // ---- seletores e limpar ----
    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'cond') {
        this.condSel = btn.dataset.cond;
        App.render();
      } else if (btn.dataset.action === 'porte') {
        this.porteSel = btn.dataset.porte;
        App.render();
      } else if (btn.dataset.action === 'limpar-mes') {
        const u = Store.unidades.get(btn.dataset.id);
        const ok = await UI.confirm({ title: `Limpar ${ano}`, message: `Apagar todos os números de ${ano} de "${u ? u.nome : ''}" (clientes ativos, Mensal e Exclusiva TST, todos os portes)? Todos os meses voltam a zero.`, confirmText: 'Apagar', danger: true });
        if (!ok) return;
        try { await Store.empresasMes.limpar(btn.dataset.id); UI.toast(`Números de ${ano} apagados.`); }
        catch (err) { UI.toast(err.message, 'error'); }
      }
    });

    const enterBlur = input => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    // ---- valor de um mês (condição × porte escolhido, ou informativo) ----
    el.querySelectorAll('input.input-mes').forEach(input => {
      enterBlur(input);
      input.addEventListener('change', async () => {
        const u = Store.unidades.get(input.dataset.id);
        if (!u) return;
        const mes = Number(input.dataset.mes);
        const campo = input.dataset.campo;
        const cond = this.condicaoDe(campo);
        const valor = input.value.trim() === '' ? 0 : Math.max(0, Math.floor(UI.parseNum(input.value, 0)));
        const anterior = this.efetivo(u, mes, campo, porteSel);
        input.value = valor || '';
        if (valor === anterior) return;
        input.disabled = true;
        try {
          if (cond) await Store.empresasMes.definirDemanda(u.id, mes, cond, porteSel, valor, { silent: true });
          else await Store.empresasMes.definirClientesAtivos(u.id, mes, valor, { silent: true });
        } catch (err) {
          UI.toast(err.message, 'error');
          input.value = anterior || '';
          return;
        } finally {
          input.disabled = false;
        }
        this.atualizarUnidade(el, u.id);
        App.updateBadges();
      });
    });
  },

  /** Recalcula, sem re-renderizar, as linhas da unidade (valores, acumulado, somas, total) e os rodapés. */
  atualizarUnidade(el, unidadeId) {
    const unidades = Store.unidades.list();
    const u = unidades.find(x => x.id === unidadeId);
    const ano = Store.ano;
    const mesAtual = Programacao.lerMesAtual();
    const porteSel = this.porteSel;
    const somaPortes = porteSel === 'todos';
    if (u) {
      el.querySelectorAll(`tr[data-unidade="${unidadeId}"][data-campo]`).forEach(tr => {
        const campo = tr.dataset.campo;
        const informativo = tr.classList.contains('linha-informativa');
        tr.querySelectorAll('input.input-mes').forEach(inp => {
          const mes = Number(inp.dataset.mes);
          const v = this.efetivo(u, mes, campo, porteSel);
          inp.closest('td').classList.toggle('cel-excecao', v > 0);
          inp.value = v || '';
          if (!informativo) inp.title = this.detalhePortes(u, mes, campo);
        });
        tr.querySelector('[data-media]').textContent = this.fmt(this.media(u, campo, porteSel));
        tr.querySelector('[data-soma]').textContent = this.fmt(this.somaAno(u, campo, porteSel));
        if (!informativo) tr.querySelector('[data-acum]').textContent = this.fmt(this.acumulado(u, campo, mesAtual, porteSel));
      });
      const trTotal = el.querySelector(`tr[data-unidade="${unidadeId}"][data-total]`);
      if (trTotal) {
        for (let m = 1; m <= 12; m++) {
          const t = this.totalMes(u, m, porteSel);
          const pond = somaPortes ? this.ponderadoMes(u, m) : 0;
          trTotal.querySelector(`[data-mes-total="${m}"]`).innerHTML = `<strong>${t}</strong>${somaPortes && Math.abs(pond - t) > 0.05 ? ` <small class="muted">(${UI.fmt(pond, 1)})</small>` : ''}`;
        }
        trTotal.querySelector('[data-acum]').innerHTML = `<strong>${this.fmt(this.acumulado(u, null, mesAtual, porteSel))}</strong>`;
        trTotal.querySelector('[data-soma]').innerHTML = `<strong>${this.fmt(this.somaAno(u, null, porteSel))}</strong>`;
        trTotal.querySelector('[data-media]').innerHTML = `<strong>${this.fmt(this.media(u, null, porteSel))}</strong>`;
      }
      const acoes = el.querySelector(`[data-acoes="${unidadeId}"]`);
      if (acoes) acoes.innerHTML = Object.keys(u.meses || {}).length ? `<button type="button" class="btn-link" data-action="limpar-mes" data-id="${u.id}" title="Apagar todos os números de ${ano} desta unidade (voltam a zero)">limpar ${ano}</button>` : '';
    }
    const conds = this.condSel === 'todas' ? this.CONDICOES : this.CAMPOS.filter(c => c.campo === this.condSel);
    const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
    const ativos = this.INFORMATIVOS[0];
    for (let m = 1; m <= 12; m++) set(`[data-ativos-mes="${m}"]`, this.fmt(unidades.reduce((s, x) => s + this.efetivo(x, m, ativos.campo), 0)));
    set('[data-ativos-soma]', this.fmt(unidades.reduce((s, x) => s + this.somaAno(x, ativos.campo), 0)));
    set('[data-ativos-media]', this.fmt(unidades.reduce((s, x) => s + this.media(x, ativos.campo), 0)));
    for (let m = 1; m <= 12; m++) set(`[data-total-mes="${m}"]`, this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + this.efetivo(x, m, c.campo, porteSel), 0), 0)));
    set('[data-total-soma]', this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + this.somaAno(x, c.campo, porteSel), 0), 0)));
    set('[data-total-media]', this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + this.media(x, c.campo, porteSel), 0), 0)));
    if (this.condSel !== ativos.campo) set('[data-total-acum]', this.fmt(unidades.reduce((s, x) => s + conds.reduce((t, c) => t + this.acumulado(x, c.campo, mesAtual, porteSel), 0), 0)));
  },
};
