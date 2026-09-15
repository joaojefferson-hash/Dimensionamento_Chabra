/* Testes do importador de planilha (funções puras): `node tests/importacao.test.mjs`
   Gera uma planilha no formato "SGG" (uma linha por documento) e confere a contagem por unidade × mês. */
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { lerPlanilha, detectarColunas, resumir, casarUnidades, montarLinhasRpc, lerData, lerPorte, situacaoExcluida } from '../src/services/importacao.js';

let passaram = 0;
const teste = (nome, fn) => { fn(); passaram++; console.log('  ✓ ' + nome); };

/* planilha de exemplo (o mesmo arquivo usado no teste de tela) */
const cabecalho = ['Cliente', 'CNPJ', 'Unidade', 'Documento', 'Data de Vencimento', 'Tipo de Contrato', 'Nº Funcionários'];
const linhas = [
  ['Padaria Central', '11.111.111/0001-11', 'Teresópolis', 'PGR', new Date(2026, 8, 10), 'Mensal', 12],
  ['Padaria Central', '11.111.111/0001-11', 'Teresópolis', 'PCMSO', new Date(2026, 8, 25), 'Mensal', 12],   // mesmo cliente, mesmo mês → conta 1
  ['Padaria Central', '11.111.111/0001-11', 'Teresópolis', 'LTCAT', new Date(2026, 9, 5), 'Mensal', 12],    // outro mês → conta
  ['Metalúrgica Serra', '22.222.222/0001-22', 'Teresópolis', 'PGR', '15/09/2026', 'Exclusiva TST', 150],
  ['Hotel Vista', '33.333.333/0001-33', 'TERESOPOLIS', 'PGR', '2026-09-30', 'Mensal', 45],                 // unidade sem acento/maiúscula
  ['Oficina Norte', '44.444.444/0001-44', 'Campos dos Goytacazes', 'PGR', new Date(2026, 0, 20), 'Mensal', 8],
  ['Oficina Norte', '44.444.444/0001-44', 'Campos dos Goytacazes', 'PCMSO', new Date(2025, 11, 20), 'Mensal', 8], // outro ano → fora
  ['Sem Data Ltda', '55.555.555/0001-55', 'Guapimirim', 'PGR', '', 'Mensal', 3],                            // sem data → ignorada
  ['Cliente Filial X', '66.666.666/0001-66', 'Filial Nova', 'PGR', new Date(2026, 2, 1), 'Mensal', 30],     // unidade que não existe
];
const ws = XLSX.utils.aoa_to_sheet([['Relatório de vencimentos — SGG'], [], cabecalho, ...linhas], { cellDates: true });
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Vencimentos');
const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true });
const saida = new URL('../../.playwright-mcp/sgg-exemplo.xlsx', import.meta.url);
try { writeFileSync(saida, Buffer.from(buffer)); } catch (_) { /* opcional */ }

const unidades = [{ id: 'u-ter', nome: 'Teresópolis' }, { id: 'u-cam', nome: 'Campos dos Goytacazes' }, { id: 'u-gua', nome: 'Guapimirim' }];

console.log('Importação');

teste('lê a planilha pulando o título e acha o cabeçalho', () => {
  const { abas } = lerPlanilha(buffer);
  assert.strictEqual(abas.length, 1);
  assert.deepStrictEqual(abas[0].cabecalhos, cabecalho);
  assert.strictEqual(abas[0].linhas.length, linhas.length);
});

teste('detecta as colunas pelos títulos', () => {
  const m = detectarColunas(cabecalho);
  assert.deepStrictEqual({ unidade: m.unidade, vencimento: m.vencimento, cliente: m.cliente, condicao: m.condicao, porte: m.porte }, { unidade: 2, vencimento: 4, cliente: 0, condicao: 5, porte: 6 });
});

teste('datas: Date, dd/mm/aaaa, aaaa-mm-dd e serial do Excel', () => {
  assert.strictEqual(lerData('15/09/2026').getMonth(), 8);
  assert.strictEqual(lerData('2026-09-30').getDate(), 30);
  assert.strictEqual(lerData(46000).getFullYear(), 2025); // serial Excel (≈ dez/2025)
  assert.strictEqual(lerData(''), null);
  assert.strictEqual(lerData('abc'), null);
});

teste('porte: P/M/G, nomes e faixa de funcionários', () => {
  assert.strictEqual(lerPorte('G'), 'G');
  assert.strictEqual(lerPorte('Médio'), 'M');
  assert.strictEqual(lerPorte(150, { pequeno: 19, medio: 99 }), 'G');
  assert.strictEqual(lerPorte(12, { pequeno: 19, medio: 99 }), 'P');
  assert.strictEqual(lerPorte(''), 'P');
});

teste('conta cada cliente uma vez por unidade × mês, só no ano escolhido', () => {
  const { abas } = lerPlanilha(buffer);
  const r = resumir(abas[0].linhas, detectarColunas(cabecalho), { contarPor: 'cliente', ano: 2026, porteFaixas: { pequeno: 19, medio: 99 } });
  // Teresópolis set: Padaria (1, não 2) + Metalúrgica (exclusiva, G) + 'TERESOPOLIS' é outro nome no arquivo
  assert.deepStrictEqual(r.porUnidade['Teresópolis'][9], { mensal: { P: 1 }, exclusiva_tst: { G: 1 } });
  assert.deepStrictEqual(r.porUnidade['Teresópolis'][10], { mensal: { P: 1 } });
  assert.deepStrictEqual(r.porUnidade['TERESOPOLIS'][9], { mensal: { M: 1 } });
  assert.deepStrictEqual(r.porUnidade['Campos dos Goytacazes'], { 1: { mensal: { P: 1 } } });
  assert.strictEqual(r.porUnidade['Guapimirim'], undefined);
  assert.strictEqual(r.linhasUsadas, 6);
  assert.ok(r.avisos.some(a => /sem data/.test(a)) && r.avisos.some(a => /outros anos/.test(a)));
  assert.deepStrictEqual(r.anosEncontrados.map(a => a.ano), [2025, 2026]);
  // por linha (documento): Padaria conta 2 em setembro
  const r2 = resumir(abas[0].linhas, detectarColunas(cabecalho), { contarPor: 'linha', ano: 2026 });
  assert.strictEqual(r2.porUnidade['Teresópolis'][9].mensal.P, 2);
});

teste('casa nomes do arquivo com o cadastro (acento, maiúscula) e junta na mesma unidade', () => {
  const { abas } = lerPlanilha(buffer);
  const r = resumir(abas[0].linhas, detectarColunas(cabecalho), { ano: 2026, porteFaixas: { pequeno: 19, medio: 99 } });
  const mapa = casarUnidades(Object.keys(r.porUnidade), unidades);
  assert.strictEqual(mapa['Teresópolis'], 'u-ter');
  assert.strictEqual(mapa['TERESOPOLIS'], 'u-ter');
  assert.strictEqual(mapa['Filial Nova'], null);
  const rpc = montarLinhasRpc(r.porUnidade, mapa);
  const set = rpc.filter(l => l.unidade_id === 'u-ter' && l.mes === 9);
  assert.deepStrictEqual(set.map(l => `${l.condicao}/${l.porte}=${l.quantidade}`).sort(), ['exclusiva_tst/G=1', 'mensal/M=1', 'mensal/P=1']);
  assert.ok(!rpc.some(l => l.unidade_id === null));
});

teste('formato real do SGG (VENCIMENTO(s) DE PGR(s)): Região, Data Validade, Empresa, Código Empresa, Situação, Informações adicionais', () => {
  const cab = ['Código Empresa', 'Empresa', 'Região', 'Tipo Período', 'Data Emissão Anterior', 'Data Validade', 'Situação', 'Detalhes Adicionais', 'Informações adicionais da Empresa', ''];
  const rows = [
    ['1483', 'FONTE DA CONSTRUCAO', 'Teresópolis', 'PERIÓDICA', '23/05/2024', '07/02/2025', 'Vencido', '', 'Mensal desde 04/04/2022\n', ''],
    ['1499', 'FRADES IDIOMAS LTDA', 'Teresópolis', 'PERIÓDICA', '', '03/09/2025', 'Vencido', '', 'Mensal', ''],
    ['1501', 'FRADES IDIOMAS LTDA', 'Teresópolis', 'PERIÓDICA', '', '12/09/2025', 'Vencido', '', 'Mensal', ''],   // outro código = outro estabelecimento
    ['2000', 'HOTEL X', 'Teresópolis', 'PERIÓDICA', '', '20/09/2025', 'Renovado', '', 'Mensal', ''],              // renovado: fora por padrão
    ['2001', 'CLINICA Y', 'Teresópolis', 'PERIÓDICA', '', '25/09/2025', 'Vencido', '', 'Exclusiva TST', ''],
  ];
  const m = detectarColunas(cab);
  assert.deepStrictEqual({ u: cab[m.unidade], v: cab[m.vencimento], c: cab[m.cliente], id: cab[m.clienteId], cond: cab[m.condicao], sit: cab[m.situacao], porte: m.porte },
    { u: 'Região', v: 'Data Validade', c: 'Empresa', id: 'Código Empresa', cond: 'Informações adicionais da Empresa', sit: 'Situação', porte: null });
  assert.strictEqual(situacaoExcluida('Renovado'), true);
  assert.strictEqual(situacaoExcluida('Vencido'), false);
  const r = resumir(rows, m, { ano: 2025, situacoes: ['Vencido'] });
  assert.deepStrictEqual(r.porUnidade['Teresópolis'][9], { mensal: { P: 2 }, exclusiva_tst: { P: 1 } }); // Frades conta 2 (dois códigos)
  assert.deepStrictEqual(r.porUnidade['Teresópolis'][2], { mensal: { P: 1 } });
  assert.ok(r.avisos.some(a => /não selecionada/.test(a)));
});

console.log(`\n${passaram} testes passaram.`);
