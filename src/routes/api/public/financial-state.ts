import { createFileRoute } from '@tanstack/react-router';
import { portalAuth } from '@/lib/portal-auth.server';
import { accessPolicyForUser, ACCESS_ADMIN_USER_ID, ACCESS_FEATURE_IDS } from '@/lib/access-control';
import { rejectCrossSiteRequest } from '@/lib/session-cookie.server';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const profileNames = new Set(['PF', 'PJ']);
const readFeatures = ['home.view','expenses.view','receivable.view','budgets.view','invoices.view','installments.view','timeline.view','assets.view','planning.view','reports.view','subscriptions.view','billing.view'];
function emptyFinancialState(name = 'Eu'): Record<string, unknown> {
  return { items: [], assets: [], bills: [], reimbursements: [], people: [name], peopleInBill: [name], categories: ['Alimentação','Mercado','Assinaturas','Saúde','Lazer','Transporte','Casa','Outros'], settings: { ownerName: name, usd: 0, theme: 'dark', yellowAlert: 70, redAlert: 90, hiddenMonths: [] } };
}
function monthOffset(value: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}
function normalizeProfileState(source: unknown): Record<string, unknown> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return emptyFinancialState();
  const value = source as Record<string, any>;
  const modern = Array.isArray(value.items) && Array.isArray(value.assets);
  if (modern) {
    const base = emptyFinancialState(value.settings?.ownerName || value.titular || 'Eu');
    return { ...base, ...value, settings: { ...(base.settings as Record<string, unknown>), ...(value.settings || {}) } };
  }
  const titular = value.titular || 'Eu';
  const base = emptyFinancialState(titular);
  base.legacyOriginal = value;
  const people = Array.isArray(value.people) ? value.people.map((person: any) => typeof person === 'string' ? person : person?.name).filter(Boolean) : [];
  base.people = [...new Set([titular, ...people])];
  base.peopleInBill = [titular, ...(Array.isArray(value.people) ? value.people.filter((person: any) => person && typeof person === 'object' && person.inBill).map((person: any) => person.name) : [])].filter(Boolean);
  base.categories = Array.isArray(value.cats) ? value.cats : base.categories;
  base.settings = { ...(base.settings as Record<string, unknown>), ownerName: titular, usd: value.fx?.rate || 0, usdDate: value.fx?.date, hiddenMonths: value.hidden || [], yellowAlert: (value.yellow || 0.7) * 100, redAlert: (value.red || 0.9) * 100 };
  const items: Record<string, unknown>[] = [];
  for (const [entries, kind] of [[value.incomes || [], 'income'], [value.purchases || [], 'expense']] as [any[], string][]) {
    for (const entry of entries) {
      const recurring = entry.n == null, count = recurring ? 1 : Math.max(1, Number(entry.n) || 1);
      for (let i = 0; i < count; i++) {
        const start = entry.start || value.start || new Date().toISOString().slice(0, 7), month = monthOffset(start, i);
        items.push({ id: String(entry.id) + '-' + i, sourceId: String(entry.id), kind, name: entry.desc, amount: Number(entry.valor) || 0, month, due: month, person: entry.who || titular, category: entry.cat || 'Outros', installments: recurring ? 0 : count, part: i + 1, recurring, paid: 0, notes: entry.obs || '', order: entry.ord ?? items.length, endMonth: entry.end });
      }
    }
  }
  base.items = items;
  base.bills = (value.bills || []).map((bill: any) => ({ ...bill, name: bill.desc, amount: bill.valor }));
  base.reimbursements = (value.received || []).map((row: any) => ({ ...row, person: row.who, amount: row.valor, unallocated: row.valor }));
  base.assets = (value.assets || []).map((asset: any) => ({ ...asset, bank: asset.bank || asset.name, month: asset.month || value.start, delta: asset.currency === 'USD' ? asset.balance * (value.fx?.rate || 0) : asset.balance, originalAmount: asset.balance, usdRate: asset.currency === 'USD' ? value.fx?.rate : null }));
  return base;
}
async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes || !request.body) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } catch { return null; }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => JSON.stringify(key)+':'+stable(item)).join(',') + '}';
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'undefined' : encoded;
}
function itemMap(value: unknown): Map<string, Record<string, unknown>> {
  return new Map((Array.isArray(value) ? value : []).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object').map((item,index) => [String(item.id ?? item.seriesId ?? index), item]));
}
function requiredFeatures(previous: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const required = new Set<string>();
  const beforeItems = itemMap(previous.items), afterItems = itemMap(next.items);
  const includesNewItem = [...afterItems.keys()].some(id => !beforeItems.has(id));
  for (const [id,item] of afterItems) {
    const old = beforeItems.get(id), kind = item.kind === 'income' ? 'income' : 'expense';
    if (!old) {
      required.add(kind === 'income' ? 'receivable.add' : 'expenses.add');
      if (kind === 'expense' && item.split && stable(item.split) !== stable(old?.split)) required.add('expenses.split');
      continue;
    }
    const changed = [...new Set([...Object.keys(old), ...Object.keys(item)])].filter(key => stable(old[key]) !== stable(item[key]));
    if (!changed.length) continue;
    if (changed.every(key => key === 'ord')) { if (!includesNewItem) required.add(kind === 'income' ? 'receivable.edit' : 'expenses.reorder'); }
    else if (changed.every(key => ['payments','paid','received'].includes(key))) required.add(kind === 'income' ? 'receivable.receive' : 'expenses.pay');
    else if (changed.length === 1 && changed[0] === 'cardId' && kind === 'expense') required.add('expenses.assignCard');
    else required.add(kind === 'income' ? 'receivable.edit' : 'expenses.edit');
  }
  for (const [id,item] of beforeItems) if (!afterItems.has(id)) required.add(item.kind === 'income' ? 'receivable.edit' : 'expenses.delete');

  const arrayFeatures: Record<string,string> = {
    assets:'assets.manage', bills:'invoices.bills.manage', cardStatements:'invoices.bills.manage',
    cards:'invoices.cards.manage', reimbursements:'invoices.reimbursements.manage',
    goals:'assets.goals', people:'settings.people', peopleInBill:'settings.people', categories:'settings.categories',
  };
  for (const [key,feature] of Object.entries(arrayFeatures)) if (stable(previous[key]) !== stable(next[key])) required.add(feature);

  const oldSettings = (previous.settings && typeof previous.settings === 'object' ? previous.settings : {}) as Record<string, unknown>;
  const newSettings = (next.settings && typeof next.settings === 'object' ? next.settings : {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(oldSettings), ...Object.keys(newSettings)])) {
    if (stable(oldSettings[key]) === stable(newSettings[key])) continue;
    if (key === 'monthlyBudgets') required.add('budgets.manage');
    else if (key === 'companyProfile') required.add('settings.companyFiscal');
    else if (key === 'peoplePhones') required.add('settings.people');
    else if (key === 'hiddenMonths' || key === 'theme') required.add('privacy.toggle');
    else required.add('settings.criteria');
  }
  const known = new Set(['items','assets','bills','cardStatements','cards','reimbursements','goals','people','peopleInBill','categories','settings']);
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (known.has(key) || stable(previous[key]) === stable(next[key])) continue;
    required.add('settings.criteria');
  }
  return [...required];
}

export const Route = createFileRoute('/api/public/financial-state')({
  server: { handlers: {
    GET: async ({ request }) => {
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Entre novamente para acessar seus dados.' }, 401);
      const url = new URL(request.url);
      const { data: isAdmin, error: roleError } = await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' });
      if (roleError) return json({ error: 'Não foi possível conferir suas permissões.' }, 503);
      let features: string[] = [];
      if (isAdmin) features = [...ACCESS_FEATURE_IDS];
      else {
        try { features = (await accessPolicyForUser(auth.userId)).features; }
        catch { return json({ error: 'Não foi possível carregar suas permissões.' }, 503); }
      }
      if (url.searchParams.get('history') === '1') {
        if (!isAdmin && !features.includes('account.export')) return json({ error: 'Seu nível não permite consultar o histórico.' }, 403);
        const id = auth.userId === ACCESS_ADMIN_USER_ID ? 'main' : auth.userId;
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data, error } = await supabaseAdmin.from('app_state_history').select('id,saved_at').eq('account_id', id).order('id', { ascending: false }).limit(7);
        if (error) return json({ error: 'Não foi possível carregar o histórico.' }, 503);
        return json({ rows: data || [] });
      }
      const profile = url.searchParams.get('profile') || 'PF';
      if (!profileNames.has(profile)) return json({ error: 'Perfil financeiro inválido.' }, 400);
      if (profile === 'PJ' && !isAdmin && !features.includes('profile.pj')) return json({ error: 'O perfil PJ está disponível somente para o nível autorizado.' }, 403);
      if (profile === 'PF' && !isAdmin && !readFeatures.some(feature => features.includes(feature))) return json({ error: 'Seu nível não permite consultar o perfil pessoal.' }, 403);
      const id = auth.userId === ACCESS_ADMIN_USER_ID ? 'main' : auth.userId;
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data, error } = await supabaseAdmin.from('app_state').select('json,updated_at').eq('id', id).maybeSingle();
      if (error) return json({ error: 'Não foi possível carregar os dados financeiros.' }, 503);
      let raw: Record<string, unknown> = {};
      try { raw = data?.json ? JSON.parse(data.json) as Record<string, unknown> : {}; }
      catch { return json({ error: 'Os dados financeiros estão inválidos.' }, 500); }
      const profiles = raw.financeProfiles && typeof raw.financeProfiles === 'object' ? raw.financeProfiles as Record<string, unknown> : {};
      const state = profiles[profile] || (profile === 'PF' ? raw.patrimonioApp || raw : null);
      return json({ profile, state: state || null, updated_at: data?.updated_at || null });
    },
    POST: async ({ request }) => {
      if (rejectCrossSiteRequest(request)) return json({ error: 'Origem inválida.' }, 403);
      const auth = await portalAuth(request);
      if (!auth) return json({ error: 'Entre novamente para alterar os dados.' }, 401);
      const text = await readLimitedBody(request, 5_000_000);
      if (text === null) return json({ error: 'O estado financeiro excede o limite permitido ou a solicitação está inválida.' }, 413);
      let body: { action?: string; profile?: string; state?: unknown; expectedUpdatedAt?: unknown; historyId?: unknown };
      try { body = JSON.parse(text); } catch { return json({ error: 'Solicitação inválida.' }, 400); }
      const { data: isAdmin, error: roleError } = await auth.client.rpc('has_role', { _user_id: auth.userId, _role: 'admin' });
      if (roleError) return json({ error: 'Não foi possível conferir suas permissões.' }, 503);
      let features: string[] = [];
      if (isAdmin) features = [...ACCESS_FEATURE_IDS];
      else {
        try { features = (await accessPolicyForUser(auth.userId)).features; }
        catch { return json({ error: 'Não foi possível carregar suas permissões.' }, 503); }
      }
      const profile = body.profile || 'PF';
      if (!profileNames.has(profile)) return json({ error: 'Perfil financeiro inválido.' }, 400);
      if (profile === 'PJ' && !isAdmin && !features.includes('profile.pj')) return json({ error: 'Seu nível não permite acessar o perfil PJ.' }, 403);
      const id = auth.userId === ACCESS_ADMIN_USER_ID ? 'main' : auth.userId;
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data: row, error: readError } = await supabaseAdmin.from('app_state').select('json,updated_at').eq('id', id).maybeSingle();
      if (readError) return json({ error: 'Não foi possível consultar a versão atual dos dados.' }, 503);
      if (body.action === 'restore') {
        if (!isAdmin && !features.includes('account.export')) return json({ error: 'Seu nível não permite restaurar o histórico.' }, 403);
        if (!Number.isSafeInteger(Number(body.historyId))) return json({ error: 'Versão do histórico inválida.' }, 400);
        if (typeof body.expectedUpdatedAt !== 'string' || body.expectedUpdatedAt !== row?.updated_at) return json({ error: 'Os dados mudaram em outro dispositivo. Atualize antes de restaurar.' }, 409);
        const { data: historical, error } = await supabaseAdmin.from('app_state_history').select('json').eq('id', Number(body.historyId)).eq('account_id', id).maybeSingle();
        if (error || !historical) return json({ error: 'Versão indisponível.' }, 404);
        let current: Record<string, unknown> = {}, snapshot: Record<string, unknown> = {};
        try { current = row?.json ? JSON.parse(row.json) : {}; snapshot = JSON.parse(historical.json); }
        catch { return json({ error: 'Não foi possível ler os dados do histórico.' }, 500); }
        const currentProfiles = current.financeProfiles && typeof current.financeProfiles === 'object' ? current.financeProfiles as Record<string, unknown> : {};
        const historicalProfiles = snapshot.financeProfiles && typeof snapshot.financeProfiles === 'object' ? snapshot.financeProfiles as Record<string, unknown> : {};
        const restored = historicalProfiles[profile] || (profile === 'PF' ? snapshot.patrimonioApp || snapshot : null);
        if (!restored) return json({ error: 'O histórico não contém esse perfil financeiro.' }, 404);
        current.financeProfiles = { ...currentProfiles, [profile]: restored };
        if (profile === 'PF') current.patrimonioApp = restored;
        const { data: result, error: saveError } = await supabaseAdmin.rpc('save_app_state_if_version', { p_id: id, p_json: JSON.stringify(current), p_expected_updated_at: row?.updated_at || null });
        if (saveError) return json({ error: 'Não foi possível restaurar os dados.' }, 503);
        const outcome = result as { ok?: boolean; updated_at?: string } | null;
        if (!outcome?.ok) return json({ error: 'Os dados mudaram em outro dispositivo. Atualize antes de restaurar.' }, 409);
        return json({ ok: true, updated_at: outcome.updated_at });
      }
      if (body.action !== 'save' || !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) return json({ error: 'Estado financeiro inválido.' }, 400);
      if (body.expectedUpdatedAt !== null && (typeof body.expectedUpdatedAt !== 'string' || body.expectedUpdatedAt !== row?.updated_at)) return json({ error: 'Os dados foram alterados em outro dispositivo. Recarregue e compare antes de salvar.' }, 409);
      let current: Record<string, unknown> = {};
      try { current = row?.json ? JSON.parse(row.json) : {}; } catch { return json({ error: 'Os dados financeiros atuais estão inválidos.' }, 500); }
      const currentProfiles = current.financeProfiles && typeof current.financeProfiles === 'object' ? current.financeProfiles as Record<string, unknown> : {};
      const storedProfile = currentProfiles[profile] || (profile === 'PF' ? current.patrimonioApp || current : null);
      const previousState = normalizeProfileState(storedProfile);
      const nextState = normalizeProfileState(body.state);
      const needed = requiredFeatures(previousState, nextState);
      if (!isAdmin && needed.some(feature => !features.includes(feature))) return json({ error: 'Uma ou mais alterações não estão autorizadas para seu nível.' }, 403);
      current.financeProfiles = { ...currentProfiles, [profile]: nextState };
      if (profile === 'PF') current.patrimonioApp = nextState;
      const { data: result, error: saveError } = await supabaseAdmin.rpc('save_app_state_if_version', { p_id: id, p_json: JSON.stringify(current), p_expected_updated_at: row?.updated_at || null });
      if (saveError) return json({ error: 'Não foi possível salvar os dados.' }, 503);
      const outcome = result as { ok?: boolean; updated_at?: string } | null;
      if (!outcome?.ok) return json({ error: 'Os dados foram alterados em outro dispositivo. Atualize e compare antes de salvar.' }, 409);
      return json({ ok: true, updated_at: outcome.updated_at });
    },
  } },
});
