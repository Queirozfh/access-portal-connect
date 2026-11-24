import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { z } from 'zod';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect-token') }),
  z.object({ action: z.literal('sync'), itemId: z.string().uuid() }),
]);

async function pluggyKey(signal?: AbortSignal) {
  const clientId = process.env['PLUGGY_CLIENT_ID'];
  const clientSecret = process.env['PLUGGY_CLIENT_SECRET'];
  if (!clientId || !clientSecret) throw new Error('Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nos segredos do servidor para ativar o Pluggy Connect.');
  const response = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const data = await response.json().catch(() => ({})) as { apiKey?: string };
  if (!response.ok || !data.apiKey) throw new Error('Não foi possível autenticar na Pluggy. Confira as credenciais configuradas no servidor.');
  return data.apiKey;
}

async function pluggyGet<T>(path: string, key: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`https://api.pluggy.ai${path}`, { signal, headers: { 'X-API-KEY': key } });
  const data = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || 'A Pluggy não conseguiu consultar os dados da conexão.');
  return data;
}

function results<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) return (data as { results: T[] }).results;
  return [];
}

type PluggyTransactionPage = { results?: Record<string, unknown>[]; next?: string | null };

async function pluggyTransactions(accountId: string, key: string, signal?: AbortSignal) {
  const transactions: Record<string, unknown>[] = [];
  let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
  // The endpoint returns 500 records per page and a query string cursor in `next`.
  // Keep each sync bounded: at most 5,000 transactions are fetched per account.
  for (let page = 0; path && page < 10; page += 1) {
    const data = await pluggyGet<PluggyTransactionPage>(path, key, signal);
    transactions.push(...(data.results || []));
    if (!data.next) return { transactions, complete: true };
    if (!data.next.startsWith('?')) throw new Error('A Pluggy retornou um cursor de transações inválido.');
    path = `/v2/transactions${data.next}`;
  }
  return { transactions, complete: false };
}

export const Route = createFileRoute('/api/public/pluggy')({
  server: { handlers: { POST: async ({ request }) => {
    const auth = await portalAuth(request);
    if (!auth) return json({ error: 'Entre novamente para usar a conexão financeira.' }, 403);
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Solicitação de conexão inválida.' }, 400);
    try {
      const key = await pluggyKey(request.signal);
      if (parsed.data.action === 'connect-token') {
        const response = await fetch('https://api.pluggy.ai/connect_token', {
          method: 'POST', signal: request.signal,
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
          body: JSON.stringify({ options: { clientUserId: auth.userId } }),
        });
        const data = await response.json().catch(() => ({})) as { accessToken?: string; message?: string };
        if (!response.ok || !data.accessToken) return json({ error: data.message || 'Não foi possível criar o token de conexão.' }, 502);
        return json({ accessToken: data.accessToken });
      }

      const item = await pluggyGet<{ id: string; clientUserId?: string; connector?: { name?: string }; status?: string }>(`/items/${encodeURIComponent(parsed.data.itemId)}`, key, request.signal);
      if (item.clientUserId !== auth.userId) return json({ error: 'Esta conexão não pertence ao perfil atual.' }, 403);
      if (item.status && !['UPDATED', 'LOGIN_IN_PROGRESS'].includes(item.status)) return json({ error: `A conexão ainda não está pronta (${item.status}).` }, 409);
      const accountData = await pluggyGet<unknown>(`/accounts?itemId=${encodeURIComponent(item.id)}`, key, request.signal);
      const accounts = results<Record<string, unknown>>(accountData).map((account) => ({
        id: String(account.id || ''), itemId: item.id,
        name: String(account.name || 'Conta'), type: String(account.type || ''), subtype: String(account.subtype || ''),
        balance: Number(account.balance || 0), currencyCode: String(account.currencyCode || 'BRL'),
        institution: String(item.connector?.name || 'Pluggy Bank'),
      }));
      const bills: Record<string, unknown>[] = [];
      const transactions: Record<string, unknown>[] = [];
      let transactionsComplete = true;
      for (const account of accounts.filter((entry) => ['BANK', 'CREDIT'].includes(entry.type.toUpperCase()))) {
        const page = await pluggyTransactions(String(account.id), key, request.signal);
        transactionsComplete = transactionsComplete && page.complete;
        transactions.push(...page.transactions.map((transaction) => ({
          id: String(transaction.id || ''), itemId: item.id, accountId: String(account.id),
          accountName: String(account.name || 'Conta'), institution: String(item.connector?.name || 'Pluggy Bank'),
          date: transaction.date || null, description: String(transaction.description || transaction.descriptionRaw || 'Movimentação'),
          category: transaction.category || null, amount: Number(transaction.amount || 0),
          currencyCode: String(transaction.currencyCode || 'BRL'), type: String(transaction.type || ''),
          status: String(transaction.status || ''), operationType: transaction.operationType || null,
          installmentNumber: (transaction.creditCardMetadata as Record<string, unknown> | undefined)?.installmentNumber || null,
          totalInstallments: (transaction.creditCardMetadata as Record<string, unknown> | undefined)?.totalInstallments || null,
        })));
      }
      for (const account of accounts.filter((entry) => entry.type.toUpperCase() === 'CREDIT' || entry.subtype.toUpperCase() === 'CREDIT_CARD')) {
        const data = await pluggyGet<unknown>(`/bills?accountId=${encodeURIComponent(account.id)}`, key, request.signal);
        for (const bill of results<Record<string, unknown>>(data)) bills.push({
          id: String(bill.id || ''), accountId: account.id, accountName: account.name,
          itemId: item.id, dueDate: bill.dueDate || null,
          amount: Number(bill.totalAmount || 0), currencyCode: String(bill.totalAmountCurrencyCode || 'BRL'),
          minimumPaymentAmount: Number(bill.minimumPaymentAmount || 0),
        });
      }
      transactions.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const recentTransactions = transactions.slice(0, 1000);
      return json({ item: { id: item.id, institution: item.connector?.name || 'Pluggy Bank', status: item.status || 'UPDATED' }, accounts, bills, transactions: recentTransactions, transactionsComplete: transactionsComplete && transactions.length <= recentTransactions.length, syncedAt: new Date().toISOString() });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      return json({ error: error instanceof Error ? error.message : 'Falha ao consultar a Pluggy.' }, 502);
    }
  } } },
});
