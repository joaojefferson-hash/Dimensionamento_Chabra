/* ==========================================================================
   Importação da planilha do SGG (ou qualquer planilha) → demanda por unidade × mês.

   Funções puras (sem Vue/Supabase; testáveis em Node):
     lerPlanilha(arrayBuffer)            → { abas: [{ nome, cabecalhos, linhas }] }
     detectarColunas(cabecalhos)         → { unidade, vencimento, cliente, condicao, porte } (índices ou null)
     resumir(linhas, mapa, opcoes)       → { ano, porUnidade: { [nomeUnidade]: { [mes]: { [condicao]: { [porte]: n } } } },
                                             avisos, totalLinhas, linhasUsadas, anosEncontrados }
     casarUnidades(nomesNoArquivo, unidadesCadastro) → { [nomeNoArquivo]: unidadeId | null }
     montarLinhasRpc(porUnidade, mapaUnidades)       → [{ unidade_id, mes, condicao, porte, quantidade }]

   Regras:
     • uma linha = um documento (ou um cliente) com data de vencimento;
     • conta-se cada CLIENTE uma vez por unidade × mês (vários documentos do mesmo cliente
       vencendo no mesmo mês = 1 atendimento), a não ser que opcoes.contarPor = 'linha';
     • condição: valor contendo "exclus" ou "tst" → Exclusiva TST; senão Mensal (padrão quando não há coluna);
     • porte: P/M/G, "pequeno/médio/grande", ou faixa de funcionários quando opcoes.porteFaixas está definido.
   ========================================================================== */
import * as XLSX from 'xlsx';

const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const chave = s => semAcento(s).replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------- leitura ---------- */

export function lerPlanilha(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: true });
  const abas = wb.SheetNames.map(nome => {
    const ws = wb.Sheets[nome];
    const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    // cabeçalho = primeira linha com pelo menos 2 células preenchidas
    const iCab = matriz.findIndex(l => l.filter(c => String(c).trim() !== '').length >= 2);
    if (iCab < 0) return { nome, cabecalhos: [], linhas: [] };
    const cabecalhos = matriz[iCab].map(c => String(c).trim());
    const linhas = matriz.slice(iCab + 1).filter(l => l.some(c => String(c).trim() !== ''));
    return { nome, cabecalhos, linhas };
  });
  return { abas };
}

/* ---------- detecção de colunas ---------- */

const PALAVRAS = {
  unidade:    ['unidade', 'filial', 'regional', 'base', 'escritorio', 'polo'],
  vencimento: ['vencimento', 'validade', 'vence', 'data de venc', 'dt venc', 'expira', 'prazo'],
  cliente:    ['cliente', 'empresa', 'razao social', 'nome fantasia', 'contratante', 'cnpj'],
  condicao:   ['condicao', 'tipo de contrato', 'contrato', 'modalidade', 'plano', 'servico'],
  porte:      ['porte', 'grau', 'tamanho', 'funcionarios', 'colaboradores', 'vidas', 'empregados'],
  documento:  ['documento', 'tipo de documento', 'programa', 'laudo'],
};
export function detectarColunas(cabecalhos) {
  const c = cabecalhos.map(chave);
  const acha = lista => { for (const p of lista) { const i = c.findIndex(h => h.includes(chave(p))); if (i >= 0) return i; } return null; };
  const mapa = {};
  Object.entries(PALAVRAS).forEach(([campo, lista]) => { mapa[campo] = acha(lista); });
  // "empresa" pode ser a unidade quando não há coluna de unidade e há outra coluna de cliente… deixa como está: o usuário confirma
  return mapa;
}

/* ---------- valores ---------- */

export function lerData(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(1899, 11, 30 + Math.floor(v)); // serial do Excel (época 30/12/1899)
  const s = String(v).trim();
  let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
  if (m) { const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return new Date(a, Number(m[2]) - 1, Number(m[1])); }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}
export function lerCondicao(v) { const s = semAcento(v); return s.includes('exclus') || /\btst\b/.test(s) ? 'exclusiva_tst' : 'mensal'; }
export function lerPorte(v, faixas = null, codigos = ['P', 'M', 'G']) {
  if (v == null || v === '') return codigos[0];
  const s = semAcento(v);
  if (/^p\b|pequen|micro/.test(s)) return codigos[0];
  if (/^m\b|medi/.test(s)) return codigos[1] || codigos[0];
  if (/^g\b|grand/.test(s)) return codigos[2] || codigos[0];
  const n = Number(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
  if (faixas && Number.isFinite(n)) return n <= faixas.pequeno ? codigos[0] : n <= faixas.medio ? (codigos[1] || codigos[0]) : (codigos[2] || codigos[0]);
  return codigos[0];
}

/* ---------- resumo por unidade × mês ---------- */

export function resumir(linhas, mapa, opcoes = {}) {
  const { contarPor = 'cliente', ano = null, condicaoPadrao = 'mensal', portePadrao = 'P', porteFaixas = null, codigosPorte = ['P', 'M', 'G'] } = opcoes;
  const avisos = [];
  const anos = {};
  const vistos = new Set();
  const porUnidade = {};
  let usadas = 0, semData = 0, semUnidade = 0, outroAno = 0;
  if (mapa.unidade == null || mapa.vencimento == null) return { ano, porUnidade, avisos: ['Escolha as colunas de unidade e de data de vencimento.'], totalLinhas: linhas.length, linhasUsadas: 0, anosEncontrados: [] };

  linhas.forEach(l => {
    const data = lerData(l[mapa.vencimento]);
    if (!data) { semData++; return; }
    const unidade = String(l[mapa.unidade] ?? '').trim();
    if (!unidade) { semUnidade++; return; }
    const y = data.getFullYear();
    anos[y] = (anos[y] || 0) + 1;
    if (ano != null && y !== ano) { outroAno++; return; }
    const mes = data.getMonth() + 1;
    const cond = mapa.condicao != null ? lerCondicao(l[mapa.condicao]) : condicaoPadrao;
    const porte = mapa.porte != null ? lerPorte(l[mapa.porte], porteFaixas, codigosPorte) : portePadrao;
    if (contarPor === 'cliente' && mapa.cliente != null) {
      const k = `${chave(unidade)}|${y}|${mes}|${chave(l[mapa.cliente])}`;
      if (vistos.has(k)) return;
      vistos.add(k);
    }
    const u = (porUnidade[unidade] = porUnidade[unidade] || {});
    const m = (u[mes] = u[mes] || {});
    const c = (m[cond] = m[cond] || {});
    c[porte] = (c[porte] || 0) + 1;
    usadas++;
  });
  if (semData) avisos.push(`${semData} linha(s) sem data de vencimento reconhecível foram ignoradas.`);
  if (semUnidade) avisos.push(`${semUnidade} linha(s) sem unidade foram ignoradas.`);
  if (outroAno) avisos.push(`${outroAno} linha(s) de outros anos foram ignoradas (só o ano ${ano} entra).`);
  const anosEncontrados = Object.entries(anos).map(([a, n]) => ({ ano: Number(a), linhas: n })).sort((x, y) => x.ano - y.ano);
  return { ano, porUnidade, avisos, totalLinhas: linhas.length, linhasUsadas: usadas, anosEncontrados };
}

/* ---------- unidades: nome no arquivo → cadastro ---------- */

export function casarUnidades(nomes, unidades) {
  const out = {};
  nomes.forEach(nome => {
    const k = chave(nome);
    let u = unidades.find(x => chave(x.nome) === k);
    if (!u) u = unidades.find(x => k.includes(chave(x.nome)) || chave(x.nome).includes(k));
    if (!u) { const p = k.split(' ')[0]; if (p && p.length >= 4) u = unidades.find(x => chave(x.nome).split(' ')[0] === p); }
    out[nome] = u ? u.id : null;
  });
  return out;
}

export function montarLinhasRpc(porUnidade, mapaUnidades) {
  const out = [];
  Object.entries(porUnidade).forEach(([nome, meses]) => {
    const unidade_id = mapaUnidades[nome];
    if (!unidade_id) return;
    Object.entries(meses).forEach(([mes, conds]) => Object.entries(conds).forEach(([condicao, portes]) => Object.entries(portes).forEach(([porte, quantidade]) => {
      out.push({ unidade_id, mes: Number(mes), condicao, porte, quantidade });
    })));
  });
  // soma linhas repetidas (dois nomes do arquivo apontando para a mesma unidade)
  const agr = {};
  out.forEach(l => { const k = `${l.unidade_id}|${l.mes}|${l.condicao}|${l.porte}`; agr[k] = agr[k] ? { ...agr[k], quantidade: agr[k].quantidade + l.quantidade } : l; });
  return Object.values(agr);
}
