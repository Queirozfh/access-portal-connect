import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export async function portalAuth(request: Request, options: { allowExpired?: boolean } = {}) {
  const bearer = request.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  const token = bearer.slice(7), url = process.env['SUPABASE_URL'], key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('A configuração de acesso está indisponível.');
  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: bearer }, fetch: (input, init) => {
      const headers = new Headers(init?.headers); headers.set('apikey', key);
      return fetch(input, { ...init, headers });
    } }, auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const expiry = data.user.app_metadata?.['expires_at'];
  const expired = typeof expiry === 'string' && new Date(expiry).getTime() <= Date.now();
  if (expired && !options.allowExpired) return null;
  return { client, userId: data.user.id, user: data.user, expired };
}
