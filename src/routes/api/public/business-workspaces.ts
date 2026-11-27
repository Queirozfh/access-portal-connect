import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { businessPlanForOwner, businessWorkspaceContext, userIsAdmin } from '@/lib/business-workspaces.server';
import { rejectCrossSiteRequest } from '@/lib/session-cookie.server';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f-]{36}$/i;
const INVITABLE_ROLES = new Set(['admin', 'finance', 'collaborator', 'accountant']);

async function workspaceManager(workspaceId: string, userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('business_workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data && ['owner', 'admin'].includes(data.role) ? data.role : null;
}

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  const code = error?.code || '';
  if (code === '42501') return { error: 'Você não tem permissão para administrar este espaço.', status: 403 };
  if (code === '23514' && /seat_limit/.test(error?.message || '')) return { error: 'O limite de usuários do plano foi atingido.', status: 409 };
  if (code === '23505') return { error: 'Este usuário já pertence ao espaço ou já tem um convite pendente.', status: 409 };
  if (code === 'P0002') return { error: 'O espaço empresarial não foi encontrado.', status: 404 };
  if (code === '22023') return { error: 'Revise o nome, o e-mail e a função escolhida.', status: 400 };
  if (code === 'PGRST202' || code === '42883') return { error: 'A migração dos espaços empresariais ainda não foi aplicada.', status: 503 };
  console.error('[business-workspaces] Database operation failed', { code });
  return { error: fallback, status: 503 };
}

export const Route = createFileRoute('/api/public/business-workspaces')({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Entre novamente para consultar os espaços.' }, 403);
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const [{ data: memberships, error: memberError }, { data: incomingInvites, error: inviteError }] = await Promise.all([
          supabaseAdmin.from('business_workspace_members').select('workspace_id, role, created_at').eq('user_id', auth.userId),
          supabaseAdmin.from('business_workspace_invitations').select('id, workspace_id, invited_email, role, created_at, expires_at').eq('invited_email', String(auth.user.email || '').toLowerCase()).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
        ]);
        if (memberError || inviteError) throw memberError || inviteError;
        const ids = [...new Set([...(memberships || []).map(row => row.workspace_id), ...(incomingInvites || []).map(row => row.workspace_id)])];
        const { data: workspaces, error: workspaceError } = ids.length
          ? await supabaseAdmin.from('business_workspaces').select('id, owner_user_id, name, created_at, updated_at').in('id', ids)
          : { data: [], error: null };
        if (workspaceError) throw workspaceError;
        const canCreate = await businessPlanForOwner(auth.userId);
        const result = await Promise.all((workspaces || []).map(async workspace => {
          const membership = memberships?.find(row => row.workspace_id === workspace.id);
          const entitlement = await businessPlanForOwner(workspace.owner_user_id);
          const [{ data: members, error: listError }, { data: pending, error: pendingError }] = await Promise.all([
            supabaseAdmin.from('business_workspace_members').select('user_id, role, created_at').eq('workspace_id', workspace.id),
            ['owner', 'admin'].includes(membership?.role || '')
              ? supabaseAdmin.from('business_workspace_invitations').select('id, invited_email, role, status, created_at, expires_at').eq('workspace_id', workspace.id).eq('status', 'pending').gt('expires_at', new Date().toISOString())
              : Promise.resolve({ data: [], error: null }),
          ]);
          if (listError || pendingError) throw listError || pendingError;
          const memberDetails = await Promise.all((members || []).map(async member => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
            return { id: member.user_id, role: member.role, email: data.user?.email || '', name: data.user?.user_metadata?.['name'] || data.user?.email || 'Usuário', createdAt: member.created_at };
          }));
          const memberLimit = entitlement.memberLimit;
          return {
            ...workspace,
            role: membership?.role,
            memberLimit,
            memberCount: (members || []).length,
            billingActive: entitlement.active,
            members: memberDetails,
            invitations: pending || [],
          };
        }));
        return json({
          workspaces: result,
          invitations: await Promise.all((incomingInvites || []).map(async row => {
            const workspace = workspaces?.find(item => item.id === row.workspace_id);
            const owner = workspace ? await supabaseAdmin.auth.admin.getUserById(workspace.owner_user_id) : { data: { user: null } };
            return { id: row.id, workspaceId: row.workspace_id, workspaceName: workspace?.name || 'Empresa', role: row.role, invitedBy: owner.data.user?.user_metadata?.['name'] || owner.data.user?.email || 'Titular', createdAt: row.created_at, expiresAt: row.expires_at };
          })),
          canCreate: canCreate.active,
          defaultMemberLimit: canCreate.memberLimit,
        });
      } catch (error) {
        console.error('[business-workspaces] Could not load workspace catalog', error);
        const code = (error as { code?: string } | null)?.code || '';
        const setupMissing = ['42P01', 'PGRST202', 'PGRST205', '42883'].includes(code);
        return json({ error: setupMissing
          ? 'A migração dos espaços empresariais ainda não foi aplicada neste ambiente.'
          : 'Não foi possível carregar os espaços empresariais.' }, 503);
      }
    },
    POST: async ({ request }) => {
      if (rejectCrossSiteRequest(request)) return json({ error: 'Origem inválida.' }, 403);
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Entre novamente para continuar.' }, 403);
      let body: Record<string, unknown>;
      try { body = await request.json(); } catch { return json({ error: 'Pedido inválido.' }, 400); }
      const action = String(body['action'] || '');
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        if (action === 'create') {
          const name = String(body['name'] || '').trim();
          if (name.length < 2 || name.length > 120) return json({ error: 'O nome da empresa deve ter entre 2 e 120 caracteres.' }, 400);
          const entitlement = await businessPlanForOwner(auth.userId);
          if (!entitlement.active) return json({ error: 'Criar um espaço empresarial compartilhado exige um plano ativo de nível 5.' }, 403);
          const accountId = await userIsAdmin(auth.userId) ? 'main' : auth.userId;
          const { data: source, error: sourceError } = await supabaseAdmin.from('app_state').select('json').eq('id', accountId).maybeSingle();
          if (sourceError) throw sourceError;
          const original = source?.json ? JSON.parse(source.json) as Record<string, any> : {};
          const existingPj = original['financeProfiles']?.['PJ'] || {};
          const initialState = { v: original['v'], financeProfiles: { PJ: existingPj }, patrimonioApp: existingPj };
          const { data: id, error } = await supabaseAdmin.rpc('create_business_workspace', {
            p_owner: auth.userId, p_name: name, p_member_limit: entitlement.memberLimit,
            p_initial_state: JSON.stringify(initialState),
          });
          if (error) { const failure = dbError(error, 'Não foi possível criar o espaço empresarial.'); return json({ error: failure.error }, failure.status); }
          return json({ ok: true, id, copiedExistingBusinessData: Object.keys(existingPj).length > 0 });
        }
        if (action === 'invite') {
          const workspaceId = String(body['workspace_id'] || ''), email = String(body['email'] || '').trim().toLowerCase(), role = String(body['role'] || '');
          if (!UUID.test(workspaceId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || !INVITABLE_ROLES.has(role))
            return json({ error: 'Informe um e-mail válido e uma função disponível.' }, 400);
          const { data: id, error } = await supabaseAdmin.rpc('invite_business_workspace_member', { p_workspace_id: workspaceId, p_actor: auth.userId, p_email: email, p_role: role });
          if (error) { const failure = dbError(error, 'Não foi possível criar o convite.'); return json({ error: failure.error }, failure.status); }
          return json({ ok: true, id, message: 'Convite criado. Ele aparecerá no aplicativo quando a pessoa entrar com este e-mail.' });
        }
        if (action === 'accept-invitation') {
          const invitationId = String(body['invitation_id'] || '');
          if (!UUID.test(invitationId) || !auth.user.email) return json({ error: 'Convite inválido.' }, 400);
          const { data: workspaceId, error } = await supabaseAdmin.rpc('accept_business_workspace_invitation', { p_invitation_id: invitationId, p_user_id: auth.userId, p_email: auth.user.email });
          if (error) { const failure = dbError(error, 'Não foi possível aceitar o convite.'); return json({ error: failure.error }, failure.status); }
          return json({ ok: true, workspaceId });
        }
        if (action === 'decline-invitation') {
          const invitationId = String(body['invitation_id'] || '');
          if (!UUID.test(invitationId) || !auth.user.email) return json({ error: 'Convite inválido.' }, 400);
          const { data, error } = await supabaseAdmin.from('business_workspace_invitations').update({ status: 'declined', responded_at: new Date().toISOString() })
            .eq('id', invitationId).eq('status', 'pending').eq('invited_email', auth.user.email.toLowerCase()).select('id').maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: 'Convite não encontrado ou expirado.' }, 404);
          return json({ ok: true });
        }
        const workspaceId = String(body['workspace_id'] || '');
        if (!UUID.test(workspaceId)) return json({ error: 'Espaço empresarial inválido.' }, 400);
        const managerRole = await workspaceManager(workspaceId, auth.userId);
        if (!managerRole) return json({ error: 'Você não tem permissão para administrar este espaço.' }, 403);
        if (action === 'rename') {
          const name = String(body['name'] || '').trim();
          if (name.length < 2 || name.length > 120) return json({ error: 'O nome deve ter entre 2 e 120 caracteres.' }, 400);
          const { error } = await supabaseAdmin.from('business_workspaces').update({ name, updated_at: new Date().toISOString() }).eq('id', workspaceId);
          if (error) throw error;
          return json({ ok: true });
        }
        if (action === 'change-role') {
          const memberId = String(body['user_id'] || ''), role = String(body['role'] || '');
          if (!UUID.test(memberId) || !INVITABLE_ROLES.has(role)) return json({ error: 'Selecione uma função e uma pessoa válidas.' }, 400);
          const { data: target, error: targetError } = await supabaseAdmin.from('business_workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', memberId).maybeSingle();
          if (targetError) throw targetError;
          if (!target || target.role === 'owner' || memberId === auth.userId && managerRole === 'owner') return json({ error: 'A função do proprietário não pode ser alterada.' }, 400);
          const { error } = await supabaseAdmin.from('business_workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', memberId);
          if (error) throw error;
          return json({ ok: true });
        }
        if (action === 'remove-member') {
          const memberId = String(body['user_id'] || '');
          if (!UUID.test(memberId)) return json({ error: 'Pessoa inválida.' }, 400);
          const { data: target, error: targetError } = await supabaseAdmin.from('business_workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', memberId).maybeSingle();
          if (targetError) throw targetError;
          if (!target) return json({ error: 'Membro não encontrado.' }, 404);
          if (target.role === 'owner') return json({ error: 'Transfira a propriedade antes de remover o titular.' }, 400);
          const { error } = await supabaseAdmin.from('business_workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', memberId);
          if (error) throw error;
          return json({ ok: true });
        }
        return json({ error: 'Ação desconhecida.' }, 400);
      } catch (error) {
        console.error('[business-workspaces] Workspace operation failed', error);
        return json({ error: 'Não foi possível concluir a operação agora.' }, 503);
      }
    },
  } },
});
