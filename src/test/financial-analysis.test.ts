import { describe, expect, it } from 'vitest';
import { estimatePurchase, plannedPurchaseSchema } from '../lib/financial-analysis';
const state = { titular:'Eu', people:[{name:'Maria',inBill:true}], cats:['Outros'],
  incomes:[{desc:'Salário',who:'',cat:'',valor:3000,start:'2026-11',n:null}],
  bills:[{month:'2026-11',valor:1000}],
  purchases:[{desc:'Compra',who:'Eu',cat:'Outros',valor:600,start:'2026-11',n:1}, {desc:'Maria',who:'Maria',cat:'Outros',valor:200,start:'2026-11',n:1}] };
describe('Planejamento',()=>{
  it('divide o total entre parcelas sem contar compras e faturas duas vezes',()=>{
    const e=estimatePurchase(state,{description:'Notebook',person:'Eu',total:1200,installments:3,start:'2026-11'});
    expect(e.payment).toBe(400); expect(e.months[0]?.committed).toBe(800); expect(e.months[0]?.remaining).toBe(1800); expect(e.months[1]?.committed).toBe(0);
  });
  it('não atribui a renda do titular à pessoa',()=>{
    const e=estimatePurchase(state,{description:'Notebook',person:'Maria',total:1200,installments:3,start:'2026-11'});
    expect(e.personalPurchase).toBe(false); expect(e.months[0]?.personAfter).toBe(600);expect(e.months[0]?.remaining).toBe(2200);
  });
  it('recusa parcelas inválidas e total negativo',()=>{
    expect(plannedPurchaseSchema.safeParse({description:'Notebook',person:'Eu',total:-1,installments:0,start:'2026-11'}).success).toBe(false);
  });
});