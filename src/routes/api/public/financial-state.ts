import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { accessPolicyForUser } from '@/lib/access-control';
import { mergeFinancialState, requiredStateFeatures, sanitizeFinancialState, validateFinancialState } from '@/lib/financial-state-access.server';
import { businessWorkspaceContext } from '@/lib/business-workspaces.server';
import { rejectCrossSiteRequest } from '@/lib/session-cookie.server';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const ADMIN_ID = 'ad46a5e7-af23-4cff-b190-ea6b6140013d';

// Personal finance is always scoped to the verified session. A workspace
// membership never changes this identifier or grants access to its owner's row.
function personalStateIdForUser(userId: string) {
  return userId === ADMIN_ID ? 'main' : userId;
}

export const Route = createFileRoute('/api/public/financial-state')({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Acesso suspenso ou sessão expirada. Entre novamente.' }, 403);
      try {
        const workspaceId = request.headers.get('x-business-workspace-id');
        if (workspaceId) {
          if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json({ error: 'Espaço empresarial inválido.' }, 400);
          const context = await businessWorkspaceContext(workspaceId, auth.userId);
          if (!context) return json({ error: 'Você não tem acesso a este espaço empresarial.' }, 403);
          if (context.unavailable) return json({ error: 'O plano do titular não está ativo para este espaço.' }, 403);
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { error: backupError } = await supabaseAdmin.rpc('create_daily_business_workspace_backup', { p_workspace_id: workspaceId });
          if (backupError) console.error('[Business workspace backup] Snapshot could not be created.', { code: backupError.code });
          const { data, error } = await supabaseAdmin.from('business_workspace_state').select('json, updated_at').eq('workspace_id', workspaceId).maybeSingle();
          if (error) return json({ error: 'Não foi possível carregar os dados da empresa.' }, 503);
          if (!data) return json({ error: 'Os dados financeiros da empresa ainda não foram inicializados.' }, 404);
          const stored = JSON.parse(data.json);
          // Only the PJ branch is ever returned from a shared workspace. Do not
          // fall back to patrimonioApp or the raw row: older aliases may contain
          // a personal profile if a previous writer serialized the wrong scope.
          const company = stored?.financeProfiles?.PJ;
          if (!company || typeof company !== 'object' || Array.isArray(company))
            return json({ error: 'O espaço não possui um perfil PJ isolado; os dados foram bloqueados.' }, 503);
          const isolatedState = { v: stored?.v, financeProfiles: { PJ: company }, patrimonioApp: {} };
          return json({ state: sanitizeFinancialState(isolatedState, new Set(context.features)), updated_at: data.updated_at, workspace: { id: context.workspace.id, name: context.workspace.name, role: context.role } });
        }
        const isAdmin = auth.userId === ADMIN_ID || (await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' })).data === true;
        const features = new Set(isAdmin ? ['admin.all', 'profile.pj'] : (await accessPolicyForUser(auth.userId)).features);
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const id = personalStateIdForUser(auth.userId);
        const { error: backupError } = await supabaseAdmin.rpc('create_daily_financial_backup_for_account', { p_account_id: id });
        if (backupError) console.error('[Daily backup] Could not create the account snapshot.', backupError);
        const { data, error } = await supabaseAdmin.from('app_state').select('json, updated_at').eq('id', id).maybeSingle();
        if (error) return json({ error: 'Não foi possível carregar os dados online.' }, 503);
        const state = data ? JSON.parse(data.json) : {};
        return json({ state: isAdmin ? state : sanitizeFinancialState(state, features), updated_at: data?.updated_at ?? null });
      } catch {
        return json({ error: 'Não foi possível validar suas permissões.' }, 503);
      }
    },
    POST: async ({ request }) => {
      if (rejectCrossSiteRequest(request)) return json({ error: 'Origem inválida.' }, 403);
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Acesso suspenso ou sessão expirada. Entre novamente.' }, 403);
      const workspaceId = request.headers.get('x-business-workspace-id');
      let body: { json?: unknown; expected_updated_at?: unknown };
      try { body = await request.json(); } catch { return json({ error: 'Dados financeiros inválidos.' }, 400); }
      if (typeof body.json !== 'string' || body.json.length > 5_000_000)
        return json({ error: 'A cópia financeira está inválida ou ultrapassa o limite permitido.' }, 413);
      let incoming: Record<string, any>;
      try { incoming = JSON.parse(body.json); } catch { return json({ error: 'Dados financeiros inválidos.' }, 400); }
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return json({ error: 'Dados financeiros inválidos.' }, 400);
      const incomingProfiles = incoming['financeProfiles'] as Record<string, any> | undefined;
      if (incomingProfiles !== undefined && (!incomingProfiles || typeof incomingProfiles !== 'object' || Array.isArray(incomingProfiles)))
        return json({ error: 'Perfis financeiros inválidos.' }, 400);
      for (const profile of Object.values(incomingProfiles || {}) as Record<string, any>[]) {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return json({ error: 'Perfil financeiro inválido.' }, 400);
        for (const key of ['items', 'assets', 'bills', 'cards', 'reimbursements', 'people', 'peopleInBill', 'categories'])
          if (profile[key] !== undefined && !Array.isArray(profile[key])) return json({ error: 'Lista de dados financeiros inválida.' }, 400);
        if (profile['settings'] !== undefined && (!profile['settings'] || typeof profile['settings'] !== 'object' || Array.isArray(profile['settings'])))
          return json({ error: 'Configurações financeiras inválidas.' }, 400);
      }

      try {
        if (workspaceId) {
          if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json({ error: 'Espaço empresarial inválido.' }, 400);
          if (!incomingProfiles?.['PJ'])
            return json({ error: 'O espaço empresarial aceita somente dados do perfil PJ.' }, 400);
          if (incomingProfiles['PF'] !== undefined)
            return json({ error: 'O espaço empresarial não pode receber dados do perfil pessoal.' }, 400);
          const context = await businessWorkspaceContext(workspaceId, auth.userId);
          if (!context) return json({ error: 'Você não tem acesso a este espaço empresarial.' }, 403);
          if (context.unavailable) return json({ error: 'O plano do titular não está ativo para este espaço.' }, 403);
          const features = new Set(context.features);
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { data: current, error: readError } = await supabaseAdmin.from('business_workspace_state')
            .select('json, updated_at').eq('workspace_id', workspaceId).maybeSingle();
          if (readError) return json({ error: 'Não foi possível ler a versão atual dos dados da empresa.' }, 503);
          if (!current) return json({ error: 'Os dados financeiros da empresa ainda não foram inicializados.' }, 404);
          if (typeof body.expected_updated_at !== 'string' || body.expected_updated_at !== current.updated_at)
            return json({ error: 'Outra pessoa salvou alterações. Seus dados locais foram preservados; recarregue antes de continuar.', conflict: true, updated_at: current.updated_at }, 409);
          const stored = JSON.parse(current.json) as Record<string, any>;
          const storedProfiles = stored['financeProfiles'] as Record<string, any> | undefined;
          const companyBefore = storedProfiles?.['PJ'];
          if (!companyBefore || typeof companyBefore !== 'object' || Array.isArray(companyBefore))
            return json({ error: 'O espaço não possui um perfil PJ isolado; os dados foram bloqueados.' }, 503);
          const oldState = { v: stored['v'], financeProfiles: { PJ: companyBefore }, patrimonioApp: {} };
          const companyIncoming = incomingProfiles['PJ'];
          const isolatedIncoming = { v: incoming['v'], financeProfiles: { PJ: companyIncoming }, patrimonioApp: {} };
          const merged = mergeFinancialState(oldState, isolatedIncoming, features);
          const mergedProfiles = merged['financeProfiles'] as Record<string, any> | undefined;
          const nextCompany = mergedProfiles?.['PJ'] || companyBefore;
          const nextState = { v: merged['v'], financeProfiles: { PJ: nextCompany }, patrimonioApp: {} };
          const validationError = validateFinancialState(oldState, nextState);
          if (validationError) return json({ error: validationError }, 400);
          const missing = requiredStateFeatures(oldState, nextState).filter(feature => !features.has(feature));
          if (missing.length) return json({ error: 'Sua função neste espaço não permite uma ou mais alterações.', denied_features: missing }, 403);
          const updatedAt = new Date().toISOString();
          const { data: saved, error: writeError } = await supabaseAdmin.from('business_workspace_state')
            .update({ json: JSON.stringify(nextState), updated_at: updatedAt })
            .eq('workspace_id', workspaceId).eq('updated_at', current.updated_at).select('updated_at').maybeSingle();
          if (writeError) return json({ error: 'Não foi possível sincronizar os dados da empresa.' }, 503);
          if (!saved) return json({ error: 'Outra pessoa salvou dados ao mesmo tempo. Recarregue e tente novamente.', conflict: true }, 409);
          return json({ ok: true, updated_at: saved.updated_at });
        }
        const role = await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' });
        if (role.error) return json({ error: 'Não foi possível conferir suas permissões.' }, 503);
        const isAdmin = auth.userId === ADMIN_ID || role.data === true;
        const features = new Set(isAdmin ? ['admin.all', 'profile.pj'] : (await accessPolicyForUser(auth.userId)).features);
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const id = personalStateIdForUser(auth.userId);
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
