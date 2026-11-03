import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('public/contas-do-mes.html', 'utf8');
const script = html.slice(html.indexOf('"use strict";'), html.indexOf('/* ============================ interface'));

function run(expression: string, purchases: string, received = '') {
  const state = `{titular:'Gio', start:'2026-10', count:3, hidden:[], people:[{name:'Maria',inBill:false}], cats:[], incomes:[], bills:[], purchases:[${purchases}], received:[${received}]}`;
  return runInNewContext(script + `\nS = normalize(${state}); cur = S.start;\n` + expression);
}
const compra = (over = '') => `{id:'p',desc:'Compra',cat:'Outros',who:'Maria',valor:100,start:'2026-10',n:3${over}}`;

describe('Consolidado a receber', () => {
  it('considera apenas a parcela do mês selecionado', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.res.Maria.prev, r.tot[2]])", compra());
    expect(JSON.parse(r)).toEqual([100, 100]);
  });
  it('desconta pagamentos parciais do consolidado final', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.res.Maria.rec, r.res.Maria.aberto, r.tot[2]])", compra(), `{id:'r',who:'Maria',month:'2026-10',valor:40}`);
    expect(JSON.parse(r)).toEqual([40, 60, 60]);
  });
  it('não desconta pagamentos registrados em meses futuros', () => {
    const r = run("const r = receberResumo(); JSON.stringify(r.res.Maria.aberto)", compra(), `{id:'r',who:'Maria',month:'2026-12',valor:300}`);
    expect(JSON.parse(r)).toBe(100);
  });
  it('desconta as parcelas anteriores ao início do período', () => {
    const r = run("const r = receberResumo(); JSON.stringify(r.res.Maria.prev)", compra(`,start:'2026-08'`));
    expect(JSON.parse(r)).toBe(100);
  });
  it('conta apenas a mensalidade selecionada das assinaturas', () => {
    const r = run("const r = receberResumo(); JSON.stringify(r.res.Maria.prev)", `{id:'p',desc:'Assinatura',cat:'Outros',who:'Maria',valor:50,start:'2026-10',n:null}`);
    expect(JSON.parse(r)).toBe(50);
  });
  it('a parte do titular não entra no consolidado', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.res.Maria.prev, r.tot[0]])", `{id:'p',desc:'Minha',cat:'Outros',who:'Gio',valor:100,start:'2026-10',n:3}`);
    expect(JSON.parse(r)).toEqual([0, 0]);
  });
  it('não desconta pagamentos anteriores do mês selecionado', () => {
    const r = run("cur = '2026-11'; JSON.stringify(receberResumo().tot)", compra(), `{who:'Maria',month:'2026-10',valor:100}`);
    expect(JSON.parse(r)).toEqual([100, 0, 100]);
  });
  it('trocar o mês usa somente os recebimentos do novo mês', () => {
    const r = run("cur = '2026-11'; JSON.stringify(receberResumo().tot)", compra(), `{who:'Maria',month:'2026-10',valor:40},{who:'Maria',month:'2026-11',valor:25}`);
    expect(JSON.parse(r)).toEqual([100, 25, 75]);
  });
  it('quitação do mês zera o saldo mensal', () => {
    const r = run("JSON.stringify(receberResumo().tot)", compra(), `{who:'Maria',month:'2026-10',valor:100}`);
    expect(JSON.parse(r)).toEqual([100, 100, 0]);
  });
  it('pagamento excedente de uma pessoa não quita outra pessoa', () => {
    const r = run("S.people.push({name:'Pai',inBill:true}); S.purchases.push({who:'Pai',valor:70,start:'2026-10',n:1}); JSON.stringify(receberResumo().tot)", compra(), `{who:'Maria',month:'2026-10',valor:150}`);
    expect(JSON.parse(r)).toEqual([170, 150, 70]);
  });
});
