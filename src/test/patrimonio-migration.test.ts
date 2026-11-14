import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { analysisState } from '../lib/patrimonio-state';
import { estimatePurchase } from '../lib/financial-analysis';

const bridge = readFileSync('public/meu-patrimonio/bridge.js', 'utf8');
const helpers = bridge.slice(bridge.indexOf('function monthStats('), bridge.indexOf('function sharedBillsPage('));
const fixture = { items: [{kind:'expense',person:'Mãe',amount:100,month:'2026-11'}, {kind:'expense',person:'Maria',amount:50,month:'2026-11'}], people:['Gio','Mãe','Maria'], peopleInBill:['Mãe'], bills:[{name:'Físico',amount:1000,month:'2026-11',paid:false}], reimbursements:[{person:'Mãe',month:'2026-11',amount:40},{person:'Mãe',month:'2026-12',amount:60}] };
const context = () => ({ db: fixture, ownerName: () => 'Gio', typeItems: (_:string,m:string) => fixture.items.filter(x=>x.month===m) });
describe('Meu Patrimônio account migration',()=>{
  it('uses current converted records rather than stale original records for AI',()=>{
    const state=analysisState({titular:'Gio',purchases:[],patrimonioApp:{settings:{ownerName:'Gio'},people:['Gio','Mãe'],peopleInBill:['Mãe'],categories:['Outros'],items:[{kind:'income',name:'Salário',amount:2000,month:'2026-11'},{kind:'expense',name:'Parcela',amount:200,month:'2026-11',person:'Gio'}],bills:[]}});
    expect(estimatePurchase(state,{description:'Notebook',person:'Gio',total:600,installments:3,start:'2026-11'}).months[0]).toMatchObject({income:2000,committed:200,payment:200,remaining:1600});
  });
  it('deducts only partial payments from the selected month',()=>{
    const result=runInNewContext(helpers+';monthStats("2026-11")',context());
    expect(result.groups['Mãe'].received).toBe(40);
    expect(result.groups['Mãe'].open).toBe(60);
    expect(result.open).toBe(110);
  });
  it('attributes Físico to the owner minus embedded people, excluding independent payers',()=>{
    expect(runInNewContext(helpers+';monthStats("2026-11").physicalOwner',context())).toBe(900);
  });
  it('blocks exclusion while bills or monthly reimbursements are unpaid',()=>{
    const settled=bridge.slice(bridge.indexOf('function monthSettled('),bridge.indexOf('function hideMonth('));
    expect(runInNewContext(helpers+settled+';monthSettled("2026-11")',{...context(),remaining:()=>0})).toBe(false);
  });
  it('neutralizes spreadsheet formulas and keeps numeric negatives',()=>{
    const csv=bridge.slice(bridge.indexOf('function exportRows('),bridge.indexOf('function downloadCsv('));
    const result=runInNewContext(csv+';csvCompleto({items:[{name:"=1+1",amount:-45}],settings:{ownerName:"Gio"}})');
    expect(result).toContain('"\'=1+1"');expect(result).toContain('"-45"');
  });
});