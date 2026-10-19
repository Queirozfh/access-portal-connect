// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('public/contas-do-mes.html', 'utf8');
const script = html.slice(html.indexOf('"use strict";'), html.indexOf('/* ============================ interface'));
function run(expression: string) {
  return runInNewContext(script + `\nS = normalize({titular:'Gio', start:'2026-10', count:2, hidden:[], people:[{name:'Maria',inBill:false}], cats:[], incomes:[], purchases:[{id:'p',who:'Maria',valor:100,start:'2026-10',n:1}], bills:[{id:'b',month:'2026-10',valor:200,paid:true}], received:[{id:'r',who:'Maria',month:'2026-10',valor:100}]}); cur = S.start;\n` + expression);
}

describe('Exclusão e restauração de meses', () => {
  it('bloqueia exclusão se uma fatura não estiver paga', () => {
    expect(run("S.bills[0].paid=false; excluirMes(cur)" )).toBe(false);
  });
  it('bloqueia exclusão com valores a receber, inclusive fora da fatura', () => {
    expect(run("S.received[0].valor=99.99; excluirMes(cur)")).toBe(false);
  });
  it('permite excluir mês integralmente quitado e preserva os dados', () => {
    expect(run("const before=JSON.stringify([S.bills,S.purchases,S.received]); excluirMes(cur) && !monthsList().includes('2026-10') && before===JSON.stringify([S.bills,S.purchases,S.received])")).toBe(true);
  });
  it('restaura o mês com todos os dados e seleciona o mês restaurado', () => {
    expect(run("excluirMes(cur); restaurarMes('2026-10') && monthsList().includes('2026-10') && cur==='2026-10' && S.bills[0].valor===200 && S.purchases[0].valor===100 && S.received[0].valor===100")).toBe(true);
  });
  it('restaura mesmo depois de alterar o início do período', () => {
    expect(run("excluirMes(cur); S.start='2026-11'; restaurarMes('2026-10'); monthsList().includes('2026-10')")).toBe(true);
  });
  it('mantém pelo menos um mês visível', () => {
    expect(run("S.count=1; excluirMes(cur)")).toBe(false);
  });
});