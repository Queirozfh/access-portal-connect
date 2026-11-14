import { financialStateSchema } from './financial-analysis';

/** Adapt the current persisted finance format to the deterministic analysis model. */
export function analysisState(raw: Record<string, any>) {
  const state = raw['patrimonioApp'] || raw;
  if (!Array.isArray(state['items'])) return financialStateSchema.parse(raw);
  const owner = state['settings']?.ownerName || 'Eu';
  const items = state['items'] as Record<string, any>[];
  const mapItem = (item: Record<string, any>) => ({
    desc: item['name'] || '', who: item['person'] || owner, cat: item['category'] || 'Outros',
    valor: Number(item['amount']) || 0, start: item['month'], n: item['recurring'] ? null : 1,
  });
  return financialStateSchema.parse({
    titular: owner,
    people: (state['people'] || []).filter((name: string) => name !== owner).map((name: string) => ({ name, inBill: (state['peopleInBill'] || []).includes(name) })),
    cats: state['categories'] || [],
    incomes: items.filter(item => item['kind'] === 'income').map(mapItem),
    purchases: items.filter(item => item['kind'] === 'expense').map(mapItem),
    bills: (state['bills'] || []).map((bill: Record<string, any>) => ({ month: bill['month'], valor: Number(bill['amount']) || 0 })),
  });
}