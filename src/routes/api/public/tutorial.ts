import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';

const TUTORIAL_ROW_ID = '__shared_tutorial__';
const MAX_TUTORIAL_CHARACTERS = 100_000;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function authorize(request: Request): Promise<{ ok: true; isAdmin: boolean } | { ok: false; response: Response }> {
  const auth = await portalAuth(request);
  if (!auth) return { ok: false, response: json({ error: 'Entre novamente para continuar.' }, 401) };
  const { data: isAdmin, error } = await auth.client.rpc('has_role', {
    _user_id: auth.userId,
    _role: 'admin',
  });
  if (error) return { ok: false, response: json({ error: 'Não foi possível conferir o perfil da conta.' }, 503) };
  return { ok: true, isAdmin: Boolean(isAdmin) };
}

export const Route = createFileRoute('/api/public/tutorial')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const access = await authorize(request);
        if (!access.ok) return access.response;
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          // This reserved service-only row contains shared help content, never financial state.
          const { data, error } = await supabaseAdmin
            .from('app_state')
            .select('json, updated_at')
            .eq('id', TUTORIAL_ROW_ID)
            .maybeSingle();
          if (error) return json({ error: 'Não foi possível consultar o tutorial publicado.' }, 503);
          let saved: { content?: unknown } = {};
          try { saved = data?.json ? JSON.parse(data.json) : {}; } catch { /* use the packaged default */ }
          return json({
            content: typeof saved.content === 'string' ? saved.content : null,
            updatedAt: data?.updated_at || null,
            admin: access.isAdmin,
          });
        } catch {
          return json({ error: 'O serviço de tutorial está indisponível.' }, 503);
        }
      },
      PUT: async ({ request }) => {
        const access = await authorize(request);
        if (!access.ok) return access.response;
        if (!access.isAdmin) return json({ error: 'Somente o administrador pode editar o tutorial.' }, 403);
        let body: { content?: unknown };
        try { body = await request.json(); } catch { return json({ error: 'Conteúdo inválido.' }, 400); }
        if (typeof body.content !== 'string') return json({ error: 'Informe o texto do tutorial.' }, 400);
        if (body.content.length > MAX_TUTORIAL_CHARACTERS) return json({ error: 'O tutorial ultrapassa o limite de 100.000 caracteres.' }, 413);
        const updatedAt = new Date().toISOString();
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { error } = await supabaseAdmin.from('app_state').upsert({
            id: TUTORIAL_ROW_ID,
            json: JSON.stringify({ content: body.content }),
            updated_at: updatedAt,
          });
          if (error) return json({ error: 'Não foi possível salvar o tutorial publicado.' }, 500);
          return json({ content: body.content, updatedAt });
        } catch {
          return json({ error: 'O serviço de tutorial está indisponível para salvar.' }, 503);
        }
      },
    },
  },
});
