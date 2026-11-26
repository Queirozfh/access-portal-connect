import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { clearRefreshCookie, readRefreshCookie, rejectCrossSiteRequest } from '@/lib/session-cookie.server';

export const Route = createFileRoute('/api/public/logout')({
  server: { handlers: { POST: async ({ request }) => {
    const headers = { 'Cache-Control': 'no-store', 'Set-Cookie': clearRefreshCookie() };
    if (rejectCrossSiteRequest(request)) return Response.json({ error: 'Origem inválida.' }, { status: 403, headers });
    const refreshToken = readRefreshCookie(request);
    const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const url = process.env['SUPABASE_URL'], key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (refreshToken && accessToken.split('.').length === 3 && url && key) {
      const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(() => null);
      await client.auth.signOut({ scope: 'local' }).catch(() => null);
    }
    return new Response(null, { status: 204, headers });
  } } },
});
