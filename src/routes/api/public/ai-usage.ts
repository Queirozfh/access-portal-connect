import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { aiMonth, quotaDecision } from '@/lib/ai-quota';

export const Route = createFileRoute('/api/public/ai-usage')({
  server: { handlers: { GET: async ({ request }) => {
    const auth = await portalAuth(request);
    if (!auth) return Response.json({ error: 'Acesso suspenso ou sessão expirada.' }, { status: 403 });
    const [permission, usage, role] = await Promise.all([
      auth.client.from('ai_account_access').select('enabled').eq('user_id', auth.userId).maybeSingle(),
      auth.client.from('ai_monthly_usage').select('used').eq('user_id', auth.userId).eq('month', aiMonth()).maybeSingle(),
      auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' }),
    ]);
    if (permission.error || usage.error || role.error) return Response.json({ error: 'Não foi possível verificar a cota de IA.' }, { status: 503 });
    const enabled = permission.data?.enabled ?? true;
    return Response.json({ ...quotaDecision(enabled, usage.data?.used ?? 0, role.data === true), enabled, month: aiMonth() });
  } } },
});