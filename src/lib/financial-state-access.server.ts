type State = Record<string, any>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function validCnpj(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits) || /^([0-9])\1{13}$/.test(digits)) return false;
  const check = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = check(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = check(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

export function validateFinancialState(before: State, after: State) {
  const oldProfile = before?.financeProfiles?.PJ || {};
  const nextProfile = after?.financeProfiles?.PJ || {};
  const oldCompany = oldProfile.settings?.companyProfile || {};
  const company = nextProfile.settings?.companyProfile || {};
  if (!same(oldCompany.cnpj, company.cnpj) && String(company.cnpj || '').trim() && !validCnpj(company.cnpj))
    return 'Informe um CNPJ válido, incluindo os dígitos verificadores.';
  if (!same(oldCompany.dueDay, company.dueDay) && company.dueDay != null && (!Number.isInteger(Number(company.dueDay)) || Number(company.dueDay) < 1 || Number(company.dueDay) > 31))
    return 'O dia padrão de vencimento deve ficar entre 1 e 31.';
  if (!same(oldCompany.legalName, company.legalName) && String(company.legalName || '').length > 150)
    return 'A razão social ultrapassa o limite permitido.';
  if (!same(oldCompany.tradeName, company.tradeName) && String(company.tradeName || '').length > 100)
    return 'O nome fantasia ultrapassa o limite permitido.';
  if (!same(oldCompany.pixKey, company.pixKey) && String(company.pixKey || '').length > 120)
    return 'A chave Pix ultrapassa o limite permitido.';
  const oldItems = new Map((oldProfile.items || []).map((item: State) => [String(item.id), item]));
  for (const item of nextProfile.items || []) {
    const previous = oldItems.get(String(item.id));
    if (previous && same(previous, item)) continue;
    if (item.kind === 'income' && item.invoiceStatus && !['yes', 'no', 'not_applicable'].includes(item.invoiceStatus))
      return 'Selecione uma situação válida para a nota fiscal.';
    if (String(item.counterparty || '').length > 150) return 'O nome do cliente ultrapassa o limite permitido.';
    if (String(item.costCenter || '').length > 80) return 'O centro de custo ultrapassa o limite permitido.';
    if (String(item.documentReference || '').length > 120) return 'O documento de referência ultrapassa o limite permitido.';
  }
  return null;
}

function itemFeatures(before: State[], after: State[]) {
  const required = new Set<string>();
  const oldById = new Map(before.map(item => [String(item.id), item]));
  const newById = new Map(after.map(item => [String(item.id), item]));
  const addFeature = (item: State) => required.add(item.kind === 'income' ? 'receivable.add' : 'expenses.add');

  for (const [id, oldItem] of oldById) {
    const newItem = newById.get(id);
    if (!newItem) {
      required.add(oldItem.kind === 'income' ? 'receivable.edit' : 'expenses.delete');
      continue;
    }
    if (oldItem.kind !== newItem.kind) {
      required.add(oldItem.kind === 'income' ? 'receivable.edit' : 'expenses.delete');
      addFeature(newItem);
      continue;
    }
    const changed = new Set([...Object.keys(oldItem), ...Object.keys(newItem)].filter(key => !same(oldItem[key], newItem[key])));
    if (changed.size === 0) continue;
    const income = oldItem.kind === 'income';
    if (['paid', 'payments', 'received', 'receivedAt', 'paidAt', 'paymentHistory'].some(key => changed.has(key)))
      required.add(income ? 'receivable.receive' : 'expenses.pay');
    if (['ord', 'order', 'sortOrder'].some(key => changed.has(key)))
      required.add(income ? 'receivable.edit' : 'expenses.reorder');
    if (changed.has('cardId')) required.add('expenses.assignCard');
    if (['split', 'splits', 'splitWith', 'shares'].some(key => changed.has(key))) required.add('expenses.split');
    const nonPaymentChanges = [...changed].some(key => !['paid', 'payments', 'received', 'receivedAt', 'paidAt', 'paymentHistory', 'ord', 'order', 'sortOrder', 'cardId', 'split', 'splits', 'splitWith', 'shares'].includes(key));
    if (nonPaymentChanges) required.add(income ? 'receivable.edit' : 'expenses.edit');
  }
  for (const [id, item] of newById) if (!oldById.has(id)) addFeature(item);
  return required;
}

function settingsFeature(key: string) {
  if (key === 'monthlyBudgets') return 'budgets.manage';
  if (key === 'companyProfile') return 'settings.companyFiscal';
  if (['people', 'peopleInBill', 'personPhones', 'whatsappByPerson', 'pixByPerson'].includes(key)) return 'settings.people';
  if (['hiddenValues', 'privacyHidden'].includes(key)) return 'privacy.toggle';
  if (key === 'assetGoals' || key === 'goals') return 'assets.goals';
  return 'settings.criteria';
}

function profileChanges(before: State, after: State) {
  const required = new Set<string>();
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (same(before?.[key], after?.[key])) continue;
    if (key === 'items') {
      for (const feature of itemFeatures(before?.items || [], after?.items || [])) required.add(feature);
    } else if (key === 'assets') required.add('assets.manage');
    else if (key === 'bills') required.add('invoices.bills.manage');
    else if (key === 'cards') required.add('invoices.cards.manage');
    else if (key === 'reimbursements') required.add('invoices.reimbursements.manage');
    else if (key === 'categories') required.add('settings.categories');
    else if (key === 'people' || key === 'peopleInBill') required.add('settings.people');
    else if (key === 'settings') {
      const oldSettings = before?.settings || {}, newSettings = after?.settings || {};
      for (const setting of new Set([...Object.keys(oldSettings), ...Object.keys(newSettings)]))
        if (!same(oldSettings[setting], newSettings[setting])) required.add(settingsFeature(setting));
    } else if (key !== 'legacyOriginal') required.add('settings.criteria');
  }
  return required;
}

export function requiredStateFeatures(before: State, after: State) {
  const required = new Set<string>();
  const beforeProfiles = before?.financeProfiles || { PF: before?.patrimonioApp || before };
  const afterProfiles = after?.financeProfiles || { PF: after?.patrimonioApp || after };
  for (const profile of ['PF', 'PJ']) {
    if (same(beforeProfiles[profile], afterProfiles[profile])) continue;
    if (profile === 'PJ') required.add('profile.pj');
    for (const feature of profileChanges(beforeProfiles[profile] || {}, afterProfiles[profile] || {})) required.add(feature);
  }
  return [...required];
}

function filteredProfile(profile: State, features: Set<string>): State {
  const result: State = structuredClone(profile || {});
  if (Array.isArray(result.items)) {
    result.items = result.items.filter((item: State) => item.kind === 'income' ? features.has('receivable.view') : features.has('expenses.view'));
  }
  if (!features.has('assets.view')) result.assets = [];
  if (!features.has('invoices.view')) {
    result.bills = [];
    result.cards = [];
    result.reimbursements = [];
  }
  if (!features.has('budgets.view') && result.settings) delete result.settings.monthlyBudgets;
  return result;
}

export function sanitizeFinancialState(source: State, features: Set<string>) {
  const raw = source || {};
  const profiles = raw.financeProfiles || { PF: raw.patrimonioApp || raw };
  const financeProfiles: State = { PF: filteredProfile(profiles.PF || {}, features) };
  if (features.has('profile.pj') && profiles.PJ) financeProfiles.PJ = filteredProfile(profiles.PJ, features);
  return { v: raw.v, financeProfiles, patrimonioApp: financeProfiles.PF };
}

function mergeProfile(oldProfile: State, incoming: State, features: Set<string>): State {
  const old = oldProfile || {}, next: State = { ...old, ...incoming };
  if (Array.isArray(old.items) && Array.isArray(incoming.items)) {
    const visible = (item: State) => item.kind === 'income' ? features.has('receivable.view') : features.has('expenses.view');
    const incomingIds = new Set(incoming.items.map((item: State) => String(item.id)));
    next.items = [
      ...old.items.filter((item: State) => !visible(item) || !incomingIds.has(String(item.id))),
      ...incoming.items,
    ];
  }
  for (const [key, feature] of [['assets', 'assets.view'], ['bills', 'invoices.view'], ['cards', 'invoices.view'], ['reimbursements', 'invoices.view']] as const) {
    if (!features.has(feature) || !Array.isArray(incoming[key])) next[key] = old[key] || [];
  }
  if (old.settings || incoming.settings) {
    next.settings = { ...(old.settings || {}), ...(incoming.settings || {}) };
    if (!features.has('budgets.view') && old.settings?.monthlyBudgets) next.settings.monthlyBudgets = old.settings.monthlyBudgets;
  }
  return next;
}

export function mergeFinancialState(oldState: State, incoming: State, features: Set<string>) {
  if (features.has('admin.all')) return incoming;
  const old = oldState || {}, next: State = { ...old };
  const oldProfiles = old.financeProfiles || { PF: old.patrimonioApp || old };
  const incomingProfiles = incoming?.financeProfiles || { PF: incoming?.patrimonioApp || incoming };
  next.financeProfiles = { ...oldProfiles };
  next.financeProfiles.PF = mergeProfile(oldProfiles.PF || {}, incomingProfiles.PF || {}, features);
  if (features.has('profile.pj')) next.financeProfiles.PJ = mergeProfile(oldProfiles.PJ || {}, incomingProfiles.PJ || {}, features);
  next.patrimonioApp = next.financeProfiles.PF;
  return next;
}
