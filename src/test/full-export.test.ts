import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const html = readFileSync('public/contas-do-mes.html', 'utf8');
const code = html.slice(html.indexOf('function exportRows('), html.indexOf('function vExportacao('));
describe('Complete account export', () => {
  it('includes every financial section including excluded months and portfolio', () => {
    const state = { titular:'Gio', hidden:['2026-10'], purchases:[{desc:'Mercado',valor:45}], received:[{who:'Maria',valor:100}], assets:[{name:'Banco',balance:500,currency:'USD'}], fx:{rate:5}, custom:{setting:42}, empty:[] };
    const rows = runInNewContext(code+';exportRows(state)', {state});
    expect(rows).toContainEqual(['hidden',1,'valor','2026-10']);
    expect(rows).toContainEqual(['assets',1,'balance',500]);
    expect(rows).toContainEqual(['received',1,'valor',100]);
    expect(rows).toContainEqual(['fx','','rate',5]);
    expect(rows).toContainEqual(['custom','','setting',42]);
  });
  it('preserves accents and escapes formulas without changing numeric values', () => {
    const csv = runInNewContext(code+';csvCompleto(state)', {state:{titular:'Mãe', purchases:[{desc:'=1+1',valor:-45,obs:'a"b'}]}});
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"-45"');
    expect(csv).toContain('"a""b"');
  });
});