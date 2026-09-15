/* ==========================================================================
   Organograma da equipe — montado pela hierarquia das funções de chefia e
   pelas unidades marcadas em cada pessoa, sem cadastro extra de "chefe de X".

     chefia   → fica embaixo da pessoa cuja função é o "responde para" da sua
                função (se há mais de uma, a que divide unidade com ela)
     equipe   → cada pessoa fica embaixo da chefia mais próxima que coordena o
                grupo dela (técnicos / administrativos / todos) na unidade
     à parte  → "Sem chefia definida" (unidade sem chefia para aquele grupo)
                e "Sem unidade" (quem ainda não tem unidade marcada)

   Só leitura; clicar numa pessoa abre a edição dela.
   ========================================================================== */

const Organograma = (() => {
  'use strict';

  const fmt = v => (Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const pessoas = n => `${fmt(n)} ${n === 1 ? 'pessoa' : 'pessoas'}`;
  const ORDEM_TIPO = { tecnico: 0, administrativo: 1, nenhuma: 2 };
  const ROTULO_TIPO = { tecnico: 'Técnicos', administrativo: 'Administrativos', nenhuma: 'Outros' };
  const cobre = (coordena, tipo) => coordena === 'todos' || (coordena === 'tecnicos' && tipo === 'tecnico') || (coordena === 'administrativos' && tipo === 'administrativo');
  const COORDENA_TXT = { todos: 'coordena toda a equipe', tecnicos: 'coordena os técnicos', administrativos: 'coordena os administrativos' };

  /** Monta a árvore: chefias (por hierarquia de funções) com suas equipes por unidade. */
  function montar({ unidades = [], colaboradores = [], funcoes = [] }) {
    const ids = new Set(unidades.map(u => u.id));
    const alocs = c => (c.alocacoes || []).filter(a => a && ids.has(a.unidadeId) && Number(a.percentual) > 0);
    const funcaoDe = c => funcoes.find(f => f.id === c.funcaoId) || null;
    const ordemF = f => (f ? f.ordem : 9999);
    const cmpNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

    // ---- chefias ----
    const chefes = colaboradores.filter(c => c.chefia).map(c => ({
      c, funcao: funcaoDe(c), unidades: alocs(c).map(a => a.unidadeId), coordena: c.coordena || 'todos', filhos: [], equipes: new Map(),
    }));
    chefes.sort((a, b) => ordemF(a.funcao) - ordemF(b.funcao) || cmpNome(a.c, b.c));

    // profundidade da função na hierarquia (0 = topo) — chefia mais "baixa" fica mais perto da equipe
    const profundidade = f => {
      let d = 0; const vistos = new Set();
      for (let cur = f; cur && cur.respondeParaId && !vistos.has(cur.id); d++) { vistos.add(cur.id); cur = funcoes.find(x => x.id === cur.respondeParaId) || null; }
      return d;
    };
    chefes.forEach(ch => { ch.nivel = profundidade(ch.funcao); });

    // superior de uma chefia: sobe pela cadeia "responde para" até achar uma função que tenha gente
    const superiorDe = ch => {
      const vistos = new Set();
      let f = ch.funcao ? funcoes.find(x => x.id === ch.funcao.respondeParaId) : null;
      while (f && !vistos.has(f.id)) {
        vistos.add(f.id);
        const cands = chefes.filter(s => s !== ch && s.c.funcaoId === f.id);
        if (cands.length) {
          const comum = cands.filter(s => s.unidades.some(u => ch.unidades.includes(u)));
          return (comum.length ? comum : cands)[0];
        }
        f = funcoes.find(x => x.id === f.respondeParaId) || null;
      }
      return null;
    };
    chefes.forEach(ch => { ch.superior = superiorDe(ch); });
    // proteção contra ciclo: quem volta a si mesmo vira raiz
    chefes.forEach(ch => {
      const vistos = new Set([ch]);
      for (let s = ch.superior; s; s = s.superior) { if (vistos.has(s)) { ch.superior = null; break; } vistos.add(s); }
    });
    chefes.forEach(ch => { if (ch.superior) ch.superior.filhos.push(ch); });
    const raizes = chefes.filter(ch => !ch.superior);

    // ---- equipe: cada pessoa vai para a chefia mais próxima que coordena o grupo dela na unidade ----
    const coordenadorDe = (p, unidadeId) => {
      const cands = chefes.filter(ch => ch.unidades.includes(unidadeId) && cobre(ch.coordena, p.tipoProducao));
      cands.sort((a, b) => (a.coordena === 'todos') - (b.coordena === 'todos') || b.nivel - a.nivel || ordemF(a.funcao) - ordemF(b.funcao) || cmpNome(a.c, b.c));
      return cands[0] || null;
    };
    const semChefia = new Map(); // unidadeId → [{ c, pct }]
    const membros = colaboradores.filter(c => !c.chefia).sort((a, b) => (ORDEM_TIPO[a.tipoProducao] ?? 2) - (ORDEM_TIPO[b.tipoProducao] ?? 2) || cmpNome(a, b));
    membros.forEach(m => {
      alocs(m).forEach(a => {
        const ch = coordenadorDe(m, a.unidadeId);
        const mapa = ch ? ch.equipes : semChefia;
        if (!mapa.has(a.unidadeId)) mapa.set(a.unidadeId, []);
        mapa.get(a.unidadeId).push({ c: m, pct: Number(a.percentual) });
      });
    });

    const semUnidade = colaboradores.filter(c => !c.chefia && alocs(c).length === 0);
    return { chefes, raizes, semChefia, semUnidade };
  }

  /** Pessoas por unidade (técnicos × administrativos em pessoas inteiras, e quantas chefias), para as barras. */
  function porUnidade({ unidades = [], colaboradores = [] }) {
    const alocsEm = (c, uid) => (c.alocacoes || []).filter(a => a && a.unidadeId === uid && Number(a.percentual) > 0).reduce((s, a) => s + Number(a.percentual), 0) / 100;
    return unidades.map(u => {
      let tec = 0, adm = 0, chefia = 0;
      colaboradores.forEach(c => {
        const f = alocsEm(c, u.id);
        if (f <= 0) return;
        if (c.chefia) chefia++;
        else if (c.tipoProducao === 'tecnico') tec += f;
        else if (c.tipoProducao === 'administrativo') adm += f;
      });
      return { nome: u.nome, tec, adm, chefia };
    });
  }

  // ---------------------------------------------------------------- HTML ----

  const pessoaHTML = (c, pct, estrela = false) => `
    <button type="button" class="org-pessoa" data-action="edit" data-local data-id="${c.id}" title="Editar ${UI.esc(c.nome)}">
      <span class="org-nome">${estrela ? '<span class="org-estrela">★</span> ' : ''}${UI.esc(c.nome)}</span>
      <span class="org-funcao">${UI.esc(c.funcao || 'sem função')}${pct != null && pct < 99.999 && c.tipoProducao !== 'nenhuma' ? ` · ${fmt(Math.round(pct * 10) / 10)}% do tempo` : ''}</span>
    </button>`;

  /** Uma unidade dentro de uma caixa de equipe: título + pessoas (com rótulo do grupo quando há mais de um). */
  function equipeHTML(nomeUnidade, lista) {
    const tipos = new Set(lista.map(x => x.c.tipoProducao));
    let ultimo = null;
    const corpo = lista.map(x => {
      const rot = tipos.size > 1 && x.c.tipoProducao !== ultimo ? `<div class="org-grupo-rotulo">${ROTULO_TIPO[x.c.tipoProducao] || 'Outros'}</div>` : '';
      ultimo = x.c.tipoProducao;
      return rot + pessoaHTML(x.c, x.pct);
    }).join('');
    const fte = lista.reduce((s, x) => s + x.pct / 100, 0);
    const parcial = Math.abs(fte - lista.length) > 0.01;
    return `
      <div class="org-equipe">
        <div class="org-equipe-titulo"><strong>${UI.esc(nomeUnidade)}</strong> <span class="muted">${lista.length}${parcial ? ` (= ${pessoas(Math.round(fte * 10) / 10)})` : ''}</span></div>
        ${corpo}
      </div>`;
  }

  /** Caixa com as equipes (uma unidade embaixo da outra) de uma chefia. */
  function equipesHTML(mapa, nomeUnidade, classe = '', titulo = '') {
    const blocos = [...mapa.entries()].map(([uid, lista]) => equipeHTML(nomeUnidade(uid), lista)).join('');
    return `<li><div class="org-node org-equipes ${classe}">${titulo}${blocos}</div></li>`;
  }

  function chefeHTML(ch, ctx) {
    const todas = ctx.totalUnidades > 1 && ch.unidades.length === ctx.totalUnidades;
    const nomes = ch.unidades.map(ctx.nomeUnidade);
    const onde = ch.unidades.length === 0 ? 'nenhuma unidade marcada' : todas ? 'todas as unidades' : nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} +${nomes.length - 3}` : nomes.join(', ');
    const filhos = ch.filhos.map(f => chefeHTML(f, ctx)).join('');
    const equipes = ch.equipes.size ? equipesHTML(ch.equipes, ctx.nomeUnidade) : '';
    return `
      <li>
        <div class="org-node org-chefe">
          ${pessoaHTML(ch.c, null, true)}
          <div class="org-meta">${COORDENA_TXT[ch.coordena] || COORDENA_TXT.todos} · <span class="${ch.unidades.length ? '' : 'org-alerta'}">${UI.esc(onde)}</span></div>
        </div>
        ${filhos || equipes ? `<ul>${filhos}${equipes}</ul>` : ''}
      </li>`;
  }

  /** HTML completo do organograma. */
  function html({ unidades = [], colaboradores = [], funcoes = [] }) {
    if (unidades.length === 0 && colaboradores.length === 0) {
      return '<div class="empty"><strong>Nada para mostrar ainda</strong>Cadastre unidades e colaboradores para ver o organograma.</div>';
    }
    const o = montar({ unidades, colaboradores, funcoes });
    const ctx = { totalUnidades: unidades.length, nomeUnidade: uid => { const u = unidades.find(x => x.id === uid); return u ? u.nome : '?'; } };

    const raizes = o.raizes.map(ch => chefeHTML(ch, ctx)).join('');
    const semChefia = o.semChefia.size
      ? equipesHTML(o.semChefia, ctx.nomeUnidade, 'org-sem-chefia', o.chefes.length
          ? '<div class="org-node-head"><strong>Sem chefia definida</strong></div><span class="org-vazio">Nenhuma chefia coordena esse grupo nessas unidades. Marque a unidade na chefia certa.</span>'
          : '')
      : '';
    const semUnidade = o.semUnidade.length
      ? `<li>
           <div class="org-node org-sem-unidade">
             <div class="org-node-head"><strong>Sem unidade</strong><span class="muted">${pessoas(o.semUnidade.length)}</span></div>
             <div class="org-secao">${o.semUnidade.map(c => pessoaHTML(c, null)).join('')}</div>
             <span class="org-vazio">Não entram na programação. Clique no nome e marque a unidade.</span>
           </div>
         </li>`
      : '';
    const filhos = raizes + semChefia + semUnidade;
    return `
      <p class="org-dica muted" hidden>A árvore é larga: role para o lado para ver tudo.</p>
      <div class="org-wrap">
        <ul class="org-tree">
          <li>
            <div class="org-node org-root">
              <div class="org-node-head"><strong>Equipe</strong><span class="muted">${pessoas(colaboradores.length)} · ${unidades.length} ${unidades.length === 1 ? 'unidade' : 'unidades'}</span></div>
              ${o.chefes.length ? '' : '<span class="org-vazio">Marque funções como chefia (tela Funções) para montar a hierarquia.</span>'}
            </div>
            ${filhos ? `<ul>${filhos}</ul>` : ''}
          </li>
        </ul>
      </div>`;
  }

  /** Barras "pessoas por unidade" (técnicos × administrativos), em pessoas inteiras; chefia fica fora da barra. */
  function barrasHTML({ unidades = [], colaboradores = [] }) {
    if (!unidades.length) return '';
    const linhas = porUnidade({ unidades, colaboradores });
    const max = Math.max(1, ...linhas.map(l => l.tec + l.adm));
    const seg = (v, cls, rotulo) => (v > 0 ? `<span class="org-barra-seg ${cls}" style="width:${(v / max) * 100}%" title="${rotulo}: ${pessoas(Math.round(v * 10) / 10)}"></span>` : '');
    return `
      <div class="org-barras">
        ${linhas.map(l => `
          <div class="org-barra-linha">
            <span class="org-barra-nome">${UI.esc(l.nome)}</span>
            <span class="org-barra">${seg(l.tec, 'seg-tec', 'Técnicos')}${seg(l.adm, 'seg-adm', 'Administrativos')}</span>
            <span class="org-barra-total muted">${fmt(Math.round((l.tec + l.adm) * 10) / 10)}${l.chefia ? ` <small title="Chefia na unidade">★${l.chefia}</small>` : ''}</span>
          </div>`).join('')}
        <div class="org-legenda muted"><span><i class="seg-tec"></i>Técnicos</span><span><i class="seg-adm"></i>Administrativos</span><span>★ chefia na unidade</span> · em pessoas inteiras (parte do tempo conta proporcionalmente; chefia não entra na barra)</div>
      </div>`;
  }

  return { montar, porUnidade, html, barrasHTML };
})();
