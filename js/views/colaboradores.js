/* ==========================================================================
   Tela: Colaboradores — equipe (técnicos de segurança e administrativos)

   Produção declarada por dia, conforme a função:
     Administrativo → empresas finalizadas por dia
     Técnico        → inspeções por dia e relatórios por dia
   Alocação por unidade com percentual do tempo (pode ser em mais de uma).
   ========================================================================== */

const ViewColaboradores = {
  id: 'colaboradores',
  title: 'Colaboradores',
  editingId: null,
  pendingFocus: false,
  filtros: { texto: '', funcao: '', unidade: '' }, // filtros da lista (mantidos enquanto a tela estiver aberta)
  MODO_KEY: 'chabra-dimensiona:colab-modo',

  get modo() {
    try { return localStorage.getItem(this.MODO_KEY) === 'organograma' ? 'organograma' : 'cadastro'; } catch (_) { return 'cadastro'; }
  },
  set modo(v) {
    try { localStorage.setItem(this.MODO_KEY, v); } catch (_) { /* sem localStorage: só não lembra */ }
  },

  /** Cabeçalho com a alternância Cadastro | Organograma. */
  cabecalhoHTML(modo) {
    return `
      <header class="page-header page-header-row">
        <div>
          <h1>Colaboradores</h1>
          <p>${modo === 'organograma'
            ? 'Quem está em cada unidade e quem lidera. O organograma é montado pelas unidades marcadas em cada pessoa — clique num nome para editar.'
            : 'Cadastre cada pessoa da equipe e informe quanto ela produz em um dia normal de trabalho. Cada pessoa tem o seu ritmo — os números são seus, não há fórmula automática.'}</p>
        </div>
        <div class="segmented" role="tablist" aria-label="Modo de visualização">
          <button type="button" role="tab" class="${modo === 'cadastro' ? 'ativo' : ''}" aria-selected="${modo === 'cadastro'}" data-action="modo" data-modo="cadastro">Cadastro</button>
          <button type="button" role="tab" class="${modo === 'organograma' ? 'ativo' : ''}" aria-selected="${modo === 'organograma'}" data-action="modo" data-modo="organograma">Organograma</button>
        </div>
      </header>`;
  },

  /** Modo Organograma: painel com números da equipe, pessoas por unidade e a árvore. */
  renderOrganograma(el) {
    const colaboradores = Store.colaboradores.list();
    const unidades = Store.unidades.list();
    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const conta = f => colaboradores.filter(f).length;
    const semUnidade = conta(c => (c.tipoProducao !== 'nenhuma' || c.chefia) && Store.totalAlocado(c) <= 0);

    el.innerHTML = `
      ${this.cabecalhoHTML('organograma')}

      <div class="stats">
        <div class="stat"><div class="label">Colaboradores</div><div class="value">${colaboradores.length}</div></div>
        <div class="stat"><div class="label">Técnicos</div><div class="value">${conta(c => c.tipoProducao === TEC)}</div></div>
        <div class="stat"><div class="label">Administrativos</div><div class="value">${conta(c => c.tipoProducao === ADM)}</div></div>
        <div class="stat"><div class="label">Chefia</div><div class="value">${conta(c => c.chefia)}</div></div>
        <div class="stat"><div class="label">Sem unidade</div><div class="value ${semUnidade ? 'neg' : ''}">${semUnidade}</div></div>
      </div>

      ${unidades.length ? `
      <section class="card">
        <div class="card-head">
          <h2>Pessoas por unidade</h2>
          <span class="muted">${UI.plural(unidades.length, 'unidade', 'unidades')}</span>
        </div>
        ${Organograma.barrasHTML({ unidades, colaboradores })}
      </section>` : ''}

      <section class="card">
        <div class="card-head">
          <h2>Organograma</h2>
          <span class="muted">chefias pela hierarquia das funções → equipes por unidade</span>
        </div>
        ${Organograma.html({ unidades, colaboradores, funcoes: Store.funcoes.list() })}
      </section>
    `;

    const wrap = el.querySelector('.org-wrap');
    const dica = el.querySelector('.org-dica');
    if (wrap && dica) requestAnimationFrame(() => { dica.hidden = wrap.scrollWidth <= wrap.clientWidth + 2; });

    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === 'modo') {
        this.modo = btn.dataset.modo;
        App.render();
      } else if (action === 'edit') {
        this.modo = 'cadastro';
        this.editingId = id;
        this.pendingFocus = true;
        App.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  },

  leave() {
    this.editingId = null;
    this.pendingFocus = false;
  },

  /** Desenha a tabela da equipe conforme os filtros (sem mexer no resto da tela). */
  desenharLista(el) {
    const box = el.querySelector('#lista-colab');
    if (!box) return;
    const fmtPct = v => (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.', ','));
    const colaboradores = Store.colaboradores.list();
    const listados = this.filtrar(colaboradores);
    const filtrando = !!(this.filtros.texto.trim() || this.filtros.funcao || this.filtros.unidade);
    const contador = el.querySelector('#colab-contador');
    if (contador) contador.textContent = filtrando ? `${listados.length} de ${colaboradores.length}` : UI.plural(colaboradores.length, 'colaborador', 'colaboradores');
    const btnLimpar = el.querySelector('[data-action="limpar-filtros"]');
    if (btnLimpar) btnLimpar.hidden = !filtrando;

    if (colaboradores.length === 0) {
      box.innerHTML = '<div class="empty"><strong>Nenhum colaborador cadastrado</strong>Use o formulário acima para adicionar o primeiro membro da equipe.</div>';
      return;
    }
    if (listados.length === 0) {
      box.innerHTML = '<div class="empty"><strong>Ninguém encontrado com esses filtros</strong>Mude a busca ou limpe os filtros.</div>';
      return;
    }
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>Ritmo por dia</th>
              <th>Unidades</th>
              <th class="num" title="Parte do tempo da pessoa dedicada a cada unidade">Tempo</th>
              <th class="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${listados.map(c => `
              <tr class="${c.id === this.editingId ? 'editing' : ''}">
                <td>${UI.esc(c.nome)}</td>
                <td>${ViewColaboradores.chipFuncao(c)}</td>
                <td class="${c.tipoProducao === 'nenhuma' ? 'muted' : ''}">${UI.esc(Calculo.ritmoTexto(c))}</td>
                ${(() => {
                  const t = Store.totalAlocado(c);
                  const semProducao = c.tipoProducao === 'nenhuma';
                  if (t <= 0) return `<td><span class="chip chip-warn">sem unidade</span></td><td class="num muted">—</td>`;
                  const alocs = (c.alocacoes || []).filter(a => a.percentual > 0);
                  const nomes = alocs.map(a => `<div>${UI.esc(Store.nomeUnidade(a.unidadeId) || a.unidadeNome || '?')}</div>`).join('');
                  if (semProducao) return `<td class="col-unidades">${nomes}</td><td class="num muted" title="Sem produção: o tempo não entra nas contas">—</td>`;
                  const tempos = alocs.map(a => `<div>${fmtPct(a.percentual)}%</div>`).join('');
                  const livre = t < 99.999 ? `<div><span class="chip chip-warn" title="Parte do tempo sem unidade">${fmtPct(Math.round((100 - t) * 10) / 10)}% livre</span></div>` : '';
                  return `<td class="col-unidades">${nomes}</td><td class="num col-tempo">${tempos}${livre}</td>`;
                })()}
                <td class="actions">
                  <button type="button" class="btn-link" data-action="edit" data-id="${c.id}">Editar</button>
                  <button type="button" class="btn-link danger" data-action="delete" data-id="${c.id}">Excluir</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  /** Chip com o nome da função (cor pelo tipo de produção) e a marca de chefia. */
  chipFuncao(c) {
    const cor = c.tipoProducao === Calculo.TEC ? 'chip-green' : c.tipoProducao === Calculo.ADM ? 'chip-blue' : 'chip-gray';
    return `<span class="chip ${cor}">${UI.esc(c.funcao || 'sem função')}</span>${c.chefia ? ' <span class="chip chip-chefia" title="Chefia de equipe: aparece como responsável pelas unidades em que está">Chefia</span>' : ''}`;
  },

  /** Aplica os filtros à lista de colaboradores. */
  filtrar(lista) {
    const f = this.filtros;
    const termo = f.texto.trim().toLocaleLowerCase('pt-BR');
    return lista.filter(c => {
      if (f.funcao === 'chefia' && !c.chefia) return false;
      if (f.funcao && f.funcao !== 'chefia' && c.funcaoId !== f.funcao) return false;
      if (f.unidade === 'sem' && Store.totalAlocado(c) > 0) return false;
      if (f.unidade && f.unidade !== 'sem' && !(c.alocacoes || []).some(a => a.unidadeId === f.unidade)) return false;
      if (termo) {
        const alvo = (c.nome + ' ' + (c.funcao || '') + ' ' + Store.descricaoAlocacoes(c) + ' ' + Calculo.ritmoTexto(c)).toLocaleLowerCase('pt-BR');
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  },

  render(el) {
    if (this.modo === 'organograma' && !this.editingId) { this.renderOrganograma(el); return; }
    const colaboradores = Store.colaboradores.list();
    const editing = this.editingId ? Store.colaboradores.get(this.editingId) : null;
    if (this.editingId && !editing) this.editingId = null;

    const TEC = Calculo.TEC, ADM = Calculo.ADM;
    const funcoes = Store.funcoes.list();
    const tecnicos = colaboradores.filter(c => c.tipoProducao === TEC).length;
    const administrativos = colaboradores.filter(c => c.tipoProducao === ADM).length;
    const chefes = colaboradores.filter(c => c.chefia).length;
    const funcaoPadrao = funcoes.find(f => f.tipoProducao === TEC) || funcoes[0] || null;
    const funcaoAtual = (editing && funcoes.find(f => f.id === editing.funcaoId)) || funcaoPadrao;
    const tipoAtual = funcaoAtual ? funcaoAtual.tipoProducao : 'nenhuma';
    const padrao = Store.DEFAULT_COLABORADOR;
    const val = campo => (editing ? editing[campo] : padrao[campo]);

    const unidades = Store.unidades.list();
    const alocAtual = editing ? (editing.alocacoes || []) : (unidades.length === 1 ? [{ unidadeId: unidades[0].id, percentual: 100 }] : []);
    const pctDe = uid => { const a = alocAtual.find(x => x.unidadeId === uid); return a ? a.percentual : 0; };
    const semUnidade = colaboradores.filter(c => (c.tipoProducao !== 'nenhuma' || c.chefia) && Store.totalAlocado(c) <= 0).length;
    const parciais = colaboradores.filter(c => { if (c.tipoProducao === 'nenhuma') return false; const t = Store.totalAlocado(c); return t > 0 && t < 99.999; }).length;
    const fmtPct = v => (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.', ','));
    if (this.filtros.funcao && this.filtros.funcao !== 'chefia' && !funcoes.some(f => f.id === this.filtros.funcao)) this.filtros.funcao = '';
    if (this.filtros.unidade && this.filtros.unidade !== 'sem' && !unidades.some(u => u.id === this.filtros.unidade)) this.filtros.unidade = '';

    el.innerHTML = `
      ${this.cabecalhoHTML('cadastro')}

      <div class="stats">
        <div class="stat"><div class="label">Colaboradores</div><div class="value">${colaboradores.length}</div></div>
        <div class="stat"><div class="label">Técnicos</div><div class="value">${tecnicos}</div></div>
        <div class="stat"><div class="label">Administrativos</div><div class="value">${administrativos}</div></div>
        <div class="stat"><div class="label">Chefia</div><div class="value">${chefes}</div></div>
      </div>
      ${semUnidade > 0 ? `<p class="alert alert-warn">${UI.plural(semUnidade, 'pessoa ainda não tem', 'pessoas ainda não têm')} unidade e por isso não ${semUnidade === 1 ? 'entra' : 'entram'} na programação. Clique em Editar e marque onde ${semUnidade === 1 ? 'ela atua' : 'elas atuam'}.${parciais > 0 ? ` ${UI.plural(parciais, 'pessoa tem', 'pessoas têm')} parte do tempo sem unidade.` : ''}</p>` : (parciais > 0 ? `<p class="alert alert-warn">${UI.plural(parciais, 'pessoa tem', 'pessoas têm')} parte do tempo sem unidade — só a parte marcada conta na programação.</p>` : '')}

      <section class="card">
        <h2>${editing ? 'Editar colaborador' : 'Novo colaborador'}</h2>
        <form id="form-colaborador" class="form-grid" autocomplete="off">
          <label class="field span-2">
            <span>Nome</span>
            <input class="input" name="nome" required maxlength="100" placeholder="Nome do colaborador"
                   value="${UI.esc(editing ? editing.nome : '')}">
          </label>
          <label class="field span-2">
            <span>Função</span>
            <select class="input" name="funcao" required ${funcoes.length === 0 ? 'disabled' : ''}>
              ${funcoes.length === 0 ? '<option value="">Cadastre uma função primeiro</option>' : ''}
              ${funcoes.map(f => `<option value="${f.id}" data-tipo="${f.tipoProducao}" data-chefia="${f.chefia ? '1' : ''}" ${funcaoAtual && f.id === funcaoAtual.id ? 'selected' : ''}>${UI.esc(f.nome)}${f.chefia ? ' (chefia)' : ''}</option>`).join('')}
            </select>
            <small>Define o que essa pessoa entrega. Para criar ou mudar funções, use a tela <a href="#funcoes">Funções</a>.</small>
          </label>

          <div class="span-4 campos-funcao" data-tipo="nenhuma" ${tipoAtual === 'nenhuma' ? '' : 'hidden'}>
            <p class="note"><strong>Função sem produção.</strong> Essa pessoa não tem ritmo diário e não entra nas contas da programação.
              <span class="so-chefia" ${funcaoAtual && funcaoAtual.chefia ? '' : 'hidden'}>Como é chefia, ela aparece como responsável pelas unidades marcadas abaixo.</span></p>
          </div>
          <div class="span-4 campos-funcao" data-tipo="${TEC}" ${tipoAtual === TEC ? '' : 'hidden'}>
            <div class="form-grid">
              <label class="field span-2">
                <span>Quantas inspeções esse colaborador faz por dia?</span>
                <input class="input" type="number" name="inspecoesDia" min="0" step="0.5" inputmode="decimal" value="${val('inspecoesDia')}">
                <small>Quantas visitas técnicas essa pessoa consegue fazer em um dia normal de trabalho.</small>
              </label>
              <label class="field span-2">
                <span>Quantos relatórios esse colaborador sobe por dia?</span>
                <input class="input" type="number" name="relatoriosDia" min="0" step="0.5" inputmode="decimal" value="${val('relatoriosDia')}">
                <small>Quantos relatórios essa pessoa consegue concluir e enviar em um dia normal de trabalho.</small>
              </label>
            </div>
          </div>
          <div class="span-4 campos-funcao" data-tipo="${ADM}" ${tipoAtual === ADM ? '' : 'hidden'}>
            <div class="form-grid">
              <label class="field span-2">
                <span>Quantas empresas esse colaborador consegue finalizar por dia?</span>
                <input class="input" type="number" name="empresasDia" min="0" step="0.5" inputmode="decimal" value="${val('empresasDia')}">
                <small>Quantas empresas essa pessoa consegue deixar prontas (documentação concluída) em um dia normal de trabalho.</small>
              </label>
            </div>
          </div>

          <div class="field span-4">
            <span id="aloc-titulo">${funcaoAtual && funcaoAtual.chefia ? 'Quais unidades essa pessoa lidera?' : 'Em quais unidades essa pessoa atua?'}</span>
            ${unidades.length === 0 ? '<p class="note">Cadastre uma unidade primeiro. Sem unidade, a pessoa não entra na programação.</p>' : `
            <div class="alocacoes ${tipoAtual === 'nenhuma' ? 'sem-pct' : ''}" id="alocacoes">
              ${unidades.map(u => { const pct = pctDe(u.id); return `
                <label class="aloc-linha">
                  <input type="checkbox" class="aloc-check" data-unidade="${u.id}" ${pct > 0 ? 'checked' : ''}>
                  <span class="aloc-nome">${UI.esc(u.nome)}</span>
                  <span class="aloc-pct">
                    <input class="input input-sm input-num aloc-input" type="number" data-unidade="${u.id}" min="0" max="100" step="1" inputmode="decimal" value="${pct > 0 ? fmtPct(pct).replace(',', '.') : ''}" ${pct > 0 ? '' : 'disabled'} aria-label="Parte do tempo em ${UI.esc(u.nome)}">
                    <span class="muted">% do tempo</span>
                  </span>
                </label>`; }).join('')}
              <div class="aloc-rodape">
                <span class="muted">Total: <strong id="aloc-total">0</strong>% <span id="aloc-aviso" class="aloc-aviso"></span></span>
                <button type="button" class="btn btn-ghost btn-sm" data-action="dividir">Dividir igualmente</button>
              </div>
            </div>
            <small class="ajuda-pct">Se a pessoa atende mais de uma unidade, divida o tempo dela em percentuais. A soma pode ficar abaixo de 100% (o resto não entra na programação), mas não acima.</small>
            <small class="ajuda-sem-pct">Marque as unidades pelas quais essa pessoa responde. Como não tem produção, não é preciso dividir o tempo.</small>`}
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Adicionar colaborador'}</button>
            ${editing ? '<button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>' : ''}
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Equipe cadastrada</h2>
          <span class="muted" id="colab-contador"></span>
        </div>
        ${colaboradores.length > 0 ? `
        <form class="filtros" id="filtros-colab" autocomplete="off">
          <input class="input input-sm filtro-texto" type="search" name="texto" placeholder="Buscar por nome…" value="${UI.esc(this.filtros.texto)}" aria-label="Buscar por nome">
          <select class="input input-sm" name="funcao" aria-label="Função">
            <option value="">Todas as funções</option>
            ${funcoes.map(f => `<option value="${f.id}" ${this.filtros.funcao === f.id ? 'selected' : ''}>${UI.esc(f.nome)}</option>`).join('')}
            ${chefes > 0 ? `<option value="chefia" ${this.filtros.funcao === 'chefia' ? 'selected' : ''}>Só chefia</option>` : ''}
          </select>
          <select class="input input-sm" name="unidade" aria-label="Unidade">
            <option value="">Todas as unidades</option>
            ${unidades.map(u => `<option value="${u.id}" ${this.filtros.unidade === u.id ? 'selected' : ''}>${UI.esc(u.nome)}</option>`).join('')}
            <option value="sem" ${this.filtros.unidade === 'sem' ? 'selected' : ''}>Sem unidade</option>
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-action="limpar-filtros" hidden>Limpar filtros</button>
        </form>` : ''}
        <div id="lista-colab"></div>
      </section>
    `;

    const form = el.querySelector('#form-colaborador');

    // ---- filtros da lista: redesenham só a lista (o formulário de cadastro fica intacto) ----
    const formFiltros = el.querySelector('#filtros-colab');
    if (formFiltros) {
      formFiltros.addEventListener('submit', e => e.preventDefault());
      const aplicar = () => {
        this.filtros = { texto: formFiltros.texto.value, funcao: formFiltros.funcao.value, unidade: formFiltros.unidade.value };
        this.desenharLista(el);
      };
      formFiltros.texto.addEventListener('input', aplicar);
      formFiltros.funcao.addEventListener('change', aplicar);
      formFiltros.unidade.addEventListener('change', aplicar);
    }
    this.desenharLista(el);

    // ---- campos conforme o tipo de produção da função escolhida ----
    const funcaoEscolhida = () => Store.funcoes.get(form.funcao.value) || null;
    const aplicarFuncao = () => {
      const f = funcaoEscolhida();
      const tipo = f ? f.tipoProducao : 'nenhuma';
      el.querySelectorAll('.campos-funcao').forEach(box => { box.hidden = box.dataset.tipo !== tipo; });
      const soChefia = el.querySelector('.so-chefia');
      if (soChefia) soChefia.hidden = !(f && f.chefia);
      const titulo = el.querySelector('#aloc-titulo');
      if (titulo) titulo.textContent = f && f.chefia ? 'Quais unidades essa pessoa lidera?' : 'Em quais unidades essa pessoa atua?';
      const aloc = el.querySelector('#alocacoes');
      if (aloc) aloc.classList.toggle('sem-pct', tipo === 'nenhuma');
    };
    form.funcao.addEventListener('change', aplicarFuncao);

    // ---- editor de alocação ----
    const lerAlocacoes = () => [...el.querySelectorAll('.aloc-input')]
      .filter(inp => !inp.disabled)
      .map(inp => ({ unidadeId: inp.dataset.unidade, percentual: Math.round(UI.parseNum(inp.value, 0) * 100) / 100 }))
      .filter(a => a.percentual > 0);
    const atualizarTotalAloc = () => {
      const total = el.querySelector('#aloc-total');
      if (!total) return;
      const soma = lerAlocacoes().reduce((s, a) => s + a.percentual, 0);
      total.textContent = fmtPct(Math.round(soma * 10) / 10);
      const aviso = el.querySelector('#aloc-aviso');
      aviso.textContent = soma > 100.0001 ? '— passou de 100%' : soma > 0 && soma < 99.999 ? `— ${fmtPct(Math.round((100 - soma) * 10) / 10)}% do tempo sem unidade` : '';
      aviso.classList.toggle('erro', soma > 100.0001);
    };
    el.querySelectorAll('.aloc-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const inp = el.querySelector(`.aloc-input[data-unidade="${chk.dataset.unidade}"]`);
        inp.disabled = !chk.checked;
        if (chk.checked) {
          if (!(UI.parseNum(inp.value, 0) > 0)) {
            const soma = lerAlocacoes().reduce((s, a) => s + a.percentual, 0);
            inp.value = Math.max(0, Math.min(100, 100 - soma));
          }
          inp.focus(); inp.select();
        } else {
          inp.value = '';
        }
        atualizarTotalAloc();
      });
    });
    el.querySelectorAll('.aloc-input').forEach(inp => inp.addEventListener('input', atualizarTotalAloc));
    el.querySelector('[data-action="dividir"]')?.addEventListener('click', () => {
      const ativos = [...el.querySelectorAll('.aloc-check')].filter(c => c.checked);
      if (ativos.length === 0) { UI.toast('Marque as unidades primeiro.', 'info'); return; }
      const parte = Math.floor(10000 / ativos.length) / 100;
      ativos.forEach((c, i) => {
        const inp = el.querySelector(`.aloc-input[data-unidade="${c.dataset.unidade}"]`);
        inp.value = i === ativos.length - 1 ? Math.round((100 - parte * (ativos.length - 1)) * 100) / 100 : parte;
      });
      atualizarTotalAloc();
    });
    atualizarTotalAloc();

    // ---- salvar ----
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const funcaoSel = funcaoEscolhida();
      const idEdicao = this.editingId; // guardado antes dos awaits: sair da tela zera editingId
      if (!nome) return;
      if (!funcaoSel) { UI.toast('Escolha a função. Se ainda não existe, cadastre em Funções.', 'error'); return; }
      const tipo = funcaoSel.tipoProducao;

      const lerProd = (campo, rotulo) => {
        const v = UI.parseNum(form[campo].value, NaN);
        if (!Number.isFinite(v) || v < 0) {
          UI.toast(`Informe um número válido em "${rotulo}".`, 'error');
          form[campo].focus();
          return null;
        }
        return v;
      };
      const dados = {
        nome, funcaoId: funcaoSel.id,
        empresasDia: editing ? editing.empresasDia : padrao.empresasDia,
        inspecoesDia: editing ? editing.inspecoesDia : padrao.inspecoesDia,
        relatoriosDia: editing ? editing.relatoriosDia : padrao.relatoriosDia,
      };
      if (tipo === ADM) {
        const v = lerProd('empresasDia', 'empresas por dia'); if (v === null) return;
        dados.empresasDia = v;
      } else if (tipo === TEC) {
        const a = lerProd('inspecoesDia', 'inspeções por dia'); if (a === null) return;
        const b = lerProd('relatoriosDia', 'relatórios por dia'); if (b === null) return;
        dados.inspecoesDia = a; dados.relatoriosDia = b;
      }

      let alocacoes = lerAlocacoes();
      if (tipo === 'nenhuma') {
        // sem produção: só importa em quais unidades a pessoa está (tempo dividido por igual, só para registro)
        const marcadas = [...el.querySelectorAll('.aloc-check')].filter(c => c.checked).map(c => c.dataset.unidade);
        const parte = marcadas.length ? Math.floor(10000 / marcadas.length) / 100 : 0;
        alocacoes = marcadas.map((uid, i) => ({ unidadeId: uid, percentual: i === marcadas.length - 1 ? Math.round((100 - parte * (marcadas.length - 1)) * 100) / 100 : parte }));
      }
      const somaAloc = alocacoes.reduce((s, a) => s + a.percentual, 0);
      if (somaAloc > 100.0001) {
        UI.toast(`A soma das unidades não pode passar de 100% (está em ${fmtPct(Math.round(somaAloc * 10) / 10)}%).`, 'error');
        return;
      }
      if (alocacoes.length === 0 && Store.unidades.list().length > 0 && (tipo !== 'nenhuma' || funcaoSel.chefia)) {
        const ok = await UI.confirm({ title: 'Sem unidade', message: funcaoSel.chefia && tipo === 'nenhuma'
          ? 'Esta pessoa é chefia, mas não está marcada em nenhuma unidade — não vai aparecer como responsável em lugar nenhum. Salvar mesmo assim?'
          : 'Esta pessoa não está em nenhuma unidade e não vai aparecer na programação. Salvar mesmo assim?', confirmText: 'Salvar' });
        if (!ok || !el.isConnected) return; // a tela pode ter sido trocada enquanto o diálogo estava aberto
      }
      dados.alocacoes = alocacoes;

      UI.busy(form, true);
      try {
        if (idEdicao) {
          await Store.colaboradores.update(idEdicao, dados);
          this.editingId = null;
          this.pendingFocus = true;
          UI.toast('Colaborador atualizado.');
        } else {
          await Store.colaboradores.add(dados);
          this.pendingFocus = true;
          UI.toast('Colaborador adicionado.');
        }
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

      if (action === 'modo') {
        this.modo = btn.dataset.modo;
        this.editingId = null;
        App.render();
      } else if (action === 'limpar-filtros') {
        this.filtros = { texto: '', funcao: '', unidade: '' };
        const f = el.querySelector('#filtros-colab');
        if (f) { f.texto.value = ''; f.funcao.value = ''; f.unidade.value = ''; }
        this.desenharLista(el);
      } else if (action === 'cancel') {
        this.editingId = null;
        App.render();
      } else if (action === 'edit') {
        this.editingId = id;
        this.pendingFocus = true;
        App.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'delete') {
        const c = Store.colaboradores.get(id);
        if (!c) return;
        const ok = await UI.confirm({
          title: 'Excluir colaborador',
          message: `Excluir "${c.nome}" da equipe?`,
          confirmText: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        try {
          await Store.colaboradores.remove(id);
          if (this.editingId === id) this.editingId = null;
          UI.toast('Colaborador excluído.');
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      }
    });

    if (this.pendingFocus) {
      this.pendingFocus = false;
      form.nome.focus();
      if (editing) form.nome.select();
    }
  },
};
