/* Company workspaces: shared PJ data with server-enforced membership roles. */
let businessWorkspaceCatalog = { workspaces: [], invitations: [], canCreate: false, defaultMemberLimit: 1 };
let businessWorkspaceLoadError = '';
const workspaceRoleLabels = { owner: 'Titular', admin: 'Administrador', finance: 'Financeiro', collaborator: 'Colaborador', accountant: 'Contador · somente leitura' };
const workspaceAssignableRoles = ['admin', 'finance', 'collaborator', 'accountant'];

function showBusinessWorkspaceNav() {
  const nav = document.querySelector('#businessWorkspacesNav');
  if (nav) nav.hidden = false;
}
async function businessWorkspaceCall(method = 'GET', body = null) {
  const response = await fetch('/api/public/business-workspaces', {
    method,
    headers: { Authorization: 'Bearer ' + await cloudToken(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}

function applyBusinessWorkspaceRole(workspace) {
  if (!workspace || !authUser) return;
  authUser.accessLevel = 5;
  authUser.features = workspace.role === 'owner' || workspace.role === 'admin'
    ? [...ACCESS_UI_ALL]
    : workspace.role === 'finance'
      ? ACCESS_UI_ALL.filter(id => !['settings.security', 'account.export'].includes(id))
      : workspace.role === 'accountant'
        ? ['home.view','budgets.view','receivable.view','billing.view','receivable.ledger','expenses.view','subscriptions.view','invoices.view','installments.view','timeline.view','assets.view','planning.view','reports.view','reports.export','privacy.toggle','profile.pj']
        : ['home.view','budgets.view','receivable.view','receivable.add','expenses.view','expenses.add','expenses.quick','invoices.view','installments.view','timeline.view','privacy.toggle','profile.pj'];
  authUser.workspaceRole = workspace.role;
  localStorage.setItem('cdm-user-cache', JSON.stringify(authUser));
  applyFeatureAccess();
  ensureFinanceProfileToggle();
}

async function loadBusinessWorkspaceCatalog() {
  if (!authUser) return businessWorkspaceCatalog;
  try {
    const catalog = await businessWorkspaceCall();
    const previousKey = 'cdm-business-workspace-ids-' + authUser.id;
    let previousIds = [];
    try { previousIds = JSON.parse(localStorage.getItem(previousKey) || '[]'); } catch {}
    const availableIds = new Set((catalog.workspaces || []).map(workspace => workspace.id));
    for (const removedId of previousIds) {
      if (availableIds.has(removedId)) continue;
      localStorage.removeItem('meu-patrimonio-' + authUser.id + '-workspace-' + removedId + '-PJ');
      localStorage.removeItem('cdm-pending-state-business-' + removedId + '-' + authUser.id);
    }
    localStorage.setItem(previousKey, JSON.stringify([...availableIds]));
    businessWorkspaceCatalog = catalog;
    businessWorkspaceLoadError = '';
    const activeKey = 'cdm-active-business-workspace-' + authUser.id;
    const savedId = localStorage.getItem(activeKey);
    const selected = (catalog.workspaces || []).find(workspace => workspace.id === savedId && workspace.billingActive);
    if (selected) {
      activeBusinessWorkspaceId = selected.id;
      activeFinanceProfile = 'PJ';
      applyBusinessWorkspaceRole(selected);
    } else {
      activeBusinessWorkspaceId = null;
      if (savedId) localStorage.removeItem(activeKey);
      delete authUser.workspaceRole;
    }
    showBusinessWorkspaceNav();
    return catalog;
  } catch (error) {
    businessWorkspaceCatalog = { workspaces: [], invitations: [], canCreate: false, defaultMemberLimit: 1 };
    businessWorkspaceLoadError = error?.message || 'Espaços empresariais indisponíveis.';
    activeBusinessWorkspaceId = localStorage.getItem('cdm-active-business-workspace-' + authUser.id) || null;
    showBusinessWorkspaceNav();
    return businessWorkspaceCatalog;
  }
}

const personalReadCloudState = readCloudState;
readCloudState = async function() {
  if (authUser) await loadBusinessWorkspaceCatalog();
  const result = await personalReadCloudState();
  if (activeBusinessWorkspaceId) {
    const selected = businessWorkspaceCatalog.workspaces.find(workspace => workspace.id === activeBusinessWorkspaceId);
    if (selected) applyBusinessWorkspaceRole(selected);
  }
  return result;
};

const personalLoadFeatureAccess = loadFeatureAccess;
loadFeatureAccess = async function() {
  const result = await personalLoadFeatureAccess();
  if (activeBusinessWorkspaceId) {
    const selected = businessWorkspaceCatalog.workspaces.find(workspace => workspace.id === activeBusinessWorkspaceId);
    if (selected) applyBusinessWorkspaceRole(selected);
  } else if (authUser) {
    delete authUser.workspaceRole;
    localStorage.setItem('cdm-user-cache', JSON.stringify(authUser));
  }
  showBusinessWorkspaceNav();
  return result;
};

const personalOfflineSession = startOfflineSession;
startOfflineSession = function() {
  // Shared financial workspaces require a fresh server membership check; do not open their cache offline.
  if (localStorage.getItem('cdm-active-business-workspace-' + (authUser?.id || (() => { try { return JSON.parse(localStorage.getItem('cdm-user-cache') || '{}').id; } catch { return ''; } })()))) return false;
  return personalOfflineSession();
};

async function selectBusinessWorkspace(workspaceId) {
  if (!authUser) return;
  if (!navigator.onLine) { toast('Conecte-se à internet para validar o acesso ao espaço empresarial.'); return; }
  const workspace = businessWorkspaceCatalog.workspaces.find(item => item.id === workspaceId);
  if (!workspace?.billingActive) { toast('O plano do titular precisa estar ativo para acessar este espaço.'); return; }
  if (activeBusinessWorkspaceId === workspace.id) { setPage('empresas'); return; }
  if (!await flushBusinessWorkspaceChanges()) return;
  activeBusinessWorkspaceId = workspace.id;
  activeFinanceProfile = 'PJ';
  stateConflict = false;
  stateUpdatedAt = null;
  localStorage.setItem('cdm-active-business-workspace-' + authUser.id, workspace.id);
  localStorage.setItem('cdm-last-business-workspace-' + authUser.id, workspace.id);
  applyBusinessWorkspaceRole(workspace);
  await personalReadCloudState();
  applyTheme();
  setPage('empresas');
  toast('Espaço empresarial compartilhado aberto.');
}

async function leaveBusinessWorkspace(targetProfile = 'PF') {
  if (!activeBusinessWorkspaceId || !authUser) return;
  if (!await flushBusinessWorkspaceChanges()) return;
  activeBusinessWorkspaceId = null;
  localStorage.removeItem('cdm-active-business-workspace-' + authUser.id);
  activeFinanceProfile = targetProfile;
  localStorage.setItem('cdm-active-finance-profile-' + authUser.id, targetProfile);
  stateConflict = false;
  stateUpdatedAt = null;
  await personalLoadFeatureAccess();
  await personalReadCloudState();
  applyTheme();
  render();
}

async function flushBusinessWorkspaceChanges() {
  if (!backendSyncEnabled || !navigator.onLine) {
    toast('Conecte-se para sincronizar as alterações antes de trocar de espaço.');
    return false;
  }
  save();
  await flushPendingState();
  if (stateConflict || localStorage.getItem('cdm-pending-state-' + accountRow)) {
    toast('Ainda há alterações sem sincronizar. Resolva a sincronização antes de trocar de espaço.');
    return false;
  }
  return true;
}

const personalSwitchFinanceProfile = switchFinanceProfile;
switchFinanceProfile = async function(profile) {
  if (activeBusinessWorkspaceId && profile === 'PF') return leaveBusinessWorkspace('PF');
  return personalSwitchFinanceProfile(profile);
};

function businessWorkspaceMemberMarkup(workspace, member) {
  const manager = ['owner', 'admin'].includes(workspace.role);
  const roles = workspaceAssignableRoles.map(role => `<option value="${role}" ${member.role === role ? 'selected' : ''}>${esc(workspaceRoleLabels[role])}</option>`).join('');
  const controls = manager && member.role !== 'owner'
    ? `<label class="workspace-member-role"><span class="sr-only">Função de ${esc(member.name)}</span><select data-workspace-role="${esc(workspace.id)}" data-user-id="${esc(member.id)}">${roles}</select></label><button type="button" class="mini-btn workspace-remove-member" data-workspace-remove="${esc(workspace.id)}" data-user-id="${esc(member.id)}">Remover</button>`
    : `<span class="workspace-role-pill">${esc(workspaceRoleLabels[member.role] || member.role)}</span>`;
  return `<div class="workspace-member"><span class="workspace-avatar" aria-hidden="true">${esc((member.name || member.email || '?').trim().slice(0,1).toUpperCase())}</span><span class="workspace-member-copy"><strong>${esc(member.name || 'Usuário')}</strong><small>${esc(member.email)}</small></span>${controls}</div>`;
}

function businessWorkspacePage() {
  const catalog = businessWorkspaceCatalog;
  const active = catalog.workspaces.find(workspace => workspace.id === activeBusinessWorkspaceId);
  const plans = catalog.workspaces.map(workspace => `<article class="workspace-card ${workspace.id === activeBusinessWorkspaceId ? 'selected' : ''}"><div class="workspace-card-copy"><span class="workspace-kicker">${esc(workspaceRoleLabels[workspace.role] || workspace.role)}</span><h3>${esc(workspace.name)}</h3><p>${workspace.memberCount} de ${workspace.memberLimit} usuários · ${workspace.billingActive ? 'plano ativo' : 'plano suspenso'}</p></div><button type="button" class="btn ${workspace.id === activeBusinessWorkspaceId ? 'secondary' : 'primary'}" data-workspace-select="${esc(workspace.id)}" ${workspace.billingActive ? '' : 'disabled'}>${workspace.id === activeBusinessWorkspaceId ? 'Aberto' : 'Abrir empresa'}</button></article>`).join('');
  const invitations = (catalog.invitations || []).map(invite => `<article class="workspace-invitation"><div><strong>${esc(invite.workspaceName)}</strong><p>${esc(invite.invitedBy)} convidou você como <b>${esc(workspaceRoleLabels[invite.role] || invite.role)}</b>.</p><small>Convite válido até ${esc(new Date(invite.expiresAt).toLocaleDateString('pt-BR'))}</small><p class="workspace-invitation-privacy">O convite libera somente os dados PJ deste espaço. Os dados PF do titular não são compartilhados.</p></div><div class="workspace-card-actions"><button type="button" class="btn primary" data-workspace-accept="${esc(invite.id)}">Aceitar</button><button type="button" class="btn secondary" data-workspace-decline="${esc(invite.id)}">Recusar</button></div></article>`).join('');
  const create = catalog.canCreate ? `<section class="card workspace-create-card"><div class="section-head"><div><h2>Criar espaço empresarial</h2><p>Convide a equipe e centralize os registros do CNPJ em um ambiente compartilhado, separado do perfil pessoal.</p></div><span class="stat-icon">＋</span></div><form id="businessWorkspaceCreateForm" class="workspace-create-form"><div class="field"><label for="businessWorkspaceName">Nome do espaço</label><input id="businessWorkspaceName" name="name" maxlength="120" placeholder="Ex.: Empresa Silva" required></div><div class="workspace-seat-note">Seu plano comporta até <strong>${Number(catalog.defaultMemberLimit) || 1} usuários</strong>, contando com o titular. Os dados PJ existentes serão copiados para o espaço; o perfil pessoal permanece separado.</div><button type="submit" class="btn primary">Criar espaço</button></form></section>` : '';
  let detail = '';
  if (active) {
    const manager = ['owner', 'admin'].includes(active.role);
    const memberRows = (active.members || []).map(member => businessWorkspaceMemberMarkup(active, member)).join('') || '<div class="empty">Nenhum membro foi encontrado.</div>';
    const inviteRows = (active.invitations || []).map(invite => `<div class="workspace-pending-invite"><span><strong>${esc(invite.invited_email)}</strong><small>Convite para ${esc(workspaceRoleLabels[invite.role] || invite.role)} · expira ${esc(new Date(invite.expires_at).toLocaleDateString('pt-BR'))}</small></span><span class="workspace-role-pill">Pendente</span></div>`).join('');
    detail = `<section class="card workspace-detail"><div class="section-head"><div><span class="workspace-kicker">ESPAÇO ATIVO · ${esc(workspaceRoleLabels[active.role] || active.role)}</span><h2>${esc(active.name)}</h2><p>Este espaço mostra somente os dados PJ da empresa. Os dados PF do titular ficam fora do compartilhamento.</p></div><button type="button" class="btn secondary" id="leaveBusinessWorkspace">Abrir meu perfil pessoal</button></div>${manager ? `<form id="businessWorkspaceRenameForm" class="workspace-rename-form"><div class="field"><label for="businessWorkspaceRename">Nome do espaço</label><input id="businessWorkspaceRename" name="name" maxlength="120" value="${esc(active.name)}" required></div><button type="submit" class="btn secondary">Salvar nome</button></form><form id="businessWorkspaceInviteForm" class="workspace-invite-form"><div class="field"><label for="businessInviteEmail">Convidar por e-mail</label><input id="businessInviteEmail" name="email" type="email" maxlength="255" placeholder="nome@empresa.com" required></div><div class="field"><label for="businessInviteRole">Função</label><select id="businessInviteRole" name="role"><option value="finance">Financeiro</option><option value="collaborator">Colaborador</option><option value="accountant">Contador · somente leitura</option><option value="admin">Administrador</option></select></div><button type="submit" class="btn primary">Enviar convite</button><small>O convite fica vinculado ao e-mail informado e aparece quando a pessoa entrar no aplicativo. Ele concede acesso somente a este espaço PJ; a conta PF do titular nunca é compartilhada.</small></form>` : ''}<div class="workspace-members-heading"><div><h3>Equipe</h3><p>${active.memberCount} de ${active.memberLimit} acessos ocupados</p></div><span class="workspace-role-pill">${manager ? 'Gerência de equipe disponível' : 'Acesso conforme função'}</span></div><div class="workspace-members">${memberRows}</div>${inviteRows ? `<div class="workspace-pending-list"><h3>Convites pendentes</h3>${inviteRows}</div>` : ''}</section>`;
  }
  const warning = !catalog.workspaces.length && !catalog.invitations.length && !catalog.canCreate && !businessWorkspaceLoadError
    ? `<div class="workspace-empty-state"><span>▤</span><strong>Recurso disponível no nível 5</strong><p>É necessário ter acesso ativo ao nível 5 para criar um espaço empresarial compartilhado. Convites recebidos por e-mail também aparecerão aqui.</p></div>`
    : '';
  const setupError = businessWorkspaceLoadError && /migra|tabela|workspace|espaço/i.test(businessWorkspaceLoadError)
    ? `<div class="auth-error workspace-error">${esc(businessWorkspaceLoadError)}</div>` : '';
  const privacyNotice = `<aside class="workspace-privacy-notice" role="note"><span aria-hidden="true">◆</span><div><strong>Dados empresariais isolados</strong><p>Convidados acessam apenas o espaço PJ indicado. Os dados PF do titular não são incluídos no convite nem ficam disponíveis aos membros.</p></div></aside>`;
  return `${welcome('Empresas compartilhadas', null, '')}<div class="welcome workspace-intro"><p>Trabalhe com sua equipe nos mesmos registros financeiros, com permissões por função e dados separados do perfil pessoal.</p></div>${privacyNotice}${setupError}${invitations ? `<section class="card workspace-invitations"><div class="section-head"><div><h2>Convites recebidos</h2><p>Os convites são pessoais e válidos apenas para o seu e-mail.</p></div></div><div class="workspace-invitation-list">${invitations}</div></section>` : ''}${create}${plans ? `<section class="card workspace-list-section"><div class="section-head"><div><h2>Seus espaços</h2><p>Selecione a empresa em que deseja trabalhar.</p></div></div><div class="workspace-list">${plans}</div></section>` : ''}${detail}${warning}`;
}

async function refreshBusinessWorkspaceView() {
  await loadBusinessWorkspaceCatalog();
  if (page === 'empresas') render();
}

const personalSetPage = setPage;
setPage = function(nextPage) {
  personalSetPage(nextPage);
  if (nextPage === 'empresas') document.querySelector('#pageTitle').textContent = 'Empresas compartilhadas';
};

const personalRenderForBusiness = render;
render = function() {
  const result = personalRenderForBusiness();
  if (page === 'empresas') {
    document.querySelector('#content').innerHTML = businessWorkspacePage();
    bindBusinessWorkspaceEvents();
  }
  showBusinessWorkspaceNav();
  return result;
};

const personalRefreshAccessForBusiness = refreshAccess;
refreshAccess = async function() {
  const previousWorkspaceId = activeBusinessWorkspaceId;
  await personalRefreshAccessForBusiness();
  if (!authUser) return;
  await loadBusinessWorkspaceCatalog();
  if (previousWorkspaceId && !activeBusinessWorkspaceId) {
    await personalLoadFeatureAccess();
    await personalReadCloudState();
    render();
    toast('Seu acesso ao espaço empresarial foi removido ou suspenso.');
  }
};

function bindBusinessWorkspaceEvents() {
  document.querySelectorAll('[data-workspace-select]').forEach(button => button.onclick = () => selectBusinessWorkspace(button.dataset.workspaceSelect));
  document.querySelector('#leaveBusinessWorkspace')?.addEventListener('click', () => leaveBusinessWorkspace('PF'));
  document.querySelector('#businessWorkspaceCreateForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await businessWorkspaceCall('POST', { action: 'create', name: String(form.get('name') || '') });
      await loadBusinessWorkspaceCatalog();
      await selectBusinessWorkspace(result.id);
      toast(result.copiedExistingBusinessData ? 'Espaço criado com uma cópia dos dados PJ atuais.' : 'Espaço empresarial criado.');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  document.querySelector('#businessWorkspaceRenameForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeBusinessWorkspaceId) return;
    try {
      await businessWorkspaceCall('POST', { action: 'rename', workspace_id: activeBusinessWorkspaceId, name: String(new FormData(event.currentTarget).get('name') || '') });
      await refreshBusinessWorkspaceView();
      toast('Nome do espaço atualizado.');
    } catch (error) { toast(error.message); }
  });
  document.querySelector('#businessWorkspaceInviteForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeBusinessWorkspaceId) return;
    const form = new FormData(event.currentTarget);
    try {
      const result = await businessWorkspaceCall('POST', { action: 'invite', workspace_id: activeBusinessWorkspaceId, email: String(form.get('email') || ''), role: String(form.get('role') || '') });
      event.currentTarget.reset();
      await refreshBusinessWorkspaceView();
      toast(result.message || 'Convite criado.');
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll('[data-workspace-accept]').forEach(button => button.onclick = async () => {
    try {
      const result = await businessWorkspaceCall('POST', { action: 'accept-invitation', invitation_id: button.dataset.workspaceAccept });
      await loadBusinessWorkspaceCatalog();
      await selectBusinessWorkspace(result.workspaceId);
      toast('Convite aceito.');
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll('[data-workspace-decline]').forEach(button => button.onclick = async () => {
    try { await businessWorkspaceCall('POST', { action: 'decline-invitation', invitation_id: button.dataset.workspaceDecline }); await refreshBusinessWorkspaceView(); toast('Convite recusado.'); }
    catch (error) { toast(error.message); }
  });
  document.querySelectorAll('[data-workspace-role]').forEach(select => select.onchange = async () => {
    try { await businessWorkspaceCall('POST', { action: 'change-role', workspace_id: select.dataset.workspaceRole, user_id: select.dataset.userId, role: select.value }); await refreshBusinessWorkspaceView(); toast('Função do membro atualizada.'); }
    catch (error) { toast(error.message); }
  });
  document.querySelectorAll('[data-workspace-remove]').forEach(button => button.onclick = async () => {
    const member = button.closest('.workspace-member')?.querySelector('.workspace-member-copy strong')?.textContent || 'membro';
    if (!confirm(`Remover ${member} deste espaço? Os registros da empresa serão preservados.`)) return;
    try { await businessWorkspaceCall('POST', { action: 'remove-member', workspace_id: button.dataset.workspaceRemove, user_id: button.dataset.userId }); await refreshBusinessWorkspaceView(); toast('Acesso removido.'); }
    catch (error) { toast(error.message); }
  });
}
