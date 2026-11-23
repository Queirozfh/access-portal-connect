import { z } from 'zod';

export const plannedPurchaseSchema = z.object({
  description: z.string().trim().min(3).max(1000),
  person: z.string().trim().min(1).max(100),
  total: z.number().finite().positive().max(1e9),
  installments: z.number().int().min(1).max(120),
  start: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  profileType: z.enum(['PF', 'PJ']).optional(),
});
const planSchema = z.object({
  desc: z.string().default(''), who: z.string().default(''), cat: z.string().default('Outros'),
  valor: z.number().finite(), start: z.string(), n: z.number().nullable().optional(),
});
export const financialStateSchema = z.object({
  titular: z.string(), people: z.array(z.object({ name: z.string(), inBill: z.boolean() })),
  cats: z.array(z.string()), incomes: z.array(planSchema), purchases: z.array(planSchema),
  bills: z.array(z.object({ month: z.string(), valor: z.number().finite() })),
});
const monthNumber = (m: string) => { const [y = 0, mo = 1] = m.split('-').map(Number); return y * 12 + mo - 1; };
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function estimatePurchase(state: z.infer<typeof financialStateSchema>, plan: z.infer<typeof plannedPurchaseSchema>) {
  const first = monthNumber(plan.start), payment = plan.total / plan.installments;
  const active = (p: z.infer<typeof planSchema>, m: number) => m >= monthNumber(p.start) && (p.n == null || m < monthNumber(p.start) + p.n);
  const months = Array.from({ length: plan.installments }, (_, i) => {
    const index = first + i, month = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
    const income = state.incomes.reduce((s, p) => s + (active(p, index) ? p.valor : 0), 0);
    const purchases = state.purchases.filter(p => active(p, index));
    const personal = purchases.filter(p => p.who === state.titular).reduce((s, p) => s + p.valor, 0);
    const embedded = purchases.filter(p => p.who !== state.titular && state.people.find(w => w.name === p.who)?.inBill !== false).reduce((s, p) => s + p.valor, 0);
    const bills = state.bills.filter(b => b.month === month).reduce((s, b) => s + b.valor, 0);
    // Purchases can already be included in bills: never add both totals together.
    const committed = Math.max(0, bills - embedded, personal);
    const personCommitted = purchases.filter(p => p.who === plan.person).reduce((s, p) => s + p.valor, 0);
    const personalPurchase = plan.person === state.titular;
    return { month, income: round(income), committed: round(committed), payment: round(payment),
      personCommitted: round(personCommitted), personAfter: round(personCommitted + payment),
      remaining: round(income - committed - (personalPurchase ? payment : 0)),
      percent: income > 0 ? round((committed + (personalPurchase ? payment : 0)) / income * 100) : null };
  });
  return { total: plan.total, payment: round(payment), months, personalPurchase: plan.person === state.titular };
}
