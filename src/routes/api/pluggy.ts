import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { z } from 'zod';
import { accessPolicyForUser } from '@/lib/access-control';

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

export const Route = createFileRoute('/api/public/pluggy')({
  server: { handlers: { POST: async ({ request }) => {
    const auth = await portalAuth(request);
    if (!auth) return json({ error: 'Entre novamente para usar a conexão financeira.' }, 403);
    const { data: isAdmin, error: roleError } = await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' });
    if (roleError) return json({ error: 'Não foi possível conferir suas permissões.' }, 503);
    if (!isAdmin) {
      try { if (!(await accessPolicyForUser(auth.userId)).features.includes('integrations.openFinance')) return json({ error: 'Seu nível de acesso não permite conectar instituições financeiras.' }, 403); }
      catch { return json({ error: 'Não foi possível consultar seu nível de acesso.' }, 503); }
    }
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
      for (const account of accounts.filter((entry) => entry.type.toUpperCase() === 'CREDIT' || entry.subtype.toUpperCase() === 'CREDIT_CARD')) {
        const data = await pluggyGet<unknown>(`/bills?accountId=${encodeURIComponent(account.id)}`, key, request.signal);
        for (const bill of results<Record<string, unknown>>(data)) bills.push({
          id: String(bill.id || ''), accountId: account.id, accountName: account.name,
          itemId: item.id, dueDate: bill.dueDate || null,
          amount: Number(bill.totalAmount || 0), currencyCode: String(bill.totalAmountCurrencyCode || 'BRL'),
          minimumPaymentAmount: Number(bill.minimumPaymentAmount || 0),
        });
      }
      return json({ item: { id: item.id, institution: item.connector?.name || 'Pluggy Bank', status: item.status || 'UPDATED' }, accounts, bills, syncedAt: new Date().toISOString() });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      return json({ error: error instanceof Error ? error.message : 'Falha ao consultar a Pluggy.' }, 502);
    }
  } } },
});
