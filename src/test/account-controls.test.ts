import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { aiMonth, quotaDecision } from '../lib/ai-quota';

const source = readFileSync('public/meu-patrimonio/bridge.js', 'utf8');
const helpers = source.slice(source.indexOf('function resetItemPayment('), source.indexOf('function collectionPage('));
describe('account safety and payments', () => {
  it('allows exactly four monthly analyses and blocks the fifth', () => {
    expect([0, 1, 2, 3, 4].map(used => quotaDecision(true, used).allowed)).toEqual([true, true, true, true, false]);
  });
  it('denies AI when the administrator disables it', () => {
    expect(quotaDecision(false, 0).allowed).toBe(false);
  });
  it('renews on the first day at midnight in Fortaleza', () => {
    expect(aiMonth(new Date('2026-12-01T02:59:59Z'))).toBe('2026-11-01');
    expect(aiMonth(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12-01');
  });
  it('returns a paid expense to pending, clearing its payments', () => {
    const item = { kind: 'expense', amount: 100, paid: 100, payments: [{ month: '2026-10', amount: 100 }] };
    runInNewContext(helpers + ';resetItemPayment(item,"2026-11")', { item });
    expect(item.paid).toBe(0); expect(item.payments).toEqual([]);
  });
  it('resets a recurring item only for the selected month', () => {
    const item = { recurring: true, paid: 0, payments: [{ month: '2026-10', amount: 100 }, { month: '2026-11', amount: 100 }] };
    runInNewContext(helpers + ';resetItemPayment(item,"2026-11")', { item });
    expect(item.payments).toEqual([{ month: '2026-10', amount: 100 }]);
  });
  it('sums unpaid future installments for each card without bills or other cards', () => {
    const items = [
      { kind: 'expense', cardId: 'nubank', month: '2026-11', amount: 500, paid: 100 },
      { kind: 'expense', cardId: 'nubank', month: '2026-12', amount: 500, paid: 0 },
      { kind: 'expense', cardId: 'nubank', month: '2026-10', amount: 500, paid: 0 },
      { kind: 'expense', cardId: 'inter', month: '2026-12', amount: 300, paid: 0 },
      { kind: 'expense', cardId: 'nubank', month: '2026-12', amount: 100, recurring: true },
    ];
    expect(runInNewContext(helpers + ';cardCommitment(items,"nubank","2026-11")', { items })).toBe(900);
    expect(runInNewContext(helpers + ';cardCommitment(items,"inter","2026-11")', { items })).toBe(300);
  });
  it('discriminates the monthly debt, payments, items and Pix in the WhatsApp message', () => {
    const group = { total: 100, received: 40, open: 60, items: [{ name: 'Mercado', amount: 100 }] };
    const text = runInNewContext(helpers + ';collectionMessage("Mãe","nov/26",group,"pix-exemplo")', { group, money: (n: number) => `R$ ${n}` });
    expect(text).toContain('Mercado: R$ 100'); expect(text).toContain('Total do mês: R$ 100');
    expect(text).toContain('Já recebido: R$ 40'); expect(text).toContain('Ainda a receber: R$ 60'); expect(text).toContain('Pix: pix-exemplo');
  });
  it('adds Brazil DDI to a masked number and preserves an existing DDI', () => {
    expect(runInNewContext(helpers + ';normalizeWhatsAppPhone("(85) 99999-9999")')).toBe('5585999999999');
    expect(runInNewContext(helpers + ';normalizeWhatsAppPhone("+55 (85) 99999-9999")')).toBe('5585999999999');
    expect(runInNewContext(helpers + ';normalizeWhatsAppPhone("(55) 99999-9999")')).toBe('5555999999999');
  });
  it('does not generate a contact link for missing or invalid numbers', () => {
    for (const phone of ['', '99999-9999', '00000000000', 'https://evil.example']) {
      expect(runInNewContext(helpers + ';whatsAppContactLink(phone,"cobrança")', { phone })).toBe('');
    }
  });
  it('encodes the entire multiline message into the specified private conversation', () => {
    const message = 'Mercado\nParcela 2/4\nSaldo: R$ 60\nPix: email+pix@example.com';
    const link = runInNewContext(helpers + ';whatsAppContactLink("(85) 99999-9999",message)', { message });
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('https://wa.me/5585999999999');
    expect(url.searchParams.get('text')).toBe(message);
  });
});