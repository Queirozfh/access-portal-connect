/* Meu Patrimônio: local-first finance app with file-backed backend. */
let KEY = "meu-patrimonio-v1";
let compoundInputs = {
    initial: "",
    rate: "",
    frequency: "annual",
    period: "10",
    periodUnit: "years",
    contribution: "",
  },
  compoundResult = null;
const DEFAULT_CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Assinaturas",
  "Compras",
  "Cartão de crédito",
  "Contas",
  "Outros",
];
const bankNames = [
  "Banco do Brasil (001)",
  "Caixa Econômica Federal (104)",
  "Itaú Unibanco (341)",
  "Bradesco / Next (237)",
  "Santander (033)",
  "Banco Safra (422)",
  "Nubank (260)",
  "Banco Inter",
  "PicPay (380)",
  "PagBank (290)",
  "Mercado Pago (323)",
  "Banco Agibank (121)",
  "Sicoob / Bancoob (756)",
  "Sicredi",
];
const now = new Date(),
  isoMonth = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  monthInput = document.querySelector("#month");
let monthPickerYear = now.getFullYear();
let db = emptyState(),
  page = "inicio",
  filterText = "",
  expensePeriod = "month",
  expensePerson = "",
  expenseCategory = "",
  activeSub = "contas",
  aiBusy = false,
  backendSyncEnabled = false,
  backendWrites = Promise.resolve(),
  authUser = null,
  authTimer = null,
  accessCache = [];
let selectedItemIds = new Set();
let installmentStatusFilter = "pending";
let expenseStatusFilter = "pending";
monthInput.value = isoMonth(now);
document.querySelector("#today").textContent = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(now);
updateMonthPicker();
function sourceLoad() {
  let base = {
    items: [],
    assets: [],
    bills: [],
    reimbursements: [],
    people: ["Giovani", "Mônica", "Maria", "Rafaelly", "Vanaldo", "Karen", "João", "Deborah", "Queiroz."],
    peopleInBill: ["Mônica", "Giovani", "Rafaelly", "Vanaldo", "Queiroz."],
    categories: DEFAULT_CATEGORIES,
    settings: {
      ownerName: "Giovani",
      usd: 5.2,
      aiEndpoint: "/api/ai/planned-purchase",
      aiModel: "openai/gpt-5.4",
      yellowAlert: 70,
      redAlert: 90,
    },
  };
  try {
    let saved = JSON.parse(localStorage.getItem(KEY)) || {};
    return {
      ...base,
      ...saved,
      items: saved.items || [],
      assets: saved.assets || [],
      bills: saved.bills || [],
      reimbursements: saved.reimbursements || [],
      people: saved.people || base.people,
      peopleInBill: saved.peopleInBill || base.peopleInBill,
      categories: saved.categories || base.categories,
      settings: { ...base.settings, ...saved.settings },
    };
  } catch {
    return base;
  }
}
function ownerName() {
  return db.settings.ownerName || "Giovani";
}
function sourceSave() {
  localStorage.setItem(KEY, JSON.stringify(db));
  if (backendSyncEnabled) {
    let payload = JSON.stringify(db);
    backendWrites = backendWrites
      .then(() => fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload }))
      .then((r) => {
        if (!r.ok) throw Error("save failed");
      })
      .catch(() => {
        backendSyncEnabled = false;
        toast("Backend local indisponível; os dados ficaram neste navegador");
      });
  }
}
function hasRecords(data) {
  return !!(data && (data.items?.length || data.assets?.length || data.bills?.length || data.reimbursements?.length));
}
async function sourceSyncBackend() {
  try {
    let response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw Error();
    let remote = await response.json(),
      local = load();
    if (!hasRecords(remote) && hasRecords(local)) {
      let saved = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (!saved.ok) throw Error();
      remote = local;
    }
    db = {
      ...local,
      ...remote,
      items: remote.items || [],
      assets: remote.assets || [],
      bills: remote.bills || [],
      reimbursements: remote.reimbursements || [],
      settings: { ...local.settings, ...remote.settings },
    };
    localStorage.setItem(KEY, JSON.stringify(db));
    backendSyncEnabled = true;
    applyTheme();
    render();
  } catch {
    backendSyncEnabled = false;
  }
}
async function sourceRefreshUsdRate() {
  try {
    let response = await fetch("/api/usd-rate", { cache: "no-store" });
    if (!response.ok) throw Error();
    let quote = await response.json();
    db.settings.usd = quote.rate;
    db.settings.usdDate = quote.date;
    save();
    if (page === "patrimonio") render();
  } catch {}
}
function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
function money(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function monthLabel(m) {
  if (!m) return "—";
  let [y, mo] = m.split("-");
  return (
    new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(+y, +mo - 1, 1)).replace(".", "") +
    "/" +
    y.slice(-2)
  );
}
function longMonthLabel(m) {
  let [year, month] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}
function updateMonthPicker() {
  let display = document.querySelector("#monthTriggerText"),
    popover = document.querySelector("#monthPopover");
  if (!display || !popover) return;
  let [year, month] = selected().split("-").map(Number);
  display.textContent = longMonthLabel(selected());
  monthPickerYear = monthPickerYear || year;
  let names = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(monthPickerYear, i, 1)).replace(".", ""),
  );
  popover.innerHTML = `<div class="month-popover-head"><button type="button" class="month-year-step" data-year-shift="-1" aria-label="Ano anterior">‹</button><strong>${monthPickerYear}</strong><button type="button" class="month-year-step" data-year-shift="1" aria-label="Próximo ano">›</button></div><div class="month-grid">${names
    .map((name, i) => {
      let key = `${monthPickerYear}-${String(i + 1).padStart(2, "0")}`,
        isSelected = key === selected();
      return `<button type="button" class="month-option ${isSelected ? "selected" : ""}" data-month-option="${key}" ${isSelected ? 'aria-current="date"' : ""}>${name}</button>`;
    })
    .join(
      "",
    )}</div><div class="month-popover-foot"><span>Escolha um mês para atualizar os valores</span><button type="button" data-month-today="true">Mês atual</button></div>`;
}
function setSelectedMonth(value) {
  monthInput.value = nextVisibleMonth(value);
  closeMonthPicker();
  render();
  document.querySelector("#monthTrigger").focus();
}
function shiftSelectedMonth(amount) {
  let [year, month] = selected().split("-").map(Number);
  setSelectedMonth(isoMonth(new Date(year, month - 1 + amount, 1)));
}
function closeMonthPicker() {
  let popover = document.querySelector("#monthPopover"),
    trigger = document.querySelector("#monthTrigger");
  if (popover) popover.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}
function selected() {
  return monthInput.value || isoMonth(now);
}
function inMonth(it, m = selected()) {
  if (it.endMonth && m > it.endMonth) return false;
  return it.month === m || it.due === m || (it.recurring && it.month <= m);
}
function paid(it, m = selected()) {
  if (it.recurring && Array.isArray(it.payments))
    return it.payments
      .filter((p) => (p.month || String(p.date || "").slice(0, 7)) === m)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  return Number(it.paid || 0);
}
function remaining(it, m = selected()) {
  return Math.max(0, Number(it.amount || 0) - paid(it, m));
}
function typeItems(kind, m = selected()) {
  return db.items.filter((x) => x.kind === kind && inMonth(x, m));
}
function totals() {
  let inc = typeItems("income").reduce((s, x) => s + remaining(x), 0),
    exp = typeItems("expense").reduce((s, x) => s + remaining(x), 0);
  let incPaid = typeItems("income").reduce((s, x) => s + paid(x), 0),
    expPaid = typeItems("expense").reduce((s, x) => s + paid(x), 0);
  return { inc, exp, incPaid, expPaid, bal: inc - exp, assets: assetTotal(selected()) };
}
function assetTotal(m) {
  return [...new Set(db.assets.map((a) => a.bank.toLowerCase()))].reduce((sum, bank) => sum + latestAsset(bank, m), 0);
}
function latestAsset(bank, m) {
  return db.assets
    .filter((a) => a.bank.toLowerCase() === bank && a.month <= m)
    .reduce((sum, a) => sum + Number(a.delta ?? a.balance ?? 0), 0);
}
function spendIn(m) {
  return typeItems("expense", m).reduce((s, x) => s + Number(x.amount || 0), 0);
}
function setPage(p) {
  if (p === "planejar") p = "calculadoras";
  if (p === "admin" && authUser?.role !== "admin") return;
  page = p;
  activeSub = "contas";
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === p));
  document.querySelector("#pageTitle").textContent = {
    inicio: "Início",
    entradas: "Entradas",
    exportacao: "Exportação",
    receber: "A receber",
    cobrancas: "Cobranças",
    despesas: "Despesas",
    faturas: "Faturas e reembolsos",
    compras: "Compras e parcelas",
    timeline: "Linha do tempo",
    patrimonio: "Patrimônio",
    planejar: "Calculadoras",
    calculadoras: "Calculadoras",
    relatorios: "Relatórios",
    tutorial: "Tutorial",
    ajustes: "Ajustes",
    admin: "Admin",
  }[p];
  document.querySelector(".sidebar").classList.remove("open");
  render();
}
document.querySelector("#nav").addEventListener("click", (e) => {
  let b = e.target.closest("[data-page]");
  if (b) setPage(b.dataset.page);
});
document.querySelector('[data-page="admin"]').onclick = () => setPage("admin");
document.querySelector("#menuToggle").onclick = () => document.querySelector(".sidebar").classList.toggle("open");
monthInput.onchange = () => {
  render();
  updateMonthPicker();
};
document.querySelector("#monthTrigger").onclick = () => {
  let popover = document.querySelector("#monthPopover"),
    open = popover.hidden;
  if (open) {
    monthPickerYear = Number(selected().slice(0, 4));
    updateMonthPicker();
  }
  popover.hidden = !open;
  document.querySelector("#monthTrigger").setAttribute("aria-expanded", String(open));
  if (open) popover.querySelector(".month-option")?.focus();
};
document.querySelector("#monthPrev").onclick = () => shiftSelectedMonth(-1);
document.querySelector("#monthNext").onclick = () => shiftSelectedMonth(1);
document.querySelector("#monthPopover").onclick = (e) => {
  e.stopPropagation();
  let year = e.target.closest("[data-year-shift]"),
    option = e.target.closest("[data-month-option]"),
    today = e.target.closest("[data-month-today]");
  if (year) {
    monthPickerYear += Number(year.dataset.yearShift);
    updateMonthPicker();
  } else if (option) setSelectedMonth(option.dataset.monthOption);
  else if (today) setSelectedMonth(isoMonth(now));
};
document.addEventListener("click", (e) => {
  if (!e.composedPath().includes(document.querySelector("#monthPicker"))) closeMonthPicker();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("#monthPopover").hidden) {
    closeMonthPicker();
    document.querySelector("#monthTrigger").focus();
  }
});
function render() {
  selectedItemIds.clear();
  updateMonthPicker();
  let c = document.querySelector("#content");
  if (page === "inicio") c.innerHTML = enhancedHome();
  if (page === "receber") c.innerHTML = listPage("income");
  if (page === "cobrancas") c.innerHTML = collectionPage();
  if (page === "despesas") c.innerHTML = expensesPage();
  if (page === "faturas") c.innerHTML = faturasPage() + cardsPage();
  if (page === "compras") c.innerHTML = installmentsPage();
  if (page === "timeline") c.innerHTML = timelinePage();
  if (page === "ajustes") c.innerHTML = settingsWithOwner() + safetyPage();
  if (page === "patrimonio") c.innerHTML = assetsPage();
  if (page === "planejar" || page === "calculadoras") c.innerHTML = planPage() + compoundSimulator();
  if (page === "relatorios") c.innerHTML = reportsPage();
  if (page === "tutorial") c.innerHTML = tutorialPage();
  if (page === "admin") c.innerHTML = adminPage();
  bindPage();
  updateBulkSelectionUi();
  if (page === "ajustes") loadHistory();
  if (page === "planejar" || page === "calculadoras") loadAiUsage();
  if (page === "admin" && authUser?.role === "admin") loadAccesses();
  if (page === "tutorial") loadTutorialContent();
}
function welcome(text, btn, label) {
  return `<div class="welcome"><div><h2>${text}</h2><p>Uma visão simples para tomar melhores decisões com o seu dinheiro.</p></div>${btn ? `<button class="btn primary" data-action="${btn}">＋ ${label}</button>` : ""}</div>`;
}
function statsCard(label, value, sub, icon, cls = "") {
  return `<div class="card"><div class="stat-label"><span class="stat-icon">${icon}</span>${label}</div><div class="stat-value ${cls}">${value}</div><div class="stat-sub">${sub}</div></div>`;
}
function enhancedHome() {
  let m = selected(),
    inc = typeItems("income", m).reduce((s, x) => s + Number(x.amount || 0), 0),
    expenses = typeItems("expense", m),
    all = expenses.reduce((s, x) => s + Number(x.amount || 0), 0),
    third = expenses.filter((x) => x.person && x.person !== ownerName()).reduce((s, x) => s + Number(x.amount || 0), 0),
    mine = Math.max(
      all - third,
      monthStats(m).billTotal -
        expenses
          .filter((x) => x.person !== ownerName() && db.peopleInBill.includes(x.person))
          .reduce((s, x) => s + Number(x.amount || 0), 0),
    ),
    received = Object.entries(monthStats(m).groups)
      .filter(([person]) => person !== ownerName())
      .reduce((s, [, g]) => s + g.received, 0),
    balance = inc - mine,
    ratio = inc ? (mine / inc) * 100 : 0,
    alert =
      ratio >= Number(db.settings.redAlert || 90)
        ? "red"
        : ratio >= Number(db.settings.yellowAlert || 70)
          ? "yellow"
          : "green",
    label =
      alert === "red"
        ? "Renda muito comprometida"
        : alert === "yellow"
          ? "Acompanhe seus gastos"
          : "Orçamento dentro do limite",
    actions = shareRows(m)
      .filter((x) => monthStats(m).groups[x.person]?.open > 0)
      .slice(0, 4),
    months = monthsFrom(m, 6);
  return `<div class="premium-home"><div class="premium-heading"><div><div class="eyebrow">${monthLabel(m)} · VISÃO FINANCEIRA</div><h2>Seu dinheiro, sob controle.</h2><p>Um panorama claro para decidir com confiança.</p></div><button class="btn primary" data-action="add-expense">＋ Adicionar</button></div><section class="premium-hero"><div class="premium-hero-copy"><small>SALDO PREVISTO</small><strong>${money(balance)}</strong><span>Receitas menos sua parte nas despesas</span><div class="premium-alert ${alert}"><i></i>${label} · ${ratio.toFixed(0)}% da renda comprometida</div></div><div class="premium-sparkline" aria-label="Projeção dos próximos seis meses">${months
    .map((x) => {
      let mi = typeItems("income", x).reduce((s, y) => s + Number(y.amount || 0), 0),
        ex = typeItems("expense", x)
          .filter((y) => y.person === ownerName() || !y.person)
          .reduce((s, y) => s + Number(y.amount || 0), 0),
        height = Math.max(8, Math.min(100, mi ? (Math.abs(mi - ex) / Math.max(1, mi)) * 100 : 8));
      return `<button data-month="${x}" aria-label="${monthLabel(x)}: ${money(mi - ex)}"><i class="${x === m ? "current" : ""}" style="height:${height}%"></i><small>${monthLabel(x)}</small></button>`;
    })
    .join(
      "",
    )}</div></section><div class="grid stats stats-premium">${statsCard("Entradas previstas", money(inc), "Receitas deste mês", "↗", "positive")}${statsCard("Compromissos", money(mine), `${money(monthStats(m).billTotal + expenses.filter((x) => x.person !== ownerName() && !db.peopleInBill.includes(x.person)).reduce((s, x) => s + Number(x.amount || 0), 0))} total a pagar`, "↘", "negative")}${statsCard("A receber", money(monthStats(m).open), "Reembolsos de terceiros", "◷", "")}</div><div class="grid two-col premium-panels"><section class="card"><div class="section-head"><div><h2>Despesas ao longo do tempo</h2><p>Últimos seis meses · período selecionado</p></div><button class="btn secondary" data-page="timeline">Ver 12 meses</button></div>${chart()}</section><section class="card"><div class="section-head"><div><h2>Reembolsos em aberto</h2><p>Valores de outras pessoas</p></div><button class="btn secondary" data-page="faturas">Ver todos</button></div>${actions.length ? `<div class="action-list">${actions.map((x) => `<div class="action-row"><span><strong>${esc(x.person)}</strong><small>${esc(x.name)} · falta ${money(monthStats(m).groups[x.person]?.open || 0)}</small></span><button class="mini-btn" data-action="reimburse" data-id="${x.id}">Registrar</button></div>`).join("")}` : '<div class="empty">Nenhum reembolso pendente neste mês.</div>'}</section></div></div>`;
}
function chart() {
  let labels = [];
  let [y, m] = selected().split("-").map(Number);
  for (let d = 5; d >= 0; d--) {
    let t = new Date(y, m - 1 - d, 1),
      key = isoMonth(t);
    labels.push({ key, name: monthLabel(key), value: spendIn(key) });
  }
  let max = Math.max(1, ...labels.map((x) => x.value));
  return `<div class="chart">${labels.map((x) => `<div class="bar-group"><div class="bar ${x.key === selected() ? "current" : ""}" style="height:${Math.max(3, (100 * x.value) / max)}%" title="${money(x.value)}"></div><span class="bar-label">${x.name}</span></div>`).join("")}</div><div class="legend"><span><i></i>Despesas mensais</span><span><i class="current"></i>Mês selecionado</span></div>`;
}
function home() {
  let t = totals(),
    recent = db.items
      .filter((x) => inMonth(x))
      .sort((a, b) => (b.due || b.month).localeCompare(a.due || a.month))
      .slice(0, 6);
  return `${welcome("Seu resumo financeiro", null, "")}<div class="grid stats">${statsCard("A receber", money(t.inc), `${money(t.incPaid)} recebidos`, "↗", "positive")}${statsCard("Despesas", money(t.exp), `${money(t.expPaid)} pagos`, "↘", "negative")}${statsCard("Saldo previsto", money(t.bal), "Entradas menos despesas", "◒", t.bal >= 0 ? "positive" : "negative")}${statsCard("Patrimônio", money(t.assets), "Saldo consolidado", "◈", "")}</div><div class="grid two-col"><section class="card"><div class="section-head"><div><h2>Despesas ao longo do tempo</h2><p>Últimos seis meses cadastrados</p></div></div>${chart()}</section><section class="card"><div class="section-head"><div><h2>Resumo do mês</h2><p>${monthLabel(selected())}</p></div></div><div class="table-wrap"><table><tbody><tr><td>Entradas previstas</td><td class="positive">${money(t.inc + t.incPaid)}</td></tr><tr><td>Despesas previstas</td><td class="negative">${money(t.exp + t.expPaid)}</td></tr><tr><td>Patrimônio informado</td><td>${money(t.assets)}</td></tr><tr><td>Cotação de referência USD</td><td>${money(db.settings.usd)}</td></tr></tbody></table></div></section></div><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Movimentações do mês</h2><p>Entradas e despesas com vencimento em ${monthLabel(selected())}</p></div><button class="btn secondary" data-page="relatorios">Ver relatórios</button></div>${itemsTable(recent, true)}</section>`;
}
function expensesPage() {
  normalizeItemOrder();
  let all = db.items.filter((x) => x.kind === "expense"),
    monthly = typeItems("expense"),
    total = monthly.reduce((s, x) => s + Number(x.amount || 0), 0),
    mine = monthly
      .filter((x) => (x.person || ownerName()) === ownerName())
      .reduce((s, x) => s + Number(x.amount || 0), 0),
    third = total - mine,
    periodItems = expensePeriod === "month" ? monthly : all,
    personItems = expensePerson
      ? periodItems.filter(
          (x) => (x.person || ownerName()) === expensePerson && (!expenseCategory || x.category === expenseCategory),
        )
      : [],
    personTotal = personItems.reduce((s, x) => s + Number(x.amount || 0), 0),
    personScopeTotal = periodItems
      .filter((x) => !expenseCategory || x.category === expenseCategory)
      .reduce((s, x) => s + Number(x.amount || 0), 0);
  let people = [...new Set([...db.people, ...all.map((x) => x.person).filter(Boolean)])],
    categories = [...new Set([...db.categories, ...all.map((x) => x.category).filter(Boolean)])];
  let statusBase = (expensePeriod === "month" ? monthly : all).filter(
      (x) =>
        (!expensePerson || x.person === expensePerson) &&
        (!expenseCategory || x.category === expenseCategory) &&
        (!filterText ||
          `${x.name} ${x.category || ""} ${x.person || ""}`.toLowerCase().includes(filterText.toLowerCase())),
    ),
    pendingExpenseCount = statusBase.filter((x) => remaining(x) > 0).length,
    paidExpenseCount = statusBase.length - pendingExpenseCount,
    arr = statusBase
      .filter(
        (x) =>
          expenseStatusFilter === "all" || (expenseStatusFilter === "pending" ? remaining(x) > 0 : remaining(x) <= 0),
      )
      .sort((a, b) => Number(a.ord) - Number(b.ord));
  let chip = (type, value, label, active) =>
    `<button class="expense-chip ${active ? "active" : ""}" data-expense-filter="${type}" data-value="${esc(value)}">${label}</button>`;
  return `<section class="card expense-overview"><div class="expense-intro"><span class="expense-icon">♧</span><div><h2>Compras, parcelas e assinaturas</h2><p>Cadastre cada item uma vez. Os meses seguintes aparecem sozinhos.</p></div></div><div class="expense-summary">Em ${monthLabel(selected())}: <strong>${money(total)}</strong> em itens, sendo <strong>${money(mine)}</strong> seus e <strong>${money(third)}</strong> de terceiros.<button class="btn primary" data-action="add-expense">＋ Novo item</button></div><div class="expense-filter-row">${chip("period", "month", "Neste mês", expensePeriod === "month")}${chip("period", "all", "Todos os itens", expensePeriod === "all")}${people.map((p) => chip("person", p, esc(p), expensePerson === p)).join("")}</div><div class="expense-filter-row categories">${chip("category", "", "Todas as categorias", !expenseCategory)}${categories.map((c) => chip("category", c, esc(c), expenseCategory === c)).join("")}</div>${expensePerson ? `<div class="expense-person-consolidated"><strong>Consolidado de ${esc(expensePerson)}: ${money(personTotal)}</strong><span>${personItems.length} lançamento(s) · ${personScopeTotal ? ((100 * personTotal) / personScopeTotal).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0"}% do total ${expensePeriod === "month" ? "do mês" : "dos períodos selecionados"}</span></div>` : ""}<div class="section-head expense-search"><div><h2>${expensePeriod === "month" ? "Despesas do mês" : "Todos os itens"}</h2><p>${arr.length} lançamento(s) · sua parte ${money(arr.filter((x) => (x.person || ownerName()) === ownerName()).reduce((s, x) => s + Number(x.amount || 0), 0))}</p></div><div class="filters"><input id="searchRows" placeholder="Buscar item" value="${esc(filterText)}"></div></div><div class="subtabs installment-status-tabs" role="tablist" aria-label="Filtrar despesas por situação"><button type="button" class="${expenseStatusFilter === "pending" ? "active" : ""}" data-action="expense-status" data-id="pending" role="tab" aria-selected="${expenseStatusFilter === "pending"}">Pendentes <span>${pendingExpenseCount}</span></button><button type="button" class="${expenseStatusFilter === "paid" ? "active" : ""}" data-action="expense-status" data-id="paid" role="tab" aria-selected="${expenseStatusFilter === "paid"}">Pagos <span>${paidExpenseCount}</span></button><button type="button" class="${expenseStatusFilter === "all" ? "active" : ""}" data-action="expense-status" data-id="all" role="tab" aria-selected="${expenseStatusFilter === "all"}">Todos <span>${statusBase.length}</span></button></div><div id="listTable">${itemsTable(arr, false, true, true)}</div></section>`;
}
function listPage(kind) {
  let isIn = kind === "income",
    title = isIn ? "Entradas e parcelas que você recebe" : "Despesas e contas que você paga";
  let arr = typeItems(kind).filter((x) =>
    `${x.name} ${x.category} ${x.bank || ""}`.toLowerCase().includes(filterText.toLowerCase()),
  );
  let cats = [
    ...new Set(
      db.items
        .filter((x) => x.kind === kind)
        .map((x) => x.category)
        .filter(Boolean),
    ),
  ];
  return `${welcome(title, `add-${kind}`, isIn ? "Adicionar entrada" : "Adicionar despesa")}<div class="card"><div class="section-head"><div><h2>${isIn ? "A receber" : "Despesas"} do mês</h2><p>Valores restantes ${monthLabel(selected())}</p></div><div class="filters"><input id="searchRows" placeholder="Buscar lançamento" value="${esc(filterText)}"><select id="categoryFilter"><option value="">Todas as categorias</option>${cats.map((x) => `<option>${esc(x)}</option>`).join("")}</select></div></div><div id="listTable">${itemsTable(arr, false, true)}</div></div><div class="notice">${isIn ? "Informe o total e as parcelas. Use prazo 0 para uma entrada recorrente sem data final; ela aparecerá nos meses seguintes." : "Cadastre também compras futuras de cartão com a data de vencimento esperada. Pagamentos parciais atualizam o valor restante sem perder o histórico."}</div>`;
}
function itemsTable(arr, compact = false, selectable = false, reorder = false) {
  if (!arr.length)
    return `<div class="empty"><strong>Nenhum lançamento neste mês</strong>Adicione uma entrada ou despesa para começar.</div>`;
  if (reorder) normalizeItemOrder();
  let bulkCardControls =
    arr[0]?.kind === "expense"
      ? '<select data-bulk-card aria-label="Cartão para vincular itens"><option value="">Escolha o cartão</option>' +
        (db.cards || [])
          .map((card) => '<option value="' + esc(card.id) + '">' + esc(card.name) + "</option>")
          .join("") +
        '</select><button type="button" class="btn secondary" data-action="assign-card-selected" disabled>Vincular cartão</button>'
      : "";
  return `${selectable ? `<div class="bulk-actions"><span id="bulkSelectionLabel">Nenhum item selecionado</span>${bulkCardControls}<button type="button" class="btn danger" data-action="delete-selected" disabled>Excluir selecionados</button></div>` : ""}<div class="table-wrap"><table><thead><tr>${selectable ? '<th class="select-column"><input type="checkbox" data-select-all aria-label="Selecionar todos os itens visíveis"></th>' : ""}${reorder ? "<th>#</th>" : ""}<th>Descrição</th><th>Categoria / pessoa</th><th>Vencimento</th><th>Valor</th><th>${arr[0]?.kind === "income" ? "Recebido" : "Pago / recebido"}</th><th>Restante</th><th>Status</th><th class="no-print">Ações</th></tr></thead><tbody>${arr
    .map((x, index) => {
      let rem = remaining(x),
        amountPaid = paid(x),
        income = x.kind === "income",
        state = rem <= 0 ? (income ? "Recebido" : "Pago") : amountPaid > 0 ? "Parcial" : "Pendente",
        markLabel = income ? "✓ Marcar recebido" : "✓ Marcar pago";
      return `<tr>${selectable ? `<td class="select-column"><input type="checkbox" data-select-item="${esc(x.id)}" aria-label="Selecionar ${esc(x.name)}"></td>` : ""}${reorder ? `<td><input class="order-input" type="number" min="1" max="${arr.length}" value="${index + 1}" data-order-item="${esc(x.id)}" aria-label="Posição de ${esc(x.name)}"></td>` : ""}<td><strong>${esc(x.name)}</strong>${x.installments > 1 ? `<div class="metric">Parcela ${x.part || 1} de ${x.installments}</div>` : ""}${x.recurring ? '<div class="metric">Recorrente</div>' : ""}${x.notes ? `<div class="metric">${esc(x.notes)}</div>` : ""}</td><td>${esc(x.category || "—")}${x.kind === "expense" && x.person ? `<div class="metric">${esc(x.person === ownerName() ? "Sua parte" : x.person)}</div>` : ""}</td><td>${monthLabel(x.due || x.month)}${x.future ? '<div class="metric">Previsto</div>' : ""}</td><td class="currency">${money(x.amount)}</td><td class="currency">${money(amountPaid)}</td><td class="currency">${money(rem)}</td><td><span class="badge ${rem <= 0 ? "paid" : amountPaid > 0 ? "partial" : "pending"}">${state}</span></td><td class="no-print"><div class="row-actions">${reorder ? `<button class="mini-btn" data-action="move-item" data-id="${esc(x.id)}" data-index="-1" aria-label="Subir item" ${index === 0 ? "disabled" : ""}>↑</button><button class="mini-btn" data-action="move-item" data-id="${esc(x.id)}" data-index="1" aria-label="Descer item" ${index === arr.length - 1 ? "disabled" : ""}>↓</button>` : ""}<button class="mini-btn" data-action="partial" data-id="${x.id}">+ ${income ? "Recebimento" : "Pagamento"}</button>${amountPaid > 0 ? `<button class="mini-btn" data-action="undo-receipt" data-id="${x.id}">↶ Marcar pendente</button>` : `<button class="mini-btn" data-action="mark-paid" data-id="${x.id}" ${rem <= 0 ? "disabled" : ""}>${rem <= 0 ? (income ? "Recebido" : "Pago") : markLabel}</button>`}<button class="mini-btn" data-action="edit" data-id="${x.id}">Editar</button><button class="mini-btn" data-action="delete" data-id="${x.id}">Excluir</button></div></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function assetsPage() {
  let m = selected(),
    records = db.assets.filter((a) => a.month === m);
  let total = assetTotal(m);
  return `${welcome("Acompanhe contas, aplicações e patrimônio", null, "")}<div class="grid stats">${statsCard("Patrimônio total", money(total), "Aportes e retiradas acumulados", "◈")}${statsCard("Equivalente em dólar", `US$ ${(total / Number(db.settings.usd || 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, `Cotação de referência: ${money(db.settings.usd)}`, "＄")}${statsCard("Instituições", `${new Set(db.assets.map((a) => a.bank.toLowerCase())).size}`, "Com histórico registrado", "⌂")}${statsCard("Movimentações no mês", `${records.length}`, "Aportes e retiradas do período", "▤")}</div><div class="grid two-col"><section class="card"><div class="section-head"><div><h2>Movimentações patrimoniais</h2><p>Movimento do mês e saldo acumulado</p></div><button class="btn primary" data-action="add-asset">＋ Registrar movimento</button></div>${assetTable(records)}</section><section class="card"><div class="section-head"><div><h2>Cotação do dólar</h2><p>Referência diária USD/BRL</p></div></div><div class="stat-value">${money(db.settings.usd)}</div><div class="metric">${db.settings.usdDate ? `Atualizada em ${esc(db.settings.usdDate)}` : "Consultando cotação…"}</div><button class="btn secondary" data-action="refresh-usd">Atualizar cotação diária</button><div class="field"><label>1 USD em reais</label><input id="usdInput" type="number" min="0.01" step="0.0001" value="${db.settings.usd || ""}"></div><button class="btn secondary" data-action="save-usd">Salvar cotação</button><div class="notice">Referência diária, não cotação em tempo real.</div></section></div><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Saldos acumulados por instituição</h2><p>Posição até ${monthLabel(selected())}</p></div></div>${assetSnapshotTable(selected())}</section><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Histórico de patrimônio</h2><p>Aportes positivos e retiradas negativas acumulam mês a mês; registros independem dos lançamentos de despesas e entradas.</p></div></div>${assetHistory()}</section>`;
}
function compoundSimulator() {
  let v = compoundInputs;
  return `<section class="card compound-card"><div class="section-head"><div><h2>Simulador de juros compostos</h2><p>Projete o crescimento do investimento ao longo do tempo.</p></div><span class="stat-icon">∿</span></div><form id="compoundForm"><div class="form-grid"><div class="field"><label for="compoundInitial">Valor inicial (R$)</label><input id="compoundInitial" name="initial" type="number" min="0" step="0.01" value="${esc(v.initial)}" required placeholder="0,00"></div><div class="field"><label for="compoundRate">Taxa de juros (%)</label><div class="compound-rate"><input id="compoundRate" name="rate" type="number" min="0" max="1000" step="0.01" value="${esc(v.rate)}" required placeholder="0,00"><select name="frequency" aria-label="Periodicidade da taxa"><option value="annual" ${v.frequency === "annual" ? "selected" : ""}>Ao ano</option><option value="monthly" ${v.frequency === "monthly" ? "selected" : ""}>Ao mês</option></select></div></div><div class="field"><label for="compoundPeriod">Período</label><div class="compound-rate"><input id="compoundPeriod" name="period" type="number" min="0" max="${v.periodUnit === "years" ? 50 : 600}" step="1" value="${esc(v.period)}" required><select name="periodUnit" aria-label="Unidade do período"><option value="years" ${v.periodUnit === "years" ? "selected" : ""}>Anos</option><option value="months" ${v.periodUnit === "months" ? "selected" : ""}>Meses</option></select></div></div><div class="field"><label for="compoundContribution">Investimento mensal (R$)</label><input id="compoundContribution" name="contribution" type="number" min="0" step="0.01" value="${esc(v.contribution)}" placeholder="0,00"></div></div><div class="compound-actions"><button type="button" class="btn secondary" data-action="compound-reset">Limpar</button><button type="submit" class="btn primary">Calcular projeção</button></div></form><div class="notice compound-note"><strong>Fórmula base:</strong> M = C × (1 + i)<sup>t</sup>. Com aportes mensais, o simulador atualiza o saldo a cada mês. O aporte é considerado no fim do mês; a taxa anual é convertida em taxa mensal equivalente. Esta simulação é uma estimativa e não inclui impostos, taxas ou inflação.</div>${compoundResult ? compoundResultMarkup() : ""}</section>`;
}
function calculateCompound(form) {
  let f = new FormData(form),
    initial = Number(f.get("initial")),
    rate = Number(f.get("rate")),
    frequency = f.get("frequency"),
    period = Number(f.get("period")),
    periodUnit = f.get("periodUnit"),
    contribution = Number(f.get("contribution") || 0),
    max = periodUnit === "years" ? 50 : 600;
  if (
    !Number.isFinite(initial) ||
    initial < 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 1000 ||
    !Number.isInteger(period) ||
    period < 0 ||
    period > max ||
    !Number.isFinite(contribution) ||
    contribution < 0
  ) {
    toast("Confira os valores informados e o limite do período");
    return;
  }
  compoundInputs = {
    initial: String(initial),
    rate: String(rate),
    frequency,
    period: String(period),
    periodUnit,
    contribution: String(contribution),
  };
  let months = period * (periodUnit === "years" ? 12 : 1),
    monthlyRate = frequency === "annual" ? Math.pow(1 + rate / 100, 1 / 12) - 1 : rate / 100,
    balance = initial,
    points = [{ month: 0, balance, invested: initial }],
    interval = months ? Math.max(1, Math.ceil(months / 12)) : 1;
  for (let month = 1; month <= months; month++) {
    balance = balance * (1 + monthlyRate) + contribution;
    if (month % interval === 0 || month === months)
      points.push({ month, balance, invested: initial + contribution * month });
  }
  compoundResult = {
    initial,
    rate,
    frequency,
    period,
    periodUnit,
    months,
    contribution,
    monthlyRate,
    totalInvested: initial + contribution * months,
    interest: balance - (initial + contribution * months),
    finalBalance: balance,
    points,
  };
  render();
}
function compoundResultMarkup() {
  let r = compoundResult,
    max = Math.max(1, ...r.points.map((p) => p.balance));
  let chart = r.points
    .map((p) => {
      let label = p.month === 0 ? "Início" : p.month % 12 === 0 ? p.month / 12 + "a" : p.month + "m",
        title = p.month === 0 ? "Início" : p.month + " meses";
      return (
        '<div class="compound-chart-point" title="' +
        title +
        ": " +
        money(p.balance) +
        '"><i style="height:' +
        Math.max(4, (p.balance / max) * 100) +
        '%"></i><small>' +
        label +
        "</small></div>"
      );
    })
    .join("");
  let rows = r.points
    .map((p) => {
      let marker = p.month === 0 ? "Início" : p.month === r.months ? "Saldo final" : "Projeção",
        period = p.month === 0 ? "0" : p.month + " " + (p.month === 1 ? "mês" : "meses");
      return (
        "<tr><td>" +
        marker +
        "</td><td>" +
        period +
        "</td><td>" +
        money(p.invested) +
        "</td><td><strong>" +
        money(p.balance) +
        "</strong></td></tr>"
      );
    })
    .join("");
  let rateText =
    r.frequency === "annual"
      ? r.rate.toLocaleString("pt-BR") +
        "% ao ano (taxa efetiva equivalente mensal: " +
        (r.monthlyRate * 100).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) +
        "%)."
      : r.rate.toLocaleString("pt-BR") + "% ao mês.";
  return `<div class="compound-results"><div class="grid stats compound-stats">${statsCard("Saldo projetado", money(r.finalBalance), "Valor estimado ao final", "◈", "positive")}${statsCard("Total investido", money(r.totalInvested), "Valor inicial + aportes mensais", "＋")}${statsCard("Juros estimados", money(r.interest), "Rendimento bruto acumulado", "∿", "positive")}</div><div class="compound-chart" role="img" aria-label="Gráfico da evolução estimada do investimento">${chart}</div><div class="table-wrap compound-table"><table><thead><tr><th>Marco</th><th>Período</th><th>Total investido</th><th>Saldo projetado</th></tr></thead><tbody>${rows}</tbody></table></div><p class="metric compound-assumption">${rateText} Período: ${r.period} ${r.periodUnit === "years" ? "ano(s)" : "mês(es)"}. ${r.contribution ? "Aporte mensal: " + money(r.contribution) + "." : "Sem aportes mensais."}</p></div>`;
}
function assetTable(arr) {
  if (!arr.length)
    return '<div class="empty"><strong>Nenhum movimento neste mês</strong>Os saldos acumulados anteriores permanecem salvos.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Instituição</th><th>Aporte / retirada</th><th>Saldo acumulado</th><th class="no-print">Ações</th></tr></thead><tbody>${arr.map((a) => `<tr><td><strong>${esc(a.bank)}</strong></td><td class="${a.delta >= 0 ? "positive" : "negative"}">${a.currency === "USD" ? `US$ ${Number(a.originalAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<div class="metric">${money(a.delta)} convertido à época</div>` : money(a.delta)}</td><td>${money(latestAsset(a.bank.toLowerCase(), selected()))}</td><td class="no-print"><div class="row-actions"><button class="mini-btn" data-action="edit-asset" data-id="${a.id}">Editar</button><button class="mini-btn" data-action="delete-asset" data-id="${a.id}">Excluir</button></div></td></tr>`).join("")}</tbody></table><div class="section-head" style="margin-top:14px"><strong>Total de ${monthLabel(selected())}</strong><strong>${money(assetTotal(selected()))}</strong></div></div>`;
}
function assetHistory() {
  let ms = [...new Set(db.assets.map((a) => a.month))].sort().reverse().slice(0, 6);
  if (!ms.length) return '<div class="empty">Histórico aparecerá quando os saldos forem cadastrados.</div>';
  let banks = [...new Set(db.assets.map((a) => a.bank))];
  return `<div class="table-wrap"><table><thead><tr><th>Mês</th>${banks.map((b) => `<th>${esc(b)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${ms
    .map((m) => {
      let vals = banks.map((b) => latestAsset(b.toLowerCase(), m)),
        sum = vals.reduce((s, v) => s + v, 0);
      return `<tr><td>${monthLabel(m)}</td>${vals.map((v) => `<td>${money(v)}</td>`).join("")}<td><strong>${money(sum)}</strong></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function assetSnapshotTable(m) {
  let banks = [...new Set(db.assets.map((a) => a.bank))];
  if (!banks.length) return '<div class="empty">Cadastre uma instituição para iniciar o acompanhamento.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Banco ou instituição</th><th>Saldo acumulado</th><th>Equivalente em USD</th></tr></thead><tbody>${banks
    .map((b) => {
      let v = latestAsset(b.toLowerCase(), m);
      return `<tr><td>${esc(b)}</td><td>${money(v)}</td><td>US$ ${(v / Number(db.settings.usd || 1)).toFixed(2)}</td></tr>`;
    })
    .join(
      "",
    )}<tr><td><strong>Total</strong></td><td><strong>${money(assetTotal(m))}</strong></td><td><strong>US$ ${(assetTotal(m) / Number(db.settings.usd || 1)).toFixed(2)}</strong></td></tr></tbody></table></div>`;
}
function planPage() {
  return `${welcome("Decida com mais clareza antes de comprar", null, "")}<div class="grid two-col"><section class="card"><div class="section-head"><div><h2>Simular compra planejada</h2><p>A estimativa considera seus lançamentos e parcelas registrados.</p></div><span class="tag-ai">AI GATEWAY</span></div><div id="aiUsage" role="status"></div><form id="planForm"><div class="field"><label for="planText">O que você pretende comprar?</label><textarea id="planText" required placeholder="Ex.: notebook por R$ 4.500 em 10 parcelas de R$ 450, a partir de janeiro"></textarea></div><div class="form-grid"><div class="field"><label>Preço total (R$)</label><input id="planAmount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Número de parcelas</label><input id="planParts" type="number" min="1" max="120" value="1"></div><div class="field"><label>Primeira parcela</label><input id="planStart" type="month" value="${selected()}"></div><div class="field"><label>Categoria (opcional)</label><input id="planCategory" placeholder="A IA pode sugerir"></div></div><button class="btn primary" ${aiBusy ? "disabled" : ""}>${aiBusy ? "Analisando…" : "✳ Analisar impacto"}</button></form></section><section class="card"><div class="section-head"><div><h2>Resultado da análise</h2><p>Recomendações são estimativas, não aconselhamento financeiro.</p></div></div><div id="planResult">${db.lastPlan ? planResult(db.lastPlan) : '<div class="empty"><strong>Nenhuma compra analisada</strong>Preencha os dados para estimar o efeito mês a mês.</div>'}</div></section></div>`;
}
function planResult(r) {
  return `<div class="callout"><strong>Categoria sugerida: ${esc(r.category || "A definir")}</strong><br>${esc(r.summary || "")}</div><div class="grid stats" style="grid-template-columns:1fr 1fr">${statsCard("Parcela estimada", money(r.monthly), "Valor mensal aproximado", "↘")}${statsCard("Impacto no orçamento", `${Number(r.impact || 0).toFixed(1)}%`, "Da entrada prevista média", "◒")}</div><h3 style="font:600 12px Manrope">Projeção por parcela</h3><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Despesa atual</th><th>Com a compra</th><th>Saldo projetado</th></tr></thead><tbody>${(r.projections || []).map((p) => `<tr><td>${monthLabel(p.month)}</td><td>${money(p.current)}</td><td>${money(p.with)}</td><td class="${p.balance >= 0 ? "positive" : "negative"}">${money(p.balance)}</td></tr>`).join("")}</tbody></table></div>`;
}
const donutPalette = [
  "#c39d60",
  "#80c5ac",
  "#80a9d6",
  "#d88a91",
  "#a995d8",
  "#d9b85f",
  "#86b8c2",
  "#d39776",
  "#97b58b",
  "#b484a6",
];
function donutColor(name) {
  let hash = Array.from(String(name || "")).reduce((n, c) => n + c.codePointAt(0), 0);
  return donutPalette[hash % donutPalette.length];
}
function donutReport(title, subtitle, values, total) {
  let rows = values.filter(([, amount]) => Number(amount) > 0).sort((a, b) => b[1] - a[1]),
    sum = Number(total || 0),
    cursor = 0,
    stops = rows.map(([label, amount]) => {
      let start = cursor,
        pct = sum ? (amount / sum) * 100 : 0;
      cursor += pct * 3.6;
      return `${donutColor(label)} ${start}deg ${cursor}deg`;
    }),
    gradient = rows.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#454b59 0deg 360deg)";
  return `<section class="card distribution-card"><div class="section-head"><div><h2>${esc(title)} em ${monthLabel(selected())}</h2><p>${esc(subtitle)}</p></div></div>${rows.length ? `<div class="distribution-layout"><div class="distribution-donut-wrap"><div class="distribution-donut" role="img" aria-label="${esc(title)}: ${money(sum)} no total" style="background:${gradient}"><div class="distribution-hole"><span>Total do mês</span><strong>${money(sum)}</strong></div></div></div><div class="distribution-legend">${rows.map(([label, amount]) => `<div class="distribution-legend-row"><i style="--slice-color:${donutColor(label)}"></i><span>${esc(label)}</span><strong>${money(amount)}</strong><small>${sum ? ((100 * amount) / sum).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0"}%</small></div>`).join("")}</div></div><p class="distribution-foot">Soma das despesas ativas em ${monthLabel(selected())}. O gráfico acompanha o mês selecionado e os lançamentos cadastrados.</p>` : '<div class="empty">Sem despesas para este período.</div>'}</section>`;
}
function reportsPage() {
  let t = totals(),
    inc = typeItems("income"),
    exp = typeItems("expense"),
    cats = {},
    people = {},
    expenseTotal = exp.reduce((s, x) => s + Number(x.amount || 0), 0);
  exp.forEach((x) => {
    let category = x.category || "Sem categoria",
      person = x.person || ownerName();
    cats[category] = (cats[category] || 0) + Number(x.amount || 0);
    people[person] = (people[person] || 0) + Number(x.amount || 0);
  });
  return `${welcome("Relatórios financeiros", null, "")}<div class="welcome no-print" style="margin-top:-10px"><p>Resumo estruturado por mês, pessoa e categoria. Use Imprimir para salvar como PDF.</p><button class="btn primary" data-action="print">⇩ Exportar PDF</button></div><div class="grid stats">${statsCard("Entradas", money(inc.reduce((s, x) => s + x.amount, 0)), "Total previsto no mês", "↗", "positive")}${statsCard("Despesas", money(expenseTotal), "Total previsto no mês", "↘", "negative")}${statsCard("Saldo", money(t.bal), "Previsto após compromissos", "◒", t.bal >= 0 ? "positive" : "negative")}${statsCard("Patrimônio", money(t.assets), "Posição selecionada", "◈")}</div>${donutReport("Quanto cada um gastou", "Fatia percentual de cada pessoa no total de compras e assinaturas ativas.", Object.entries(people), expenseTotal)}${donutReport("Gasto por categoria", "Fatia percentual de cada categoria no total de compras e assinaturas ativas.", Object.entries(cats), expenseTotal)}<div class="grid two-col"><section class="card"><div class="section-head"><div><h2>Detalhamento por categoria</h2><p>${monthLabel(selected())} · valor, quantidade e participação</p></div></div>${
    Object.keys(cats).length
      ? `<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Quantidade</th><th>Total</th><th>% despesas</th></tr></thead><tbody>${Object.entries(
          cats,
        )
          .sort((a, b) => b[1] - a[1])
          .map(
            ([k, v]) =>
              `<tr><td>${esc(k)}</td><td>${exp.filter((x) => (x.category || "Sem categoria") === k).length}</td><td>${money(v)}</td><td>${expenseTotal ? ((100 * v) / expenseTotal).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0"}%</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<div class="empty">Sem despesas para este período.</div>'
  }</section><section class="card"><div class="section-head"><div><h2>Fluxo de caixa</h2><p>Itens cadastrados no período</p></div></div>${itemsTable([...inc, ...exp])}</section></div><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Posição patrimonial</h2><p>Saldo acumulado por instituição até ${monthLabel(selected())}</p></div></div>${assetSnapshotTable(selected())}</section>`;
}
function shareRows(m) {
  return db.items.filter((x) => x.kind === "expense" && inMonth(x, m) && x.person && x.person !== ownerName());
}
function normalizeItemOrder() {
  let expenses = db.items.filter((x) => x.kind === "expense"),
    next = Math.max(0, ...expenses.map((x) => (Number.isFinite(Number(x.ord)) ? Number(x.ord) : 0))) + 1;
  expenses.forEach((x) => {
    if (!Number.isFinite(Number(x.ord))) x.ord = next++;
  });
  expenses.sort((a, b) => Number(a.ord) - Number(b.ord));
  expenses.forEach((x, i) => {
    x.ord = i + 1;
  });
}
function prioritizeNewExpenses(count) {
  normalizeItemOrder();
  db.items
    .filter((x) => x.kind === "expense")
    .forEach((x) => {
      x.ord += count;
    });
}
function getItemOrder(item) {
  normalizeItemOrder();
  return Number(item.ord) || 1;
}
function reorderVisibleExpenses(id, position) {
  normalizeItemOrder();
  let expenses = db.items.filter((x) => x.kind === "expense"),
    visibleIds = [...document.querySelectorAll("[data-order-item]")].map((input) => input.dataset.orderItem),
    visible = visibleIds.map((itemId) => expenses.find((x) => x.id === itemId)).filter(Boolean),
    from = visible.findIndex((x) => x.id === id);
  if (from < 0) return false;
  let to = Math.max(0, Math.min(visible.length - 1, Math.round(Number(position) || 1) - 1));
  if (from === to) return false;
  let [item] = visible.splice(from, 1);
  visible.splice(to, 0, item);
  let visibleSet = new Set(visibleIds),
    first = Math.min(...expenses.map((x, i) => (visibleSet.has(x.id) ? i : Infinity)));
  expenses = expenses.filter((x) => !visibleSet.has(x.id));
  expenses.splice(first, 0, ...visible);
  expenses.forEach((x, i) => {
    x.ord = i + 1;
  });
  save();
  return true;
}
function moveItem(id, delta) {
  let current = [...document.querySelectorAll("[data-order-item]")].findIndex(
    (input) => input.dataset.orderItem === id,
  );
  if (current < 0) return;
  reorderVisibleExpenses(id, current + 1 + delta);
  render();
}
function setItemOrder(id, position) {
  reorderVisibleExpenses(id, position);
  render();
}
function installmentsPage() {
  normalizeItemOrder();
  let candidates = db.items
    .filter(
      (x) =>
        x.kind === "expense" &&
        (x.installments > 1 || x.recurring || inMonth(x, selected())) &&
        (!filterText ||
          [x.name, x.category, x.person].filter(Boolean).join(" ").toLowerCase().includes(filterText.toLowerCase())),
    )
    .sort((a, b) => Number(a.ord) - Number(b.ord));
  let pendingCount = candidates.filter((x) => remaining(x) > 0).length,
    paidCount = candidates.length - pendingCount;
  let arr = candidates.filter(
    (x) =>
      installmentStatusFilter === "all" ||
      (installmentStatusFilter === "pending" ? remaining(x) > 0 : remaining(x) <= 0),
  );
  let next = monthsFrom(selected(), 12).map((m) => ({
    month: m,
    items: db.items.filter((x) => x.kind === "expense" && inMonth(x, m)),
    total: db.items.filter((x) => x.kind === "expense" && inMonth(x, m)).reduce((s, x) => s + Number(x.amount || 0), 0),
  }));
  return `${welcome("Compras, parcelas e recorrências", null, "")}<div class="grid stats">${statsCard("Itens na lista", arr.length, "Compras com parcelas ou repetição", "◷")}${statsCard("Compromisso em 12 meses", money(next.reduce((s, x) => s + x.total, 0)), "Parcelas e itens recorrentes", "▥")}${statsCard("Maior parcela mensal", money(Math.max(0, ...next.map((x) => x.total))), "No horizonte projetado", "↘")}</div><section class="card"><div class="section-head"><div><h2>Previsão mês a mês</h2><p>Parcelas restantes e recorrências até 12 meses</p></div></div><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Itens ativos</th><th>Despesas previstas</th><th>Acumulado</th></tr></thead><tbody>${(() => {
    let running = 0;
    return next
      .map((r) => {
        running += r.total;
        return `<tr><td>${monthLabel(r.month)}</td><td>${r.items.length}</td><td>${money(r.total)}</td><td>${money(running)}</td></tr>`;
      })
      .join("");
  })()}</tbody></table></div></section><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Itens e parcelas</h2><p>Uma compra aparece em cada mês de vencimento · ajuste a posição ou use ↑ ↓</p></div><div class="filters"><input id="searchRows" placeholder="Buscar descrição ou pessoa" value="${esc(filterText)}"></div></div><div class="subtabs installment-status-tabs" role="tablist" aria-label="Filtrar itens por situação"><button type="button" class="${installmentStatusFilter === "pending" ? "active" : ""}" data-action="installment-status" data-id="pending" role="tab" aria-selected="${installmentStatusFilter === "pending"}">Pendentes <span>${pendingCount}</span></button><button type="button" class="${installmentStatusFilter === "paid" ? "active" : ""}" data-action="installment-status" data-id="paid" role="tab" aria-selected="${installmentStatusFilter === "paid"}">Pagos <span>${paidCount}</span></button><button type="button" class="${installmentStatusFilter === "all" ? "active" : ""}" data-action="installment-status" data-id="all" role="tab" aria-selected="${installmentStatusFilter === "all"}">Todos <span>${candidates.length}</span></button></div>${itemsTable(arr, false, true, true)}</section>`;
}
function timelinePage() {
  let months = monthsFrom(selected(), 12 + (db.settings.hiddenMonths || []).length)
      .filter((m) => !(db.settings.hiddenMonths || []).includes(m))
      .slice(0, 12),
    rows = months.map((m) => {
      let inc = typeItems("income", m).reduce((s, x) => s + Number(x.amount || 0), 0),
        exp = typeItems("expense", m),
        all = exp.reduce((s, x) => s + Number(x.amount || 0), 0),
        third = exp.filter((x) => x.person && x.person !== ownerName()).reduce((s, x) => s + Number(x.amount || 0), 0);
      return { month: m, inc, all, third, mine: all - third, balance: inc - (all - third) };
    });
  return `${welcome("Linha do tempo financeira", null, "")}<div class="notice">Projeção dos próximos 12 meses, com receitas, compromissos, reembolsos esperados e resultado líquido.</div><section class="card"><div class="section-head"><div><h2>Meses lado a lado</h2><p>Valores previstos para cada período</p></div></div><div class="table-wrap"><table><thead><tr><th>Indicador</th>${rows.map((r) => `<th>${monthLabel(r.month)}</th>`).join("")}</tr></thead><tbody><tr><td>Receitas</td>${rows.map((r) => `<td class="positive">${money(r.inc)}</td>`).join("")}</tr><tr><td>Despesas totais</td>${rows.map((r) => `<td class="negative">${money(r.all)}</td>`).join("")}</tr><tr><td>Parte de terceiros</td>${rows.map((r) => `<td>${money(r.third)}</td>`).join("")}</tr><tr><td>Sua parte</td>${rows.map((r) => `<td>${money(r.mine)}</td>`).join("")}</tr><tr><td><strong>Resultado líquido</strong></td>${rows.map((r) => `<td class="${r.balance >= 0 ? "positive" : "negative"}"><strong>${money(r.balance)}</strong></td>`).join("")}</tr></tbody></table></div></section><div class="spacer"></div><section class="card installment-card"><div class="section-head"><div><h2>Até quando vai cada parcela</h2><p>Cada barra mostra os meses em que o item cobra. Listrado: recorrente. O número é a parcela do mês.</p></div></div>${installmentCalendar(months)}</section>`;
}
function installmentColor(person = "") {
  let palette = [
    "#8dbfe6",
    "#afa2e7",
    "#f5b69e",
    "#f6dc72",
    "#93c7ed",
    "#b6a4e8",
    "#92c7e9",
    "#f1cb6b",
    "#f4a98b",
    "#8fd0bc",
  ];
  let hash = 0;
  for (let c of person) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
function installmentCalendar(months) {
  let byId = new Map();
  for (let item of db.items.filter((x) => x.kind === "expense")) {
    let key = item.sourceId || item.seriesId || item.id;
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(item);
  }
  let series = [...byId.values()]
    .map((parts) => {
      parts.sort((a, b) => (a.month || "").localeCompare(b.month || ""));
      return { items: parts, first: parts[0], person: parts[0].person || ownerName() };
    })
    .filter((s) => s.items.some((x) => months.some((m) => inMonth(x, m))))
    .sort(
      (a, b) =>
        a.person.localeCompare(b.person, "pt-BR") ||
        a.first.name.localeCompare(b.first.name, "pt-BR") ||
        (a.first.month || "").localeCompare(b.first.month || ""),
    );
  if (!series.length) return '<div class="empty">Adicione compras para ver o calendário de parcelas.</div>';
  return `<div class="installment-scroll"><table class="installment-table"><thead><tr><th class="installment-label-head">${series.length} itens</th>${months.map((m) => `<th>${monthLabel(m)}</th>`).join("")}</tr></thead><tbody>${series
    .map(
      (s) =>
        `<tr><td class="installment-label"><strong>${esc(s.first.name)}</strong><small>${esc(s.person)}</small></td>${months
          .map((m) => {
            let part = s.items.find((x) => x.month === m || x.due === m || (x.recurring && x.month <= m));
            if (!part) return '<td class="installment-empty"></td>';
            let color = installmentColor(s.person),
              recurring = !!part.recurring,
              label = `${part.part || 1}/${part.installments || 1}`;
            return `<td class="installment-slot"><span class="installment-pill ${recurring ? "recurring" : ""}" style="--pill-color:${color}" title="${esc(s.first.name)} · ${monthLabel(m)} · ${money(part.amount)}${recurring ? " · recorrente" : ""}">${label}</span></td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function settingsPage() {
  return `${welcome("Ajustes do controle", null, "")}<div class="grid two-col"><section class="card"><div class="section-head"><div><h2>Pessoas</h2><p>Use para atribuir compras e acompanhar reembolsos</p></div><button class="btn secondary" data-action="add-person">＋ Pessoa</button></div><div class="settings-list">${db.people.map((p, i) => `<div class="settings-row person-settings-row"><input aria-label="Nome de ${esc(p)}" value="${esc(p)}" data-person-index="${i}"><button class="mini-btn" data-action="remove-person" data-index="${i}">Remover</button></div>`).join("")}</div><button class="btn secondary" data-action="save-people">Salvar pessoas</button></section><section class="card"><div class="section-head"><div><h2>Categorias</h2><p>Classificações usadas em despesas e relatórios</p></div><button class="btn secondary" data-action="add-category">＋ Categoria</button></div><div class="settings-list">${db.categories.map((c, i) => `<div class="settings-row"><input value="${esc(c)}" data-category-index="${i}"><button class="mini-btn" data-action="remove-category" data-index="${i}">Remover</button></div>`).join("")}</div><button class="btn secondary" data-action="save-categories">Salvar categorias</button></section></div><div class="spacer"></div><section class="card"><div class="section-head"><h2>Alertas de renda comprometida</h2></div><div class="form-grid"><div class="field"><label>Alerta amarelo (%)</label><input id="yellowAlert" type="number" min="1" max="100" value="${db.settings.yellowAlert || 70}"></div><div class="field"><label>Alerta vermelho (%)</label><input id="redAlert" type="number" min="1" max="100" value="${db.settings.redAlert || 90}"></div></div><button class="btn secondary" data-action="save-alerts">Salvar alertas</button><div class="notice">O resumo mensal usa esses limites para sinalizar quando as despesas comprometem grande parte das receitas previstas.</div></section>`;
}
function sourceSharedBillsPage() {
  let third = shareRows(selected()),
    groups = {};
  third.forEach((x) => {
    let k = x.person;
    groups[k] ||= { items: [], total: 0, reimbursed: 0 };
    groups[k].items.push(x);
    groups[k].total += Number(x.amount || 0);
    groups[k].reimbursed += Number(x.reimbursed || 0);
  });
  (db.reimbursements || [])
    .filter((r) => r.month === selected() && Number(r.unallocated || 0) > 0)
    .forEach((r) => {
      groups[r.person] ||= { items: [], total: 0, reimbursed: 0 };
      groups[r.person].reimbursed += Number(r.unallocated || 0);
    });
  let exp = typeItems("expense"),
    invoices = (db.bills || []).filter((b) => b.month === selected()),
    all = exp.reduce((s, x) => s + Number(x.amount || 0), 0),
    paidBills = invoices.length
      ? invoices.filter((b) => b.paid).reduce((s, b) => s + Number(b.amount || 0), 0)
      : exp.reduce((s, x) => s + paid(x), 0),
    total = third.reduce((s, x) => s + Number(x.amount || 0), 0),
    received = Object.values(groups).reduce((s, g) => s + g.reimbursed, 0),
    open = Object.values(groups).reduce((s, g) => s + Math.max(0, g.total - g.reimbursed), 0);
  let table = Object.keys(groups).length
    ? `<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Modelo de cobrança</th><th>Previsto</th><th>Recebido</th><th>Em aberto</th><th>Ações</th></tr></thead><tbody>${Object.entries(
        groups,
      )
        .map(
          ([name, g]) =>
            `<tr><td><strong>${esc(name)}</strong></td><td>${(db.peopleInBill || []).includes(name) ? "Dentro da sua fatura" : "Paga por conta própria"}</td><td>${money(g.total)}</td><td>${money(g.reimbursed)}</td><td class="negative">${money(Math.max(0, g.total - g.reimbursed))}</td><td><div class="row-actions">${g.items
              .filter((x) => Number(x.reimbursed || 0) < Number(x.amount || 0))
              .map(
                (x) =>
                  `<button class="mini-btn" data-action="reimburse" data-id="${x.id}">Receber ${esc(x.name)}</button>`,
              )
              .join(" ")}</div></td></tr>`,
        )
        .join("")}</tbody></table></div><div class="spacer"></div>${itemsTable(third)}`
    : '<div class="empty">Nenhuma despesa atribuída a terceiros neste mês. Cadastre a pessoa responsável ao lançar uma compra.</div>';
  return `${welcome("Faturas e valores a receber", null, "")}<div class="grid stats">${statsCard("Compras do mês", money(all), "Itens e parcelas ativos", "▣")}${statsCard("Faturas pagas", money(paidBills), "Pagamentos confirmados no portal antigo", "✓", "positive")}${statsCard("Recebido de terceiros", money(received), "Reembolsos registrados", "↗", "positive")}${statsCard("Ainda a receber", money(open), "Saldo em aberto por pessoa", "◷", "negative")}</div><section class="card"><div class="section-head"><div><h2>Consolidado por pessoa</h2><p>${monthLabel(selected())} · previsto, recebido e pendente</p></div><button class="btn secondary" data-action="print">Exportar PDF</button></div>${table}</section>`;
}
function sourceFaturasPage() {
  let bills = (db.bills || []).filter((b) => b.month === selected());
  return `${sharedBillsPage()}${bills.length ? `<div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Faturas do sistema anterior</h2><p>Registros importados de ${monthLabel(selected())}</p></div></div><div class="table-wrap"><table><thead><tr><th>Fatura</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ação</th></tr></thead><tbody>${bills.map((b) => `<tr><td><strong>${esc(b.name)}</strong></td><td>${monthLabel(b.month)}</td><td>${money(b.amount)}</td><td><span class="badge ${b.paid ? "paid" : "pending"}">${b.paid ? "Paga" : "Pendente"}</span></td><td><button class="mini-btn" data-action="toggle-bill" data-id="${b.id}">${b.paid ? "Marcar pendente" : "Marcar paga"}</button></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
}
function saveOwner() {
  let input = document.querySelector("#ownerNameInput"),
    old = ownerName(),
    next = input.value.trim();
  if (!next) return;
  db.items.forEach((x) => {
    if (x.person === old) x.person = next;
  });
  db.people = db.people.map((p) => (p === old ? next : p));
  db.peopleInBill = (db.peopleInBill || []).map((p) => (p === old ? next : p));
  if (!db.people.includes(next)) db.people.unshift(next);
  db.settings.ownerName = next;
  save();
  render();
  toast("Titular salvo");
}
function sourceSettingsWithOwner() {
  let html = settingsPage().replace(
    '<div class="grid two-col">',
    `<section class="card owner-settings"><div class="section-head"><div><h2>Titular</h2><p>Nome usado para distinguir sua parte das compras de terceiros</p></div></div><div class="field"><label>Seu nome</label><input id="ownerNameInput" value="${esc(ownerName())}"></div><button class="btn secondary" data-action="save-owner">Salvar titular</button></section><div class="spacer"></div><div class="grid two-col">`,
  );
  db.people.forEach((p, i) => {
    html = html.replace(
      `data-person-index="${i}"><button class="mini-btn" data-action="remove-person"`,
      `data-person-index="${i}">${personPhoneField(p, i)}<label class="bill-toggle"><input type="checkbox" data-bill-toggle="${i}" ${db.peopleInBill.includes(p) ? "checked" : ""}> Na minha fatura</label><button class="mini-btn" data-action="remove-person"`,
    );
  });
  return html;
}
document.addEventListener("click", (e) => {
  let b = e.target.closest('[data-action="toggle-bill"]');
  if (!b) return;
  let bill = (db.bills || []).find((x) => x.id === b.dataset.id);
  if (!bill) return;
  bill.paid = !bill.paid;
  save();
  render();
});
function savePeople() {
  let inputs = [...document.querySelectorAll("[data-person-index]")],
    rows = inputs.map((input, i) => ({
      old: db.people[Number(input.dataset.personIndex)],
      name: input.value.trim(),
      raw: document.querySelector(`[data-person-phone="${i}"]`)?.value || "",
      inBill: document.querySelector(`[data-bill-toggle="${i}"]`)?.checked,
    }));
  if (rows.some((r) => !r.name) || new Set(rows.map((r) => r.name.toLowerCase())).size !== rows.length) {
    toast("Use nomes preenchidos e diferentes para cada pessoa.");
    return;
  }
  for (let [i, row] of rows.entries())
    if (row.raw && !normalizeWhatsAppPhone(row.raw)) {
      toast("Informe DDD e um telefone válido para " + row.name + ".");
      document.querySelector(`[data-person-phone="${i}"]`)?.focus();
      return;
    }
  let renames = new Map(rows.map((r) => [r.old, r.name])),
    phones = {};
  for (let row of rows)
    if (row.raw)
      Object.defineProperty(phones, row.name, {
        value: normalizeWhatsAppPhone(row.raw),
        enumerable: true,
        writable: true,
        configurable: true,
      });
  for (let item of [...db.items, ...db.reimbursements]) {
    if (renames.has(item.person)) item.person = renames.get(item.person);
    if (renames.has(item.counterparty)) item.counterparty = renames.get(item.counterparty);
  }
  if (renames.has(ownerName())) db.settings.ownerName = renames.get(ownerName());
  db.people = rows.map((r) => r.name);
  db.peopleInBill = rows.filter((r) => r.inBill).map((r) => r.name);
  db.settings.peoplePhones = phones;
  save();
  render();
  toast("Pessoas e WhatsApp salvos");
}
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="save-owner"]')) {
    e.preventDefault();
    saveOwner();
  }
});
document.addEventListener(
  "click",
  (e) => {
    if (e.target.closest('[data-action="save-people"]')) {
      e.preventDefault();
      e.stopPropagation();
      savePeople();
    }
  },
  true,
);
function sourceAdminPage() {
  return `${welcome("Administração de acessos", null, "")}<section class="card access-panel"><div class="section-head"><div><h2>Acessos a outras pessoas</h2><p>Cada e-mail tem conta própria, com dados separados da sua conta.</p></div><button class="btn primary" data-action="access-add">＋ Conceder acesso</button></div><div id="accessRows"><div class="empty">Carregando acessos…</div></div></section><div class="spacer"></div><div class="grid admin-grid"><section class="card"><div class="section-head"><h2>Perfil</h2></div><div class="field"><label>Nome de exibição</label><input value="${esc(ownerName())}" disabled></div><div class="field"><label>Moeda padrão</label><select disabled><option>Real brasileiro (BRL)</option></select></div><p class="metric">Conta autenticada: ${esc(authUser?.email || "")}. Os dados dos acessos são separados no backend.</p></section><section class="card"><div class="section-head"><h2>Integração AI Gateway</h2></div><div class="field"><label>URL do proxy seguro</label><input id="aiEndpoint" value="${esc(db.settings.aiEndpoint || "")}"><small>Endpoint backend compatível com POST JSON para análise. Ex.: /api/ai/planned-purchase</small></div><div class="field"><label>Modelo</label><input id="aiModel" value="${esc(db.settings.aiModel || "")}"></div><button class="btn secondary" data-action="save-ai">Salvar integração</button><div class="notice">Uma aplicação implantada precisa de uma função backend para encaminhar pedidos ao AI Gateway. Segredos nunca devem ser embutidos no front-end.</div></section><section class="card"><div class="section-head"><h2>Dados e privacidade</h2></div><p style="font-size:11px;line-height:1.6;color:#707789">Os dados de cada conta ficam em arquivos separados no backend local. Este servidor atende apenas neste computador; faça cópias de segurança periódicas.</p><button class="btn secondary" data-action="export-data">Baixar cópia JSON</button><div class="field"><label>Importar backup JSON ou CSV de lançamentos</label><input type="file" id="importFile" accept="application/json,.json,.csv,text/csv"><small>CSV precisa ter colunas de descrição, valor e mês. Também aceita pessoa, categoria, tipo, parcelas e valor pago/recebido. Também aceita a cópia completa JSON do sistema antigo.</small></div><button class="btn danger" data-action="reset-data">Apagar todos os dados</button></section></div><div class="notice">A autenticação usa sessão local, senhas com hash e bloqueio de prazo no servidor. Para permitir acesso de outras pessoas pela internet, hospede com HTTPS e configure backups protegidos.</div>`;
}
function bindPage() {
  document.querySelectorAll("[data-person-phone]").forEach(
    (input) =>
      (input.oninput = () => {
        input.value = formatWhatsAppPhone(input.value);
      }),
  );
  document.querySelectorAll("[data-ai-user]").forEach(
    (input) =>
      (input.onchange = async () => {
        input.disabled = true;
        try {
          await adminCall({ action: "ai-permission", id: input.dataset.aiUser, enabled: input.value === "true" });
          toast("Permissão de IA atualizada");
        } catch (error) {
          toast(error.message);
          input.value = input.value === "true" ? "false" : "true";
        } finally {
          input.disabled = false;
        }
      }),
  );
  document.querySelectorAll("[data-ai-limit]").forEach(
    (input) =>
      (input.onchange = async () => {
        const limit = Number(input.value);
        if (!Number.isInteger(limit) || limit < 0 || limit > 10000) {
          toast("Informe um limite inteiro entre 0 e 10000");
          return;
        }
        input.disabled = true;
        try {
          await adminCall({ action: "ai-limit", id: input.dataset.aiLimit, limit });
          toast("Limite mensal de IA atualizado");
        } catch (error) {
          toast(error.message);
        } finally {
          input.disabled = false;
        }
      }),
  );
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => act(b.dataset.action, b.dataset.id, b.dataset.index)));
  document.querySelectorAll("[data-page]").forEach((b) => {
    if (!b.closest("#nav")) b.onclick = () => setPage(b.dataset.page);
  });
  document.querySelectorAll("[data-month]").forEach(
    (b) =>
      (b.onclick = () => {
        monthInput.value = b.dataset.month;
        render();
      }),
  );
  let s = document.querySelector("#searchRows");
  if (s)
    s.oninput = () => {
      filterText = s.value;
      let start = s.selectionStart,
        end = s.selectionEnd;
      render();
      let next = document.querySelector("#searchRows");
      if (next) {
        next.focus();
        next.setSelectionRange(start, end);
      }
    };
  let f = document.querySelector("#categoryFilter");
  if (f)
    f.onchange = () => {
      let a = typeItems(page === "receber" ? "income" : "expense").filter(
        (x) =>
          (!filterText ||
            `${x.name} ${x.category} ${x.person || ""}`.toLowerCase().includes(filterText.toLowerCase())) &&
          (!f.value || x.category === f.value),
      );
      let target = document.querySelector("#listTable");
      selectedItemIds.clear();
      if (target) {
        target.innerHTML = itemsTable(a, false, true);
        updateBulkSelectionUi();
      }
    };
  document.querySelectorAll("[data-expense-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        let t = b.dataset.expenseFilter,
          v = b.dataset.value;
        if (t === "period") expensePeriod = v;
        if (t === "person") expensePerson = expensePerson === v ? "" : v;
        if (t === "category") expenseCategory = expenseCategory === v ? "" : v;
        render();
      }),
  );
  let compoundForm = document.querySelector("#compoundForm");
  if (compoundForm) {
    compoundForm.onsubmit = (e) => {
      e.preventDefault();
      calculateCompound(compoundForm);
    };
    let periodUnit = compoundForm.elements.periodUnit,
      periodInput = compoundForm.elements.period;
    periodUnit.onchange = () => (periodInput.max = periodUnit.value === "years" ? 50 : 600);
  }
  let pf = document.querySelector("#planForm");
  if (pf)
    pf.onsubmit = (e) => {
      e.preventDefault();
      analyzePlan();
    };
  let file = document.querySelector("#importFile");
  if (file) file.onchange = importData;
}
function act(a, id, index) {
  if (a === "access-add") openAccessCreate();
  if (a.startsWith("access-") && a !== "access-add") manageAccess(a, id);
  if (a === "add-income" || a === "add-expense") openItem(a === "add-income" ? "income" : "expense");
  if (a === "edit") openItem(db.items.find((x) => x.id === id)?.kind, id);
  if (a === "partial") openPartial(id);
  if (a === "mark-paid") markPaid(id);
  if (a === "undo-receipt") undoReceipt(id);
  if (a === "card-add") openCard();
  if (a === "card-edit") openCard(id);
  if (a === "card-delete") deleteCard(id);
  if (a === "pix-settings") openPixSettings();
  if (a === "whatsapp") chargeWhatsApp(id);
  if (a === "history-refresh") loadHistory();
  if (a === "history-restore") restoreHistory(id);
  if (a === "reimburse") openReimburse(id);
  if (a === "delete") deleteItem(id);
  if (a === "delete-selected") deleteSelectedItems();
  if (a === "assign-card-selected") assignSelectedItemsToCard();
  if (a === "installment-status") {
    installmentStatusFilter = id;
    render();
  }
  if (a === "expense-status") {
    expenseStatusFilter = id;
    render();
  }
  if (a === "refresh-usd") refreshUsdRate();
  if (a === "export-csv") downloadCsv();
  if (a === "month-hide") hideMonth();
  if (a === "month-restore") restoreMonth(id);
  if (a === "move-person") movePerson(Number(index), Number(id));
  if (a === "add-bill") openBill();
  if (a === "edit-bill") openBill(id);
  if (a === "delete-bill") deleteBill(id);
  if (a === "move-item") moveItem(id, Number(index));
  if (a === "add-asset") openAsset();
  if (a === "edit-asset") openAsset(id);
  if (a === "delete-asset") deleteAsset(id);
  if (a === "add-person") openSettingEntry("person");
  if (a === "add-category") openSettingEntry("category");
  if (a === "remove-person") removeSettingEntry("people", Number(index));
  if (a === "remove-category") removeSettingEntry("categories", Number(index));
  if (a === "save-people") {
    db.people = [...document.querySelectorAll("[data-person-index]")].map((x) => x.value.trim()).filter(Boolean);
    save();
    render();
    toast("Pessoas salvas");
  }
  if (a === "save-categories") {
    db.categories = [...document.querySelectorAll("[data-category-index]")].map((x) => x.value.trim()).filter(Boolean);
    save();
    render();
    toast("Categorias salvas");
  }
  if (a === "save-alerts") {
    db.settings.yellowAlert = Number(document.querySelector("#yellowAlert").value) || 70;
    db.settings.redAlert = Number(document.querySelector("#redAlert").value) || 90;
    save();
    toast("Alertas salvos");
    render();
  }
  if (a === "save-usd") {
    db.settings.usd = Number(document.querySelector("#usdInput").value) || 5.2;
    save();
    toast("Cotação salva");
    render();
  }
  if (a === "save-ai") {
    db.settings.aiEndpoint = document.querySelector("#aiEndpoint").value.trim();
    db.settings.aiModel = document.querySelector("#aiModel").value.trim();
    save();
    toast("Configuração do AI Gateway salva");
  }
  if (a === "compound-reset") {
    compoundInputs = {
      initial: "",
      rate: "",
      frequency: "annual",
      period: "10",
      periodUnit: "years",
      contribution: "",
    };
    compoundResult = null;
    render();
  }
  if (a === "print") window.print();
  if (a === "export-data") exportData();
  if (a === "reset-data") resetData();
}
function updateBulkSelectionUi() {
  let boxes = [...document.querySelectorAll("[data-select-item]")],
    count = boxes.filter((x) => x.checked).length,
    button = document.querySelector("[data-action=delete-selected]"),
    label = document.querySelector("#bulkSelectionLabel"),
    all = document.querySelector("[data-select-all]");
  if (button) {
    button.onclick = deleteSelectedItems;
    button.disabled = !count;
    button.textContent = count ? `Excluir ${count} item(ns)` : "Excluir selecionados";
  }
  if (label) label.textContent = count ? `${count} item(ns) selecionado(s)` : "Nenhum item selecionado";
  if (all) {
    all.checked = boxes.length > 0 && count === boxes.length;
    all.indeterminate = count > 0 && count < boxes.length;
  }
  let assignButton = document.querySelector("[data-action=assign-card-selected]"),
    cardSelect = document.querySelector("[data-bulk-card]");
  if (assignButton) {
    assignButton.disabled = !count || !cardSelect?.value;
    assignButton.textContent = count ? "Vincular " + count + " item(ns) ao cartão" : "Vincular cartão";
  }
}
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-select-item]")) {
    if (e.target.checked) selectedItemIds.add(e.target.dataset.selectItem);
    else selectedItemIds.delete(e.target.dataset.selectItem);
  } else if (e.target.matches("[data-select-all]")) {
    document.querySelectorAll("[data-select-item]").forEach((x) => {
      x.checked = e.target.checked;
      if (e.target.checked) selectedItemIds.add(x.dataset.selectItem);
      else selectedItemIds.delete(x.dataset.selectItem);
    });
  } else if (e.target.matches("[data-order-item]")) {
    setItemOrder(e.target.dataset.orderItem, e.target.value);
  } else if (e.target.matches("[data-bulk-card]")) {
    updateBulkSelectionUi();
  }
  updateBulkSelectionUi();
});
function showModal(title, html, onSave) {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalBody").innerHTML = html;
  let d = document.querySelector("#modal");
  d.showModal();
  document.querySelector("#modalForm").onsubmit = (e) => {
    e.preventDefault();
    if (e.submitter?.value === "cancel") {
      d.close("cancel");
      return;
    }
    if (onSave() !== false) {
      d.close("saved");
      render();
    }
  };
  d.onclick = null;
  d.oncancel = (e) => e.preventDefault();
}
function categoryOptions(kind, sel = "") {
  let base = kind === "income" ? ["Salário", "Freelance", "Investimentos", "Benefícios", "Outros"] : db.categories;
  return `<option value="">Selecione</option>${base.map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("")}`;
}
function openItem(kind, id) {
  if (!kind) return;
  let x = id ? db.items.find((a) => a.id === id) : null;
  let title = x ? "Editar lançamento" : kind === "income" ? "Adicionar entrada" : "Adicionar despesa";
  showModal(
    title,
    `<div class="form-grid"><div class="field span2"><label>Descrição</label><input name="name" required value="${esc(x?.name || "")}" placeholder="Ex.: Salário, mercado, parcela do carro"></div><div class="field"><label>Valor por mês / parcela (R$)</label><input name="amount" required type="number" min="0.01" step="0.01" value="${x?.amount ?? ""}"></div><div class="field"><label>Categoria</label><select name="category">${categoryOptions(kind, x?.category)}</select></div><div class="field"><label>Mês da primeira ocorrência</label><input name="month" type="month" required value="${x?.month || selected()}"></div><div class="field"><label>${kind === "income" ? "Prazo (meses)" : "Quantidade de parcelas"}</label><input name="installments" type="number" min="${kind === "income" ? 0 : 1}" max="120" value="${kind === "income" && x?.recurring ? 0 : x?.installments || 1}"><small>${kind === "income" ? "Informe 0 para receber todo mês sem prazo final." : "1 para compra à vista."}</small></div>${kind === "expense" ? `<div class="field"><label>Parcela no mês inicial</label><input name="startPart" type="number" min="1" max="120" value="${x?.part || 1}"><small>Ex.: 8/10 inicia no mês escolhido; as parcelas 1 a 7 não são criadas.</small></div><div class="field"><label>Responsável pela compra</label><select name="person">${db.people.map((p) => `<option ${p === (x?.person || ownerName()) ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>${cardSelect(x)}<div class="field"><label>Observação</label><input name="notes" value="${esc(x?.notes || "")}" placeholder="Cartão, referência ou detalhe"></div><div class="field span2"><label><input style="width:auto" type="checkbox" name="recurring" ${x?.recurring ? "checked" : ""}> Repetir todo mês sem data final</label><small>Use para assinaturas e contas mensais. Cada mês mantém seu próprio pagamento.</small></div>` : ""}<div class="field span2"><label><input style="width:auto" type="checkbox" name="future" ${x?.future ? "checked" : ""}> Lançamento previsto/futuro ainda não debitado</label></div></div>`,
    () => {
      let f = document.querySelector("#modalForm"),
        data = Object.fromEntries(new FormData(f).entries());
      data.future = f.elements.future.checked;
      data.amount = Number(data.amount);
      data.installments = Number(data.installments);
      data.recurring = kind === "income" ? data.installments === 0 : f.elements.recurring.checked;
      if (data.installments < 0 || data.installments > 120) {
        toast("Informe um prazo entre 0 e 120 meses");
        return false;
      }
      if (
        kind === "expense" &&
        !data.recurring &&
        (Number(data.startPart) < 1 || Number(data.startPart) > Math.max(1, data.installments))
      ) {
        toast("A parcela inicial deve ficar entre 1 e o total informado");
        return false;
      }
      data.part = kind === "expense" ? Number(data.startPart || x?.part || 1) : 1;
      delete data.startPart;
      data.kind = kind;
      data.paid = x?.paid || 0;
      data.id = x?.id || crypto.randomUUID();
      data.seriesId = x?.seriesId || x?.sourceId || crypto.randomUUID();
      if (x) Object.assign(x, data);
      else if (kind === "expense") {
        let count = data.recurring ? 1 : Math.max(1, data.installments - data.part + 1);
        prioritizeNewExpenses(count);
        data.ord = 1;
        if (data.recurring)
          db.items.push({
            ...data,
            id: crypto.randomUUID(),
            month: data.month,
            due: data.month,
            paid: 0,
            installments: 0,
            recurring: true,
          });
        else if (data.installments > 1) {
          let [firstYear, firstMonth] = data.month.split("-").map(Number),
            first = new Date(firstYear, firstMonth - 1, 1);
          for (let i = data.part - 1; i < data.installments; i++) {
            let d = new Date(first.getFullYear(), first.getMonth() + i - (data.part - 1), 1);
            db.items.push({
              ...data,
              id: crypto.randomUUID(),
              month: isoMonth(d),
              due: isoMonth(d),
              part: i + 1,
              ord: i - data.part + 2,
              amount: Math.round(data.amount * 100) / 100,
              paid: 0,
              installments: data.installments,
            });
          }
        } else db.items.push(data);
      } else if (data.recurring) {
        db.items.push({
          ...data,
          id: crypto.randomUUID(),
          month: data.month,
          due: data.month,
          paid: 0,
          installments: 0,
          recurring: true,
        });
      } else if (data.installments > 1) {
        let [firstYear, firstMonth] = data.month.split("-").map(Number),
          first = new Date(firstYear, firstMonth - 1, 1);
        for (let i = data.part - 1; i < data.installments; i++) {
          let d = new Date(first.getFullYear(), first.getMonth() + i - (data.part - 1), 1);
          db.items.push({
            ...data,
            id: crypto.randomUUID(),
            month: isoMonth(d),
            due: isoMonth(d),
            part: i + 1,
            amount: Math.round(data.amount * 100) / 100,
            paid: 0,
            installments: data.installments,
          });
        }
      } else db.items.push(data);
      save();
      toast("Lançamento salvo");
    },
  );
}
function markPaid(id) {
  let x = db.items.find((a) => a.id === id);
  if (!x) return;
  let amount = remaining(x),
    month = selected();
  if (amount <= 0) return;
  let today = new Date(),
    date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  x.payments = x.payments || [];
  x.payments.push({ amount, date, month });
  if (!x.recurring) x.paid = Number(x.paid || 0) + amount;
  save();
  render();
  toast(x.kind === "income" ? "Recebimento registrado" : "Pagamento registrado");
}
function openPartial(id) {
  let x = db.items.find((a) => a.id === id);
  if (!x) return;
  showModal(
    x.kind === "income" ? "Registrar recebimento" : "Registrar pagamento parcial",
    `<div class="notice">Valor total ${money(x.amount)} · já ${x.kind === "income" ? "recebido" : "pago"} ${money(paid(x))} · restante ${money(remaining(x))}</div><div class="field"><label>Valor desta movimentação (R$)</label><input name="amount" required type="number" min="0.01" max="${remaining(x)}" step="0.01"></div><div class="field"><label>Data</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>`,
    () => {
      let form = new FormData(document.querySelector("#modalForm")),
        amt = Number(form.get("amount"));
      if (amt > remaining(x)) {
        toast("O valor excede o restante");
        return false;
      }
      x.payments = x.payments || [];
      let date = form.get("date");
      x.payments.push({ amount: amt, date, month: date.slice(0, 7) });
      if (!x.recurring) x.paid = paid(x) + amt;
      save();
      toast("Movimentação registrada");
    },
  );
}
function undoReceipt(id) {
  let x = db.items.find((a) => a.id === id);
  if (!x) return;
  if (
    !confirm(
      "Retornar este item a pendente? Os pagamentos deste item serão removidos" +
        (x.recurring ? " somente no mês selecionado." : "."),
    )
  )
    return;
  resetItemPayment(x, selected());
  save();
  render();
  toast("Item marcado como pendente");
}
function sourceOpenReimburse(id) {
  let x = db.items.find((a) => a.id === id);
  if (!x) return;
  let open = Math.max(0, Number(x.amount || 0) - Number(x.reimbursed || 0));
  showModal(
    "Registrar reembolso",
    `<div class="notice">${esc(x.person || "Terceiro")} · ${esc(x.name)} · previsto ${money(x.amount)} · recebido ${money(x.reimbursed || 0)} · em aberto ${money(open)}</div><div class="field"><label>Valor recebido (R$)</label><input name="amount" type="number" min="0.01" max="${open}" step="0.01" required></div><div class="field"><label>Data</label><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>`,
    () => {
      let form = new FormData(document.querySelector("#modalForm")),
        amount = Number(form.get("amount"));
      if (amount > open) {
        toast("O valor ultrapassa o saldo em aberto");
        return false;
      }
      x.reimbursed = Number(x.reimbursed || 0) + amount;
      x.reimbursements = x.reimbursements || [];
      x.reimbursements.push({ amount, date: form.get("date") });
      save();
      toast("Reembolso registrado");
    },
  );
}
function openSettingEntry(type) {
  let label = type === "person" ? "pessoa" : "categoria";
  showModal(
    `Adicionar ${label}`,
    `<div class="field"><label>Nome</label><input name="name" required maxlength="60"></div>${type === "person" ? '<div class="field"><label for="newPersonPhone">WhatsApp</label><input id="newPersonPhone" name="phone" type="tel" inputmode="tel" placeholder="(85) 99999-9999" maxlength="20"></div>' : ""}`,
    () => {
      let name = String(new FormData(document.querySelector("#modalForm")).get("name") || "").trim(),
        list = type === "person" ? db.people : db.categories;
      if (list.some((x) => x.toLowerCase() === name.toLowerCase())) {
        toast("Esse nome já está cadastrado");
        return false;
      }
      let raw = String(new FormData(document.querySelector("#modalForm")).get("phone") || "").trim();
      if (type === "person" && raw && !normalizeWhatsAppPhone(raw)) {
        toast("Informe DDD e um telefone válido.");
        return false;
      }
      list.push(name);
      if (type === "person" && raw) {
        db.settings.peoplePhones ||= {};
        Object.defineProperty(db.settings.peoplePhones, name, {
          value: normalizeWhatsAppPhone(raw),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      save();
      toast(`${type === "person" ? "Pessoa" : "Categoria"} adicionada`);
    },
  );
  let phone = document.querySelector("#newPersonPhone");
  if (phone) phone.oninput = () => (phone.value = formatWhatsAppPhone(phone.value));
}
function removeSettingEntry(key, index) {
  let arr = db[key],
    label = key === "people" ? "pessoa" : "categoria";
  if (!arr || !arr[index]) return;
  if (confirm(`Remover ${label} “${arr[index]}”? Os lançamentos existentes serão preservados.`)) {
    arr.splice(index, 1);
    save();
    render();
  }
}
function openDeleteConfirm({ title, description, name, meta, warning, button, onConfirm }) {
  let d = document.querySelector("#deleteDialog"),
    f = document.querySelector("#deleteForm");
  document.querySelector("#deleteTitle").textContent = title;
  document.querySelector("#deleteDescription").textContent = description;
  document.querySelector("#deleteRecordName").textContent = name;
  document.querySelector("#deleteRecordMeta").textContent = meta;
  document.querySelector("#deleteWarning").textContent = warning;
  f.querySelector('[value="confirm"]').textContent = button;
  f.onsubmit = (e) => {
    e.preventDefault();
    if (e.submitter?.value === "cancel") {
      d.close("cancel");
      return;
    }
    d.close("confirm");
    onConfirm();
  };
  d.onclick = (e) => {
    if (e.target === d) d.close("cancel");
  };
  d.showModal();
}
function deleteItem(id) {
  let x = db.items.find((item) => item.id === id);
  if (!x) return;
  let installment =
    x.installments > 1
      ? `Parcela ${x.part || 1} de ${x.installments}`
      : x.recurring
        ? "Recorrente"
        : "Lançamento único";
  let meta = [installment, monthLabel(x.due || x.month), x.person, money(x.amount)].filter(Boolean).join(" · ");
  openDeleteConfirm({
    title: "Excluir lançamento?",
    description: "Revise os dados antes de confirmar a exclusão.",
    name: x.name,
    meta,
    warning:
      x.installments > 1
        ? "Somente esta parcela será removida. As outras parcelas permanecerão no histórico."
        : x.recurring
          ? "A regra recorrente e as projeções futuras deste lançamento serão removidas."
          : "Esta ação não pode ser desfeita.",
    button: "Excluir lançamento",
    onConfirm: () => {
      db.items = db.items.filter((item) => item.id !== id);
      save();
      render();
      toast("Lançamento excluído");
    },
  });
}
function deleteSelectedItems() {
  let ids = [...selectedItemIds],
    selected = db.items.filter((x) => ids.includes(x.id));
  if (!selected.length) return;
  let total = selected.reduce((sum, x) => sum + Number(x.amount || 0), 0),
    names =
      selected
        .slice(0, 3)
        .map((x) => x.name)
        .join(" · ") + (selected.length > 3 ? "…" : "");
  openDeleteConfirm({
    title: `Excluir ${selected.length} itens?`,
    description: "Confira a seleção antes de confirmar.",
    name: names,
    meta: `${selected.length} lançamento(s) · total de ${money(total)}`,
    warning: "A exclusão remove os itens selecionados e seus pagamentos registrados. Esta ação não pode ser desfeita.",
    button: `Excluir ${selected.length} itens`,
    onConfirm: () => {
      db.items = db.items.filter((x) => !ids.includes(x.id));
      selectedItemIds.clear();
      save();
      render();
      toast(`${selected.length} itens excluídos`);
    },
  });
}
function assignSelectedItemsToCard() {
  let ids = [...selectedItemIds],
    cardId = document.querySelector("[data-bulk-card]")?.value;
  if (!ids.length || !cardId) return;
  let selected = db.items.filter((item) => ids.includes(item.id) && item.kind === "expense");
  if (!selected.length) return;
  for (const item of selected) item.cardId = cardId;
  save();
  selectedItemIds.clear();
  render();
  toast(selected.length + " itens vinculados ao cartão");
}
function openAsset(id) {
  let x = id ? db.assets.find((a) => a.id === id) : null,
    rate = Number(db.settings.usd) || 1,
    currency = x?.currency || "BRL",
    initial = x?.originalAmount ?? x?.delta ?? "";
  showModal(
    x ? "Editar movimentação" : "Registrar aporte ou retirada",
    `<div class="form-grid"><div class="field span2"><label>Banco ou instituição financeira</label><input list="banks" name="bank" required value="${esc(x?.bank || "")}" placeholder="Selecione ou escreva o nome"><datalist id="banks">${bankNames.map((b) => `<option value="${b}">`).join("")}</datalist><small>Lista de referência fornecida; qualquer instituição pode ser digitada.</small></div><div class="field"><label>Mês da movimentação</label><input name="month" type="month" required value="${x?.month || selected()}"></div><div class="field"><label>Moeda</label><select name="currency"><option value="BRL" ${currency === "BRL" ? "selected" : ""}>Real (BRL)</option><option value="USD" ${currency === "USD" ? "selected" : ""}>Dólar americano (USD)</option></select></div><div class="field span2"><label>Valor do movimento</label><input name="amount" type="number" step="0.01" required value="${initial}"><small id="assetConversionHint">Use valor positivo para aporte e negativo para retirada.</small></div></div><div class="notice">${currency === "USD" ? `O valor será convertido para reais pela cotação de ${money(rate)} por USD.` : "Movimentos em dólar são convertidos para reais pela cotação automática do sistema."} Movimentos do mesmo banco se acumulam no tempo.</div>`,
    () => {
      let f = document.querySelector("#modalForm"),
        form = new FormData(f),
        currency = form.get("currency"),
        originalAmount = Number(form.get("amount")),
        usedRate = currency === "USD" ? rate : null,
        delta = Math.round(originalAmount * (usedRate || 1) * 100) / 100,
        data = {
          id: x?.id || crypto.randomUUID(),
          bank: String(form.get("bank")).trim(),
          month: form.get("month"),
          delta,
          currency,
          originalAmount,
          usdRate: usedRate,
        };
      if (x) Object.assign(x, data);
      else db.assets.push(data);
      save();
      toast("Movimentação patrimonial salva");
    },
  );
  let form = document.querySelector("#modalForm"),
    currencyInput = form.elements.currency,
    amountInput = form.elements.amount,
    hint = document.querySelector("#assetConversionHint");
  function updateHint() {
    let amount = Number(amountInput.value || 0);
    hint.textContent =
      currencyInput.value === "USD"
        ? `Cotação atual: ${money(rate)} por USD · conversão estimada: ${money(amount * rate)}.`
        : "Use valor positivo para aporte e negativo para retirada.";
  }
  currencyInput.onchange = updateHint;
  amountInput.oninput = updateHint;
  updateHint();
}
function deleteAsset(id) {
  let x = db.assets.find((a) => a.id === id);
  if (!x) return;
  openDeleteConfirm({
    title: "Remover movimento patrimonial?",
    description: "Confira a movimentação antes de confirmar.",
    name: x.bank,
    meta: [monthLabel(x.month), money(x.delta)].join(" · "),
    warning: "O movimento será removido do histórico e os saldos seguintes serão recalculados.",
    button: "Remover movimento",
    onConfirm: () => {
      db.assets = db.assets.filter((a) => a.id !== id);
      save();
      render();
      toast("Movimento removido");
    },
  });
}
function monthsFrom(start, n) {
  let [y, m] = start.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => isoMonth(new Date(y, m - 1 + i, 1)));
}
function sourceAnalyzePlan() {
  if (aiBusy) return;
  let desc = document.querySelector("#planText").value.trim(),
    amount = Number(document.querySelector("#planAmount").value),
    n = Math.min(120, Math.max(1, Number(document.querySelector("#planParts").value) || 1)),
    start = document.querySelector("#planStart").value || selected();
  let monthly = amount / n,
    months = monthsFrom(start, n),
    recentIn = months.map((m) => typeItems("income", m).reduce((s, x) => s + x.amount, 0)).filter(Boolean),
    avgIn = recentIn.length ? recentIn.reduce((a, b) => a + b, 0) / recentIn.length : 0;
  let category = document.querySelector("#planCategory").value.trim() || suggestCategory(desc),
    projections = months.map((m) => {
      let current = typeItems("expense", m).reduce((s, x) => s + x.amount, 0);
      return { month: m, current, with: current + monthly, balance: avgIn - current - monthly };
    }),
    draft = {
      category,
      summary: `A compra adicionaria aproximadamente ${money(monthly)} por mês em ${n} parcela(s). ${avgIn ? "A estimativa usa a média das entradas mensais cadastradas nos meses projetados." : "Cadastre entradas para refinar a avaliação de comprometimento do orçamento."}`,
      monthly,
      impact: avgIn ? (monthly / avgIn) * 100 : 0,
      projections,
      amount,
      parts: n,
    };
  db.lastPlan = draft;
  save();
  render();
  let endpoint = db.settings.aiEndpoint;
  if (!endpoint) {
    toast("Configure o endpoint do AI Gateway em Admin");
    return;
  }
  aiBusy = true;
  let result = document.querySelector("#planResult");
  if (result) result.innerHTML = '<div class="empty">Consultando AI Gateway…</div>';
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: db.settings.aiModel,
      task: "planned-purchase-impact",
      purchase: { description: desc, totalAmount: amount, installments: n, firstMonth: start },
      transactions: db.items.map((x) => ({
        kind: x.kind,
        name: x.name,
        category: x.category,
        amount: x.amount,
        paid: x.paid,
        month: x.month,
        due: x.due,
        installments: x.installments,
        part: x.part,
      })),
      responseFormat: { category: "string", summary: "string", risks: "array", suggestion: "string" },
    }),
  })
    .then((r) => {
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      let ai = data.result || data.output || data;
      draft.category = ai.category || draft.category;
      draft.summary =
        [ai.summary, ai.suggestion, Array.isArray(ai.risks) ? ai.risks.join(" ") : ""].filter(Boolean).join(" ") ||
        draft.summary;
      db.lastPlan = draft;
      save();
      toast("Análise AI concluída");
    })
    .catch(() => toast("AI indisponível; mostrando estimativa local"))
    .finally(() => {
      aiBusy = false;
      render();
    });
}
function suggestCategory(s) {
  let t = s.toLowerCase();
  if (/mercado|comida|restaurante|supermerc/.test(t)) return "Alimentação";
  if (/carro|combust|uber|ônibus|passagem/.test(t)) return "Transporte";
  if (/casa|aluguel|móvel|geladeira/.test(t)) return "Moradia";
  if (/médic|saúde|farmác/.test(t)) return "Saúde";
  if (/curso|livro|escola/.test(t)) return "Educação";
  if (/viagem|hotel/.test(t)) return "Lazer";
  return "Compras";
}
function exportData() {
  let blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `meu-patrimonio-backup-${selected()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function parseCsv(text) {
  let sample = text.split(/\r?\n/, 1)[0],
    delimiter = (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ";" : ",";
  let rows = [],
    row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function normalizeHeader(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function parseMoneyValue(v) {
  let s = String(v || "")
    .replace(/R\$\s?/gi, "")
    .trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Number(s) || 0;
}
function parseMonthValue(v) {
  let s = String(v || "").trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}`;
  let p = s.match(/^([A-Za-zÀ-ÿ]{3})\/?(\d{2,4})$/),
    months = {
      jan: "01",
      fev: "02",
      mar: "03",
      abr: "04",
      mai: "05",
      jun: "06",
      jul: "07",
      ago: "08",
      set: "09",
      out: "10",
      nov: "11",
      dez: "12",
    };
  if (p) {
    let y = p[2].length === 2 ? "20" + p[2] : p[2];
    return `${y}-${months[normalizeHeader(p[1]).slice(0, 3)] || "01"}`;
  }
  return selected();
}
function importCsv(text) {
  let rows = parseCsv(text);
  if (rows.length < 2) throw Error("CSV vazio");
  let headers = rows.shift().map(normalizeHeader),
    find = (...names) => headers.findIndex((h) => names.some((n) => h.includes(n))),
    ix = {
      name: find("descricao", "nome", "item", "lancamento"),
      amount: find("valorparcela", "valortotal", "valor", "amount"),
      month: find("mesreferencia", "mes", "competencia", "vencimento", "month"),
      kind: find("tipo"),
      category: find("categoria"),
      person: find("pessoa", "responsavel", "quem"),
      parts: find("parcelas", "parcelamento"),
      part: find("parcelaatual", "parcela"),
      paid: find("pago", "recebido"),
      notes: find("observacao", "nota"),
    };
  if (ix.name < 0 || ix.amount < 0) throw Error("CSV sem as colunas descrição e valor");
  let imported = [];
  for (let row of rows) {
    let get = (k) => (ix[k] >= 0 ? String(row[ix[k]] || "").trim() : "");
    let name = get("name"),
      amount = parseMoneyValue(get("amount"));
    if (!name || !amount) continue;
    let kind = get("kind"),
      isIncome = /receita|entrada|renda|income/i.test(kind),
      month = parseMonthValue(get("month")),
      parts = Math.max(1, Number(get("parts")) || 1),
      firstPart = Math.min(parts, Math.max(1, Number(get("part")) || 1)),
      paidAmount = parseMoneyValue(get("paid"));
    monthsFrom(month, parts - firstPart + 1).forEach((m, j) => {
      let part = firstPart + j;
      imported.push({
        id: crypto.randomUUID(),
        kind: isIncome ? "income" : "expense",
        name,
        amount,
        month: m,
        due: m,
        category: get("category") || "Outros",
        person: get("person") || ownerName(),
        notes: get("notes"),
        installments: parts,
        part,
        paid: part === firstPart ? Math.min(amount, paidAmount) : 0,
        payments: [],
      });
    });
  }
  if (!imported.length) throw Error("Nenhum lançamento válido encontrado");
  let seen = new Set(db.items.map((x) => `${x.kind}|${x.name}|${x.month}|${x.part || 1}|${x.person || ""}`));
  imported = imported.filter((x) => {
    let k = `${x.kind}|${x.name}|${x.month}|${x.part}|${x.person}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  db.items.push(...imported);
  return imported.length;
}
function importLegacyBackup(d) {
  if (!Array.isArray(d.incomes) || !Array.isArray(d.purchases) || !Array.isArray(d.bills))
    throw Error("Formato do backup antigo não reconhecido");
  let added = [],
    seen = new Set(db.items.map((x) => x.sourceId).filter(Boolean));
  function addSchedule(entry, kind) {
    let sourceId = String(entry.id || `${kind}-${entry.desc}-${entry.start}`);
    if (seen.has(sourceId)) return;
    seen.add(sourceId);
    let start = entry.start || selected(),
      count = entry.n == null ? 1 : Math.max(1, Math.min(120, Number(entry.n) || 1)),
      base = {
        kind,
        name: entry.desc || "Sem descrição",
        amount: Number(entry.valor || 0),
        category: entry.cat || (kind === "income" ? "Outros" : "Outros"),
        month: start,
        due: start,
        person: entry.who || d.titular || ownerName(),
        notes: entry.obs || "",
        installments: count,
        part: 1,
        paid: 0,
        sourceId,
        sourceSystem: "contas-do-mes",
      };
    if (!base.amount) return;
    if (entry.n == null) {
      added.push({ ...base, id: crypto.randomUUID(), recurring: true });
    } else
      monthsFrom(start, count).forEach((month, i) =>
        added.push({ ...base, id: crypto.randomUUID(), month, due: month, part: i + 1, paid: 0, recurring: false }),
      );
  }
  d.incomes.forEach((x) => addSchedule(x, "income"));
  d.purchases.forEach((x) => addSchedule(x, "expense"));
  let addedBills = [];
  for (let b of d.bills) {
    let id = String(b.id || "");
    if ((db.bills || []).some((x) => x.sourceId === id)) continue;
    addedBills.push({
      id: crypto.randomUUID(),
      sourceId: id,
      sourceSystem: "contas-do-mes",
      name: b.desc || "Fatura",
      month: b.month || selected(),
      amount: Number(b.valor || 0),
      paid: !!b.paid,
    });
  }
  let addedReceipts = [];
  for (let r of d.received || []) {
    let id = String(r.id || "");
    if ((db.reimbursements || []).some((x) => x.sourceId === id)) continue;
    let entry = {
      id: crypto.randomUUID(),
      sourceId: id,
      sourceSystem: "contas-do-mes",
      person: r.who || "Terceiro",
      month: r.month || selected(),
      amount: Number(r.valor || 0),
      unallocated: 0,
    };
    let remainingAmount = entry.amount;
    let targets = added.filter((x) => x.kind === "expense" && x.person === entry.person && x.month === entry.month);
    for (let item of targets) {
      let room = Math.max(0, item.amount - Number(item.reimbursed || 0)),
        part = Math.min(room, remainingAmount);
      if (part > 0) {
        item.reimbursed = Number(item.reimbursed || 0) + part;
        item.reimbursements = [
          ...(item.reimbursements || []),
          { amount: part, date: `${entry.month}-01`, month: entry.month, imported: true },
        ];
        remainingAmount -= part;
      }
      if (remainingAmount <= 0) break;
    }
    entry.unallocated = remainingAmount;
    addedReceipts.push(entry);
  }
  db.items.push(...added);
  db.bills = [...(db.bills || []), ...addedBills];
  db.reimbursements = [...(db.reimbursements || []), ...addedReceipts];
  let people = (d.people || []).map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean),
    billPeople = (d.people || []).filter((p) => p && p.inBill).map((p) => p.name);
  if (d.titular && !people.includes(d.titular)) people.unshift(d.titular);
  db.people = [...new Set([...people, ...db.people])];
  db.peopleInBill = billPeople.length ? billPeople : [...(db.peopleInBill || [])];
  db.categories = [...new Set([...(d.cats || []), ...db.categories.filter((c) => !DEFAULT_CATEGORIES.includes(c))])];
  db.settings = {
    ...db.settings,
    ownerName: d.titular || db.settings.ownerName,
    yellowAlert: Number(d.yellow || 0.7) <= 1 ? Number(d.yellow || 0.7) * 100 : Number(d.yellow || 70),
    redAlert: Number(d.red || 0.9) <= 1 ? Number(d.red || 0.9) * 100 : Number(d.red || 90),
    legacyStart: d.start || null,
    hiddenMonths: d.hidden || [],
  };
  return { items: added.length, bills: addedBills.length, receipts: addedReceipts.length };
}
function sourceImportData(e) {
  let f = e.target.files?.[0];
  if (!f) return;
  let reader = new FileReader();
  reader.onload = () => {
    try {
      let text = String(reader.result || "");
      if (/\.csv$/i.test(f.name) || f.type === "text/csv") {
        let n = importCsv(text);
        save();
        render();
        toast(`${n} lançamento(s) importado(s)`);
      } else {
        let d = JSON.parse(text);
        if (Array.isArray(d.incomes) && Array.isArray(d.purchases)) {
          let result = importLegacyBackup(d);
          save();
          render();
          toast(`Importados ${result.items} lançamentos, ${result.bills} faturas e ${result.receipts} recebimentos`);
        } else if (Array.isArray(d.items) && Array.isArray(d.assets)) {
          if (!confirm("Substituir os dados locais atuais pelo backup?")) return;
          db = { ...load(), ...d, settings: { ...load().settings, ...d.settings } };
          save();
          render();
          toast("Backup importado");
        } else throw Error("Formato de backup incompatível");
      }
    } catch (err) {
      toast(err.message || "Arquivo incompatível ou inválido");
    }
  };
  reader.readAsText(f);
}
function sourceResetData() {
  if (confirm("Apagar todos os lançamentos e saldos deste navegador e do backend local?")) {
    localStorage.removeItem(KEY);
    db = load();
    save();
    render();
    toast("Dados removidos");
  }
}
function applyTheme() {
  let theme = db.settings.theme === "light" ? "light" : "dark";
  if (theme === "dark") document.body.dataset.theme = "dark";
  else delete document.body.dataset.theme;
  let button = document.querySelector("#themeToggle");
  if (button) {
    button.textContent = theme === "dark" ? "☀" : "◐";
    button.title = theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";
    button.setAttribute("aria-label", button.title);
  }
}
function toggleTheme() {
  db.settings.theme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme();
  save();
}
function sourceOpenChangePassword() {
  showModal(
    "Alterar senha",
    `<div class="field"><label>Senha atual</label><input name="currentPassword" type="password" required autocomplete="current-password"></div><div class="field"><label>Nova senha (mínimo 8 caracteres)</label><input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></div><div class="field"><label>Confirme a nova senha</label><input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password"></div>`,
    () => {
      let form = Object.fromEntries(new FormData(document.querySelector("#modalForm")).entries());
      if (form.newPassword !== form.confirmPassword) {
        toast("A confirmação não corresponde à nova senha");
        return false;
      }
      fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      })
        .then(async (response) => {
          let result = await response.json().catch(() => ({}));
          if (!response.ok) throw Error(result.error || "Não foi possível alterar a senha");
          document.querySelector("#modal").close();
          toast("Senha alterada com sucesso");
        })
        .catch((error) => toast(error.message));
      return false;
    },
  );
}
function lockApplication() {
  document.body.classList.add("auth-locked");
  document.querySelector("#authScreen").hidden = false;
  if (document.querySelector("#modal").open) document.querySelector("#modal").close();
  backendSyncEnabled = false;
  clearInterval(authTimer);
}
function sourceShowAuthScreen(mode = "login", message = "", expiresAt = "") {
  lockApplication();
  let root = document.querySelector("#authScreen");
  if (mode === "suspended") {
    let date = expiresAt ? new Date(expiresAt).toLocaleString("pt-BR") : "—";
    root.innerHTML = `<section class="auth-card auth-suspended"><div class="lock-icon">🔒</div><h1>Acesso suspenso</h1><p>${message || "O prazo deste acesso terminou ou foi suspenso pelo administrador."}</p>${expiresAt ? `<p>Prazo encerrado em <strong>${date}</strong>. Seus dados continuam guardados. Fale com o administrador para reativar o acesso.</p>` : "<p>Seus dados continuam guardados. Fale com o administrador para reativar o acesso.</p>"}<button id="backToLogin" class="btn secondary">Voltar</button></section>`;
    root.querySelector("#backToLogin").onclick = () => showAuthScreen("login");
    return;
  }
  let setup = mode === "setup";
  root.innerHTML = `<section class="auth-card"><div class="brand-icon">R$</div><h1>${setup ? "Configurar administrador" : "Entrar no Meu Patrimônio"}</h1><p>${setup ? "Crie a conta principal que administrará o sistema. Seus dados existentes permanecerão vinculados a ela." : "Entre com o e-mail e a senha da sua conta. Cada acesso mantém os dados separados."}</p>${message ? `<div class="auth-error">${esc(message)}</div>` : ""}<form id="authForm">${setup ? `<div class="field"><label>Nome</label><input name="name" required autocomplete="name"></div>` : ""}<div class="field"><label>E-mail</label><input name="email" type="email" required autocomplete="username"></div><div class="field"><label>Senha ${setup ? "(mínimo 8 caracteres)" : ""}</label><input name="password" type="password" required autocomplete="${setup ? "new-password" : "current-password"}"></div><button class="btn primary">${setup ? "Criar administrador" : "Entrar"}</button></form></section>`;
  root.querySelector("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    let form = new FormData(e.currentTarget),
      payload = Object.fromEntries(form.entries());
    try {
      let response = await fetch(setup ? "/api/auth/bootstrap" : "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        result = await response.json();
      if (result.suspended) {
        showAuthScreen("suspended", result.error, result.expiresAt);
        return;
      }
      if (!response.ok) throw Error(result.error || "Não foi possível autenticar");
      authUser = result.account;
      await startAuthenticatedApp();
    } catch (error) {
      showAuthScreen(setup ? "setup" : "login", error.message);
    }
  };
}
async function sourceInitializeApplication() {
  lockApplication();
  try {
    let statusResponse = await fetch("/api/auth/status", { cache: "no-store" }),
      status = await statusResponse.json();
    if (!status.initialized) {
      showAuthScreen("setup");
      return;
    }
    let response = await fetch("/api/auth/me", { cache: "no-store" }),
      result = await response.json();
    if (response.ok) {
      authUser = result.account;
      await startAuthenticatedApp();
    } else if (result.suspended) showAuthScreen("suspended", result.error, result.expiresAt);
    else showAuthScreen("login");
  } catch {
    showAuthScreen("login", "Servidor local indisponível. Inicie novamente o backend e tente outra vez.");
  }
}
async function sourceStartAuthenticatedApp() {
  KEY = authUser.id === "owner" ? "meu-patrimonio-v1" : `meu-patrimonio-${authUser.id}`;
  db = load();
  applyTheme();
  document.body.classList.remove("auth-locked");
  document.querySelector("#authScreen").hidden = true;
  document.querySelector('[data-page="admin"]').style.display = authUser.role === "admin" ? "flex" : "none";
  document.querySelector("#logoutButton").textContent = (authUser.name || "U").trim().slice(0, 1).toUpperCase();
  render();
  await syncBackend();
  if (db.settings.appearancePreset !== "premium-night-v1") {
    db.settings.theme = "dark";
    db.settings.appearancePreset = "premium-night-v1";
    save();
  }
  applyTheme();
  refreshUsdRate();
  clearInterval(authTimer);
  authTimer = setInterval(async () => {
    try {
      let r = await fetch("/api/auth/me", { cache: "no-store" }),
        state = await r.json();
      if (!r.ok) {
        authUser = null;
        showAuthScreen(state.suspended ? "suspended" : "login", state.error, state.expiresAt);
      }
    } catch {}
  }, 20000);
  document.querySelector("#passwordButton").onclick = openChangePassword;
  document.querySelector("#themeToggle").onclick = toggleTheme;
  document.querySelector("#logoutButton").onclick = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    authUser = null;
    showAuthScreen("login");
  };
}
async function sourceAccessRequest(url, method = "GET", body) {
  let response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    result = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    if (result.suspended) {
      authUser = null;
      showAuthScreen("suspended", result.error, result.expiresAt);
    }
    throw Error(result.error || "Acesso negado");
  }
  if (!response.ok) throw Error(result.error || "Não foi possível completar a ação");
  return result;
}
async function loadAccesses() {
  let target = document.querySelector("#accessRows");
  if (!target) return;
  try {
    let result = await accessRequest(`/api/accesses?month=${encodeURIComponent(selected())}`);
    accessCache = result.accesses || [];
    target.innerHTML = accessCache.length
      ? accessCache
          .map((a) => {
            let expired = a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now(),
              expiry = a.expiresAt ? new Date(a.expiresAt).toLocaleString("pt-BR") : "Sem prazo";
            return `<div class="access-row"><div class="access-info"><strong>${esc(a.name)} — ${esc(a.email)}</strong>${expired ? '<span class="access-expired">Prazo encerrado</span>' : a.suspended ? '<span class="access-expired">Suspenso</span>' : `<span class="access-valid">${a.expiresAt ? "Ativo" : "Permanente"}</span>`}<small>Criado em ${new Date(a.createdAt).toLocaleDateString("pt-BR")} · ${a.lastAccessAt ? `último acesso ${new Date(a.lastAccessAt).toLocaleString("pt-BR")}` : "ainda não entrou"}<br>${a.monthCount} lançamento(s) neste mês · ${a.totalCount} no total · última alteração ${new Date(a.lastChangedAt || a.createdAt).toLocaleString("pt-BR")}<br>IA: ${a.aiUsed} de ${a.aiLimit ?? 4} usos em ${monthLabel(a.aiMonth)} · renova dia 1º (Fortaleza)<br>${a.expiresAt ? `Válido até ${expiry}` : "Sem prazo de expiração"}</small></div><div class="access-actions"><label class="bill-toggle">Permitir IA: <select data-ai-user="${a.id}" aria-label="Permitir IA para ${esc(a.email)}"><option value="true" ${a.aiEnabled ? "selected" : ""}>Sim</option><option value="false" ${!a.aiEnabled ? "selected" : ""}>Não</option></select></label><label class="bill-toggle">Limite IA: <input type="number" min="0" max="10000" step="1" style="width:64px" data-ai-limit="${a.id}" value="${Number(a.aiLimit ?? 4)}" aria-label="Limite mensal de IA para ${esc(a.email)}"></label><button class="mini-btn" data-action="access-name" data-id="${a.id}">Nome</button><button class="mini-btn" data-action="access-clear" data-id="${a.id}">Apagar dados</button><button class="mini-btn" data-action="access-toggle" data-id="${a.id}">${expired ? "Prazo" : a.suspended ? "Reativar" : "Suspender"}</button><button class="mini-btn" data-action="access-term" data-id="${a.id}">Prazo</button><button class="mini-btn" data-action="access-password" data-id="${a.id}">Nova senha</button><button class="mini-btn" data-action="access-delete" data-id="${a.id}" aria-label="Excluir acesso">🗑</button></div></div>`;
          })
          .join("")
      : '<div class="empty">Nenhum acesso concedido ainda.</div>';
    bindPage();
  } catch (error) {
    target.innerHTML = `<div class="auth-error">${esc(error.message)}</div>`;
  }
}
function openAccessCreate() {
  showModal(
    "Conceder acesso",
    `<div class="field"><label>Nome</label><input name="name" required></div><div class="field"><label>E-mail</label><input name="email" type="email" required></div><div class="field"><label>Senha inicial (mínimo 8 caracteres)</label><input name="password" type="password" minlength="8" required></div><div class="notice">A conta terá dados próprios, separados dos demais. Compartilhe a senha inicial com a pessoa por um canal seguro.</div>`,
    () => {
      let values = Object.fromEntries(new FormData(document.querySelector("#modalForm")).entries());
      accessRequest("/api/accesses", "POST", values)
        .then(() => {
          document.querySelector("#modal").close();
          render();
          toast("Acesso concedido");
        })
        .catch((error) => toast(error.message));
      return false;
    },
  );
}
function openAccessTerm(id) {
  let a = accessCache.find((x) => x.id === id);
  showModal(
    "Definir prazo de acesso",
    `<div class="field"><label>Prazo</label><select name="unit"><option value="none">Sem prazo (permanente)</option><option value="hours">Horas</option><option value="days">Dias</option><option value="months">Meses</option><option value="years">Anos</option></select></div><div class="field" id="termAmountField" hidden><label>Quantidade</label><input name="duration" type="number" min="1" max="1000" value="1"></div><div class="notice">${a?.expiresAt ? `Prazo atual: ${new Date(a.expiresAt).toLocaleString("pt-BR")}.` : "Escolha sem prazo ou defina quanto tempo este acesso ficará ativo."}</div>`,
    () => {
      let f = document.querySelector("#modalForm"),
        unit = f.elements.unit.value,
        duration = Number(f.elements.duration.value);
      accessRequest(`/api/accesses/${id}/term`, "PATCH", { unit, duration })
        .then(() => {
          document.querySelector("#modal").close();
          render();
          toast(unit === "none" ? "Acesso permanente" : "Prazo atualizado");
        })
        .catch((error) => toast(error.message));
      return false;
    },
  );
  let f = document.querySelector("#modalForm"),
    field = document.querySelector("#termAmountField");
  f.elements.unit.onchange = () => (field.hidden = f.elements.unit.value === "none");
}
function openAccessPassword(id) {
  showModal(
    "Definir nova senha",
    `<div class="field"><label>Nova senha (mínimo 8 caracteres)</label><input name="password" type="password" required minlength="8"></div>`,
    () => {
      let password = new FormData(document.querySelector("#modalForm")).get("password");
      accessRequest(`/api/accesses/${id}/password`, "PATCH", { password })
        .then(() => {
          document.querySelector("#modal").close();
          toast("Senha atualizada");
        })
        .catch((error) => toast(error.message));
      return false;
    },
  );
}
function manageAccess(action, id) {
  let a = accessCache.find((x) => x.id === id);
  if (!a) return;
  if (action === "access-term") return openAccessTerm(id);
  if (action === "access-password") return openAccessPassword(id);
  if (action === "access-name") {
    let name = prompt("Nome para este acesso:", a.name);
    if (name && name.trim())
      accessRequest(`/api/accesses/${id}`, "PATCH", { action: "name", name: name.trim() })
        .then(() => {
          render();
          toast("Nome atualizado");
        })
        .catch((error) => toast(error.message));
    return;
  }
  if (action === "access-clear") {
    if (!confirm(`Apagar todos os dados de ${a.name}? Esta ação não pode ser desfeita.`)) return;
    accessRequest(`/api/accesses/${id}/data`, "PATCH", {})
      .then(() => {
        render();
        toast("Dados apagados");
      })
      .catch((error) => toast(error.message));
    return;
  }
  if (action === "access-toggle") {
    if (a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now()) return openAccessTerm(id);
    let resume = a.suspended;
    accessRequest(`/api/accesses/${id}`, "PATCH", { action: resume ? "resume" : "suspend" })
      .then(() => {
        render();
        toast(resume ? "Acesso reativado" : "Acesso suspenso");
      })
      .catch((error) => toast(error.message));
    return;
  }
  if (
    action === "access-delete" &&
    confirm(`Revogar o acesso de ${a.name}? Os dados deste perfil também serão apagados.`)
  )
    accessRequest(`/api/accesses/${id}`, "DELETE")
      .then(() => {
        render();
        toast("Acesso removido");
      })
      .catch((error) => toast(error.message));
}
function toast(s) {
  let t = document.querySelector("#toast");
  t.textContent = s;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
