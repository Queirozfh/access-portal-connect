/* Plan catalog, PF self-service screen, and administrator plan editor. */
let subscriptionCatalogCache = null;
let adminPlanCache = [];

function subscriptionsCall(method = "GET", body = null) {
  const controller = method === "GET" ? new AbortController() : null;
  const request = async () => {
    const token = await cloudToken();
    const response = await fetch("/api/public/subscriptions", {
      method,
      headers: {
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || `Não foi possível concluir a operação (HTTP ${response.status}).`);
    return result;
  };
  if (!controller) return request();

  let timeout;
  const limit = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(Error("O servidor demorou para responder. Tente carregar os planos novamente."));
    }, 90000);
  });
  return Promise.race([request(), limit]).finally(() => clearTimeout(timeout));
}

function subscriptionMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parsePlanPrice(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s|R\$/gi, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

function subscriptionDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

function subscriptionStatusText(status) {
  return ({
    admin: "Acesso administrativo",
    trialing: "Período de teste",
    active: "Ativo",
    expired: "Período encerrado",
    canceled: "Cancelado",
  })[status] || "Acesso atual";
}

function planFeatureMarkup(features) {
  if (!features?.length) return '<p class="plan-feature-empty">Nenhuma função configurada para este nível.</p>';
  const groups = new Map();
  for (const feature of features) {
    const category = feature.category || "Recursos";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(feature);
  }
  return [...groups.entries()].map(([category, items]) =>
    `<div class="plan-feature-group"><strong>${esc(category)}</strong><ul>${items.map((feature) => `<li>${esc(feature.label)}</li>`).join("")}</ul></div>`,
  ).join("");
}

function subscriptionComparisonMarkup(plans) {
  const visiblePlans = plans || [];
  const grouped = new Map();
  for (const plan of visiblePlans) {
    for (const feature of plan.features || []) {
      const category = feature.category || "Recursos";
      if (!grouped.has(category)) grouped.set(category, new Map());
      grouped.get(category).set(feature.id || feature.label, feature);
    }
  }
  if (!grouped.size || !visiblePlans.length) return "";

  const headers = visiblePlans.map((plan) =>
    `<th scope="col"><span>${esc(plan.name)}</span><small>Nível ${Number(plan.access_level) || 1}</small></th>`,
  ).join("");
  const rows = [...grouped.entries()].map(([category, features]) =>
    `<tr class="subscription-comparison-category"><th colspan="${visiblePlans.length + 1}" scope="colgroup">${esc(category)}</th></tr>${[...features.entries()].map(([featureId, feature]) =>
      `<tr><th scope="row">${esc(feature.label)}</th>${visiblePlans.map((plan) => {
        const included = (plan.features || []).some((entry) => (entry.id || entry.label) === featureId);
        return `<td><span class="subscription-compare-mark ${included ? "included" : "not-included"}" aria-label="${included ? "Incluído" : "Não incluído"}">${included ? "✓" : "—"}</span></td>`;
      }).join("")}</tr>`,
    ).join("")}`,
  ).join("");

  return `<section class="subscription-comparison card" aria-labelledby="subscriptionComparisonTitle">
    <div class="subscription-comparison-heading"><div><span class="eyebrow">COMPARAÇÃO</span><h3 id="subscriptionComparisonTitle">Veja o que cada plano inclui</h3><p>Os recursos acompanham o nível e as permissões configurados para sua conta.</p></div><span class="subscription-comparison-count">${grouped.size} categorias</span></div>
    <div class="subscription-comparison-scroll" tabindex="0" aria-label="Tabela comparativa dos recursos dos planos">
      <table class="subscription-comparison-table"><thead><tr><th scope="col">Recursos</th>${headers}</tr></thead><tbody>${rows}</tbody></table>
    </div>
  </section>`;
}

let subscriptionBillingPeriod = "monthly";
let subscriptionAnnualMigrationState = { targetPlanId: "", days: null, discountPercent: null };

function subscriptionAnnualPlanName(plan) {
  const suffix = " Anual";
  return plan?.name?.endsWith(suffix) ? plan.name.slice(0, -suffix.length) : plan?.name || "";
}

function subscriptionAnnualPriceDetails(plan, allPlans) {
  const monthly = allPlans.find((entry) =>
    !entry.is_free &&
    Number(entry.access_level) === Number(plan.access_level) &&
    Number(entry.duration_days) === 30
  );
  if (!monthly) return "";
  const regularAnnualPrice = Number(monthly.price_cents) * 12;
  const savings = Math.max(0, regularAnnualPrice - Number(plan.price_cents));
  if (!regularAnnualPrice || !savings) return "";
  const discount = (savings / regularAnnualPrice * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `<div class="subscription-annual-price-details">
      <div><s>${esc(subscriptionMoney(regularAnnualPrice))}</s><span>${discount}% de desconto</span></div>
      <p>Equivale a <strong>${esc(subscriptionMoney(Number(plan.price_cents) / 12))}</strong> por mês</p>
      <small>Economia anual de ${esc(subscriptionMoney(savings))}</small>
    </div>`;
}

function subscriptionAnnualDaysRemaining(expiresAt) {
  const expires = Date.parse(expiresAt || "");
  if (!Number.isFinite(expires)) return 365;
  return Math.max(1, Math.min(365, Math.ceil((expires - Date.now()) / 86400000)));
}

function recommendedAnnualUpgradeDiscount(currentLevel, targetLevel) {
  const discounts = {
    "2:3": 5, "2:4": 10, "2:5": 15,
    "3:4": 5, "3:5": 10,
    "4:5": 15,
  };
  return discounts[`${Number(currentLevel)}:${Number(targetLevel)}`] || 0;
}

function annualMigrationMarkup(snapshot) {
  const subscription = snapshot.subscription || {};
  const current = subscription.currentPlan;
  if (
    subscriptionBillingPeriod !== "annual" ||
    !current ||
    Number(current.duration_days) < 360 ||
    Number(current.access_level) >= 5 ||
    !["active", "trialing"].includes(subscription.status || "active") ||
    snapshot.expired
  ) return "";
  const targets = (snapshot.plans || [])
    .filter((plan) => !plan.is_free && Number(plan.duration_days) >= 360 && Number(plan.access_level) > Number(current.access_level))
    .sort((a, b) => Number(a.access_level) - Number(b.access_level));
  if (!targets.length) return "";
  const fallbackTarget = targets.find((plan) => Number(plan.access_level) === 5) || targets[targets.length - 1];
  const selectedTarget = targets.find((plan) => plan.id === subscriptionAnnualMigrationState.targetPlanId) || fallbackTarget;
  const days = Number.isInteger(subscriptionAnnualMigrationState.days)
    ? Math.max(1, Math.min(365, subscriptionAnnualMigrationState.days))
    : subscriptionAnnualDaysRemaining(subscription.expiresAt);
  const discount = Number.isFinite(subscriptionAnnualMigrationState.discountPercent)
    ? subscriptionAnnualMigrationState.discountPercent
    : recommendedAnnualUpgradeDiscount(current.access_level, selectedTarget.access_level);
  const pendingSamePlan = subscription.pendingPlan?.id === selectedTarget.id;
  return `<section class="subscription-annual-upgrade card" data-annual-upgrade>
    <div class="subscription-annual-upgrade-heading">
      <div><span class="eyebrow">MIGRAÇÃO ANUAL</span><h3>Simule um upgrade</h3><p>O crédito considera os dias restantes do seu plano anual. Você pode solicitar a mudança sem perder o período já pago.</p></div>
      <span class="subscription-upgrade-mark" aria-hidden="true">↗</span>
    </div>
    <div class="subscription-annual-upgrade-controls">
      <label><span>Plano atual</span><input type="text" readonly value="${esc(subscriptionAnnualPlanName(current))} · ${esc(subscriptionMoney(current.price_cents))}/ano"></label>
      <label><span>Plano desejado</span><select data-annual-target>${targets.map((plan) =>
        `<option value="${esc(plan.id)}" ${plan.id === selectedTarget.id ? "selected" : ""}>${esc(subscriptionAnnualPlanName(plan))} · ${esc(subscriptionMoney(plan.price_cents))}/ano</option>`
      ).join("")}</select></label>
      <label class="subscription-annual-days"><span>Dias restantes <output data-annual-days-label>${days} dias</output></span><input type="range" data-annual-days min="1" max="365" value="${days}"></label>
      <label><span>Desconto adicional</span><select data-annual-discount>
        ${[0, 5, 10, 15].map((value) => `<option value="${value}" ${value === discount ? "selected" : ""}>${value === 0 ? "Sem bônus" : value + "%"}`).join("")}
      </select></label>
    </div>
    <div class="subscription-annual-quote" data-annual-quote></div>
    <button type="button" class="btn primary subscription-plan-action subscription-annual-request" data-annual-upgrade-request data-request-plan="${esc(selectedTarget.id)}" data-annual-upgrade="true" ${pendingSamePlan ? "disabled" : ""}>${pendingSamePlan ? "Solicitação pendente" : "Solicitar análise do upgrade"}</button>
    <small class="subscription-annual-disclaimer">Estimativa para análise administrativa. O app não realiza cobrança online; o valor final e o incentivo dependem de confirmação.</small>
  </section>`;
}

function renderAnnualMigrationQuote() {
  const panel = document.querySelector("[data-annual-upgrade]");
  const snapshot = subscriptionCatalogCache;
  if (!panel || !snapshot?.subscription?.currentPlan) return;
  const current = snapshot.subscription.currentPlan;
  const targetSelect = panel.querySelector("[data-annual-target]");
  const discountSelect = panel.querySelector("[data-annual-discount]");
  const daysInput = panel.querySelector("[data-annual-days]");
  const target = snapshot.plans?.find((plan) => plan.id === targetSelect?.value);
  if (!target || !discountSelect || !daysInput) return;
  const days = Math.max(1, Math.min(365, Number(daysInput.value) || 1));
  const discountPercent = Math.max(0, Math.min(15, Number(discountSelect.value) || 0));
  const targetValue = Math.round(Number(target.price_cents) * days / 365);
  const currentCredit = Math.round(Number(current.price_cents) * days / 365);
  const difference = Math.max(0, targetValue - currentCredit);
  const discount = Math.round(difference * discountPercent / 100);
  const finalValue = Math.max(0, difference - discount);
  const quote = panel.querySelector("[data-annual-quote]");
  if (quote) quote.innerHTML = `<div><span>Valor proporcional do plano desejado</span><strong>${esc(subscriptionMoney(targetValue))}</strong></div>
    <div><span>Crédito do plano atual</span><strong>− ${esc(subscriptionMoney(currentCredit))}</strong></div>
    <div><span>Diferença antes do incentivo</span><strong>${esc(subscriptionMoney(difference))}</strong></div>
    <div><span>Desconto adicional (${discountPercent}%)</span><strong>− ${esc(subscriptionMoney(discount))}</strong></div>
    <div class="subscription-annual-quote-total"><span>Valor estimado da migração</span><strong>${esc(subscriptionMoney(finalValue))}</strong></div>`;
  const daysLabel = panel.querySelector("[data-annual-days-label]");
  if (daysLabel) daysLabel.textContent = `${days} dias`;
  const requestButton = panel.querySelector("[data-annual-upgrade-request]");
  if (requestButton) {
    requestButton.dataset.requestPlan = target.id;
    const pendingSamePlan = snapshot.subscription.pendingPlan?.id === target.id;
    requestButton.disabled = pendingSamePlan;
    requestButton.textContent = pendingSamePlan ? "Solicitação pendente" : "Solicitar análise do upgrade";
  }
}

function renderSubscriptionPageFromCache() {
  const content = document.querySelector("#content");
  if (!content || page !== "plano" || !subscriptionCatalogCache) return;
  content.innerHTML = subscriptionPageMarkup(subscriptionCatalogCache);
  renderAnnualMigrationQuote();
}

function subscriptionPageMarkup(snapshot) {
  const subscription = snapshot.subscription || {};
  const currentPlan = subscription.currentPlan;
  const pendingPlan = subscription.pendingPlan;
  const status = subscription.status || "active";
  const expired = Boolean(snapshot.expired || authUser?.expired || status === "expired");
  const annualBilling = subscriptionBillingPeriod === "annual";
  const allPlans = snapshot.plans || [];
  const freePlans = allPlans.filter((plan) => plan.is_free);
  const paidPlans = allPlans.filter((plan) =>
    !plan.is_free &&
    (annualBilling ? Number(plan.duration_days) >= 360 : Number(plan.duration_days) < 360)
  );
  const plans = [...freePlans, ...paidPlans];
  const statusCopy = status === "trialing" && subscription.expiresAt
    ? `Seu teste gratuito termina em ${esc(subscriptionDate(subscription.expiresAt))}.`
    : status === "expired"
      ? "O período de acesso terminou. Escolha um plano para continuar usando o sistema após a configuração do pagamento."
      : status === "admin"
        ? "Sua conta administrativa tem acesso completo ao sistema."
        : currentPlan
          ? `Plano vigente até ${esc(subscriptionDate(subscription.expiresAt) || "prazo indeterminado")}.`
          : "Sua conta mantém as condições de acesso anteriores. Escolha um plano quando desejar conhecer as opções comerciais.";
  const current = currentPlan
    ? `<strong>${esc(subscriptionAnnualPlanName(currentPlan))}</strong><span>Nível ${currentPlan.access_level} · ${esc(subscriptionStatusText(status))}${Number(currentPlan.duration_days) >= 360 ? " · Anual" : ""}</span>`
    : `<strong>${status === "admin" ? "Administrador" : "Acesso atual"}</strong><span>Nível ${Number(subscription.currentAccessLevel) || 1} · ${esc(subscriptionStatusText(status))}</span>`;
  const pendingDowngrade = Boolean(
    currentPlan && pendingPlan && (Number(pendingPlan.access_level) < Number(currentPlan.access_level) || Number(pendingPlan.duration_days) < Number(currentPlan.duration_days))
  );
  const pending = pendingPlan
    ? pendingDowngrade
      ? `<div class="subscription-pending"><strong>Redução solicitada: ${esc(subscriptionAnnualPlanName(pendingPlan))}</strong><span>Seu acesso atual continua até ${esc(subscriptionDate(subscription.expiresAt) || "o vencimento do ciclo")}. A mudança depende de confirmação administrativa.</span><small>Solicitado em ${esc(subscriptionDate(subscription.pendingRequestedAt))}</small></div>`
      : `<div class="subscription-pending"><strong>Solicitação registrada: ${esc(subscriptionAnnualPlanName(pendingPlan))}</strong><span>O plano continuará pendente até que exista confirmação do administrador.</span><small>Solicitado em ${esc(subscriptionDate(subscription.pendingRequestedAt))}</small></div>`
    : "";
  const highestLevel = Math.max(0, ...paidPlans.map((plan) => Number(plan.access_level) || 0));
  const cards = plans.map((plan) => {
    const isAnnualPlan = !plan.is_free && Number(plan.duration_days) >= 360;
    const displayName = subscriptionAnnualPlanName(plan);
    const isCurrent = currentPlan?.id === plan.id && ["active", "trialing"].includes(status) && !expired;
    const isPending = pendingPlan?.id === plan.id;
    const action = plan.is_free
      ? (isCurrent ? "Plano atual" : "Teste incluído no cadastro")
      : isCurrent
        ? "Plano atual"
        : isPending
          ? "Solicitação pendente"
          : "Solicitar plano";
    const disabled = Boolean(plan.is_free || isCurrent || isPending || status === "admin");
    const isHighest = !plan.is_free && Number(plan.access_level) === highestLevel;
    const resourceSummary = Number(plan.access_level) === 5
      ? "+ de 100 recursos disponíveis"
      : `${plan.features?.length || 0} recursos disponíveis`;
    const priceMarkup = plan.is_free
      ? '<div class="subscription-price">Gratuito</div>'
      : isAnnualPlan
        ? `<div class="subscription-price">${esc(subscriptionMoney(plan.price_cents))}<small>por ano</small></div>${subscriptionAnnualPriceDetails(plan, allPlans)}`
        : `<div class="subscription-price">${esc(subscriptionMoney(plan.price_cents))}<small>por 30 dias</small></div>`;
    return `<article class="subscription-plan-card ${isCurrent ? "is-current" : ""} ${isHighest ? "is-highest" : ""} ${plan.is_free ? "is-free" : ""}">
      ${isHighest ? `<span class="subscription-plan-ribbon">${isAnnualPlan ? "Maior economia anual" : "Nível mais completo"}</span>` : ""}
      <div class="subscription-plan-heading"><div><span class="plan-level-pill">Nível ${plan.access_level}</span><h3>${esc(displayName)}</h3></div>${isCurrent ? '<span class="plan-current-badge">Atual</span>' : ""}</div>
      <p class="subscription-plan-description">${esc(plan.description || "Acesso financeiro pessoal com recursos definidos por nível.")}</p>
      ${priceMarkup}
      <p class="subscription-term">${plan.is_free ? `${plan.duration_days} dias de teste gratuito` : isAnnualPlan ? "Acesso por 1 ano (365 dias)" : "Acesso por 30 dias"}</p>
      <div class="subscription-plan-includes"><span class="subscription-plan-includes-icon" aria-hidden="true">✓</span><span><strong>${esc(resourceSummary)}</strong><small>Confira a comparação completa abaixo</small></span></div>
      <button class="btn ${disabled ? "secondary" : "primary"} subscription-plan-action" data-request-plan="${esc(plan.id)}" ${disabled ? "disabled" : ""}>${action}</button>
    </article>`;
  }).join("");
  const noAnnualPlans = annualBilling && !paidPlans.length
    ? '<div class="subscription-annual-empty">As opções anuais estão sendo preparadas. O administrador precisa atualizar o catálogo comercial.</div>'
    : "";
  const periodSwitch = `<div class="subscription-period-switch" role="group" aria-label="Período do plano">
    <button type="button" data-plan-period="monthly" aria-pressed="${String(!annualBilling)}" class="${annualBilling ? "" : "active"}">Mensal</button>
    <button type="button" data-plan-period="annual" aria-pressed="${String(annualBilling)}" class="${annualBilling ? "active" : ""}">Anual <span>Até 33,22% de economia</span></button>
  </div>`;
  const annualNotice = annualBilling
    ? '<p class="subscription-period-note">Pagamento anual com desconto progressivo. O plano Completo e PJ oferece a maior economia.</p>'
    : "";
  const renewalNotice = '<div class="subscription-payment-notice"><span class="subscription-payment-icon" aria-hidden="true">ⓘ</span><div><strong>Solicitações e renovações</strong><span>O pagamento online ainda não está configurado. Os pedidos ficam pendentes de validação administrativa. Simulações de upgrade anual são estimativas; downgrades não reduzem seu acesso antes do vencimento do ciclo. A renovação seguirá o preço vigente informado, após confirmação.</span></div></div>';
  const plansGrid = plans.length
    ? `<div class="subscription-plan-grid">${cards}</div>`
    : "";
  const migration = annualMigrationMarkup(snapshot);
  return `<section class="subscription-intro"><div class="subscription-intro-copy"><span class="eyebrow">PLANOS PARA SUA CONTA</span><h2>${annualBilling ? "Planos anuais com desconto" : "Escolha o nível ideal para você"}</h2><p>Compare níveis, recursos e período. Seu controle financeiro continua organizado no padrão do Meu Patrimônio.</p></div><span class="subscription-intro-mark" aria-hidden="true">✦</span></section>
    <section class="subscription-current-card"><div><span class="subscription-status-label">${esc(subscriptionStatusText(status))}</span><div class="subscription-current-info">${current}</div><p>${statusCopy}</p></div>${pending}</section>
    ${renewalNotice}
    ${periodSwitch}
    ${annualNotice}
    ${noAnnualPlans}
    ${plansGrid || '<div class="empty">Nenhum plano disponível no momento.</div>'}
    ${migration}
    ${subscriptionComparisonMarkup(plans)}`;
}

async function loadSubscriptionPage() {
  const content = document.querySelector("#content");
  if (!content || page !== "plano") return;
  content.innerHTML = '<section class="card"><p>Carregando planos…</p></section>';
  try {
    if (authUser?.role === "admin") {
      try {
        await subscriptionsCall("POST", { action: "sync-commercial-plans" });
      } catch (syncError) {
        console.warn("Não foi possível sincronizar o catálogo anual", syncError);
      }
    }
    const snapshot = await subscriptionsCall();
    if (page !== "plano") return;
    subscriptionCatalogCache = snapshot;
    renderSubscriptionPageFromCache();
  } catch (error) {
    if (page === "plano") content.innerHTML = `<section class="card"><div class="auth-error">${esc(error.message)}</div><button class="btn secondary" data-subscription-reload>↻ Tentar novamente</button></section>`;
  }
}

function adminPlansMarkup() {
  return `<div class="admin-plan-toolbar"><div><h2>Planos comerciais PF</h2><p>Defina preço por período, duração e nível de funções de cada plano.</p></div><button class="btn primary" data-plan-new>＋ Novo plano pago</button></div>
    <form id="adminPlanForm" class="admin-plan-form" hidden novalidate>
      <input type="hidden" name="id"><input type="hidden" name="is_free">
      <div class="admin-plan-form-heading"><strong id="adminPlanFormTitle">Novo plano</strong><button type="button" class="mini-btn" data-plan-cancel>Fechar</button></div>
      <div class="admin-plan-fields">
        <label class="field"><span>Nome</span><input name="name" maxlength="80" required placeholder="Ex.: Essencial"></label>
        <label class="field"><span>Preço por período (R$)</span><input name="price" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 29,90" required></label>
        <label class="field"><span>Duração (dias)</span><input name="duration_days" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Ex.: 30" required value="30"></label>
        <label class="field"><span>Nível de acesso</span><select name="access_level">${[1, 2, 3, 4, 5].map((level) => `<option value="${level}">Nível ${level} · ${["Básico", "Essencial", "Intermediário", "Avançado", "Completo"][level - 1]}</option>`).join("")}</select></label>
        <label class="field admin-plan-description"><span>Descrição para o usuário</span><textarea name="description" maxlength="500" rows="2" placeholder="Resumo do que este plano oferece"></textarea></label>
        <label class="admin-plan-active"><input type="checkbox" name="is_active" checked> Exibir para novos usuários</label>
      </div>
      <div class="admin-plan-preview"><strong>Funções que este nível libera</strong><div data-plan-feature-preview>Escolha um nível.</div></div>
      <div class="admin-plan-form-actions"><span id="adminPlanStatus" role="status"></span><button type="submit" class="btn primary">Salvar plano</button></div>
    </form><div class="admin-plan-list" id="adminPlanList"><p class="empty">Carregando planos…</p></div>`;
}

function adminTabsMarkup() {
  return `<div class="admin-tabbar" role="tablist" aria-label="Seções administrativas"><button type="button" role="tab" aria-selected="true" class="active" data-admin-tab="access">Acessos e permissões</button><button type="button" role="tab" aria-selected="false" data-admin-tab="plans">Planos comerciais</button></div>`;
}

function mountAdminTabs() {
  const content = document.querySelector("#content");
  if (!content || content.querySelector(".admin-tabbar")) return;
  const oldContent = [...content.children];
  const accessPane = document.createElement("div");
  accessPane.className = "admin-tab-pane";
  accessPane.dataset.adminPane = "access";
  oldContent.forEach((node) => accessPane.append(node));
  const plansPane = document.createElement("div");
  plansPane.className = "admin-tab-pane";
  plansPane.dataset.adminPane = "plans";
  plansPane.hidden = true;
  plansPane.innerHTML = `<section class="card admin-plans-card">${adminPlansMarkup()}</section>`;
  content.replaceChildren();
  content.insertAdjacentHTML("beforeend", adminTabsMarkup());
  content.append(accessPane, plansPane);
  const planForm = plansPane.querySelector("#adminPlanForm");
  if (planForm) planForm.onsubmit = saveAdminPlanForm;
}

function renderAdminPlanList(plans) {
  adminPlanCache = plans || [];
  const root = document.querySelector("#adminPlanList");
  if (!root) return;
  if (!adminPlanCache.length) {
    root.innerHTML = '<div class="empty">Nenhum plano cadastrado.</div>';
    return;
  }
  root.innerHTML = adminPlanCache.map((plan) => `<article class="admin-plan-row">
    <div class="admin-plan-row-head"><div><span class="plan-level-pill">Nível ${plan.access_level}</span>${plan.is_free ? '<span class="plan-free-pill">Teste inicial</span>' : ""}<h3>${esc(plan.name)}</h3></div><span class="admin-plan-state ${plan.is_active ? "enabled" : "disabled"}">${plan.is_active ? "Ativo" : "Oculto"}</span></div>
    <p>${esc(plan.description || "Sem descrição")}</p><div class="admin-plan-facts"><strong>${plan.is_free ? "Gratuito" : esc(subscriptionMoney(plan.price_cents))}</strong><span>${plan.duration_days} dias</span><span>${plan.features?.length || 0} funções liberadas</span></div>
    <details class="plan-features"><summary>Ver funções do nível ${plan.access_level}</summary>${planFeatureMarkup(plan.features)}</details>
    <div class="admin-plan-actions"><button type="button" class="btn secondary" data-plan-edit="${esc(plan.id)}">Editar</button><button type="button" class="btn secondary" data-plan-duplicate="${esc(plan.id)}" title="${plan.is_free ? "Cria uma cópia paga, oculta e com preço inicial de R$ 0,01." : "Cria uma cópia independente, oculta e salva automaticamente."}">Duplicar</button>${plan.is_free ? "" : `<button type="button" class="btn secondary" data-plan-archive="${esc(plan.id)}">${plan.is_active ? "Ocultar" : "Reexibir"}</button>`}</div>
  </article>`).join("");
}

async function loadAdminPlans() {
  const root = document.querySelector("#adminPlanList");
  if (!root) return;
  root.innerHTML = '<p class="empty">Carregando planos…</p>';
  try {
    const syncResult = await subscriptionsCall("POST", { action: "sync-commercial-plans" });
    const result = await subscriptionsCall();
    if (!document.querySelector("#adminPlanList")) return;
    renderAdminPlanList(result.plans);
    if (Number(syncResult.updated) > 0)
      toast(`${syncResult.updated} planos atualizados com sucesso`);
  } catch (error) {
    root.innerHTML = `<div class="auth-error">${esc(error.message)}</div>`;
  }
}

async function duplicateAdminPlan(plan, button) {
  if (!plan) return;
  button.disabled = true;
  const name = `Cópia de ${plan.name}`.slice(0, 80);
  const copiedFromFree = Boolean(plan.is_free);
  const priceCents = copiedFromFree ? 1 : Number(plan.price_cents);
  try {
    const result = await subscriptionsCall("POST", {
      action: "save-plan",
      name,
      description: plan.description || "",
      price_cents: priceCents,
      duration_days: Number(plan.duration_days),
      access_level: Number(plan.access_level),
      is_active: false,
    });
    if (!result.id) throw Error("A cópia foi enviada, mas o servidor não confirmou o registro. Atualize a lista para conferir.");
    const copy = {
      ...plan,
      id: result.id,
      name,
      price_cents: priceCents,
      is_free: false,
      is_active: false,
    };
    adminPlanCache = [copy, ...adminPlanCache.filter((entry) => entry.id !== copy.id)];
    openAdminPlanForm(copy);
    const status = document.querySelector("#adminPlanStatus");
    status.textContent = copiedFromFree
      ? "Cópia salva como plano pago oculto, com preço inicial de R$ 0,01. Revise o preço e só marque “Exibir para novos usuários” quando estiver pronta."
      : "Cópia salva e oculta. Revise os dados e marque “Exibir para novos usuários” quando estiver pronta.";
    status.classList.remove("is-error");
    toast(copiedFromFree ? "Cópia do Free salva como plano pago oculto" : "Cópia salva como oculta");
    await loadAdminPlans();
  } catch (error) {
    toast(error.message);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function fillPlanFeaturePreview(level, plan = null) {
  const root = document.querySelector("[data-plan-feature-preview]");
  if (!root) return;
  const features = plan?.features ||
    subscriptionCatalogCache?.plans?.find((entry) => Number(entry.access_level) === Number(level))?.features ||
    adminPlanCache.find((entry) => Number(entry.access_level) === Number(level))?.features;
  root.innerHTML = features?.length
    ? `<ul>${features.map((feature) => `<li>${esc(feature.label)}</li>`).join("")}</ul>`
    : `<p>As funções detalhadas deste nível aparecerão depois de carregar o catálogo.</p>`;
}

function openAdminPlanForm(plan = null) {
  const form = document.querySelector("#adminPlanForm");
  if (!form) return;
  form.hidden = false;
  form.reset();
  form.elements.id.value = plan?.id || "";
  form.elements.is_free.value = String(Boolean(plan?.is_free));
  form.elements.name.value = plan?.name || "";
  form.elements.price.value = plan?.is_free
    ? "0.00"
    : plan
      ? (plan.price_cents / 100).toFixed(2)
      : "";
  form.elements.duration_days.value = String(plan?.duration_days || 30);
  form.elements.access_level.value = String(plan?.access_level || 1);
  form.elements.description.value = plan?.description || "";
  form.elements.is_active.checked = Boolean(plan?.is_active ?? true);
  form.elements.price.disabled = Boolean(plan?.is_free);
  form.elements.is_active.disabled = Boolean(plan?.is_free);
  document.querySelector("#adminPlanFormTitle").textContent = plan
    ? `Editar ${plan.name}`
    : "Novo plano pago";
  document.querySelector("#adminPlanStatus").textContent = plan?.is_free
    ? "O Free mantém preço zero e permanece disponível para novos cadastros."
    : "O preço informado será cobrado por todo o prazo definido.";
  fillPlanFeaturePreview(plan?.access_level || 1, plan);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function activateAdminTab(name) {
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    const selected = tab.dataset.adminTab === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-admin-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.adminPane !== name;
  });
  if (name === "plans" && !adminPlanCache.length) loadAdminPlans();
}

const previousSubscriptionRender = render;
render = function () {
  const result = previousSubscriptionRender();
  if (page === "plano") loadSubscriptionPage();
  if (page === "admin" && authUser?.role === "admin") mountAdminTabs();
  return result;
};

const previousSubscriptionSetPage = setPage;
setPage = function (target) {
  if (authUser?.expired && target !== "plano") {
    toast("Seu acesso venceu. Consulte os planos para regularizar a conta.");
    return;
  }
  return previousSubscriptionSetPage(target);
};

const previousSubscriptionRefreshAccess = refreshAccess;
refreshAccess = async function () {
  if (!authUser) return;
  await verifyAccount();
  if (authUser.expired) {
    enterBillingOnly();
    render();
    return;
  }
  restoreBillingNavigation();
  const result = await previousSubscriptionRefreshAccess();
  if (authUser?.expired) {
    enterBillingOnly();
    render();
  }
  return result;
};

document.addEventListener(
  "click",
  (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('#adminPlanForm button[type="submit"]')
      : null;
    if (!button) return;
    event.preventDefault();
    const form = button.form;
    if (form) void saveAdminPlanForm({ preventDefault() {}, target: form });
  },
  true,
);

document.addEventListener("click", async (event) => {
  const periodButton = event.target.closest("[data-plan-period]");
  if (periodButton) {
    subscriptionBillingPeriod = periodButton.dataset.planPeriod === "annual" ? "annual" : "monthly";
    renderSubscriptionPageFromCache();
    return;
  }
  const tab = event.target.closest("[data-admin-tab]");
  if (tab) {
    activateAdminTab(tab.dataset.adminTab);
    return;
  }
  if (event.target.closest("[data-plan-new]")) {
    openAdminPlanForm();
    return;
  }
  if (event.target.closest("[data-plan-cancel]")) {
    const form = document.querySelector("#adminPlanForm");
    if (form) form.hidden = true;
    return;
  }
  if (event.target.closest("[data-subscription-reload]")) {
    loadSubscriptionPage();
    return;
  }
  const duplicate = event.target.closest("[data-plan-duplicate]");
  if (duplicate) {
    const plan = adminPlanCache.find((entry) => entry.id === duplicate.dataset.planDuplicate);
    if (plan) await duplicateAdminPlan(plan, duplicate);
    return;
  }
  const edit = event.target.closest("[data-plan-edit]");
  if (edit) {
    openAdminPlanForm(adminPlanCache.find((plan) => plan.id === edit.dataset.planEdit));
    return;
  }
  const archive = event.target.closest("[data-plan-archive]");
  if (archive) {
    const plan = adminPlanCache.find((entry) => entry.id === archive.dataset.planArchive);
    if (!plan) return;
    try {
      await subscriptionsCall("POST", { action: "archive-plan", id: plan.id });
      adminPlanCache = [];
      toast(plan.is_active ? "Plano ocultado do catálogo" : "Plano reexibido no catálogo");
      await loadAdminPlans();
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const request = event.target.closest("[data-request-plan]");
  if (request) {
    request.disabled = true;
    try {
      await subscriptionsCall("POST", { action: "request-plan", plan_id: request.dataset.requestPlan });
      toast(request.dataset.annualUpgrade === "true"
        ? "Pedido de upgrade anual registrado. A estimativa e o desconto serão confirmados pelo administrador; nenhuma cobrança foi feita."
        : "Solicitação registrada. O plano só será ativado após confirmação do administrador.");
      await loadSubscriptionPage();
    } catch (error) {
      toast(error.message);
      request.disabled = false;
    }
  }
});

document.addEventListener("input", (event) => {
  const daysInput = event.target?.closest?.("[data-annual-days]");
  if (!daysInput) return;
  subscriptionAnnualMigrationState.days = Number(daysInput.value);
  renderAnnualMigrationQuote();
});

document.addEventListener("change", (event) => {
  const annualTarget = event.target?.closest?.("[data-annual-target]");
  if (annualTarget) {
    const current = subscriptionCatalogCache?.subscription?.currentPlan;
    const target = subscriptionCatalogCache?.plans?.find((plan) => plan.id === annualTarget.value);
    subscriptionAnnualMigrationState.targetPlanId = annualTarget.value;
    if (current && target) {
      subscriptionAnnualMigrationState.discountPercent = recommendedAnnualUpgradeDiscount(current.access_level, target.access_level);
      const discountSelect = document.querySelector("[data-annual-discount]");
      if (discountSelect) discountSelect.value = String(subscriptionAnnualMigrationState.discountPercent);
    }
    renderAnnualMigrationQuote();
    return;
  }
  const annualDiscount = event.target?.closest?.("[data-annual-discount]");
  if (annualDiscount) {
    subscriptionAnnualMigrationState.discountPercent = Number(annualDiscount.value);
    renderAnnualMigrationQuote();
    return;
  }
  if (event.target?.matches('#adminPlanForm [name="access_level"]'))
    fillPlanFeaturePreview(Number(event.target.value));
});

async function saveAdminPlanForm(event) {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "adminPlanForm") return;
  const values = Object.fromEntries(new FormData(form));
  const isFree = values.is_free === "true";
  const name = String(values.name || "").trim();
  const price = parsePlanPrice(values.price);
  const priceCents = isFree ? 0 : Math.round(price * 100);
  const durationText = String(values.duration_days || "").trim();
  const durationDays = /^\d+$/.test(durationText) ? Number(durationText) : Number.NaN;
  const status = document.querySelector("#adminPlanStatus");
  const validationError = !name
    ? "Informe o nome do plano."
    : name.length > 80
      ? "O nome deve ter no máximo 80 caracteres."
      : !isFree && (!Number.isFinite(price) || price <= 0 || price > 999999.99)
        ? "Informe um preço válido entre R$ 0,01 e R$ 999.999,99. Você pode usar vírgula ou ponto nos centavos."
        : !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650
          ? "Informe uma duração inteira entre 1 e 3.650 dias."
          : "";
  if (validationError) {
    status.textContent = validationError;
    status.classList.add("is-error");
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  status.textContent = "Salvando…";
  status.classList.remove("is-error");
  try {
    await subscriptionsCall("POST", {
      action: "save-plan",
      id: values.id || undefined,
      name,
      description: values.description,
      price_cents: priceCents,
      duration_days: durationDays,
      access_level: Number(values.access_level),
      is_active: isFree ? true : form.elements.is_active.checked,
    });
    form.hidden = true;
    adminPlanCache = [];
    toast("Plano salvo");
    await loadAdminPlans();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("is-error");
  } finally {
    submit.disabled = false;
  }
}
