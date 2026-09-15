/* ==========================================================================
   Testes do motor (Calculo) — sem dependências: `node tests/calculo.test.js`
   Cobrem: demanda por porte, ramp-up e presença (admissão/desligamento),
   custo por função, quadro ideal, pendente acumulado (fila) e simulação.
   ========================================================================== */

const assert = require('assert');
const path = require('path');
const Calculo = require(path.join(__dirname, '..', 'js', 'calculo.js'));

let passaram = 0;
const teste = (nome, fn) => { fn(); passaram++; console.log('  ✓ ' + nome); };
const perto = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `esperava ${b}, veio ${a}`);

const DIAS = [21, 18, 22, 20, 20, 21, 23, 21, 21, 21, 19, 22];
const PARAM = { diasUteis: DIAS, ocupacaoAlvo: 85, rampup: [50, 80], pesosPorte: { P: 1, M: 1.5, G: 2 } };
const tecnico = (extra = {}) => ({ id: extra.id || 'c1', nome: 'T', tipoProducao: 'tecnico', inspecoesDia: 2, relatoriosDia: 1, empresasDia: 0,
  alocacoes: [{ unidadeId: 'u', percentual: 100 }], ...extra });
const unidade = meses => ({ id: 'u', nome: 'U', empresasVencidas: 0, empresasExclusivaTst: 0, meses });
const mesesConst = (mensal, demanda) => { const m = {}; for (let i = 1; i <= 12; i++) m[i] = { empresasVencidas: mensal, empresasExclusivaTst: 0, ...(demanda ? { demanda } : {}) }; return m; };
const rodar = (unidades, colaboradores, extra = {}) => Calculo.calcular({ unidades, colaboradores, parametros: PARAM, janela: { de: 0, ate: 11 }, ano: 2026, ...extra });

console.log('Calculo');

teste('porte: 10 P + 4 M + 3 G = 10 + 6 + 6 = 22 empresas equivalentes', () => {
  const u = unidade(mesesConst(17, { mensal: { P: 10, M: 4, G: 3 } }));
  perto(Calculo.empresasPonderadas(u, Calculo.normalizarParametros(PARAM), 0), 22);
  // sem detalhe por porte, vale a contagem
  perto(Calculo.empresasPonderadas(unidade(mesesConst(17)), Calculo.normalizarParametros(PARAM), 0), 17);
  // porte desconhecido pesa 1
  perto(Calculo.empresasPonderadas(unidade(mesesConst(0, { mensal: { X: 5 } })), Calculo.normalizarParametros(PARAM), 0), 5);
});

teste('produção sem ramp-up: 1 técnico veterano faz 1 × 21 × 0,85 = 17,85 relatórios em janeiro', () => {
  const r = rodar([unidade(mesesConst(10))], [tecnico()]);
  perto(r.total.meses[0].entregas.relatorios.consegue, 17.85, 1e-9);
  perto(r.total.meses[0].pessoas.tecnico, 1);
});

teste('ramp-up: admitido em 1/mar produz 50% em março, 80% em abril, 100% de maio em diante', () => {
  const r = rodar([unidade(mesesConst(10))], [tecnico({ dataAdmissao: '2026-03-01' })]);
  const rel = i => r.total.meses[i].entregas.relatorios.consegue;
  perto(rel(0), 0);                      // ainda não entrou
  perto(rel(2), 22 * 0.85 * 0.5, 1e-9);  // março: 50%
  perto(rel(3), 20 * 0.85 * 0.8, 1e-9);  // abril: 80%
  perto(rel(4), 20 * 0.85, 1e-9);        // maio: 100%
  perto(r.total.meses[0].pessoas.tecnico, 0);
  perto(r.total.meses[2].pessoas.tecnico, 1); // conta como pessoa desde o 1º dia; só a produção é menor
  assert.strictEqual(r.total.meses[2].funcoes.tecnico.emRampup, 1);
  assert.strictEqual(r.total.meses[4].funcoes.tecnico.emRampup, 0);
});

teste('presença: admitido em 16/jan conta 16/31 do mês; desligado em 10/jun não conta em julho', () => {
  const r = rodar([unidade(mesesConst(10))], [tecnico({ dataAdmissao: '2026-01-16', dataDesligamento: '2026-06-10' })]);
  perto(Calculo.presencaNoMes({ dataAdmissao: '2026-01-16' }, 2026, 0), 16 / 31, 1e-9);
  perto(r.total.meses[0].pessoas.tecnico, 16 / 31, 1e-9);
  perto(r.total.meses[5].pessoas.tecnico, 10 / 30, 1e-9);
  perto(r.total.meses[6].pessoas.tecnico, 0);
  perto(r.total.meses[6].entregas.relatorios.consegue, 0);
});

teste('quadro ideal e faltam/sobram continuam iguais (2 técnicos, 71 empresas em fevereiro → ideal 5, faltam 3)', () => {
  const r = rodar([unidade(mesesConst(71))], [tecnico({ id: 'a' }), tecnico({ id: 'b' })]);
  const f = r.total.meses[1].funcoes.tecnico;
  assert.strictEqual(f.ideal, 5);   // 71 ÷ (18 × 0,85 = 15,3) = 4,64 → 5
  assert.strictEqual(f.faltam, 3);  // (71 − 30,6) ÷ 15,3 = 2,64 → 3
});

teste('custo: faltam 3 técnicos × R$ 4.000 = R$ 12.000 no mês; o custo do colaborador sobrepõe o da função', () => {
  const r = rodar([unidade(mesesConst(71))], [tecnico({ id: 'a', funcaoCustoMensal: 4000 }), tecnico({ id: 'b', funcaoCustoMensal: 4000, custoMensal: 6000 })]);
  const f = r.total.meses[1].funcoes.tecnico;
  perto(f.custo.pessoa, 5000);          // média ponderada: (4000 + 6000) / 2
  perto(f.custo.contratar, 3 * 5000);
  perto(f.custo.sobra, 0);
  // no ano: soma dos meses
  const ano = r.total.janela.funcoes.tecnico.custo;
  perto(ano.contratar, r.total.meses.reduce((s, m) => s + m.funcoes.tecnico.custo.contratar, 0));
  // sem custo cadastrado, tudo zero (não inventa número)
  const r0 = rodar([unidade(mesesConst(71))], [tecnico()]);
  perto(r0.total.meses[1].funcoes.tecnico.custo.contratar, 0);
});

teste('custo da sobra: 3 técnicos para 10 empresas → sobram 2 × R$ 4.000', () => {
  const r = rodar([unidade(mesesConst(10))], ['a', 'b', 'c'].map(id => tecnico({ id, funcaoCustoMensal: 4000 })));
  const f = r.total.meses[0].funcoes.tecnico;
  assert.strictEqual(f.sobram, 2);
  perto(f.custo.sobra, 8000);
});

teste('simulação: contratação simulada em setembro entra com ramp-up (50% em set, 80% em out, 100% em nov)', () => {
  const r = rodar([unidade(mesesConst(10))], [], { simulacoes: [{ unidadeId: 'u', grupo: 'tecnico', quantidade: 1, de: 8, ate: 11, inspecoesDia: 2, relatoriosDia: 1 }] });
  const rel = i => r.total.meses[i].entregas.relatorios.consegue;
  perto(rel(7), 0);
  perto(rel(8), 21 * 0.85 * 0.5, 1e-9);
  perto(rel(9), 21 * 0.85 * 0.8, 1e-9);
  perto(rel(10), 19 * 0.85, 1e-9);
  // desligamento simulado não tem ramp-up: −1 de 2 veteranos a partir de setembro tira uma pessoa inteira
  const r2 = rodar([unidade(mesesConst(10))], [tecnico({ id: 'a' }), tecnico({ id: 'b' })], { simulacoes: [{ unidadeId: 'u', grupo: 'tecnico', quantidade: -1, de: 8, ate: 11 }] });
  perto(r2.total.meses[8].pessoas.tecnico, 1);
});

teste('pendente acumulado (fila): passado soma sem descontar; do mês atual em diante a equipe atende', () => {
  const vencem = [25, 30, 20, 22, 10, 5, 0, 0, 0, 0, 0, 0];
  const meses = {}; vencem.forEach((v, i) => { meses[i + 1] = { empresasVencidas: v, empresasExclusivaTst: 0 }; });
  const r = Calculo.calcular({ unidades: [unidade(meses)], colaboradores: [tecnico()], parametros: { diasUteis: Array(12).fill(20), ocupacaoAlvo: 85 }, janela: { de: 0, ate: 11 }, ano: 2026 });
  const g = Calculo.fila(r, { mesAtual: 4, prazoMeses: 2 }).total.grupos.tecnico;
  assert.deepStrictEqual(g.meses.slice(0, 4).map(m => m.filaFim), [25, 55, 75, 97]);
  assert.deepStrictEqual(g.meses.slice(4, 8).map(m => m.filaFim), [90, 78, 61, 44]);
  assert.strictEqual(g.resumo.filaHoje, 107);
  assert.strictEqual(g.resumo.deMesesAnteriores, 97);
});

teste('porte muda o pendente: 10 empresas G pesam como 20 na fila', () => {
  const meses = {}; for (let i = 1; i <= 12; i++) meses[i] = { empresasVencidas: 10, empresasExclusivaTst: 0, demanda: { mensal: { G: 10 } } };
  const r = rodar([unidade(meses)], [tecnico()]);
  perto(r.total.meses[0].precisa, 20);
  const g = Calculo.fila(r, { mesAtual: 0, prazoMeses: 2 }).total.grupos.tecnico;
  perto(g.meses[0].pendentes, 20);
});

console.log(`\n${passaram} testes passaram.`);
