import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { clearRefreshCookie, publicSession, readRefreshCookie, refreshCookie, rejectCrossSiteRequest } from '@/lib/session-cookie.server';

const reply = (body: unknown, status: number, cookie?: string) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});

async function readSessionRequest(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 2_048 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_048) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute('/api/public/session')({
  server: { handlers: { POST: async ({ request }) => {
    if (rejectCrossSiteRequest(request)) return reply({ error: 'Origem da solicitação inválida.' }, 403, clearRefreshCookie());
    const input = await readSessionRequest(request);
    if (!input) {
      return reply({ error: 'Sessão inválida.' }, 400);
    }
    const refreshToken = readRefreshCookie(request) || (typeof input.refresh_token === 'string' ? input.refresh_token : '');
    if (!refreshToken || refreshToken.length > 4_096) return reply({ error: 'Sessão expirada.' }, 401, clearRefreshCookie());
    const url = process.env['SUPABASE_URL'], key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) return reply({ error: 'Sessão temporariamente indisponível.' }, 503);
    const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return reply({ error: 'Sessão expirada. Entre novamente.' }, 401, clearRefreshCookie());
    return reply(publicSession(data.session), 200, refreshCookie(data.session.refresh_token));
  } } },
});
