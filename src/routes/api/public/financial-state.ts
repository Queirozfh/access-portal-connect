import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { accessPolicyForUser } from '@/lib/access-control';
import { mergeFinancialState, requiredStateFeatures, sanitizeFinancialState, validateFinancialState } from '@/lib/financial-state-access.server';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const ADMIN_ID = 'ad46a5e7-af23-4cff-b190-ea6b6140013d';

export const Route = createFileRoute('/api/public/financial-state')({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Acesso suspenso ou sessão expirada. Entre novamente.' }, 403);
      try {
        const isAdmin = auth.userId === ADMIN_ID || (await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' })).data === true;
        const features = new Set(isAdmin ? ['admin.all', 'profile.pj'] : (await accessPolicyForUser(auth.userId)).features);
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const id = auth.userId === ADMIN_ID ? 'main' : auth.userId;
        const { data, error } = await supabaseAdmin.from('app_state').select('json, updated_at').eq('id', id).maybeSingle();
        if (error) return json({ error: 'Não foi possível carregar os dados online.' }, 503);
        const state = data ? JSON.parse(data.json) : {};
        return json({ state: isAdmin ? state : sanitizeFinancialState(state, features), updated_at: data?.updated_at ?? null });
      } catch {
        return json({ error: 'Não foi possível validar suas permissões.' }, 503);
      }
    },
    POST: async ({ request }) => {
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Acesso suspenso ou sessão expirada. Entre novamente.' }, 403);
      let body: { json?: unknown; expected_updated_at?: unknown };
      try { body = await request.json(); } catch { return json({ error: 'Dados financeiros inválidos.' }, 400); }
      if (typeof body.json !== 'string' || body.json.length > 5_000_000)
        return json({ error: 'A cópia financeira está inválida ou ultrapassa o limite permitido.' }, 413);
      let incoming: Record<string, any>;
      try { incoming = JSON.parse(body.json); } catch { return json({ error: 'Dados financeiros inválidos.' }, 400); }
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return json({ error: 'Dados financeiros inválidos.' }, 400);
      if (incoming.financeProfiles !== undefined && (!incoming.financeProfiles || typeof incoming.financeProfiles !== 'object' || Array.isArray(incoming.financeProfiles)))
        return json({ error: 'Perfis financeiros inválidos.' }, 400);
      for (const profile of Object.values(incoming.financeProfiles || {})) {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return json({ error: 'Perfil financeiro inválido.' }, 400);
        for (const key of ['items', 'assets', 'bills', 'cards', 'reimbursements', 'people', 'peopleInBill', 'categories'])
          if (profile[key] !== undefined && !Array.isArray(profile[key])) return json({ error: 'Lista de dados financeiros inválida.' }, 400);
        if (profile.settings !== undefined && (!profile.settings || typeof profile.settings !== 'object' || Array.isArray(profile.settings)))
          return json({ error: 'Configurações financeiras inválidas.' }, 400);
      }

      try {
        const role = await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' });
        if (role.error) return json({ error: 'Não foi possível conferir suas permissões.' }, 503);
        const isAdmin = auth.userId === ADMIN_ID || role.data === true;
        const features = new Set(isAdmin ? ['admin.all', 'profile.pj'] : (await accessPolicyForUser(auth.userId)).features);
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const id = auth.userId === ADMIN_ID ? 'main' : auth.userId;
        const { data: current, error: readError } = await supabaseAdmin.from('app_state').select('json, updated_at').eq('id', id).maybeSingle();
        if (readError) return json({ error: 'Não foi possível ler a versão atual dos dados.' }, 503);
        if (!current) return json({ error: 'A conta ainda não possui um estado financeiro inicial.' }, 409);
        if (typeof body.expected_updated_at !== 'string' || body.expected_updated_at !== current.updated_at)
          return json({ error: 'Outra aba ou aparelho salvou alterações. Sua cópia local foi preservada; recarregue ou exporte antes de continuar.', conflict: true, updated_at: current.updated_at }, 409);

        const oldState = JSON.parse(current.json) as Record<string, any>;
        const nextState = isAdmin ? incoming : mergeFinancialState(oldState, incoming, features);
        const validationError = validateFinancialState(oldState, nextState);
        if (validationError) return json({ error: validationError }, 400);
        if (!isAdmin) {
          const missing = requiredStateFeatures(oldState, nextState).filter(feature => !features.has(feature));
          if (missing.length) return json({ error: 'Seu nível de acesso não permite realizar uma ou mais alterações.', denied_features: missing }, 403);
        }
        const updatedAt = new Date().toISOString();
        const { data: saved, error: writeError } = await supabaseAdmin.from('app_state').update({ json: JSON.stringify(nextState), updated_at: updatedAt }).eq('id', id).eq('updated_at', current.updated_at).select('updated_at').maybeSingle();
        if (writeError) return json({ error: 'Não foi possível sincronizar as alterações.' }, 503);
        if (!saved) {
          const { data: latest } = await supabaseAdmin.from('app_state').select('updated_at').eq('id', id).maybeSingle();
          return json({ error: 'Outra aba salvou dados ao mesmo tempo. Sua cópia local foi preservada.', conflict: true, updated_at: latest?.updated_at ?? null }, 409);
        }
        return json({ ok: true, updated_at: saved.updated_at });
      } catch {
        return json({ error: 'Não foi possível validar suas permissões para salvar.' }, 503);
      }
    },
  } },
});
