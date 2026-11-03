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
  it('prevê o valor total das parcelas, inclusive as de meses futuros', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.res.Maria.prev, r.tot[2]])", compra());
    expect(JSON.parse(r)).toEqual([300, 300]);
  });
  it('desconta pagamentos parciais do consolidado final', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.res.Maria.rec, r.res.Maria.aberto, r.tot[2]])", compra(), `{id:'r',who:'Maria',month:'2026-10',valor:40}`);
    expect(JSON.parse(r)).toEqual([40, 260, 260]);
  });
  it('zera o consolidado quando tudo é pago, mesmo espalhado nos meses', () => {
    const r = run("const r = receberResumo(); JSON.stringify(r.res.Maria.aberto)", compra(), `{id:'r',who:'Maria',month:'2026-12',valor:300}`);
    expect(JSON.parse(r)).toBe(0);
  });
  it('não cobra parcelas anteriores ao início do período', () => {
    const r = run("const r = receberResumo(); JSON.stringify(r.res.Maria.prev)", compra(`,start:'2026-08'`));
    expect(JSON.parse(r)).toBe(300);
  });
  it('assinaturas recorrentes contam até o fim do período', () => {
    const r = run("const r = receberResumo(); JSON.stringify(r.res.Maria.prev)", `{id:'p',desc:'Assinatura',cat:'Outros',who:'Maria',valor:50,start:'2026-10',n:null}`);
    expect(JSON.parse(r)).toBe(150);
  });
  it('a parte do titular não entra no consolidado', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.res.Maria.prev, r.tot[0]])", `{id:'p',desc:'Minha',cat:'Outros',who:'Gio',valor:100,start:'2026-10',n:3}`);
    expect(JSON.parse(r)).toEqual([0, 0]);
  });
  it('separa o que já venceu do que vem nos meses futuros', () => {
    const r = run("const r = receberResumo(); JSON.stringify([r.tot[3], r.tot[2] - r.tot[3]])", compra());
    expect(JSON.parse(r)).toEqual([100, 200]);
  });
});
