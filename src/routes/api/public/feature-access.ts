import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { ACCESS_FEATURE_IDS, accessPolicyForUser } from '@/lib/access-control';

export const Route = createFileRoute('/api/public/feature-access')({
  server: { handlers: { GET: async ({ request }) => {
    const auth = await portalAuth(request);
    if (!auth) return Response.json({ error: 'Entre novamente para consultar suas permissões.' }, { status: 403 });
    const { data: isAdmin, error: roleError } = await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' });
    if (roleError) return Response.json({ error: 'Não foi possível conferir o perfil da conta.' }, { status: 503 });
    if (isAdmin) return Response.json({ level: 5, features: ACCESS_FEATURE_IDS, admin: true });
    try {
      const access = await accessPolicyForUser(auth.userId);
      return Response.json({ ...access, admin: false });
    } catch {
      return Response.json({ error: 'Não foi possível consultar o nível de acesso.' }, { status: 503 });
    }
  } } },
});
