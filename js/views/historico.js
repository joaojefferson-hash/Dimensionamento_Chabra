/* ==========================================================================
   Tela: Histórico — quem alterou o quê e quando (tabela `historico`,
   preenchida por gatilhos no banco). Cada linha vira uma frase simples.
   ========================================================================== */

const ViewHistorico = {
  id: 'historico',
  title: 'Histórico',
  PAGINA: 100,
  itens: [],
  fim: false,
  filtro: '',

  leave() { this.itens = []; this.fim = false; },

  render(el) {
    el.innerHTML = `
      <header class="page-header">
        <h1>Histórico de alterações</h1>
        <p>Tudo o que foi cadastrado, alterado ou excluído, com quem fez e quando. Registrado automaticamente pelo banco — não dá para editar nem apagar por aqui.</p>
      </header>

      <section class="card">
        <div class="card-head">
          <h2>Alterações recentes</h2>
          <div class="right">
            <input class="input input-sm" id="hist-filtro" type="search" placeholder="Filtrar por pessoa, unidade, colaborador…" value="${UI.esc(this.filtro)}" style="min-width:260px">
            <button type="button" class="btn btn-ghost btn-sm" data-action="recarregar">Atualizar</button>
          </div>
        </div>
        <div id="hist-lista"><div class="empty">Carregando…</div></div>
        <div class="hist-rodape">
          <button type="button" class="btn btn-ghost btn-sm" id="hist-mais" hidden>Carregar mais</button>
        </div>
      </section>
    `;

    el.querySelector('#hist-filtro').addEventListener('input', e => { this.filtro = e.target.value; this.desenhar(el); });
    el.querySelector('[data-action="recarregar"]').addEventListener('click', () => { this.itens = []; this.fim = false; this.carregar(el); });
    el.querySelector('#hist-mais').addEventListener('click', () => this.carregar(el));
    this.itens = []; this.fim = false;
    this.carregar(el);
  },

  async carregar(el) {
    const box = el.querySelector('#hist-lista');
    const btn = el.querySelector('#hist-mais');
    btn.disabled = true;
    try {
      const ultimo = this.itens.length ? this.itens[this.itens.length - 1] : null;
      let q = db.from('historico').select('*').order('id', { ascending: false }).limit(this.PAGINA);
      if (ultimo) q = q.lt('id', ultimo.id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      this.itens = this.itens.concat(data);
      this.fim = data.length < this.PAGINA;
    } catch (err) {
      box.innerHTML = `<div class="empty"><strong>Não foi possível carregar</strong>${UI.esc(err.message)}</div>`;
      return;
    } finally {
      btn.disabled = false;
    }
    this.desenhar(el);
  },

  desenhar(el) {
    const box = el.querySelector('#hist-lista');
    const btn = el.querySelector('#hist-mais');
    const termo = this.filtro.trim().toLocaleLowerCase('pt-BR');
    // exclusões em cascata (mês/alocação apagados junto com a unidade ou o colaborador) são ruído:
    // a linha "Excluiu a unidade X" / "Excluiu o colaborador Y" já conta a história
    const cascata = h => h.operacao === 'delete' && h.antes && (
      (h.tabela === 'unidade_empresas_mes' && h.antes.unidade_nome == null) ||
      (h.tabela === 'colaborador_unidades' && (h.antes.unidade_nome == null || h.antes.colaborador_nome == null)));
    const linhas = this.itens
      .filter(h => !cascata(h))
      .map(h => ({ h, frase: this.descrever(h), quem: h.usuario_nome || h.usuario_email || 'Sistema' }))
      .filter(x => !termo || (x.frase + ' ' + x.quem).toLocaleLowerCase('pt-BR').includes(termo));
    btn.hidden = this.fim;

    if (!linhas.length) {
      box.innerHTML = `<div class="empty">${this.itens.length ? 'Nada encontrado com esse filtro.' : 'Nenhuma alteração registrada ainda. A partir de agora, tudo o que mudar nos cadastros aparece aqui.'}</div>`;
      return;
    }
    // agrupa por dia
    let diaAtual = '';
    const partes = [];
    linhas.forEach(({ h, frase, quem }) => {
      const d = new Date(h.quando);
      const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      if (dia !== diaAtual) { diaAtual = dia; partes.push(`<div class="hist-dia">${dia.charAt(0).toUpperCase() + dia.slice(1)}</div>`); }
      partes.push(`
        <div class="hist-item hist-${h.operacao}">
          <span class="hist-hora">${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="hist-quem" title="${UI.esc(h.usuario_email || '')}">${UI.esc(quem)}</span>
          <span class="hist-frase">${frase}</span>
        </div>`);
    });
    box.innerHTML = `<div class="hist-lista">${partes.join('')}</div>`;
  },

  /* ---------- frases ---------- */

  MES: ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],

  CAMPOS: {
    unidades: { nome: 'nome', empresas_vencidas: 'documentos vencidos (padrão)',
                empresas_em_dia: 'em dia (padrão)', empresas_vencendo: 'vencendo (padrão)', empresas_a_vencer: 'a vencer no mês (padrão)',
                empresas_baixo: 'grau baixo (padrão)', empresas_medio: 'grau médio (padrão)', empresas_alto: 'grau alto (padrão)' },
    unidade_empresas_mes: { empresas_vencidas: 'documentos vencidos',
                            empresas_em_dia: 'em dia', empresas_vencendo: 'vencendo', empresas_a_vencer: 'a vencer no mês',
                            empresas_baixo: 'grau baixo', empresas_medio: 'grau médio', empresas_alto: 'grau alto' },
    colaboradores: { nome: 'nome', funcao: 'função', funcao_id: 'função', empresas_dia: 'empresas por dia', inspecoes_dia: 'inspeções por dia', relatorios_dia: 'relatórios por dia' },
    funcoes: { nome: 'nome', tipo_producao: 'tipo de produção', chefia: 'chefia de equipe', coordena: 'coordena', responde_para: 'responde para', ordem: 'ordem' },
    colaborador_unidades: { percentual: '% do tempo' },
    parametros: { peso_em_dia: 'peso de "em dia"', peso_vencendo: 'peso de "vencendo"', peso_a_vencer: 'peso de "a vencer no mês"', ocupacao_alvo: 'folga para imprevistos', dias_uteis: 'dias úteis',
                  fator_baixo: 'peso do grau baixo', fator_medio: 'peso do grau médio', fator_alto: 'peso do grau alto', meses_por_inspecao: 'frequência de inspeção', meses_por_relatorio: 'frequência de relatório', meses_por_finalizacao: 'frequência de finalização' },
    documentos: { nome: 'nome', horas: 'horas', periodicidade_meses: 'periodicidade', responsavel: 'produzido por' },
  },

  fmtVal(campo, v) {
    if (v == null) return '—';
    if (campo === 'ocupacao_alvo') return `${UI.fmt(100 - Number(v), 0)}%`;
    if (campo === 'percentual') return `${UI.fmt(Number(v), 1)}%`;
    if (campo.startsWith('meses_por')) { const m = Number(v); return m >= 12 && m % 12 === 0 ? `a cada ${m / 12} ${m === 12 ? 'ano' : 'anos'}` : `a cada ${UI.fmt(m, 1)} ${m === 1 ? 'mês' : 'meses'}`; }
    if (campo === 'funcao') return String(v);
    if (campo === 'funcao_id' || campo === 'responde_para') { const f = Store.funcoes.get(String(v)); return f ? f.nome : 'função excluída'; }
    if (campo === 'coordena') { const c = Store.COORDENA.find(x => x.id === v); return c ? c.rotulo.toLowerCase() : String(v); }
    if (campo === 'tipo_producao') { const t = Store.TIPOS_PRODUCAO.find(x => x.id === v); return t ? t.rotulo : String(v); }
    if (typeof v === 'boolean') return v ? 'sim' : 'não';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) return UI.fmt(Number(v), 2);
    return String(v);
  },

  diffs(tabela, antes, depois) {
    const rotulos = this.CAMPOS[tabela] || {};
    const out = [];
    Object.keys(rotulos).forEach(campo => {
      const a = antes ? antes[campo] : undefined, d = depois ? depois[campo] : undefined;
      if (JSON.stringify(a) === JSON.stringify(d)) return;
      if (campo === 'dias_uteis' && Array.isArray(a) && Array.isArray(d)) {
        const meses = a.map((v, i) => (v !== d[i] ? `${this.MES[i + 1]} ${v}→${d[i]}` : null)).filter(Boolean);
        out.push(`dias úteis: ${meses.join(', ')}`);
        return;
      }
      out.push(`${rotulos[campo]}: <s>${UI.esc(this.fmtVal(campo, a))}</s> → <strong>${UI.esc(this.fmtVal(campo, d))}</strong>`);
    });
    return out;
  },

  descrever(h) {
    const a = h.antes || null, d = h.depois || null, r = d || a || {};
    const nome = UI.esc(r.nome || '');
    const uni = UI.esc(r.unidade_nome || 'unidade excluída');
    const col = UI.esc(r.colaborador_nome || 'colaborador excluído');
    const mudancas = () => { const l = this.diffs(h.tabela, a, d); return l.length ? ' — ' + l.join('; ') : ''; };

    switch (h.tabela) {
      case 'unidades':
        if (h.operacao === 'insert') return `Cadastrou a unidade <strong>${nome}</strong>`;
        if (h.operacao === 'delete') return `Excluiu a unidade <strong>${nome}</strong>`;
        return `Alterou a unidade <strong>${nome}</strong>${mudancas()}`;
      case 'unidade_empresas_mes': {
        const mes = this.MES[Number(r.mes)] || `mês ${r.mes}`;
        const valores = x => {
          if (!x) return '';
          if (x.empresas_vencidas != null) return `${x.empresas_vencidas} com documentos vencidos`;
          if (x.empresas_em_dia != null) return `${x.empresas_em_dia} / ${x.empresas_vencendo} / ${x.empresas_a_vencer} (em dia / vencendo / a vencer)`;
          return `${x.empresas_baixo} / ${x.empresas_medio} / ${x.empresas_alto} (baixo / médio / alto)`;
        };
        if (h.operacao === 'insert') return `Definiu valor próprio para <strong>${mes}</strong> em <strong>${uni}</strong>: ${valores(d)}`;
        if (h.operacao === 'delete') return `Voltou <strong>${mes}</strong> de <strong>${uni}</strong> ao padrão (era ${valores(a)})`;
        return `Alterou <strong>${mes}</strong> de <strong>${uni}</strong>${mudancas()}`;
      }
      case 'funcoes':
        if (h.operacao === 'insert') return `Cadastrou a função <strong>${nome}</strong> (${this.fmtVal('tipo_producao', r.tipo_producao)}${r.chefia ? ', chefia de equipe' : ''})`;
        if (h.operacao === 'delete') return `Excluiu a função <strong>${nome}</strong>`;
        return `Alterou a função <strong>${nome}</strong>${mudancas()}`;
      case 'colaboradores':
        if (h.operacao === 'insert') return `Cadastrou o colaborador <strong>${nome}</strong> (${r.funcao_id ? this.fmtVal('funcao_id', r.funcao_id) : this.fmtVal('funcao', r.funcao)})`;
        if (h.operacao === 'delete') return `Excluiu o colaborador <strong>${nome}</strong>`;
        return `Alterou o colaborador <strong>${nome}</strong>${mudancas()}`;
      case 'colaborador_unidades':
        if (h.operacao === 'insert') return `Alocou <strong>${col}</strong> em <strong>${uni}</strong> com ${this.fmtVal('percentual', r.percentual)} do tempo`;
        if (h.operacao === 'delete') return `Removeu <strong>${col}</strong> de <strong>${uni}</strong>`;
        return `Alterou a alocação de <strong>${col}</strong> em <strong>${uni}</strong>${mudancas()}`;
      case 'parametros':
        return `Alterou as configurações${mudancas() || ' (sem mudança visível)'}`;
      case 'documentos':
        if (h.operacao === 'insert') return `Cadastrou o documento <strong>${nome}</strong>`;
        if (h.operacao === 'delete') return `Excluiu o documento <strong>${nome}</strong>`;
        return `Alterou o documento <strong>${nome}</strong>${mudancas()}`;
      case 'backup':
        return `Importou um backup: ${UI.plural(Number(r.unidades || 0), 'unidade', 'unidades')}, ${UI.plural(Number(r.colaboradores || 0), 'colaborador', 'colaboradores')}${r.parametros ? ', com configurações' : ''} — substituiu todos os cadastros`;
      default:
        return `${h.operacao} em ${UI.esc(h.tabela)}`;
    }
  },
};
