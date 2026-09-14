/* ==========================================================================
   Organograma da equipe — montado a partir das alocações, sem cadastro extra.
     topo      → chefia geral: quem tem função de chefia e está em TODAS as
                 unidades (com uma unidade só, a chefia fica dentro dela)
     unidades  → chefia da unidade, técnicos, administrativos e outros
     à parte   → quem ainda não tem unidade
   Só leitura; clicar numa pessoa abre a edição dela.
   ========================================================================== */

const Organograma = (() => {
  'use strict';

  const fmt = v => (Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const pessoas = n => `${fmt(n)} ${n === 1 ? 'pessoa' : 'pessoas'}`;

  /** Agrupa colaboradores por unidade e papel. */
  function montar({ unidades = [], colaboradores = [] }) {
    const ids = new Set(unidades.map(u => u.id));
    const alocs = c => (c.alocacoes || []).filter(a => a && ids.has(a.unidadeId) && Number(a.percentual) > 0);
    const multi = unidades.length > 1;

    const geral = colaboradores.filter(c => c.chefia && multi && unidades.every(u => alocs(c).some(a => a.unidadeId === u.id)));
    const geralIds = new Set(geral.map(c => c.id));

    const porUnidade = unidades.map(u => {
      const membros = colaboradores
        .filter(c => !geralIds.has(c.id))
        .map(c => ({ c, pct: alocs(c).filter(a => a.unidadeId === u.id).reduce((s, a) => s + Number(a.percentual), 0) }))
        .filter(x => x.pct > 0);
      const grupo = f => membros.filter(f);
      return {
        unidade: u,
        chefia: grupo(x => x.c.chefia),
        tecnicos: grupo(x => !x.c.chefia && x.c.tipoProducao === 'tecnico'),
        administrativos: grupo(x => !x.c.chefia && x.c.tipoProducao === 'administrativo'),
        outros: grupo(x => !x.c.chefia && x.c.tipoProducao === 'nenhuma'),
        total: membros.length,
      };
    });

    const semUnidade = colaboradores.filter(c => alocs(c).length === 0);
    return { geral, porUnidade, semUnidade, unidades: unidades.length };
  }

  const pessoaHTML = (c, pct) => `
    <button type="button" class="org-pessoa" data-action="edit" data-id="${c.id}" title="Editar ${UI.esc(c.nome)}">
      <span class="org-nome">${UI.esc(c.nome)}</span>
      <span class="org-funcao">${UI.esc(c.funcao || 'sem função')}${pct != null && pct < 99.999 && c.tipoProducao !== 'nenhuma' ? ` · ${fmt(Math.round(pct * 10) / 10)}% do tempo` : ''}</span>
    </button>`;

  /** Seção de um grupo dentro da caixa da unidade (título + pessoas). */
  function secaoHTML(titulo, lista, vazio, classe = '', comFte = true) {
    const fte = lista.reduce((s, x) => s + x.pct / 100, 0);
    const parcial = comFte && lista.length && Math.abs(fte - lista.length) > 0.01;
    return `
      <div class="org-secao ${classe}">
        <div class="org-secao-titulo">${titulo}${lista.length ? ` <span class="muted">${lista.length}${parcial ? ` (= ${pessoas(Math.round(fte * 10) / 10)})` : ''}</span>` : ''}</div>
        ${lista.length ? lista.map(x => pessoaHTML(x.c, x.pct)).join('') : `<span class="org-vazio">${vazio}</span>`}
      </div>`;
  }

  function unidadeHTML(item) {
    const u = item.unidade;
    return `
      <li>
        <div class="org-node org-unidade">
          <div class="org-node-head">
            <strong>${UI.esc(u.nome)}</strong>
            <span class="muted">${pessoas(item.total)}</span>
          </div>
          ${secaoHTML('Chefia', item.chefia, 'não definida', 'org-secao-chefia', false)}
          ${secaoHTML('Técnicos', item.tecnicos, 'ninguém')}
          ${secaoHTML('Administrativos', item.administrativos, 'ninguém')}
          ${item.outros.length ? secaoHTML('Outros', item.outros, '', '', false) : ''}
        </div>
      </li>`;
  }

  /** HTML completo do organograma (árvore CSS: topo → unidades). */
  function html({ unidades = [], colaboradores = [] }) {
    if (unidades.length === 0 && colaboradores.length === 0) {
      return '<div class="empty"><strong>Nada para mostrar ainda</strong>Cadastre unidades e colaboradores para ver o organograma.</div>';
    }
    const o = montar({ unidades, colaboradores });
    const topo = o.geral.length
      ? `<div class="org-node org-root">
           <div class="org-node-head"><strong>Chefia geral</strong><span class="muted">${pessoas(o.geral.length)}</span></div>
           <div class="org-secao org-secao-chefia">${o.geral.map(c => pessoaHTML(c, null)).join('')}</div>
         </div>`
      : `<div class="org-node org-root">
           <div class="org-node-head"><strong>Equipe</strong><span class="muted">${pessoas(colaboradores.length)} · ${unidades.length} ${unidades.length === 1 ? 'unidade' : 'unidades'}</span></div>
           ${unidades.length > 1 ? '<span class="org-vazio">Quem for chefia em todas as unidades aparece aqui.</span>' : ''}
         </div>`;
    const semUnidade = o.semUnidade.length
      ? `<li>
           <div class="org-node org-sem-unidade">
             <div class="org-node-head"><strong>Sem unidade</strong><span class="muted">${pessoas(o.semUnidade.length)}</span></div>
             <div class="org-secao">${o.semUnidade.map(c => pessoaHTML(c, null)).join('')}</div>
             <span class="org-vazio">Não entram na programação. Clique no nome e marque a unidade.</span>
           </div>
         </li>`
      : '';
    return `
      <p class="org-dica muted" hidden>A árvore é larga: role para o lado para ver todas as unidades.</p>
      <div class="org-wrap">
        <ul class="org-tree">
          <li>
            ${topo}
            ${o.porUnidade.length || semUnidade ? `<ul>${o.porUnidade.map(unidadeHTML).join('')}${semUnidade}</ul>` : ''}
          </li>
        </ul>
      </div>`;
  }

  /** Barras "pessoas por unidade" (técnicos × administrativos), em pessoas inteiras; chefia e quem não produz ficam fora. */
  function barrasHTML({ unidades = [], colaboradores = [] }) {
    if (!unidades.length) return '';
    const o = montar({ unidades, colaboradores });
    const fte = l => l.reduce((s, x) => s + x.pct / 100, 0);
    const linhas = o.porUnidade.map(i => ({ nome: i.unidade.nome, tec: fte(i.tecnicos), adm: fte(i.administrativos), chefia: i.chefia.length }));
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

  return { montar, html, barrasHTML };
})();
