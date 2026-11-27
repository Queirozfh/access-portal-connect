import { ACCESS_FEATURE_IDS, defaultUserAccessLevel } from '@/lib/access-control';

export type BusinessWorkspaceRole = 'owner' | 'admin' | 'finance' | 'collaborator' | 'accountant';

const accountantFeatures = [
  'home.view', 'budgets.view', 'receivable.view', 'billing.view', 'receivable.ledger',
  'expenses.view', 'subscriptions.view', 'invoices.view', 'installments.view', 'timeline.view',
  'assets.view', 'planning.view', 'reports.view', 'reports.export', 'privacy.toggle', 'profile.pj',
];
const collaboratorFeatures = [
  'home.view', 'budgets.view', 'receivable.view', 'receivable.add', 'expenses.view', 'expenses.add',
  'expenses.quick', 'invoices.view', 'installments.view', 'timeline.view', 'privacy.toggle', 'profile.pj',
];

export function featuresForWorkspaceRole(role: BusinessWorkspaceRole) {
  if (role === 'owner' || role === 'admin') return [...ACCESS_FEATURE_IDS];
  if (role === 'finance') return ACCESS_FEATURE_IDS.filter(id => !['settings.security', 'account.export'].includes(id));
  if (role === 'accountant') return accountantFeatures;
  return collaboratorFeatures;
}

export async function userIsAdmin(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('user_roles').select('role')
    .eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function businessPlanForOwner(ownerUserId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const admin = await userIsAdmin(ownerUserId);
  if (admin) return { active: true, accessLevel: 5, memberLimit: 5, admin: true };
  const [{ data: subscription, error }, { data: authData, error: authError }] = await Promise.all([
    supabaseAdmin.from('user_subscriptions')
      .select('plan_id, status, expires_at, access_level_override')
      .eq('user_id', ownerUserId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(ownerUserId),
  ]);
  if (error) throw error;
  if (authError || !authData.user) throw authError || new Error('Titular do espaço não encontrado.');
  const metadata = authData.user.app_metadata as { access_level?: number; expires_at?: string } | undefined;
  const metadataExpiryActive = !metadata?.expires_at || Date.parse(metadata.expires_at) > Date.now();
  if (!subscription) {
    const accessLevel = Number(metadata?.access_level) || defaultUserAccessLevel(authData.user.created_at);
    return {
      active: accessLevel === 5 && metadataExpiryActive,
      accessLevel,
      memberLimit: accessLevel === 5 ? 5 : 1,
      admin: false,
    };
  }
  let plan: { access_level: number; member_limit: number } | null = null;
  if (subscription?.plan_id) {
    const result = await supabaseAdmin.from('subscription_plans')
      .select('access_level, member_limit').eq('id', subscription.plan_id).maybeSingle();
    if (result.error) throw result.error;
    plan = result.data;
  }
  const accessLevel = Number(subscription?.access_level_override || plan?.access_level || 0);
  const active = Boolean(subscription && ['active', 'trialing'].includes(subscription.status)
    && (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now())
    && metadataExpiryActive
    && accessLevel === 5);
  return { active, accessLevel, memberLimit: Math.min(500, Math.max(1, Number(plan?.member_limit) || 1)), admin: false };
}

export async function businessWorkspaceContext(workspaceId: string, userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: membership, error: memberError } = await supabaseAdmin.from('business_workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (memberError) throw memberError;
  if (!membership) return null;
  const { data: workspace, error: workspaceError } = await supabaseAdmin.from('business_workspaces')
    .select('id, owner_user_id, name').eq('id', workspaceId).maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) return null;
  const entitlement = await businessPlanForOwner(workspace.owner_user_id);
  if (!entitlement.active) return { workspace, role: membership.role as BusinessWorkspaceRole, features: [], entitlement, unavailable: true };
  return {
    workspace,
    role: membership.role as BusinessWorkspaceRole,
    features: featuresForWorkspaceRole(membership.role as BusinessWorkspaceRole),
    entitlement,
    unavailable: false,
  };
}
