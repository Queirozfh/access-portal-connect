/* Cloud adaptation: authenticated state only; never adopts another browser's records. */
const CLOUD = "https://c--445ea0b9-2520-4ebf-8832-751b19b49956-prod.lovable.cloud",
  PUBLIC_KEY = "sb_publishable_7t6ExUJhxBEHMvQ3NaX6ug_2F3PUtSc",
  OWNER_ID = "ad46a5e7-af23-4cff-b190-ea6b6140013d";
let cloudSession = null,
  originalState = null,
  accountRow = "",
  accessBusy = false,
  activeFinanceProfile = "PF",
  financeProfileStates = {};
let pendingSyncBusy = false;
let stateUpdatedAt = null;
let stateConflict = false;
const LOGIN_LIMIT_KEY = "cdm-login-limit-v1";
function passwordMeetsPolicy(value) {
  return value.length >= 8 && value.length <= 72 && /\p{L}/u.test(value) && /\p{N}/u.test(value);
}
function emptyState(name = "Eu") {
  return {
    items: [],
    assets: [],
    bills: [],
    reimbursements: [],
    people: [name],
    peopleInBill: [name],
    categories: ["Alimentação", "Mercado", "Assinaturas", "Saúde", "Lazer", "Transporte", "Casa", "Outros"],
    settings: { ownerName: name, usd: 0, theme: "dark", yellowAlert: 70, redAlert: 90, hiddenMonths: [] },
  };
}
function load() {
  return emptyState(authUser?.name || "Eu");
}
async function refreshCloudSession(legacyRefreshToken){let response=await fetch("/api/public/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(legacyRefreshToken?{refresh_token:legacyRefreshToken}:{})}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||"Sua sessão expirou.");cloudSession={at:data.access_token,exp:Date.now()+(data.expires_in-60)*1000};return cloudSession}
async function cloudToken(){if(!cloudSession)throw Error("Entre novamente.");if(Date.now()>cloudSession.exp)await refreshCloudSession();return cloudSession.at}
async function cloudLogin(body){let response=await fetch("/api/public/register",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"login",email:body.email,password:body.password})}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error_code==="user_banned"?"suspenso":data.error||data.msg||"E-mail ou senha incorretos.");let session=data.session;cloudSession={at:session.access_token,exp:Date.now()+(session.expires_in-60)*1000};localStorage.removeItem("cdm-sessao")}
async function cloudFetch(path, options = {}) {
  let headers = { ...options.headers, apikey: PUBLIC_KEY, Authorization: "Bearer " + (await cloudToken()) };
  return fetch(CLOUD + path, { ...options, headers });
}
function convertState(source) {
  if (Array.isArray(source.items) && Array.isArray(source.assets))
    return {
      ...emptyState(source.settings?.ownerName || source.titular || "Eu"),
      ...source,
      settings: { ...emptyState().settings, ...source.settings },
    };
  let result = emptyState(source.titular || "Eu");
  result.legacyOriginal = source;
  result.people = [
    ...new Set(
      [source.titular, ...(source.people || []).map((p) => (typeof p === "string" ? p : p.name))].filter(Boolean),
    ),
  ];
  result.peopleInBill = [source.titular, ...(source.people || []).filter((p) => p.inBill).map((p) => p.name)].filter(
    Boolean,
  );
  result.categories = source.cats || result.categories;
  result.settings = {
    ...result.settings,
    ownerName: source.titular || "Eu",
    usd: source.fx?.rate || 0,
    usdDate: source.fx?.date,
    hiddenMonths: source.hidden || [],
    yellowAlert: (source.yellow || 0.7) * 100,
    redAlert: (source.red || 0.9) * 100,
  };
  for (let [list, kind] of [
    [source.incomes || [], "income"],
    [source.purchases || [], "expense"],
  ])
    for (let entry of list) {
      let recurring = entry.n == null,
        n = recurring ? 1 : entry.n;
      for (let i = 0; i < n; i++) {
        let month = monthsFrom(entry.start || source.start || isoMonth(new Date()), i + 1)[i];
        result.items.push({
          id: String(entry.id) + "-" + i,
          sourceId: String(entry.id),
          kind,
          name: entry.desc,
          amount: Number(entry.valor) || 0,
          month,
          due: month,
          person: entry.who || source.titular,
          category: entry.cat || "Outros",
          installments: recurring ? 0 : n,
          part: i + 1,
          recurring,
          paid: 0,
          notes: entry.obs || "",
          order: entry.ord ?? result.items.length,
          endMonth: entry.end,
        });
      }
    }
  result.bills = (source.bills || []).map((b) => ({ ...b, name: b.desc, amount: b.valor }));
  result.reimbursements = (source.received || []).map((r) => ({
    ...r,
    person: r.who,
    amount: r.valor,
    unallocated: r.valor,
  }));
  result.assets = (source.assets || []).map((a) => ({
    ...a,
    bank: a.bank || a.name,
    month: a.month || source.start,
    delta: a.currency === "USD" ? a.balance * (source.fx?.rate || 0) : a.balance,
    originalAmount: a.balance,
    usdRate: a.currency === "USD" ? source.fx?.rate : null,
  }));
  return result;
}
function financeProfileMapKey() {
  return "cdm-finance-profiles-" + authUser.id;
}
function financeProfileKey(profile = activeFinanceProfile) {
  return "meu-patrimonio-" + authUser.id + "-" + profile;
}
function serializeState() {
  financeProfileStates[activeFinanceProfile] = db;
  return {
    ...(originalState || {}),
    financeProfiles: { ...financeProfileStates },
    patrimonioApp: financeProfileStates.PF || db,
  };
}
async function readCloudState() {
  let response = await fetch("/api/public/financial-state", { headers: { Authorization: "Bearer " + (await cloudToken()) } });
  if (!response.ok) throw Error("Não foi possível carregar os dados online.");
  let result = await response.json();
  let source = result.state || {};
  stateUpdatedAt = result.updated_at || null;
  stateConflict = false;
  originalState = source;
  activeFinanceProfile = localStorage.getItem("cdm-active-finance-profile-" + authUser.id) === "PJ" ? "PJ" : "PF";
  KEY = financeProfileKey();
  let queued = localStorage.getItem("cdm-pending-state-" + accountRow);
  if (queued) {
    try {
      let pending = JSON.parse(queued),
        cached =
          localStorage.getItem(KEY) ||
          (activeFinanceProfile === "PF" ? localStorage.getItem("meu-patrimonio-" + authUser.id) : null);
      if (pending.id === accountRow && cached && !pending.json) {
        let local = JSON.parse(cached);
        if (source.financeProfiles) source.financeProfiles[activeFinanceProfile] = local;
        else source = { ...source, patrimonioApp: local };
      }
      if (pending.json) source = JSON.parse(pending.json);
    } catch {}
  }
  financeProfileStates =
    source.financeProfiles && typeof source.financeProfiles === "object"
      ? { ...source.financeProfiles }
      : { PF: source.patrimonioApp || source };
  if (!financeProfileStates.PF) financeProfileStates.PF = emptyState(authUser.name);
  if (!financeProfileStates.PJ) financeProfileStates.PJ = emptyState(authUser.name);
  originalState = source;
  db = convertState(financeProfileStates[activeFinanceProfile]);
  db.settings.ownerName = db.settings.ownerName || authUser.name;
  financeProfileStates[activeFinanceProfile] = db;
  localStorage.setItem(financeProfileMapKey(), JSON.stringify(financeProfileStates));
  localStorage.setItem(KEY, JSON.stringify(db));
  backendSyncEnabled = true;
  document.querySelector("#saveStatus").textContent = queued ? "Alterações pendentes de sincronização" : "Salvo online";
  if (queued) flushPendingState();
}
function flushPendingState() {
  if (stateConflict || pendingSyncBusy || !navigator.onLine || !backendSyncEnabled || !authUser) return backendWrites;
  pendingSyncBusy = true;
  backendWrites = backendWrites
    .catch(() => {})
    .then(async () => {
      const queueKey = "cdm-pending-state-" + accountRow;
      while (navigator.onLine) {
        let queued = localStorage.getItem(queueKey);
        if (!queued) break;
        let marker = JSON.parse(queued),
          body = JSON.stringify({
            json: marker.json || JSON.stringify(serializeState()),
            expected_updated_at: marker.expected_updated_at ?? stateUpdatedAt,
          }),
          response = await fetch("/api/public/financial-state", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await cloudToken()) },
            body,
          });
        if (response.status === 409) {
          stateConflict = true;
          showSyncConflict();
          break;
        }
        if (!response.ok) throw Error("Não foi possível sincronizar as alterações pendentes.");
        const saved = await response.json();
        stateUpdatedAt = saved.updated_at || stateUpdatedAt;
        if (localStorage.getItem(queueKey) === queued) localStorage.removeItem(queueKey);
        else {
          // A newer local edit may have replaced this queue entry while the
          // request was in flight. Rebase it only when it shares this request's
          // original server version; unrelated edits still get a 409.
          const latest = localStorage.getItem(queueKey);
          if (latest) {
            try {
              const next = JSON.parse(latest);
              if (next.expected_updated_at === marker.expected_updated_at) {
                next.expected_updated_at = stateUpdatedAt;
                localStorage.setItem(queueKey, JSON.stringify(next));
              }
            } catch {}
          }
        }
      }
      if (stateConflict) return;
      document.querySelector("#saveStatus").textContent = navigator.onLine
        ? "Salvo online"
        : "Offline · alterações em fila";
    })
    .catch(() => {
      const status = document.querySelector("#saveStatus");
      if (!stateConflict && status) status.textContent = navigator.onLine ? "Erro ao salvar · alterações preservadas" : "Offline · alterações em fila";
    })
    .finally(() => {
      pendingSyncBusy = false;
    });
  return backendWrites;
}
function save() {
  if (!backendSyncEnabled || !authUser) {
    toast("Conecte-se para salvar.");
    return;
  }
  if (typeof normalizeItemOrder === "function") normalizeItemOrder();
  financeProfileStates[activeFinanceProfile] = db;
  let row = accountRow,
    queueKey = "cdm-pending-state-" + row,
    payload = serializeState(),
    updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(db));
  localStorage.setItem(financeProfileMapKey(), JSON.stringify(financeProfileStates));
  localStorage.setItem(queueKey, JSON.stringify({ id: row, updated_at: updatedAt, expected_updated_at: stateUpdatedAt, json: JSON.stringify(payload) }));
  if (stateConflict) {
    showSyncConflict();
    return;
  }
  document.querySelector("#saveStatus").textContent = navigator.onLine ? "Salvando…" : "Offline · alterações em fila";
  if (navigator.onLine) flushPendingState();
}
function showSyncConflict() {
  const status = document.querySelector("#saveStatus");
  if (!status) return;
  status.innerHTML = 'Conflito de sincronização · suas alterações estão preservadas neste aparelho. <button type="button" class="mini-btn" id="export-local-state">Baixar cópia local</button> <button type="button" class="mini-btn" id="discard-local-state">Descartar cópia e recarregar</button>';
  status.setAttribute("role", "alert");
  status.querySelector("#export-local-state")?.addEventListener("click", () => {
    const queued = localStorage.getItem("cdm-pending-state-" + accountRow);
    if (!queued) return;
    const marker = JSON.parse(queued);
    const localState = marker.json ? JSON.parse(marker.json) : serializeState();
    const blob = new Blob([JSON.stringify(localState, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `meu-patrimonio-conflito-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  status.querySelector("#discard-local-state")?.addEventListener("click", () => {
    if (!confirm("Descartar a cópia local preservada e recarregar a versão salva online?")) return;
    localStorage.removeItem("cdm-pending-state-" + accountRow);
    stateConflict = false;
    location.reload();
  });
}
async function switchFinanceProfile(profile) {
  if (!["PF", "PJ"].includes(profile) || profile === activeFinanceProfile) return;
  if (!authUser) return;
  save();
  financeProfileStates[activeFinanceProfile] = db;
  localStorage.setItem(financeProfileMapKey(), JSON.stringify(financeProfileStates));
  activeFinanceProfile = profile;
  localStorage.setItem("cdm-active-finance-profile-" + authUser.id, profile);
  KEY = financeProfileKey();
  db = convertState(financeProfileStates[profile] || emptyState(authUser.name));
  db.settings.ownerName = db.settings.ownerName || authUser.name;
  financeProfileStates[profile] = db;
  localStorage.setItem(KEY, JSON.stringify(db));
  applyTheme();
  render();
  toast(profile === "PJ" ? "Ambiente da empresa" : "Ambiente pessoal");
}
async function syncBackend() {
  await readCloudState();
  render();
}
async function verifyAccount() {
  let previous = authUser,
    response = await cloudFetch("/auth/v1/user"),
    user = await response.json();
  if (!response.ok) {
    if (user.error_code === "user_banned" || /banned/i.test(user.msg || "")) throw Error("suspenso");
    throw Error("Sua sessão expirou.");
  }
  let expiresAt = user.app_metadata?.expires_at;
  let roles = await cloudFetch("/rest/v1/rpc/has_role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ _user_id: user.id, _role: "admin" }),
  });
  authUser = {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || "Eu",
    role: roles.ok && (await roles.json()) === true ? "admin" : "access",
    expiresAt,
    expired: Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now()),
    accessLevel: previous?.accessLevel,
    features: previous?.features,
  };
  accountRow = user.id === OWNER_ID ? "main" : user.id;
  localStorage.setItem("cdm-user-cache", JSON.stringify(authUser));
}
function showAuthScreen(mode = "login", message = "") {
  lockApplication();
  let root = document.querySelector("#authScreen");
  document.querySelector("#content").innerHTML = "";
  if (mode === "suspended") {
    root.innerHTML =
      '<section class="auth-card auth-suspended"><h1>Acesso suspenso</h1><p>Regularize o pagamento e solicite ao administrador a renovação ou liberação do acesso. Seus dados continuam guardados.</p><button class="btn secondary" id="backToLogin">Voltar ao login</button></section>';
    root.querySelector("#backToLogin").onclick = () => {
      cloudSession = null;
      localStorage.removeItem("cdm-sessao");
      showAuthScreen();
    };
    return;
  }
  const registering = mode === "register";
  root.innerHTML = `<section class="auth-card auth-login"><img class="auth-logo" src="/icon-192.png" alt=""><div class="eyebrow">CONTROLE FINANCEIRO</div><h1>Meu Patrimônio</h1><p>${registering ? "Crie sua conta para começar a organizar suas finanças." : "Entre para acompanhar suas contas, faturas e patrimônio."}</p>${message ? `<div class="auth-error">${esc(message)}</div>` : ""}<form id="authForm"><div class="field"><label for="loginEmail">E-mail</label><input id="loginEmail" name="email" type="email" autocomplete="email" maxlength="255" required></div><div class="field"><label for="loginPassword">Senha</label><input id="loginPassword" name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" minlength="${registering ? 8 : 1}" maxlength="72" required></div>${registering ? '<div class="field"><label for="confirmPassword">Confirmar senha</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></div>' : ""}<button class="btn primary">${registering ? "Criar conta" : "Entrar"}</button></form><button type="button" class="auth-switch" id="authModeToggle">${registering ? "Já tenho uma conta · Entrar" : "Criar minha conta"}</button></section>`;
  root.querySelector("#authModeToggle").onclick = () => showAuthScreen(registering ? "login" : "register");
  root.querySelector("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (registering) {
        if (values.password !== values.confirmPassword) throw Error("As senhas não conferem.");
        if (!passwordMeetsPolicy(String(values.password)))
          throw Error("A senha deve ter entre 8 e 72 caracteres, incluindo pelo menos uma letra e um número.");
        const response = await fetch("/api/public/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: values.email, password: values.password }),
          }),
          result = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(result.error || "Não foi possível criar a conta.");
        if (result.confirmationRequired) {
          showAuthScreen(
            "login",
            "Cadastro recebido. Confirme seu e-mail, se solicitado, e depois entre com sua conta.",
          );
          return;
        }
        const session = result.session;
        if (!session?.access_token)
          throw Error("Conta criada. Entre com seu e-mail e senha para continuar.");
        cloudSession = { at: session.access_token, exp: Date.now() + (session.expires_in - 60) * 1000 };
        localStorage.removeItem("cdm-sessao");
        await startAuthenticatedApp();
        return;
      }
      await cloudLogin({ email: values.email, password: values.password });
      await startAuthenticatedApp();
    } catch (error) {
      showAuthScreen(registering ? "register" : "login", error.message);
    }
  };
}
function startOfflineSession() {
  try {
    let cachedUser = JSON.parse(localStorage.getItem("cdm-user-cache") || "null");
    if (
      !cloudSession ||
      !cachedUser?.id ||
      (cachedUser.expiresAt && new Date(cachedUser.expiresAt).getTime() <= Date.now())
    )
      return false;
    authUser = cachedUser;
    accountRow = authUser.id === OWNER_ID ? "main" : authUser.id;
    activeFinanceProfile = localStorage.getItem("cdm-active-finance-profile-" + authUser.id) === "PJ" ? "PJ" : "PF";
    KEY = financeProfileKey();
    try {
      financeProfileStates = JSON.parse(localStorage.getItem(financeProfileMapKey()) || "{}");
    } catch {
      financeProfileStates = {};
    }
    let cached = localStorage.getItem(KEY);
    if (!cached && activeFinanceProfile === "PF") {
      cached = localStorage.getItem("meu-patrimonio-" + authUser.id);
      if (cached) localStorage.setItem(KEY, cached);
    }
    if (!cached && activeFinanceProfile === "PJ") {
      activeFinanceProfile = "PF";
      KEY = financeProfileKey();
      cached = localStorage.getItem(KEY);
    }
    if (!cached) return false;
    db = convertState(JSON.parse(cached));
    financeProfileStates[activeFinanceProfile] = db;
    originalState = null;
    backendSyncEnabled = true;
    monthInput.value = nextVisibleMonth(isoMonth(new Date()));
    if (deviceBiometricLockEnabled()) showDeviceBiometricLock();
    document.body.classList.remove("auth-locked");
    document.querySelector("#authScreen").hidden = true;
    document.querySelector('[data-page="admin"]').style.display = authUser.role === "admin" ? "flex" : "none";
    document.querySelector("#logoutButton").textContent = ownerName().slice(0, 1).toUpperCase();
    applyTheme();
    render();
    document.querySelector("#saveStatus").textContent = "Offline · alterações serão sincronizadas";
    setupProfileMenu();
    return true;
  } catch {
    return false;
  }
}
async function initializeApplication() {
  lockApplication();
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem("cdm-sessao") || "null");
    if (!legacy) {
      const key = Object.keys(localStorage).find((item) => /^sb-.*-auth-token$/.test(item));
      if (key) legacy = JSON.parse(localStorage.getItem(key) || "null");
    }
  } catch {}
  if (legacy?.at && legacy?.rt) legacy = { access_token: legacy.at, refresh_token: legacy.rt, expires_at: Math.floor(Number(legacy.exp) / 1000) };
  localStorage.removeItem("cdm-sessao");
  for (const key of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(key)) localStorage.removeItem(key);
  try {
    if (legacy?.access_token && legacy?.refresh_token) {
      cloudSession = { at: legacy.access_token, exp: Date.now() + Math.max(0, (Number(legacy.expires_at) * 1000 || Date.now()) - Date.now() - 60000) };
      await refreshCloudSession(legacy.refresh_token);
    } else {
      cloudSession = null;
      await refreshCloudSession();
    }
    await startAuthenticatedApp();
  } catch (error) {
    if (legacy?.access_token && legacy?.expires_at * 1000 > Date.now()) {
      cloudSession = { at: legacy.access_token, exp: legacy.expires_at * 1000 - 60000 };
      if (startOfflineSession()) return;
    }
    cloudSession = null;
    if (error.message === "suspenso") await fetch("/api/public/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    showAuthScreen(error.message === "suspenso" ? "suspended" : "login", error.message);
  }
}
window.addEventListener("online", () => {
  if (authUser && backendSyncEnabled) {
    flushPendingState();
    refreshAccess();
  }
});
function enterBillingOnly() {
  if (!authUser) return;
  authUser.expired = true;
  backendSyncEnabled = false;
  db = emptyState();
  originalState = null;
  page = "plano";
  document.body.classList.add("billing-only");
  document.querySelectorAll("#nav [data-page]").forEach((item) => {
    item.hidden = item.dataset.page !== "plano";
  });
  document.querySelectorAll(".sidebar .side-label").forEach((label) => (label.hidden = true));
  document.querySelector("#monthPicker").hidden = true;
  for (const selector of ["#monthLockButton", "#privacyToggle", "#passwordButton", "#themeToggle"]) {
    const element = document.querySelector(selector);
    if (element) element.hidden = true;
  }
  document.querySelector("#accessNotice").innerHTML = "";
  document.querySelector("#pageTitle").textContent = "Meu plano";
}
function restoreBillingNavigation() {
  document.body.classList.remove("billing-only");
  document.querySelectorAll("#nav [data-page], .sidebar .side-label").forEach((item) => (item.hidden = false));
  for (const selector of ["#monthPicker", "#monthLockButton", "#privacyToggle", "#passwordButton", "#themeToggle"]) {
    const element = document.querySelector(selector);
    if (element) element.hidden = false;
  }
}
async function startAuthenticatedApp() {
  await verifyAccount();
  if (authUser.expired) {
    enterBillingOnly();
    document.body.classList.remove("auth-locked");
    document.querySelector("#authScreen").hidden = true;
    document.querySelector('[data-page="admin"]').style.display = "none";
    document.querySelector("#logoutButton").textContent = (authUser.name || authUser.email || "U").slice(0, 1).toUpperCase();
    applyTheme();
    setupProfileMenu();
    window.doLogout = logoutPortalAccount;
    render();
    return;
  }
  restoreBillingNavigation();
  await readCloudState();
  await loadFeatureAccess();
  monthInput.value = nextVisibleMonth(isoMonth(new Date()));
  if (deviceBiometricLockEnabled()) showDeviceBiometricLock();
  document.body.classList.remove("auth-locked");
  document.querySelector("#authScreen").hidden = true;
  document.querySelector('[data-page="admin"]').style.display = authUser.role === "admin" ? "flex" : "none";
  document.querySelector("#logoutButton").textContent = ownerName().slice(0, 1).toUpperCase();
  applyTheme();
  render();
  await refreshAccess();
  clearInterval(authTimer);
  authTimer = setInterval(refreshAccess, 60000);
  document.querySelector("#passwordButton").onclick = openChangePassword;
  document.querySelector("#themeToggle").onclick = toggleTheme;
  setupProfileMenu();
  window.doLogout = logoutPortalAccount;
}
async function logoutPortalAccount() {
  const menu = document.querySelector("#profileMenu");
  if (menu) menu.hidden = true;
  await backendWrites;
  await fetch("/api/public/logout", { method: "POST", credentials: "same-origin", headers: { Authorization: "Bearer " + (cloudSession?.at || "") } }).catch(() => {});
  cloudSession = null;
  authUser = null;
  db = emptyState();
  originalState = null;
  localStorage.removeItem("cdm-sessao");
  localStorage.removeItem(KEY);
  for (let key of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(key)) localStorage.removeItem(key);
  showAuthScreen();
}
function closeAccessNotifications(){const button=document.querySelector('#accessNotificationsButton'),panel=document.querySelector('#accessNotificationsPanel');if(!button||!panel)return;panel.hidden=true;button.setAttribute('aria-expanded','false')}
function renderAccessNotifications(users){const wrap=document.querySelector('#accessNotifications'),button=document.querySelector('#accessNotificationsButton'),panel=document.querySelector('#accessNotificationsPanel'),count=document.querySelector('#accessNotificationCount');if(!wrap||!button||!panel||!count)return;wrap.hidden=authUser?.role!=='admin';if(wrap.hidden)return;const now=Date.now(),warnings=users.filter(u=>!u.admin&&!u.suspended&&u.expires_at&&new Date(u.expires_at).getTime()>now&&new Date(u.expires_at).getTime()-now<=604800000).sort((a,b)=>new Date(a.expires_at)-new Date(b.expires_at));count.hidden=!warnings.length;count.textContent=warnings.length>99?'99+':String(warnings.length);button.setAttribute('aria-label',warnings.length?`${warnings.length} acesso(s) próximo(s) do vencimento`:'Notificações de acesso; nenhum vencimento próximo');const rows=warnings.map(user=>{const remaining=new Date(user.expires_at).getTime()-now,days=Math.floor(remaining/86400000),hours=Math.floor((remaining%86400000)/3600000),until=days>0?`vence em ${days} dia(s) e ${hours} h`:remaining<3600000?'vence em menos de 1 hora':`vence em ${hours} hora(s)`;return `<article class="access-notification-item"><strong>${esc(user.name||user.email||'Usuário')}</strong><span>${esc(until)}</span><small>Data limite: ${esc(new Date(user.expires_at).toLocaleString('pt-BR'))}</small></article>`}).join('');panel.innerHTML=`<h2>Acessos próximos do vencimento</h2><p>Contas ativas com prazo nos próximos 7 dias.</p>${warnings.length?`<div class="access-notification-list">${rows}</div>`:'<div class="access-notification-empty">Nenhum acesso próximo do vencimento.</div>'}<button type="button" class="access-notification-footer" data-open-admin-users>Gerenciar acessos</button>`;panel.querySelector('[data-open-admin-users]').onclick=()=>{closeAccessNotifications();setPage('admin')};button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden))}}
function setAccessNotificationError(){const wrap=document.querySelector('#accessNotifications'),button=document.querySelector('#accessNotificationsButton'),panel=document.querySelector('#accessNotificationsPanel');if(authUser?.role!=='admin'||!wrap||!button||!panel)return;wrap.hidden=false;panel.innerHTML='<h2>Acessos próximos do vencimento</h2><div class="access-notification-empty">Não foi possível carregar as notificações agora.</div><button type="button" class="access-notification-footer" data-open-admin-users>Gerenciar acessos</button>';panel.querySelector('[data-open-admin-users]').onclick=()=>{closeAccessNotifications();setPage('admin')};button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden))}}
document.addEventListener('click',event=>{const wrap=document.querySelector('#accessNotifications');if(wrap&&!wrap.contains(event.target))closeAccessNotifications()});async function refreshAccess(){if(!authUser||accessBusy)return;accessBusy=true;try{await verifyAccount();await loadFeatureAccess();let target=document.querySelector('#accessNotice');if(authUser.role==='admin'){let result=await adminCall({action:'list'});renderAccessNotifications(result.users);target.innerHTML=''}else{let wrap=document.querySelector('#accessNotifications');if(wrap)wrap.hidden=true;let remaining=authUser.expiresAt?Math.max(0,new Date(authUser.expiresAt)-Date.now()):null;target.innerHTML=remaining===null?'Acesso liberado pelo administrador: sem prazo':`<div class="access-warning">Tempo restante: ${Math.ceil(remaining/3600000)} hora(s) · até ${esc(new Date(authUser.expiresAt).toLocaleString('pt-BR'))}${remaining<=604800000?'<br>Regularize o pagamento e solicite a renovação antes do vencimento.':''}</div>`}}catch(error){if(error.message==='suspenso')showAuthScreen('suspended',error.message);else if(error.message==='Sua sessão expirou.')showAuthScreen('login',error.message);else{let target=document.querySelector('#accessNotice');if(target)target.innerHTML=authUser?.role==='admin'?'':'<div class="access-warning">Não foi possível atualizar os avisos de acesso. Sua sessão continua ativa.</div>';if(authUser?.role==='admin')setAccessNotificationError();console.warn('Falha ao atualizar informações administrativas:',error)}}finally{accessBusy=false}}
  window.addEventListener("focus", () => refreshAccess());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshAccess();
});
async function adminCall(body) {
  let response = await fetch("/api/public/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await cloudToken()) },
      body: JSON.stringify(body),
    }),
    result = await response.json();
  if (!response.ok) throw Error(result.error || "Acesso negado");
  return result;
}
async function accessRequest(url, method = "GET", body = {}) {
  if (method === "GET") {
    let result = await adminCall({ action: "list" });
    return {
      accesses: result.users
        .filter((u) => !u.admin)
        .map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          createdAt: u.created_at,
          lastAccessAt: u.last_sign_in_at,
          accessLevel: u.access_level || 1,
          aiEnabled: u.ai_enabled,
          aiUsed: u.ai_used,
          aiLimit: u.ai_limit ?? 4,
          aiMonth: billingMonth(),
          lastChangedAt: u.stats?.updated_at || u.created_at,
          monthCount: u.stats?.ativos || 0,
          totalCount: u.stats?.total || 0,
          expiresAt: u.expires_at,
          suspended: u.suspended,
        })),
    };
  }
  let match = url.match(/\/api\/accesses\/([^/]+)(?:\/(.*))?$/),
    id = match?.[1],
    action =
      method === "POST"
        ? "create"
        : method === "DELETE"
          ? "delete"
          : match?.[2] === "term"
            ? "expiry"
            : match?.[2] === "password"
              ? "password"
              : match?.[2] === "data"
                ? "wipe"
                : body.action === "name"
                  ? "rename"
                  : body.action === "resume"
                    ? "unsuspend"
                    : "suspend";
  return adminCall({
    ...body,
    id,
    action,
    amount: body.duration,
    unit: { none: "sem", hours: "horas", days: "dias", months: "meses", years: "anos" }[body.unit],
  });
}
function adminPage() {
  let html = sourceAdminPage();
  const integrationStart = html.indexOf('<section class="card"><div class="section-head"><h2>Integração AI Gateway');
  const integrationEnd = html.indexOf(
    '<section class="card"><div class="section-head"><h2>Dados e privacidade',
    integrationStart,
  );
  html =
    html.slice(0, integrationStart) +
    `<section class="card"><div class="section-head"><h2>Integração AI Gateway</h2></div><div class="field"><label>Análise de compras</label><input value="Lovable AI" disabled></div><div class="field"><label>Modelo</label><input value="openai/gpt-6-astra" disabled></div></section>` +
    html.slice(integrationEnd);
  html = html
    .replace(
      "Os dados de cada conta ficam em arquivos separados no backend local. Este servidor atende apenas neste computador; faça cópias de segurança periódicas.",
      "Os dados financeiros de cada perfil são salvos online e permanecem separados.",
    )
    .replace(
      '<button class="btn secondary" data-action="export-data">Baixar cópia JSON</button>',
      '<button class="btn secondary" data-action="export-data">Baixar cópia JSON</button> <button class="btn secondary" data-action="export-csv">Baixar CSV / Excel</button>',
    );
  const footer = html.lastIndexOf('<div class="notice">A autenticação usa sessão local');
  return footer >= 0 ? html.slice(0, footer) : html;
}

function openChangePassword() {
  showModal(
    "Alterar senha",
    `<div class="field"><label>Senha atual</label><input name="currentPassword" type="password" required autocomplete="current-password"></div><div class="field"><label>Nova senha</label><input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></div><div class="field"><label>Confirme a nova senha</label><input name="confirmPassword" type="password" required autocomplete="new-password"></div>`,
    () => {
      let values = Object.fromEntries(new FormData(document.querySelector("#modalForm")));
      if (values.newPassword !== values.confirmPassword) {
        toast("As senhas não conferem");
        return false;
      }
      (async () => {
        try {
          await cloudLogin({ email: authUser.email, password: values.currentPassword });
          let response = await cloudFetch("/auth/v1/user", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: values.newPassword }),
          });
          if (!response.ok) throw Error("Senha recusada. Escolha uma senha forte e diferente da atual.");
          document.querySelector("#modal").close();
          toast("Senha alterada");
        } catch (error) {
          toast(error.message);
        }
      })();
      return false;
    },
  );
}
async function refreshUsdRate() {
  try {
    let response = await fetch("/api/public/dollar-rate", {
        headers: { Authorization: "Bearer " + (await cloudToken()) },
      }),
      quote = await response.json();
    if (!response.ok) throw Error(quote.error);
    db.settings.usd = quote.rate;
    db.settings.usdDate = quote.date;
    db.settings.usdSource = quote.source;
    save();
    render();
  } catch {
    toast("Cotação indisponível. A última referência foi mantida.");
  }
}
function monthStats(month) {
  let items = typeItems("expense", month),
    groups = {};
  for (let person of new Set([...db.people, ...items.map((x) => x.person || ownerName())]))
    groups[person] = { items: [], total: 0, received: 0, open: 0 };
  for (let item of items) {
    let group = groups[item.person || ownerName()];
    group.items.push(item);
    group.total += Number(item.amount) || 0;
    if (Array.isArray(item.reimbursements))
      group.received += item.reimbursements
        .filter((r) => (r.month || String(r.date || "").slice(0, 7)) === month)
        .reduce((s, r) => s + Number(r.amount || 0), 0);
    else if (!item.recurring) group.received += Number(item.reimbursed) || 0;
  }
  for (let r of db.reimbursements || [])
    if (r.month === month) {
      groups[r.person] ||= { items: [], total: 0, received: 0, open: 0 };
      groups[r.person].received += Number(r.unallocated ?? r.amount) || 0;
    }
  let open = 0,
    third = 0;
  for (let [person, g] of Object.entries(groups)) {
    g.open = Math.max(0, Math.round((g.total - g.received) * 100) / 100);
    if (person !== ownerName()) {
      open += g.open;
      third += g.total;
    }
  }
  let bills = db.bills.filter((b) => b.month === month),
    billTotal = bills.reduce((s, b) => s + Number(b.amount || 0), 0),
    embedded = items
      .filter((x) => x.person !== ownerName() && db.peopleInBill.includes(x.person))
      .reduce((s, x) => s + Number(x.amount || 0), 0);
  return {
    items,
    groups,
    open,
    third,
    bills,
    billTotal,
    physicalOwner: Math.max(
      0,
      bills.filter((b) => /f[ií]sico/i.test(b.name)).reduce((s, b) => s + Number(b.amount || 0), 0) - embedded,
    ),
  };
}
function sharedBillsPage() {
  let stats = monthStats(selected()),
    groups = Object.entries(stats.groups).filter(([person]) => person !== ownerName()),
    received = groups.reduce((sum, [, group]) => sum + group.received, 0),
    all = stats.items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    paidBills = stats.bills.filter((b) => b.paid).reduce((sum, b) => sum + Number(b.amount || 0), 0);
  return `${welcome("Faturas e valores a receber", null, "")}<div class="grid stats">${statsCard("Compras do mês", money(all), "Itens e parcelas ativos", "▣")}${statsCard("Faturas pagas", money(paidBills), "Pagamentos confirmados", "✓", "positive")}${statsCard("Recebido de terceiros", money(received), "Reembolsos registrados", "↗", "positive")}${statsCard("Ainda a receber", money(stats.open), "Saldo em aberto por pessoa", "◷", "negative")}</div><section class="card"><div class="section-head"><div><h2>Consolidado por pessoa</h2><p>${monthLabel(selected())} · previsto, recebido e pendente</p></div><button class="btn secondary" data-action="print">Exportar PDF</button></div>${groups.length ? `<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Modelo de cobrança</th><th>Previsto</th><th>Recebido</th><th>Em aberto</th><th>Ações</th></tr></thead><tbody>${groups.map(([person, g]) => `<tr><td><strong>${esc(person)}</strong></td><td>${db.peopleInBill.includes(person) ? "Dentro da sua fatura" : "Paga por conta própria"}</td><td>${money(g.total)}</td><td>${money(g.received)}</td><td class="negative">${money(g.open)}</td><td><div class="row-actions">${g.open > 0 ? g.items.map((item) => `<button class="mini-btn" data-action="reimburse" data-id="${item.id}">Receber ${esc(item.name)}</button>`).join("") : ""}</div></td></tr>`).join("")}</tbody></table></div><div class="spacer"></div>${itemsTable(shareRows(selected()))}` : '<div class="empty">Nenhuma despesa atribuída a terceiros neste mês.</div>'}</section>`;
}

function openReimburse(id) {
  let item = db.items.find((x) => x.id === id);
  if (!item) return;
  let month = selected(),
    group = monthStats(month).groups[item.person];
  showModal(
    "Registrar recebimento",
    `<p>${esc(item.person)} · saldo do mês ${money(group.open)}</p><div class="field"><label>Valor recebido (R$)</label><input name="amount" required type="number" min="0.01" max="${group.open}" step="0.01"></div>`,
    () => {
      let amount = Number(new FormData(document.querySelector("#modalForm")).get("amount"));
      if (!Number.isFinite(amount) || amount <= 0 || amount > monthStats(month).groups[item.person].open) {
        toast("Valor acima do saldo do mês");
        return false;
      }
      db.reimbursements.push({ id: crypto.randomUUID(), person: item.person, month, amount, unallocated: amount });
      save();
      toast("Recebimento registrado");
    },
  );
}
function faturasPage() {
  let html = sourceFaturasPage();
  return html
    .replace("<h2>Faturas do sistema anterior</h2>", "<h2>Faturas</h2>")
    .replace(`<p>Registros importados de ${monthLabel(selected())}</p>`, `<p>${monthLabel(selected())}</p>`);
}

function openBill(id) {
  let bill = db.bills.find((b) => b.id === id);
  showModal(
    bill ? "Editar fatura" : "Adicionar fatura",
    `<div class="field"><label>Nome</label><input name="name" required value="${esc(bill?.name || "")}"></div><div class="field"><label>Valor (R$)</label><input name="amount" type="number" min="0" step="0.01" required value="${bill?.amount ?? ""}"></div><div class="field"><label>Mês</label><input name="month" type="month" required value="${bill?.month || selected()}"></div>`,
    () => {
      let fields = Object.fromEntries(new FormData(document.querySelector("#modalForm"))),
        value = {
          id: bill?.id || crypto.randomUUID(),
          name: fields.name,
          amount: Number(fields.amount),
          month: fields.month,
          paid: bill?.paid || false,
        };
      if (bill) Object.assign(bill, value);
      else db.bills.push(value);
      save();
    },
  );
}
function deleteBill(id) {
  if (confirm("Excluir esta fatura?")) {
    db.bills = db.bills.filter((b) => b.id !== id);
    save();
    render();
  }
}
function nextVisibleMonth(month) {
  let hidden = db.settings.hiddenMonths || [];
  for (let i = 0; i <= hidden.length; i++) {
    let candidate = monthsFrom(month, i + 1)[i];
    if (!hidden.includes(candidate)) return candidate;
  }
  return month;
}
function monthSettled(month) {
  let s = monthStats(month);
  return (
    s.bills.every((b) => b.paid) &&
    s.open <= 0.005 &&
    s.items
      .filter((x) => (x.person || ownerName()) === ownerName())
      .every((x) => s.bills.length || remaining(x, month) <= 0.005)
  );
}
function hideMonth() {
  let month = selected();
  if (!monthSettled(month)) {
    toast("Só é possível excluir um mês completamente quitado.");
    return;
  }
  openDeleteConfirm({
    title: "Excluir mês quitado?",
    description: monthLabel(month),
    name: month,
    meta: "Dados preservados",
    warning: "O mês poderá ser restaurado em Ajustes.",
    button: "Excluir mês",
    onConfirm: () => {
      if (!monthSettled(month)) {
        toast("Mês não quitado. Exclusão bloqueada.");
        return;
      }
      db.settings.hiddenMonths = [...new Set([...(db.settings.hiddenMonths || []), month])];
      monthInput.value = nextVisibleMonth(month);
      save();
      render();
    },
  });
}
function restoreMonth(month) {
  db.settings.hiddenMonths = (db.settings.hiddenMonths || []).filter((m) => m !== month);
  monthInput.value = month;
  save();
  render();
}
function movePerson(index, direction) {
  let other = index + direction;
  if (other < 0 || other >= db.people.length) return;
  [db.people[index], db.people[other]] = [db.people[other], db.people[index]];
  save();
  render();
}
function moveItem(id, direction) {
  let index = db.items.findIndex((x) => x.id === id),
    other = index + direction;
  if (index < 0 || other < 0 || other >= db.items.length) return;
  [db.items[index], db.items[other]] = [db.items[other], db.items[index]];
  save();
  render();
}
function settingsWithOwner() {
  let html = sourceSettingsWithOwner();
  html = html.replace(/data-person-index="(\d+)"/g, (match, index) => match);
  for (let i = 0; i < db.people.length; i++)
    html = html.replace(
      `data-action="remove-person" data-index="${i}"`,
      `data-action="remove-person" data-index="${i}"`,
    );
  html += `<div class="spacer"></div><section class="card"><div class="section-head"><h2>Ordem das pessoas</h2></div>${db.people.map((p, i) => `<div class="settings-row"><span>${esc(p)}</span><div><button class="mini-btn" aria-label="Subir ${esc(p)}" data-action="move-person" data-index="${i}" data-id="-1">↑</button><button class="mini-btn" aria-label="Descer ${esc(p)}" data-action="move-person" data-index="${i}" data-id="1">↓</button></div></div>`).join("")}</section><div class="spacer"></div><section class="card"><h2>Meses</h2><button class="btn danger" data-action="month-hide">Excluir mês quitado</button>${(db.settings.hiddenMonths || []).map((m) => `<div class="settings-row"><span>${monthLabel(m)}</span><button class="btn secondary" data-action="month-restore" data-id="${m}">Restaurar</button></div>`).join("")}</section>`;
  return html;
}
function exportRows(state) {
  const rows = [["Seção", "Registro", "Campo", "Valor"]];
  Object.entries(state).forEach(([section, value]) => {
    if (Array.isArray(value))
      value.forEach((record, i) => {
        if (record && typeof record === "object")
          Object.entries(record).forEach(([key, v]) =>
            rows.push([section, i + 1, key, typeof v === "object" ? JSON.stringify(v) : v]),
          );
        else rows.push([section, i + 1, "valor", record]);
      });
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([key, v]) =>
        rows.push([section, "", key, typeof v === "object" ? JSON.stringify(v) : v]),
      );
    else rows.push(["Perfil", "", section, value]);
  });
  return rows;
}
function csvCompleto(state = db) {
  const cell = (v) => {
    let text = String(v ?? "");
    if (/^[\s]*[=+@-]/.test(text) && typeof v !== "number") text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return (
    "\uFEFF" +
    exportRows(state)
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
function downloadCsv() {
  let url = URL.createObjectURL(new Blob([csvCompleto()], { type: "text/csv;charset=utf-8" })),
    a = document.createElement("a");
  a.href = url;
  a.download = "meu-patrimonio-completo.csv";
  a.click();
  URL.revokeObjectURL(url);
}
function exportPage() {
  return `<div class="section-head"><h2>Exportação</h2></div><section class="card"><h2>Cópia completa do perfil</h2><button class="btn primary" data-action="export-data">⇩ Baixar JSON</button> <button class="btn secondary" data-action="export-csv">⇩ Baixar CSV / Excel</button><div class="field"><label>Restaurar backup JSON ou importar lançamentos CSV</label><input id="importFile" type="file" accept=".json,.csv"></div></section>`;
}
function resetData() {
  if (confirm("Apagar todos os dados financeiros deste perfil?")) {
    db = emptyState(ownerName());
    originalState = null;
    save();
    render();
  }
}
function importData(event) {
  let file = event.target.files?.[0];
  if (!file) return;
  file.text().then((text) => {
    try {
      if (file.name.endsWith(".csv")) {
        let count = importCsv(text);
        save();
        render();
        toast(count + " lançamento(s) importado(s)");
        return;
      }
      let data = JSON.parse(text);
      if (!Array.isArray(data.items) && !Array.isArray(data.purchases) && !data.patrimonioApp)
        throw Error("Backup incompatível");
      if (!confirm("Substituir os dados deste perfil pelo backup?")) return;
      db = convertState(data.patrimonioApp || data);
      originalState = Array.isArray(data.purchases) ? data : null;
      save();
      render();
      toast("Backup restaurado");
    } catch (error) {
      toast(error.message);
    }
  });
}
async function analyzePlan() {
  if (aiBusy) return;
  let description = document.querySelector("#planText").value.trim(),
    total = Number(document.querySelector("#planAmount").value),
    installments = Number(document.querySelector("#planParts").value),
    start = document.querySelector("#planStart").value;
  aiBusy = true;
  document.querySelector("#planResult").textContent = "Analisando…";
  try {
    await backendWrites;
    let response = await fetch("/api/public/planned-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await cloudToken()) },
      body: JSON.stringify({
        description,
        total,
        installments,
        start,
        person: ownerName(),
        profileType: activeFinanceProfile,
      }),
    });
    if (!response.ok) {
      let error = await response.json();
      throw Error(error.error || "Análise indisponível");
    }
    if (!response.body) throw Error("Análise sem resposta");
    let reader = response.body.getReader(),
      decoder = new TextDecoder(),
      buffer = "",
      comment = "",
      draft = null;
    for (;;) {
      let chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (let line of lines) {
        if (!line) continue;
        let data = JSON.parse(line);
        if (data.error) throw Error(data.error);
        if (data.estimate) {
          let estimate = data.estimate;
          draft = {
            category: "Indicada na análise abaixo",
            summary: "",
            monthly: estimate.payment,
            impact: estimate.months[0]?.percent || 0,
            projections: estimate.months.map((m) => ({
              month: m.month,
              current: m.committed,
              with: m.committed + m.payment,
              balance: m.remaining,
            })),
          };
        }
        if (data.text) comment += data.text;
        if (draft) {
          draft.summary = comment;
          document.querySelector("#planResult").innerHTML = planResult(draft);
        }
      }
    }
    if (draft) {
      db.lastPlan = draft;
      save();
    }
  } catch (error) {
    document.querySelector("#planResult").textContent = error.message;
    toast(error.message);
  } finally {
    aiBusy = false;
    loadAiUsage();
  }
}

function setupProfileMenu() {
  let btn = document.querySelector("#logoutButton"),
    menu = document.querySelector("#profileMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "profileMenu";
    menu.className = "profile-menu";
    menu.hidden = true;
    btn.parentNode.style.position = "relative";
    btn.after(menu);
  }
  btn.title = "Perfil";
  btn.onclick = (e) => {
    e.stopPropagation();
    menu.innerHTML = `<div class="profile-head"><strong>${esc(ownerName())}</strong><small>${esc(authUser?.email || "")}</small></div><button data-a="name">✎ Editar nome</button><button data-a="pass">🔑 Alterar senha</button><button data-a="out" class="out">⎋ Sair</button>`;
    menu.hidden = !menu.hidden;
  };
  menu.onclick = (e) => {
    let a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    menu.hidden = true;
    if (a === "name") openEditName();
    if (a === "pass") openChangePassword();
    if (a === "out") window.doLogout();
  };
  if (!window._pmDoc) {
    window._pmDoc = 1;
    document.addEventListener("click", (e) => {
      let m = document.querySelector("#profileMenu");
      if (m && !m.contains(e.target)) m.hidden = true;
    });
  }
}
function openEditName() {
  showModal(
    "Editar nome",
    `<div class="field"><label>Nome do perfil</label><input name="ownerName" required maxlength="60" value="${esc(ownerName())}"></div>`,
    () => {
      let n = String(new FormData(document.querySelector("#modalForm")).get("ownerName") || "").trim();
      if (!n) return false;
      db.settings.ownerName = n;
      save();
      document.querySelector("#logoutButton").textContent = n.slice(0, 1).toUpperCase();
      toast("Nome atualizado");
    },
  );
}

function billingMonth(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit" }).format(
    date,
  );
}
function resetItemPayment(item, month) {
  if (item.recurring) {
    item.payments = (item.payments || []).filter((p) => (p.month || String(p.date || "").slice(0, 7)) !== month);
    item.paid = 0;
  } else {
    item.payments = [];
    item.paid = 0;
  }
}
function cardCommitment(items, cardId, month) {
  return (
    Math.round(
      items
        .filter((x) => x.kind === "expense" && x.cardId === cardId && !x.recurring && (x.due || x.month) >= month)
        .reduce((sum, x) => sum + Math.max(0, Number(x.amount || 0) - Number(x.paid || 0)), 0) * 100,
    ) / 100
  );
}
function collectionMessage(person, month, group, pix) {
  return (
    `Olá, ${person}! Segue o resumo de ${month}:\n` +
    group.items
      .map(
        (x) =>
          `• ${x.name}${x.installments > 1 ? " (parcela " + x.part + "/" + x.installments + ")" : ""}: ${money(x.amount)}`,
      )
      .join("\n") +
    `\nTotal do mês: ${money(group.total)}\nJá recebido: ${money(group.received)}\nAinda a receber: ${money(group.open)}\nPix: ${pix}\nObrigado!`
  );
}
function normalizeWhatsAppPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return /^55[1-9]\d[2-9]\d{7,8}$/.test(digits) ? digits : "";
}
function formatWhatsAppPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(2);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits ? "(" + digits : "";
  let local = digits.slice(2),
    prefix = local.length > 8 ? 5 : 4;
  return (
    "(" + digits.slice(0, 2) + ") " + local.slice(0, prefix) + (local.length > prefix ? "-" + local.slice(prefix) : "")
  );
}
function whatsAppContactLink(phone) {
  let number = normalizeWhatsAppPhone(phone);
  return number ? `https://api.whatsapp.com/send/?phone=${number}&text&type=phone_number&app_absent=0` : "";
}
function openWhatsAppChat(phone, message) {
  let url = whatsAppContactLink(phone);
  if (!url) return false;
  showModal(
    "Compartilhar pelo WhatsApp",
    `<p>Copie a mensagem se quiser usá-la. O botão abaixo abre somente a conversa de ${esc(formatWhatsAppPhone(phone))}, sem preencher nem enviar texto.</p><div class="field"><label>Mensagem para copiar</label><textarea id="whatsAppMessage" rows="8" readonly>${esc(message)}</textarea></div><div class="person-ledger-actions"><button type="button" class="btn secondary" id="copyWhatsAppMessage">Copiar mensagem</button><a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir conversa sem mensagem ↗</a><button type="button" class="btn secondary" id="copyWhatsAppLink">Copiar link</button></div>`,
    () => {},
  );
  document.querySelector("#copyWhatsAppMessage").onclick = async () => {
    let field = document.querySelector("#whatsAppMessage");
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      field.focus();
      field.select();
      document.execCommand("copy");
    }
    toast("Mensagem copiada");
  };
  document.querySelector("#copyWhatsAppLink").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link do WhatsApp copiado");
    } catch {
      window.prompt("Copie o link do WhatsApp:", url);
    }
  };
  return true;
}
function personPhoneField(person, index) {
  return `<label class="person-phone"><span>WhatsApp</span><input type="tel" inputmode="tel" autocomplete="tel-national" aria-label="WhatsApp de ${esc(person)}" data-person-phone="${index}" value="${esc(formatWhatsAppPhone(db.settings.peoplePhones?.[person] || ""))}" placeholder="(85) 99999-9999" maxlength="20"></label>`;
}
function collectionPage() {
  let groups = Object.entries(monthStats(selected()).groups).filter(
    ([person, g]) => person !== ownerName() && g.items.length,
  );
  return `<div class="spacer"></div><section><div class="section-head"><div><h2>Cobrança por pessoa</h2><p>${monthLabel(selected())}</p></div><button class="btn secondary" data-action="pix-settings">⚙ Chave Pix</button></div><div class="grid collection-person-grid">${groups.map(([person, g]) => `<article class="card"><div class="section-head"><h3>${esc(person)}</h3><button class="btn secondary" data-action="whatsapp" data-id="${esc(person)}" ${g.open <= 0 ? "disabled" : ""}>↗ WhatsApp</button></div>${g.items.map((x) => `<div class="settings-row"><span>${esc(x.name)}</span><strong>${money(x.amount)}</strong></div>`).join("")}<p>Total: ${money(g.total)} · Recebido: ${money(g.received)}</p><strong>A receber: ${money(g.open)}</strong></article>`).join("") || '<div class="empty">Sem despesas de terceiros neste mês.</div>'}</div></section>`;
}
function openPixSettings() {
  showModal(
    "Chave Pix para cobranças",
    `<div class="field"><label for="pixKey">Chave Pix ou código Copia e Cola</label><textarea id="pixKey" name="pix" required maxlength="2000">${esc(db.settings.pix || "")}</textarea></div>`,
    () => {
      db.settings.pix = String(new FormData(document.querySelector("#modalForm")).get("pix") || "").trim();
      save();
      toast("Pix salvo");
    },
  );
}
function chargeWhatsApp(person) {
  let group = monthStats(selected()).groups[person],
    pix = db.settings.pix;
  if (!pix) {
    toast("Cadastre sua chave Pix antes de cobrar.");
    openPixSettings();
    return;
  }
  if (!group || group.open <= 0) return;
  let message = collectionMessage(person, monthLabel(selected()), group, pix);
  if (!openWhatsAppChat(db.settings.peoplePhones?.[person], message)) {
    toast("Cadastre o WhatsApp de " + person + " em Ajustes → Pessoas.");
    setPage("ajustes");
    let index = db.people.indexOf(person);
    document.querySelector(`[data-person-phone="${index}"]`)?.focus();
  }
}
function cardSelect(item) {
  let cards = db.cards || [];
  return `<div class="field"><label>Cartão</label><select name="cardId"><option value="">Sem cartão / não vinculado</option>${cards.map((card) => `<option value="${esc(card.id)}" ${item?.cardId === card.id ? "selected" : ""}>${esc(card.name)}</option>`).join("")}</select></div>`;
}
function cardsPage() {
  let cards = db.cards || [],
    limit = cards.reduce((sum, card) => sum + Number(card.limit || 0), 0),
    used = cards.reduce((sum, card) => sum + cardCommitment(db.items, card.id, selected()), 0);
  const cardTiles = cards
    .map((card) => {
      const committed = cardCommitment(db.items, card.id, selected()),
        available = Math.max(0, Number(card.limit || 0) - committed),
        percent = card.limit ? Math.min(100, Math.max(0, (committed / Number(card.limit)) * 100)) : 0;
      const closed = (db.cardStatements || []).find(
        (statement) => statement.cardId === card.id && statement.month === selected(),
      );
      const invoiceItems = typeItems("expense", selected()).filter(
          (item) => item.cardId === card.id && (!closed?.itemIds || closed.itemIds.includes(item.id)),
        ),
        invoiceTotal = invoiceItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        shownTotal = Number(closed?.total ?? invoiceTotal);
      const isSubscription = (item) => Boolean(item.recurring || /assinatura/i.test(item.category || ""));
      const isInstallment = (item) => !isSubscription(item) && Number(item.installments || 1) > 1;
      const groups = [
        { id: "installments", label: "Parcelas", items: invoiceItems.filter(isInstallment), color: "blue" },
        {
          id: "transactions",
          label: "Transações",
          items: invoiceItems.filter((item) => !isInstallment(item) && !isSubscription(item)),
          color: "lime",
        },
        { id: "subscriptions", label: "Assinaturas", items: invoiceItems.filter(isSubscription), color: "white" },
        { id: "refunds", label: "Estornos", items: [], color: "muted" },
      ].map((group) => ({ ...group, total: group.items.reduce((sum, item) => sum + Number(item.amount || 0), 0) }));
      const segments = groups
        .filter((group) => group.total > 0)
        .map(
          (group) =>
            `<i class="${group.color}" style="width:${shownTotal ? Math.min(100, (group.total / shownTotal) * 100) : 0}%" aria-hidden="true"></i>`,
        )
        .join("");
      const breakdown = groups
        .map(
          (group) =>
            `<div class="invoice-breakdown-row"><i class="${group.color}" aria-hidden="true"></i><span>${group.label}</span><strong class="privacy-sensitive">${money(group.total)}</strong></div>`,
        )
        .join("");
      const tabs = [
        ["all", "Todas", invoiceItems.length],
        ["transactions", "Transações", groups[1].items.length],
        ["installments", "Parcelas", groups[0].items.length],
        ["subscriptions", "Assinaturas", groups[2].items.length],
      ];
      const itemRows = invoiceItems
        .map((item) => {
          const type = isSubscription(item) ? "subscriptions" : isInstallment(item) ? "installments" : "transactions",
            category = item.category || "Despesa",
            part = isInstallment(item)
              ? `Parcela ${item.part || 1}/${item.installments}`
              : isSubscription(item)
                ? "Recorrente"
                : category;
          return `<article class="invoice-ledger-row" data-invoice-type="${type}"><span class="invoice-ledger-icon ${type}" aria-hidden="true">${esc(category.toLocaleUpperCase("pt-BR").slice(0, 1))}</span><span class="invoice-ledger-copy"><strong>${esc(item.name)}</strong><small>${esc(category)} · ${esc(part)}${item.person && item.person !== ownerName() ? ` · ${esc(item.person)}` : ""}</small></span><b class="privacy-sensitive">${money(item.amount)}</b></article>`;
        })
        .join("");
      return `<article class="card credit-card-tile"><div class="credit-card-header"><span class="credit-card-mark" aria-hidden="true">${esc(
        String(card.name || "C")
          .trim()
          .slice(0, 1)
          .toUpperCase(),
      )}</span><div class="credit-card-name"><h3>${esc(card.name)}</h3><small>Cartão de crédito</small></div><div class="row-actions"><button class="mini-btn" data-action="card-edit" data-id="${esc(card.id)}" aria-label="Editar ${esc(card.name)}">✎</button><button class="mini-btn" data-action="card-delete" data-id="${esc(card.id)}" aria-label="Excluir ${esc(card.name)}">🗑</button></div></div><div class="credit-card-invoice"><div><small>Fatura de ${esc(monthLabel(selected()))}</small><strong class="privacy-sensitive">${money(shownTotal)}</strong></div><span class="badge ${closed ? "paid" : "pending"}">${closed ? "Fechada" : "Em aberto"}</span></div><div class="invoice-composition"><div class="invoice-composition-bar" role="img" aria-label="Composição da fatura">${segments || '<i class="muted" style="width:100%"></i>'}</div><div class="invoice-breakdown">${breakdown}</div><p class="invoice-estimate-note">ⓘ Estimativa baseada nos lançamentos cadastrados. O valor pode diferir do aplicativo do banco.</p><div class="invoice-ledger-tabs" role="tablist" aria-label="Filtrar lançamentos da fatura">${tabs.map(([id, label, count], index) => `<button type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" class="${index === 0 ? "active" : ""}" data-invoice-tab="${id}">${label}<small>${count}</small></button>`).join("")}</div><label class="invoice-search"><span aria-hidden="true">⌕</span><input type="search" data-invoice-search placeholder="Buscar nesta fatura" aria-label="Buscar lançamentos nesta fatura"></label><div class="invoice-ledger-list">${itemRows || '<div class="empty">Nenhum lançamento vinculado a este cartão no período.</div>'}<p class="invoice-ledger-empty" hidden>Nenhum lançamento encontrado.</p></div></div><div class="credit-card-limit"><div class="credit-card-limit-label"><span>Limite utilizado</span><strong class="privacy-sensitive">${money(committed)} <small>de ${money(card.limit)}</small></strong></div><div class="credit-card-progress" role="img" aria-label="${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do limite utilizado"><i class="${percent >= 90 ? "near-limit" : ""}" style="width:${percent}%"></i></div><div class="credit-card-available"><span>Disponível estimado</span><strong class="privacy-sensitive">${money(available)}</strong></div></div><div class="credit-card-footer"><span>Fechamento dia ${esc(card.closingDay)}</span><span>Vencimento dia ${esc(card.dueDay)}</span></div></article>`;
    })
    .join("");
  return `<div class="spacer"></div><section class="registered-cards-section"><div class="section-head"><div><h2>Cartões e limites</h2><p>Faturas e limite estimado no período selecionado</p></div><button class="btn primary" data-action="card-add">＋ Cadastrar cartão</button></div><div class="grid stats credit-card-summary">${statsCard("Limite global", money(limit), "Soma dos limites cadastrados", "▣")}${statsCard("Comprometido", money(used), "Parcelas em aberto deste mês em diante", "◷")}${statsCard("Disponível estimado", money(Math.max(0, limit - used)), limit ? ((used / limit) * 100).toFixed(1) + "% comprometido" : "Sem limites cadastrados", "↗")}</div><div class="credit-card-grid">${cardTiles || '<div class="empty">Nenhum cartão cadastrado.</div>'}</div><p class="metric credit-card-note">O limite considera parcelas não pagas vinculadas ao cartão a partir do mês selecionado. Faturas não são somadas novamente; recorrências sem prazo não reservam limite futuro. O disponível real deve ser confirmado com o banco.</p></section>`;
}
function openCard(id) {
  let card = (db.cards || []).find((c) => c.id === id);
  showModal(
    card ? "Editar cartão" : "Cadastrar cartão",
    `<div class="field"><label>Nome do cartão</label><input name="name" required maxlength="60" value="${esc(card?.name || "")}"></div><div class="field"><label>Limite total (R$)</label><input name="limit" type="number" min="0.01" step="0.01" required value="${card?.limit || ""}"></div><div class="form-grid"><div class="field"><label>Dia de fechamento</label><input name="closingDay" type="number" min="1" max="31" step="1" required value="${card?.closingDay || ""}"></div><div class="field"><label>Dia de vencimento</label><input name="dueDay" type="number" min="1" max="31" step="1" required value="${card?.dueDay || ""}"></div></div>`,
    () => {
      let f = Object.fromEntries(new FormData(document.querySelector("#modalForm"))),
        value = {
          id: card?.id || crypto.randomUUID(),
          name: String(f.name).trim(),
          limit: Number(f.limit),
          closingDay: Number(f.closingDay),
          dueDay: Number(f.dueDay),
        };
      if (
        !value.name ||
        !Number.isFinite(value.limit) ||
        value.limit <= 0 ||
        ![value.closingDay, value.dueDay].every((d) => Number.isInteger(d) && d >= 1 && d <= 31)
      ) {
        toast("Confira limite e dias do cartão.");
        return false;
      }
      db.cards ||= [];
      if (card) Object.assign(card, value);
      else db.cards.push(value);
      save();
      toast("Cartão salvo");
    },
  );
}
function deleteCard(id) {
  if (!confirm("Excluir cartão? As compras serão preservadas, sem vínculo com este cartão.")) return;
  db.cards = (db.cards || []).filter((c) => c.id !== id);
  for (let item of db.items) if (item.cardId === id) item.cardId = "";
  save();
  render();
}
function safetyPage() {
  if (typeof hasFeature === "function" && !hasFeature("account.export"))
    return `<div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Histórico e cópias de segurança</h2><p>Acesso restrito ao nível autorizado.</p></div></div></section>`;
  return `<div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Histórico de segurança</h2><p>Últimas 7 versões anteriores · apenas desta conta</p></div><button class="btn secondary" data-action="history-refresh">↻ Atualizar</button></div><div id="historyRows" class="table-wrap"><p>Carregando versões…</p></div></section><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Cópias diárias</h2><p>O primeiro acesso do dia cria uma cópia · até 7 cópias disponíveis por até uma semana.</p></div><button class="btn secondary" data-action="backup-refresh">↻ Atualizar</button></div><div id="dailyBackupRows" class="table-wrap"><p>Carregando cópias…</p></div></section>`;
}
async function loadHistory() {
  let target = document.querySelector("#historyRows");
  if (!target) return;
  try {
    await backendWrites;
    let response = await cloudFetch("/rest/v1/app_state_history?select=id,saved_at&order=id.desc&limit=7");
    if (!response.ok) throw Error("Não foi possível carregar o histórico.");
    let rows = await response.json();
    target.innerHTML = rows.length
      ? `<table><thead><tr><th>Estado salvo em (Fortaleza)</th><th>Ação</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(new Date(row.saved_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }))}</td><td><button class="btn secondary" data-action="history-restore" data-id="${row.id}">↶ Restaurar</button></td></tr>`).join("")}</tbody></table>`
      : '<div class="empty">O histórico começa na próxima alteração salva online.</div>';
    target.querySelectorAll("[data-action]").forEach((b) => (b.onclick = () => restoreHistory(b.dataset.id)));
  } catch (error) {
    target.textContent = error.message;
  }
}
async function loadDailyBackups() {
  const target = document.querySelector("#dailyBackupRows");
  if (!target) return;
  try {
    const response = await cloudFetch("/rest/v1/rpc/list_daily_financial_backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw Error("Não foi possível carregar as cópias diárias.");
    const rows = await response.json();
    target.innerHTML = rows.length
      ? `<table><thead><tr><th>Data da cópia</th><th>Última atualização</th><th>Ação</th></tr></thead><tbody>${rows.map(row => {
          const date = new Date(`${row.backup_date}T12:00:00-03:00`);
          const created = new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
          return `<tr><td>${esc(date.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }))}</td><td>${esc(created)}</td><td><button class="btn secondary" data-action="backup-restore" data-id="${esc(row.backup_date)}">↶ Restaurar</button></td></tr>`;
        }).join("")}</tbody></table>`
      : '<div class="empty">A primeira cópia diária será criada no próximo ciclo de backup.</div>';
  } catch (error) {
    target.textContent = error.message;
  }
}
async function restoreHistory(id) {
  if (
    !confirm(
      "Restaurar esta versão? Os dados atuais serão substituídos e guardados no histórico; a versão mais antiga pode sair do limite de 7.",
    )
  )
    return;
  try {
    await backendWrites;
    let response = await cloudFetch("/rest/v1/rpc/restore_financial_state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_history_id: Number(id) }),
    });
    if (!response.ok || (await response.json()) !== true) throw Error("Versão indisponível ou acesso expirado.");
    await readCloudState();
    applyTheme();
    render();
    toast("Estado restaurado");
  } catch (error) {
    toast(error.message);
  }
}
async function restoreDailyBackup(date) {
  const label = new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  if (!confirm(`Restaurar a cópia de ${label}? Os dados atuais serão preservados no histórico antes da restauração.`)) return;
  try {
    await backendWrites;
    const response = await cloudFetch("/rest/v1/rpc/restore_daily_financial_backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_backup_date: date }),
    });
    if (!response.ok || (await response.json()) !== true) throw Error("Cópia indisponível ou acesso expirado.");
    await readCloudState();
    applyTheme();
    render();
    loadHistory();
    loadDailyBackups();
    toast("Cópia diária restaurada");
  } catch (error) {
    toast(error.message);
  }
}
async function loadAiUsage() {
  let target = document.querySelector("#aiUsage");
  if (!target) return;
  try {
    let response = await fetch("/api/public/ai-usage", {
        headers: { Authorization: "Bearer " + (await cloudToken()) },
      }),
      data = await response.json();
    if (!response.ok) throw Error(data.error);
    target.textContent = !data.enabled
      ? "IA desativada pelo administrador"
      : data.limit === null
        ? "Administrador · sem limite mensal de IA"
        : `${data.used} de ${data.limit} análises utilizadas em ${monthLabel(data.month.slice(0, 7))} · renova dia 1º (Fortaleza)`;
    let button = document.querySelector("#planForm button");
    if (button) button.disabled = !data.allowed || aiBusy;
  } catch (error) {
    target.textContent = error.message;
    let button = document.querySelector("#planForm button");
    if (button) button.disabled = true;
  }
}
