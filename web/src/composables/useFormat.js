/* Formatação em pt-BR compartilhada pelos componentes. */
import Calculo from '../engine/calculo.js';

export const MESES = Calculo.MESES;
export const MESES_LONGO = Calculo.MESES_LONGO;

export const num = (v, digitos = 0) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: digitos, maximumFractionDigits: digitos }) : '—');
/** Pessoas: inteiro sem casas, fração com uma ("2,8"). */
export const numFte = v => (!Number.isFinite(Number(v)) ? '—' : Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : num(v, 1));
export const moeda = v => { const x = Number(v) || 0; return 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(x - Math.round(x)) < 0.005 ? 0 : 2 }); };
export const plural = (q, um, varios) => `${num(q)} ${q === 1 ? um : varios}`;
/** "1 técnico" / "3 administrativos". */
export const qtdFuncao = (f, q) => `${q} ${q === 1 ? Calculo.FUNCAO_SINGULAR[f] : Calculo.FUNCAO_SINGULAR[f] + 's'}`;
export const mesLongo = i => MESES_LONGO[i];
export const mesMin = i => MESES_LONGO[i].toLowerCase();

export function useFormat() {
  return { MESES, MESES_LONGO, num, numFte, moeda, plural, qtdFuncao, mesLongo, mesMin };
}
