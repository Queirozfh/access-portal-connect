export const ACCESS_FEATURE_GROUPS = [
  { id: 'home', label: 'Visão geral', features: [{ id: 'home.view', label: 'Abrir fluxo de caixa / início', minLevel: 1 }] },
  { id: 'budgets', label: 'Orçamento mensal', features: [
    { id: 'budgets.view', label: 'Consultar orçamento por categoria', minLevel: 1 },
    { id: 'budgets.manage', label: 'Definir limites mensais por categoria', minLevel: 2 },
  ] },
  { id: 'receivables', label: 'A receber', features: [
    { id: 'receivable.view', label: 'Consultar contas e valores a receber', minLevel: 1 },
    { id: 'receivable.add', label: 'Cadastrar recebimentos e faturamento', minLevel: 2 },
    { id: 'receivable.edit', label: 'Editar recebimentos', minLevel: 2 },
    { id: 'receivable.receive', label: 'Registrar recebimento / reembolso', minLevel: 2 },
  ] },
  { id: 'billing', label: 'Cobranças', features: [
    { id: 'billing.view', label: 'Abrir cobrança por pessoa e extrato acumulado', minLevel: 2 },
    { id: 'receivable.ledger', label: 'Consultar extrato por pessoa / cliente', minLevel: 2 },
    { id: 'receivable.receipt', label: 'Gerar recibo de quitação', minLevel: 3 },
    { id: 'receivable.whatsapp', label: 'Cobrar ou compartilhar pelo WhatsApp', minLevel: 3 },
  ] },
  { id: 'expenses', label: 'Despesas e assinaturas', features: [
    { id: 'expenses.view', label: 'Consultar despesas', minLevel: 1 },
    { id: 'expenses.add', label: 'Cadastrar despesas', minLevel: 2 },
    { id: 'expenses.quick', label: 'Usar lançamento rápido', minLevel: 2 },
    { id: 'expenses.edit', label: 'Editar despesas', minLevel: 2 },
    { id: 'expenses.pay', label: 'Registrar pagamento', minLevel: 2 },
    { id: 'expenses.delete', label: 'Excluir uma despesa', minLevel: 3 },
    { id: 'expenses.bulkDelete', label: 'Excluir várias despesas', minLevel: 4 },
    { id: 'expenses.assignCard', label: 'Vincular despesas a cartão', minLevel: 3 },
    { id: 'expenses.split', label: 'Dividir despesa por rateio', minLevel: 3 },
    { id: 'expenses.reorder', label: 'Reordenar despesas', minLevel: 3 },
    { id: 'subscriptions.view', label: 'Abrir radar de assinaturas', minLevel: 2 },
  ] },
  { id: 'invoices', label: 'Faturas e cartões', features: [
    { id: 'invoices.view', label: 'Consultar faturas e recebimentos', minLevel: 2 },
    { id: 'invoices.bills.manage', label: 'Cadastrar, pagar e editar faturas', minLevel: 3 },
    { id: 'invoices.cards.manage', label: 'Cadastrar e administrar cartões', minLevel: 3 },
    { id: 'invoices.reimbursements.manage', label: 'Administrar reembolsos e acertos', minLevel: 3 },
  ] },
  { id: 'commitments', label: 'Compras e linha do tempo', features: [
    { id: 'installments.view', label: 'Consultar compras e parcelas', minLevel: 2 },
    { id: 'installments.reorder', label: 'Reordenar compras e parcelas', minLevel: 3 },
    { id: 'timeline.view', label: 'Consultar linha do tempo', minLevel: 2 },
  ] },
  { id: 'assets', label: 'Patrimônio', features: [
    { id: 'assets.view', label: 'Consultar saldos e alocação', minLevel: 3 },
    { id: 'assets.manage', label: 'Cadastrar e editar movimentações', minLevel: 4 },
    { id: 'assets.goals', label: 'Administrar metas financeiras', minLevel: 4 },
    { id: 'assets.emergencyReserve', label: 'Consultar reserva e cobertura de caixa', minLevel: 4 },
    { id: 'assets.passiveIncome', label: 'Consultar projeção de renda passiva', minLevel: 4 },
  ] },
  { id: 'planning', label: 'Calculadoras', features: [
    { id: 'planning.view', label: 'Abrir calculadoras', minLevel: 3 },
    { id: 'planning.analyze', label: 'Analisar compra planejada com IA', minLevel: 4 },
    { id: 'planning.compound', label: 'Simular juros compostos', minLevel: 4 },
    { id: 'planning.vehicleSimulator', label: 'Simular financiamento e troca de veículo', minLevel: 4 },
  ] },
  { id: 'reports', label: 'Relatórios', features: [
    { id: 'reports.view', label: 'Consultar relatórios e DRE', minLevel: 3 },
    { id: 'reports.export', label: 'Imprimir ou exportar relatórios', minLevel: 4 },
  ] },
  { id: 'settings', label: 'Ajustes e conta', features: [
    { id: 'settings.view', label: 'Abrir Ajustes', minLevel: 4 },
    { id: 'settings.people', label: 'Administrar pessoas, clientes e fornecedores', minLevel: 4 },
    { id: 'settings.categories', label: 'Administrar categorias', minLevel: 4 },
    { id: 'settings.criteria', label: 'Alterar critérios e metas financeiras', minLevel: 4 },
    { id: 'settings.companyFiscal', label: 'Editar dados fiscais da empresa', minLevel: 5 },
    { id: 'settings.security', label: 'Alterar opções de segurança', minLevel: 5 },
    { id: 'account.export', label: 'Baixar ou restaurar cópia dos dados', minLevel: 5 },
    { id: 'profile.pj', label: 'Acessar perfil financeiro PJ (exclusivo nível 5)', minLevel: 5 },
    { id: 'privacy.toggle', label: 'Ocultar ou exibir valores', minLevel: 1 },
  ] },
] as const;

export const ACCESS_FEATURES = ACCESS_FEATURE_GROUPS.flatMap(group => group.features);
export const ACCESS_FEATURE_IDS = ACCESS_FEATURES.map(feature => feature.id);
export const ACCESS_LEVEL_LABELS: Record<number, string> = {
  1: 'Básico', 2: 'Essencial', 3: 'Intermediário', 4: 'Avançado', 5: 'Completo',
};
export const ALL_ACCESS_FEATURES = [...ACCESS_FEATURE_IDS];
export const ACCESS_ADMIN_USER_ID = 'ad46a5e7-af23-4cff-b190-ea6b6140013d';
export const ACCESS_POLICY_VERSION = 2;

export const SELF_SERVICE_SIGNUP_CUTOFF = '2026-11-24T00:00:00.000Z';

export function defaultUserAccessLevel(createdAt?: string): number {
  return createdAt && Date.parse(createdAt) >= Date.parse(SELF_SERVICE_SIGNUP_CUTOFF) ? 1 : 5;
}

export function defaultAccessFeatures(level: number): string[] {
  const safeLevel = Math.max(1, Math.min(5, Math.floor(level || 1)));
  return ACCESS_FEATURES.filter(feature => feature.minLevel <= safeLevel).map(feature => feature.id);
}

export async function configuredAccessFeatures(level: number): Promise<string[]> {
  const safeLevel = Math.max(1, Math.min(5, Math.floor(level || 1)));
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(ACCESS_ADMIN_USER_ID);
  if (error || !data.user) throw error || new Error('Administrador principal não encontrado.');
  const metadata = data.user.app_metadata as
    | { access_policies?: Array<{ level: number; features: string[] }>; access_policy_version?: number }
    | undefined;
  const policy = metadata?.access_policies?.find(item => Number(item.level) === safeLevel);
  const features = new Set(
    (Array.isArray(policy?.features) ? policy.features : defaultAccessFeatures(safeLevel)).filter(
      (feature): feature is (typeof ACCESS_FEATURE_IDS)[number] =>
        typeof feature === 'string' && (ACCESS_FEATURE_IDS as readonly string[]).includes(feature),
    ),
  );
  if ((Number(metadata?.access_policy_version) || 1) < ACCESS_POLICY_VERSION) {
    features.add('budgets.view');
    if (safeLevel >= 2) features.add('budgets.manage');
  }
  if (safeLevel === 5) for (const feature of ACCESS_FEATURE_IDS) features.add(feature);
  return ACCESS_FEATURES.filter(feature => features.has(feature.id)).map(feature => feature.id);
}

export async function accessPolicyForUser(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const [{ data: target, error: targetError }, { data: admin, error: adminError }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.auth.admin.getUserById(ACCESS_ADMIN_USER_ID),
  ]);
  if (targetError || !target.user) throw targetError || new Error('Usuário não encontrado.');
  if (adminError || !admin.user) throw adminError || new Error('Administrador principal não encontrado.');
  const metadata = target.user.app_metadata as { access_level?: number } | undefined;
  let subscribedLevel: number | null = null;
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status, expires_at, access_level_override')
    .eq('user_id', userId)
    .maybeSingle();
  if (
    subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now())
  ) {
    if (subscription.access_level_override) subscribedLevel = subscription.access_level_override;
    else if (subscription.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('subscription_plans')
        .select('access_level')
        .eq('id', subscription.plan_id)
        .maybeSingle();
      if (plan) subscribedLevel = plan.access_level;
    }
  }
  // Accounts predating self-service registration retain their legacy full access.
  const fallbackLevel = defaultUserAccessLevel(target.user.created_at);
  const level = Math.max(1, Math.min(5, subscribedLevel || Number(metadata?.access_level) || fallbackLevel));
  const adminMetadata = admin.user.app_metadata as { access_policies?: Array<{ level: number; features: string[] }>; access_policy_version?: number } | undefined;
  const policy = adminMetadata?.access_policies?.find(item => Number(item.level) === level);
  const features = Array.isArray(policy?.features)
    ? policy.features.filter((feature): feature is (typeof ACCESS_FEATURE_IDS)[number] =>
      typeof feature === 'string' && (ACCESS_FEATURE_IDS as readonly string[]).includes(feature))
    : defaultAccessFeatures(level);
  if ((Number(adminMetadata?.access_policy_version) || 1) < ACCESS_POLICY_VERSION) {
    if (!features.includes('budgets.view')) features.push('budgets.view');
    if (level >= 2 && !features.includes('budgets.manage')) features.push('budgets.manage');
  }
  if (level === 5 && !features.includes('profile.pj')) features.push('profile.pj');
  return { level, features };
}
