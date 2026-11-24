/* Google Calendar reminders use a short-lived user OAuth token. No refresh token is stored. */
let googleCalendarToken = '';
let googleCalendarEmail = '';
let googleCalendarConfig = null;
let googleCalendarTokenClient = null;
let googleCalendarSyncTimer = 0;
let googleCalendarSyncBusy = false;
let googleCalendarSyncGuard = false;
const googleCalendarSeen = new Map();

function googleCalendarCard() {
  const linked = db?.settings?.googleCalendarEmail || '';
  return `<div class="spacer"></div><section class="card google-calendar-card"><div class="section-head"><div><h2>Google Agenda</h2><p>Crie lembretes por e-mail para recebimentos e pagamentos previstos.</p></div><span class="stat-icon" aria-hidden="true">▦</span></div><div id="googleCalendarStatus" class="notice" role="status">Verificando a configuração...</div><div class="field"><small>O dia do vencimento precisa estar preenchido no lançamento. Para parcelas, o sistema aplica o dia em cada mês; em itens recorrentes, cria lembretes para os próximos 12 meses.</small></div><div class="row-actions"><button class="btn primary" data-google-calendar="connect">Conectar Google Agenda</button><button class="btn secondary" data-google-calendar="sync">Sincronizar lançamentos</button>${linked?'<button class="btn secondary" data-google-calendar="disconnect">Desconectar</button>':''}</div><p class="metric">A conexão usa acesso somente para criar e atualizar eventos próprios. Os eventos já enviados permanecem no Google Agenda se você desconectar.</p></section>`;
}

const googleCalendarBaseSettings = window.settingsWithOwner;
if (typeof googleCalendarBaseSettings === 'function') {
  window.settingsWithOwner = function () { return googleCalendarBaseSettings() + googleCalendarCard(); };
}

const googleCalendarBaseOpenItem = window.openItem;
if (typeof googleCalendarBaseOpenItem === 'function') {
  window.openItem = function (kind, id) {
    const result = googleCalendarBaseOpenItem.call(this, kind, id);
    const form = document.querySelector('#modalForm');
    const monthField = form?.elements?.month?.closest('.field');
    if (!form || !monthField || form.querySelector('[name="calendarDay"]')) return result;
    const item = id ? db.items.find(entry => String(entry.id) === String(id)) : null;
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `<label for="calendarDay">Dia previsto do vencimento</label><input id="calendarDay" name="calendarDay" type="number" min="1" max="31" inputmode="numeric" value="${Number(item?.calendarDay) || ''}" placeholder="1 a 31"><small>Opcional. Necessário para criar o lembrete no Google Agenda.</small>`;
    monthField.insertAdjacentElement('afterend', field);
    return result;
  };
}

const googleCalendarBaseQuickExpense = window.quickExpense;
if (typeof googleCalendarBaseQuickExpense === 'function') {
  window.quickExpense = function (...args) {
    const before = new Set((db.items || []).map(item => String(item.id)));
    const result = googleCalendarBaseQuickExpense.apply(this, args);
    const form = document.querySelector('#modalForm');
    if (!form || form.querySelector('[name="calendarDay"]')) return result;
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = '<label for="quickCalendarDay">Dia previsto do vencimento</label><input id="quickCalendarDay" name="calendarDay" type="number" min="1" max="31" inputmode="numeric" placeholder="1 a 31"><small>Opcional. Necessário para lembrete no Google Agenda.</small>';
    document.querySelector('#modalBody')?.append(field);
    const normalSave = window.save;
    form.addEventListener('submit', () => {
      const day = field.querySelector('input')?.value || '';
      window.save = function (...saveArgs) {
        window.save = normalSave;
        const created = (db.items || []).filter(item => !before.has(String(item.id)));
        if (day) created.forEach(item => { item.calendarDay = day; });
        return normalSave.apply(this, saveArgs);
      };
      setTimeout(() => { if (window.save !== normalSave) window.save = normalSave; }, 0);
    }, true);
    return result;
  };
}

async function googleCalendarLoadConfig() {
  if (googleCalendarConfig) return googleCalendarConfig;
  const response = await fetch('/api/public/google-calendar-config', {
    headers: { Authorization: `Bearer ${await cloudToken()}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.clientId) throw new Error(payload.error || 'O administrador precisa configurar GOOGLE_CALENDAR_CLIENT_ID no servidor.');
  googleCalendarConfig = payload;
  return payload;
}

function googleCalendarLoadIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (window.googleCalendarIdentityLoading) return window.googleCalendarIdentityLoading;
  window.googleCalendarIdentityLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    const script = existing || document.createElement('script');
    const timeout = setTimeout(() => reject(new Error('O serviço de login do Google não respondeu.')), 12000);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Não foi possível carregar a conexão segura do Google.')); };
    if (!existing) document.head.append(script);
  }).finally(() => { window.googleCalendarIdentityLoading = null; });
  return window.googleCalendarIdentityLoading;
}

function googleCalendarRenderStatus(message) {
  const target = document.querySelector('#googleCalendarStatus');
  if (!target) return;
  if (message) { target.textContent = message; return; }
  const savedEmail = db?.settings?.googleCalendarEmail || '';
  if (googleCalendarToken && googleCalendarEmail && googleCalendarEmail === savedEmail) target.textContent = `Conectado como ${googleCalendarEmail}. A sincronização desta sessão está ativa.`;
  else if (savedEmail) target.textContent = `Conta vinculada anteriormente: ${savedEmail}. Conecte novamente para liberar a sincronização nesta sessão.`;
  else target.textContent = 'Nenhuma conta Google conectada.';
}

const googleCalendarBaseRender = window.render;
if (typeof googleCalendarBaseRender === 'function') {
  window.render = function (...args) {
    const result = googleCalendarBaseRender.apply(this, args);
    if (page === 'ajustes') {
      const connectButton = document.querySelector('[data-google-calendar="connect"]');
      if (connectButton) connectButton.disabled = true;
      googleCalendarRenderStatus();
      googleCalendarPrepare().then(() => {
        const button = document.querySelector('[data-google-calendar="connect"]');
        if (button) button.disabled = false;
      }).catch(error => googleCalendarRenderStatus(error.message));
    }
    return result;
  };
}

function googleCalendarItemSignature(item) {
  return JSON.stringify([item.kind, item.name, item.amount, item.category, item.person, item.month, item.due, item.calendarDay, item.paid, item.payments, item.recurring, item.part, item.installments]);
}

function googleCalendarDates(item) {
  const day = Number(item.calendarDay);
  const monthValue = String(item.due || item.month || '');
  const match = monthValue.match(/^(\d{4})-(\d{2})/);
  if (!match || !Number.isInteger(day) || day < 1 || day > 31) return [];
  let year = Number(match[1]), month = Number(match[2]);
  if (!item.recurring) {
    const current = new Date();
    if (year * 12 + month - 1 < current.getFullYear() * 12 + current.getMonth()) return [];
    const lastDay = new Date(year, month, 0).getDate();
    return [`${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`];
  }
  const current = new Date();
  const currentMonth = current.getFullYear() * 12 + current.getMonth();
  const startMonth = Math.max(year * 12 + month - 1, currentMonth);
  return Array.from({ length: 12 }, (_, index) => {
    const serial = startMonth + index;
    const occurrenceYear = Math.floor(serial / 12), occurrenceMonth = serial % 12 + 1;
    const lastDay = new Date(occurrenceYear, occurrenceMonth, 0).getDate();
    return `${occurrenceYear}-${String(occurrenceMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  });
}

function googleCalendarEventBody(item, date) {
  const month = date.slice(0, 7);
  const isIncome = item.kind === 'income';
  const isSettled = item.recurring ? paid(item, month) >= Number(item.amount || 0) : Number(item.paid || 0) >= Number(item.amount || 0);
  const nextDate = new Date(`${date}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  const endDate = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.amount || 0));
  const installment = Number(item.installments || 0) > 1 ? `Parcela ${item.part || 1}/${item.installments}` : '';
  const status = isSettled ? (isIncome ? 'RECEBIDO' : 'PAGO') : (isIncome ? 'A RECEBER' : 'A PAGAR');
  return {
    summary: `${isSettled ? '✓ ' : ''}${isIncome ? 'Receber' : 'Pagar'} · ${item.name || 'Lançamento'}${installment ? ` · ${installment}` : ''}`,
    description: [`Status: ${status}`, `Valor previsto: ${amount}`, item.person ? `Responsável: ${item.person}` : '', item.category ? `Categoria: ${item.category}` : '', item.recurring ? 'Lançamento recorrente' : '', 'Criado pelo Meu Patrimônio.'].filter(Boolean).join('\n'),
    start: { date }, end: { date: endDate },
    reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 1440 }] },
  };
}

async function googleCalendarRequest(path, method, body) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
    method,
    headers: { Authorization: `Bearer ${googleCalendarToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) { googleCalendarToken = ''; throw new Error('A autorização do Google expirou. Conecte novamente para continuar.'); }
    const error = new Error(`${response.status}: ${payload.error?.message || 'Não foi possível atualizar os eventos do Google Agenda.'}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function googleCalendarSyncItems(quiet = false) {
  if (!googleCalendarToken || !googleCalendarEmail || googleCalendarEmail !== db?.settings?.googleCalendarEmail || googleCalendarSyncBusy) return;
  googleCalendarSyncBusy = true;
  googleCalendarSyncGuard = true;
  let created = 0, updated = 0, withoutDate = 0;
  try {
    const pendingDeletes = Array.isArray(db.settings.googleCalendarPendingDeletes) ? db.settings.googleCalendarPendingDeletes : [];
    for (const entry of pendingDeletes) {
      if (entry.owner !== googleCalendarEmail) continue;
      if (entry.date >= new Date().toISOString().slice(0, 10) && entry.id) {
        try { await googleCalendarRequest(`/${encodeURIComponent(entry.id)}`, 'DELETE'); } catch (error) { if (error.status !== 404) throw error; }
      }
    }
    db.settings.googleCalendarPendingDeletes = pendingDeletes.filter(entry => entry.owner !== googleCalendarEmail);
    for (const item of db.items || []) {
      if (!['income', 'expense'].includes(item.kind)) continue;
      const dates = googleCalendarDates(item);
      const existing = item.googleCalendarEvents && typeof item.googleCalendarEvents === 'object' ? { ...item.googleCalendarEvents } : {};
      const next = {};
      if (!dates.length) {
        if (!item.calendarDay) withoutDate += 1;
        for (const [date, prior] of Object.entries(existing)) {
          if (date >= new Date().toISOString().slice(0, 10) && prior?.owner === googleCalendarEmail && prior?.id) await googleCalendarRequest(`/${encodeURIComponent(prior.id)}`, 'DELETE');
          else next[date] = prior;
        }
        item.googleCalendarEvents = next;
        googleCalendarSeen.set(String(item.id), googleCalendarItemSignature(item));
        continue;
      }
      const signature = googleCalendarItemSignature(item);
      if (googleCalendarSeen.get(String(item.id)) === signature && dates.every(date => existing[date]?.owner === googleCalendarEmail && existing[date]?.id)) continue;
      for (const date of dates) {
        const prior = existing[date];
        const body = googleCalendarEventBody(item, date);
        let event;
        if (prior?.id && prior.owner === googleCalendarEmail) {
          try { event = await googleCalendarRequest(`/${encodeURIComponent(prior.id)}`, 'PATCH', body); }
          catch (error) {
            if (error.status !== 404) throw error;
            event = await googleCalendarRequest('', 'POST', body);
          }
        } else event = await googleCalendarRequest('', 'POST', body);
        next[date] = { id: event.id, owner: googleCalendarEmail };
        if (prior?.id && prior.owner === googleCalendarEmail) updated += 1; else created += 1;
      }
      for (const [date, prior] of Object.entries(existing)) {
        if (dates.includes(date) || date < new Date().toISOString().slice(0, 10) || prior?.owner !== googleCalendarEmail || !prior?.id) continue;
        await googleCalendarRequest(`/${encodeURIComponent(prior.id)}`, 'DELETE');
      }
      for (const [date, prior] of Object.entries(existing)) if (!next[date] && date < new Date().toISOString().slice(0, 10)) next[date] = prior;
      item.googleCalendarEvents = next;
      googleCalendarSeen.set(String(item.id), signature);
      save();
    }
    googleCalendarRenderStatus(`Sincronização concluída: ${created} evento(s) criado(s), ${updated} atualizado(s). ${withoutDate ? `${withoutDate} lançamento(s) sem dia previsto foram ignorados.` : ''}`.trim());
    if (!quiet) toast(withoutDate ? `${created + updated} eventos sincronizados; ${withoutDate} sem dia previsto.` : `${created + updated} eventos sincronizados no Google Agenda.`);
  } catch (error) {
    googleCalendarRenderStatus(error.message || 'Falha na sincronização.');
    if (!quiet) toast(error.message || 'Falha na sincronização do Google Agenda.');
  } finally {
    googleCalendarSyncGuard = false;
    googleCalendarSyncBusy = false;
  }
}

async function googleCalendarQueueDeletedEvents(events) {
  const today = new Date().toISOString().slice(0, 10);
  const pending = Array.isArray(db.settings.googleCalendarPendingDeletes) ? db.settings.googleCalendarPendingDeletes : [];
  for (const [date, entry] of Object.entries(events || {})) {
    if (date >= today && entry?.id && entry?.owner) pending.push({ date, id: entry.id, owner: entry.owner });
  }
  db.settings.googleCalendarPendingDeletes = pending;
  save();
}

const googleCalendarBaseDeleteItem = window.deleteItem;
const googleCalendarBaseOpenDeleteConfirm = window.openDeleteConfirm;
if (typeof googleCalendarBaseDeleteItem === 'function' && typeof googleCalendarBaseOpenDeleteConfirm === 'function') {
  window.deleteItem = function (id) {
    const item = db.items.find(entry => String(entry.id) === String(id));
    const events = item?.googleCalendarEvents ? { ...item.googleCalendarEvents } : {};
    const originalOpenDeleteConfirm = window.openDeleteConfirm;
    window.openDeleteConfirm = function (options) {
      const onConfirm = options.onConfirm;
      options.onConfirm = () => { onConfirm(); googleCalendarQueueDeletedEvents(events); };
      return googleCalendarBaseOpenDeleteConfirm.call(this, options);
    };
    try { return googleCalendarBaseDeleteItem.call(this, id); }
    finally { window.openDeleteConfirm = originalOpenDeleteConfirm; }
  };
}

function googleCalendarScheduleSync() {
  if (!googleCalendarToken || googleCalendarEmail !== db?.settings?.googleCalendarEmail || googleCalendarSyncGuard) return;
  clearTimeout(googleCalendarSyncTimer);
  googleCalendarSyncTimer = setTimeout(() => googleCalendarSyncItems(true), 1200);
}

const googleCalendarBaseSave = window.save;
if (typeof googleCalendarBaseSave === 'function') {
  window.save = function (...args) {
    const result = googleCalendarBaseSave.apply(this, args);
    googleCalendarScheduleSync();
    return result;
  };
}

async function googleCalendarPrepare() {
  const [config] = await Promise.all([googleCalendarLoadConfig(), googleCalendarLoadIdentity()]);
  if (!googleCalendarTokenClient) {
    googleCalendarTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: 'openid email https://www.googleapis.com/auth/calendar.events.owned',
      callback: async response => {
        if (response.error || !response.access_token) { googleCalendarRenderStatus('O Google não autorizou a conexão.'); return; }
        try {
          googleCalendarToken = response.access_token;
          const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${googleCalendarToken}` } });
          const profile = await userResponse.json();
          if (!userResponse.ok || !profile.email) throw new Error('O Google não informou o e-mail da conta conectada.');
          googleCalendarEmail = String(profile.email);
          db.settings.googleCalendarEmail = googleCalendarEmail;
          save();
          render();
          await googleCalendarSyncItems(false);
        } catch (error) { googleCalendarRenderStatus(error.message || 'Não foi possível validar a conta Google.'); }
      },
      error_callback: error => googleCalendarRenderStatus(error?.message || 'A janela de autorização do Google foi fechada.'),
    });
  }
}

function googleCalendarConnect() {
  try {
    if (!googleCalendarTokenClient) throw new Error('Aguarde a configuração do Google Agenda carregar e tente novamente.');
    googleCalendarTokenClient.requestAccessToken({ prompt: 'consent select_account', login_hint: authUser?.email || undefined });
  } catch (error) { googleCalendarRenderStatus(error.message || 'Não foi possível iniciar a conexão com o Google.'); toast(error.message || 'Falha ao conectar Google Agenda.'); }
}

async function googleCalendarDisconnect() {
  const linkedEmail = db?.settings?.googleCalendarEmail || '';
  if (googleCalendarToken && googleCalendarEmail && googleCalendarEmail === linkedEmail && window.google?.accounts?.oauth2?.revoke) {
    await new Promise(resolve => google.accounts.oauth2.revoke(googleCalendarToken, resolve));
  }
  if (googleCalendarEmail === linkedEmail) { googleCalendarToken = ''; googleCalendarEmail = ''; }
  db.settings.googleCalendarEmail = '';
  save();
  render();
  toast('Acesso do Google revogado. Eventos já criados permanecem no seu calendário.');
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-google-calendar]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (button.dataset.googleCalendar === 'connect') googleCalendarConnect();
  if (button.dataset.googleCalendar === 'sync') {
    if (!googleCalendarToken) googleCalendarConnect();
    else googleCalendarSyncItems(false);
  }
  if (button.dataset.googleCalendar === 'disconnect') googleCalendarDisconnect();
}, true);
