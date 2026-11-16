import { describe, expect, it } from 'vitest';
import '../../public/meu-patrimonio/financing.js';
const solveFinancing = (globalThis as any).solveFinancing;
describe('Financiamento veicular', () => {
  it('calcula a prestação (planilha: 2,40789% a.m., 48x, 48.012,35)', () => {
    expect(solveFinancing({ n: 48, rate: 2.40789, principal: 48012.35 }).payment).toBeCloseTo(1698.0, 1);
  });
  it('calcula o nº de meses do print', () => {
    expect(solveFinancing({ rate: 2, payment: 1500, principal: 34760.85 }).n).toBeCloseTo(31.44, 2);
  });
  it('calcula o valor financiado e a taxa', () => {
    expect(solveFinancing({ n: 31.44, rate: 2, payment: 1500 }).principal).toBeCloseTo(34758.71, 1);
    expect(solveFinancing({ n: 31.44, payment: 1500, principal: 34760.85 }).rate).toBeCloseTo(2, 3);
  });
  it('exige exatamente 3 campos', () => {
    expect(() => solveFinancing({ n: 48, rate: 2 })).toThrow();
  });
});
