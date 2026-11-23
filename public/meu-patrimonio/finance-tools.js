/* New financial planning and household accounting tools. Loaded after the app's
   current page and action wrappers so all data remains in the account state. */
const FINANCE_TOOL_DEFAULTS = {
  essentialCategories: ['Moradia', 'Alimentação', 'Saúde', 'Transporte', 'Contas'],
  fixedExpenseCategories: ['Moradia', 'Contas', 'Assinaturas', 'Educação'],
  liquidAssetClasses: ['emergency', 'checking'],
};
const financeSettings = () => (db.settings ||= {});
const financePercentages = () => financeSettings().splitPercentages || {};
const financeCategories = () => [...new Set([...(db.categories || []), ...db.items.map(x => x.category).filter(Boolean)])];
const financeEsc = value => typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const financeNumber = value => Number(value || 0);
const financeCurrency = value => typeof money === 'function' ? money(value) : `R$ ${financeNumber(value).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
const financeHourRate = () => {
  const s = financeSettings();
  const hours = Math.max(1, financeNumber(s.workHoursPerMonth) || 160);
  return s.compensationMode === 'hourly' ? financeNumber(s.netHourlyValue) : financeNumber(s.netMonthlyIncome) / hours;
};
function workHoursHint(amount, label = 'Esse valor') {
  const rate = financeHourRate(), value = financeNumber(amount);
  if (!(value > 0) || !(rate > 0)) return '<span>Informe sua remuneração líquida nos Ajustes para ver o equivalente em horas de trabalho.</span>';
  const hours = value / rate;
  return `<span>${label}: <strong>${financeCurrency(value)}</strong> · equivale a <strong>${hours.toLocaleString('pt-BR',{maximumFractionDigits:1})} h</strong> (cerca de ${(hours/8).toLocaleString('pt-BR',{maximumFractionDigits:1})} dias de 8 horas).</span>`;
}
function workHoursCard(id, title, amount) {
  return `<section class="card finance-tool-card work-hours-card"><div class="section-head"><div><h2>${title}</h2><p>Estimativa baseada na remuneração cadastrada em Ajustes.</p></div><span class="stat-icon">◷</span></div><div id="${id}" class="finance-tool-result">${workHoursHint(amount)}</div></section>`;
}
function essentialCategories() {
  const saved = financeSettings().essentialCategories;
  return Array.isArray(saved) ? saved : FINANCE_TOOL_DEFAULTS.essentialCategories.filter(x => financeCategories().includes(x));
}
function fixedCategories() {
  const saved = financeSettings().fixedExpenseCategories;
  return Array.isArray(saved) ? saved : FINANCE_TOOL_DEFAULTS.fixedExpenseCategories.filter(x => financeCategories().includes(x));
}
function liquidClasses() {
  const saved = financeSettings().liquidAssetClasses;
  return Array.isArray(saved) ? saved : [...FINANCE_TOOL_DEFAULTS.liquidAssetClasses];
}
function priorClosedMonths(endMonth, count) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({length:count}, (_, i) => {
    const date = new Date(year, month - 2 - (count - 1 - i), 1);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  });
}
function essentialMonthlySpend(month) {
  const cats = new Set(essentialCategories());
  return typeItems('expense', month)
    .filter(item => !item.future && cats.has(item.category) && (item.person || ownerName()) === ownerName())
    .reduce((sum, item) => sum + financeNumber(item.amount), 0);
}
function emergencyReservePanel() {
  const months = priorClosedMonths(selected(), 6);
  const average = months.reduce((sum, month) => sum + essentialMonthlySpend(month), 0) / months.length;
  const values = assetClassValues(selected()).totals;
  const reserve = Math.max(0, liquidClasses().reduce((sum, key) => sum + financeNumber(values[key]), 0));
  const runway = average > 0 ? reserve / average : 0;
  const target = Math.max(1, financeNumber(financeSettings().emergencyTargetMonths) || 6);
  const progress = average > 0 ? Math.min(100, runway / target * 100) : 0;
  return `<section class="card finance-tool-card emergency-reserve-panel"><div class="section-head"><div><h2>Reserva de emergência</h2><p>Saldo líquido selecionado dividido pelo custo essencial médio dos seis meses fechados anteriores.</p></div><span class="stat-icon">⌂</span></div>${average > 0 ? `<div class="finance-tool-result"><strong>${runway.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} meses</strong><span>A reserva cobre ${runway.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} meses de despesas essenciais. Meta: ${target} meses.</span></div><div class="finance-progress"><i style="width:${progress}%"></i></div><div class="runway-details"><span>Reserva líquida <b>${financeCurrency(reserve)}</b></span><span>Média essencial <b>${financeCurrency(average)}/mês</b></span><span>Para completar a meta <b>${financeCurrency(Math.max(0, average*target-reserve))}</b></span></div>` : `<p class="metric">Cadastre despesas nas categorias essenciais e patrimônio para calcular a cobertura.</p>`}<small class="finance-tool-footnote">Categorias essenciais e classes de ativos líquidos são ajustáveis em Ajustes. A média usa os seis meses completos anteriores e a parte atribuída a ${financeEsc(ownerName())}.</small></section>`;
}
const baseAssetsPageFinanceTools = assetsPage;
assetsPage = function() { return baseAssetsPageFinanceTools() + `<div class="spacer"></div>${emergencyReservePanel()}`; };

function monthlyDre(month) {
  const incomes = typeItems('income', month).filter(item => !item.future).reduce((sum, item) => sum + financeNumber(paid(item, month)), 0);
  const expenses = typeItems('expense', month).filter(item => !item.future);
  const fixedSet = new Set(fixedCategories());
  const business = typeof isBusinessProfile === 'function' && isBusinessProfile();
  const fixed = expenses.filter(item => item.recurring || (business ? item.businessExpenseType === 'fixed' : fixedSet.has(item.category))).reduce((sum,item)=>sum+financeNumber(item.amount),0);
  const variable = expenses.filter(item => !item.recurring && (business ? item.businessExpenseType !== 'fixed' : !fixedSet.has(item.category))).reduce((sum,item)=>sum+financeNumber(item.amount),0);
  const stats = monthStats(month);
  const received = business ? 0 : Object.entries(stats.groups).filter(([person]) => person !== ownerName()).reduce((sum,[,group])=>sum+financeNumber(group.received),0);
  const surplus = incomes - fixed - variable + received;
  return {month,incomes,fixed,variable,received,surplus,rate:incomes>0?surplus/incomes*100:0};
}
function savingsReportPanel() {
  const business = typeof isBusinessProfile === 'function' && isBusinessProfile();
  const year = Number(selected().slice(0,4));
  const rows = Array.from({length:12},(_,index)=>monthlyDre(`${year}-${String(index+1).padStart(2,'0')}`));
  const totals = rows.reduce((out,row)=>{for(const key of ['incomes','fixed','variable','received','surplus'])out[key]+=row[key];return out;},{incomes:0,fixed:0,variable:0,received:0,surplus:0});
  const overallRate = totals.incomes > 0 ? totals.surplus/totals.incomes*100 : 0;
  const chart = rows.map(row=>`<div class="saving-month ${row.rate<0?'negative':''}" title="${monthLabel(row.month)} · ${row.rate.toLocaleString('pt-BR',{maximumFractionDigits:1})}%"><span><i style="height:${Math.max(3,Math.min(100,Math.abs(row.rate)))}%"></i></span><small>${monthLabel(row.month).slice(0,3)}</small><b>${row.incomes?`${row.rate.toLocaleString('pt-BR',{maximumFractionDigits:0})}%`:'—'}</b></div>`).join('');
  return `<div class="spacer"></div><section class="card finance-tool-card dre-panel"><div class="section-head"><div><h2>${business?'DRE simplificado da empresa':'DRE pessoal'} · ${year}</h2><p>${business?'Receitas recebidas − custos fixos − custos variáveis = resultado operacional.':'Receitas − gastos fixos − despesas variáveis + reembolsos recebidos = superávit.'}</p></div><span class="stat-icon">▤</span></div><div class="savings-chart" aria-label="${business?'Margem operacional':'Taxa de poupança'} por mês">${chart}</div><div class="table-wrap"><table class="finance-tool-table"><thead><tr><th>Mês</th><th>${business?'Receitas recebidas':'Receitas'}</th><th>${business?'Custos fixos':'Gastos fixos'}</th><th>${business?'Custos variáveis':'Variáveis'}</th>${business?'':'<th>Reembolsos</th>'}<th>${business?'Resultado':'Superávit'}</th><th>${business?'Margem':'Guardado'}</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${monthLabel(row.month)}</td><td>${financeCurrency(row.incomes)}</td><td>${financeCurrency(row.fixed)}</td><td>${financeCurrency(row.variable)}</td>${business?'':`<td>${financeCurrency(row.received)}</td>`}<td>${financeCurrency(row.surplus)}</td><td>${row.incomes?`${row.rate.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`:'—'}</td></tr>`).join('')}<tr class="dre-total"><th>Total do ano</th><th>${financeCurrency(totals.incomes)}</th><th>${financeCurrency(totals.fixed)}</th><th>${financeCurrency(totals.variable)}</th>${business?'':`<th>${financeCurrency(totals.received)}</th>`}<th>${financeCurrency(totals.surplus)}</th><th>${overallRate.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</th></tr></tbody></table></div><small class="finance-tool-footnote">${business?'Os cartões corporativos não são somados à parte; os gastos vêm dos lançamentos de despesa e evitam duplicidade. ':'As faturas não são somadas à parte: os gastos entram pelos lançamentos de despesa, evitando duplicidade. '}Gastos futuros ainda não debitados ficam fora do DRE.</small></section>`;
}
const baseReportsPageFinanceTools = reportsPage;
reportsPage = function() { return baseReportsPageFinanceTools() + savingsReportPanel(); };

const basePlanPageFinanceTools = planPage;
planPage = function() { return basePlanPageFinanceTools() + workHoursCard('workHoursPlanHint','Compra em horas de trabalho',0); };
const baseFaturasPageFinanceTools = faturasPage;
faturasPage = function() {
  const html = baseFaturasPageFinanceTools();
  const total = typeItems('expense', selected()).filter(item => item.cardId && !item.future).reduce((sum,item)=>sum+financeNumber(item.amount),0);
  return html + workHoursCard('workHoursInvoiceHint','Compras lançadas em cartões',total);
};
document.addEventListener('input', event => {
  if (event.target?.id === 'planAmount') {
    const target = document.querySelector('#workHoursPlanHint');
    if (target) target.innerHTML = workHoursHint(event.target.value, 'A compra');
  }
});

function financeToolsSettingsCard() {
  const settings = financeSettings(), cats = financeCategories(), people = db.people || [];
  const essential = new Set(essentialCategories()), fixed = new Set(fixedCategories()), liquid = new Set(liquidClasses()), percentages = financePercentages();
  const checkboxList = (values, selected, key) => values.map(value=>`<label class="finance-choice"><input type="checkbox" data-finance-list="${key}" value="${financeEsc(value)}" ${selected.has(value)?'checked':''}><span>${financeEsc(value)}</span></label>`).join('') || '<small>Cadastre categorias para selecionar.</small>';
  return `<div class="spacer"></div><section class="card finance-tool-card"><div class="section-head"><div><h2>Planejamento e critérios financeiros</h2><p>Valores e regras usados nos novos indicadores.</p></div><span class="stat-icon">⚙</span></div><div class="form-grid"><div class="field"><label for="compensationMode">Base da conversão em horas</label><select id="compensationMode"><option value="monthly" ${settings.compensationMode!=='hourly'?'selected':''}>Renda líquida mensal</option><option value="hourly" ${settings.compensationMode==='hourly'?'selected':''}>Valor líquido por hora</option></select></div><div class="field"><label for="netMonthlyIncome">Renda líquida mensal (R$)</label><input id="netMonthlyIncome" type="number" min="0" step="0.01" value="${financeNumber(settings.netMonthlyIncome)||''}"></div><div class="field"><label for="netHourlyValue">Valor líquido por hora (R$)</label><input id="netHourlyValue" type="number" min="0" step="0.01" value="${financeNumber(settings.netHourlyValue)||''}"></div><div class="field"><label for="workHoursPerMonth">Horas trabalhadas por mês</label><input id="workHoursPerMonth" type="number" min="1" max="400" value="${financeNumber(settings.workHoursPerMonth)||160}"><small>Usado quando a base for renda mensal. Dia de trabalho estimado em 8 horas.</small></div><div class="field"><label for="emergencyTargetMonths">Meta de reserva</label><select id="emergencyTargetMonths"><option value="6" ${Number(settings.emergencyTargetMonths||6)===6?'selected':''}>6 meses</option><option value="12" ${Number(settings.emergencyTargetMonths)===12?'selected':''}>12 meses</option></select></div></div><div class="finance-settings-columns"><div><h3>Categorias essenciais</h3><p>Usadas para a média de custo de vida.</p><div class="finance-choice-list">${checkboxList(cats,essential,'essential')}</div></div><div><h3>Gastos fixos no DRE</h3><p>As demais categorias entram como variáveis.</p><div class="finance-choice-list">${checkboxList(cats,fixed,'fixed')}</div></div><div><h3>Ativos líquidos para a reserva</h3><p>Selecione as classes que podem cobrir emergências.</p><div class="finance-choice-list">${[['emergency','Reserva de emergência'],['checking','Contas correntes'],['fixedIncome','Renda fixa'],['international','Dólar / internacional'],['other','Outros ativos']].map(([key,label])=>`<label class="finance-choice"><input type="checkbox" data-finance-list="liquid" value="${key}" ${liquid.has(key)?'checked':''}><span>${label}</span></label>`).join('')}</div></div></div><div class="spacer"></div><h3>Percentuais padrão para rateio</h3><p>Cadastre a divisão habitual da casa. Os percentuais devem totalizar 100% para usar o modelo percentual.</p><div class="form-grid split-percent-settings">${people.map(person=>`<div class="field"><label>${financeEsc(person)} (%)</label><input type="number" min="0" max="100" step="0.01" data-split-percent="${financeEsc(person)}" value="${percentages[person]??''}"></div>`).join('')||'<p>Adicione pessoas antes de configurar o rateio.</p>'}</div><button class="btn secondary" data-action="save-finance-tool-settings">Salvar critérios</button></section>`;
}
const baseSettingsWithFinanceTools = settingsWithOwner;
settingsWithOwner = function() { return baseSettingsWithFinanceTools() + financeToolsSettingsCard(); };

function saveFinanceToolSettings() {
  const settings = financeSettings(), mode = document.querySelector('#compensationMode')?.value || 'monthly';
  const income = Math.max(0, Number(document.querySelector('#netMonthlyIncome')?.value) || 0);
  const hourly = Math.max(0, Number(document.querySelector('#netHourlyValue')?.value) || 0);
  const hours = Number(document.querySelector('#workHoursPerMonth')?.value) || 160;
  if (hours < 1 || hours > 400) { toast('Informe entre 1 e 400 horas por mês.'); return; }
  const percentages = {};
  for (const input of document.querySelectorAll('[data-split-percent]')) {
    const value = input.value.trim() === '' ? 0 : Number(input.value);
    if (!Number.isFinite(value) || value < 0 || value > 100) { toast('Cada percentual deve ficar entre 0% e 100%.'); input.focus(); return; }
    percentages[input.dataset.splitPercent] = value;
  }
  const sum = Object.values(percentages).reduce((total,value)=>total+value,0);
  if (sum > 0 && Math.abs(sum-100) > 0.01) { toast('Os percentuais padrão devem totalizar 100%.'); return; }
  settings.compensationMode = mode;
  settings.netMonthlyIncome = income;
  settings.netHourlyValue = hourly;
  settings.workHoursPerMonth = hours;
  settings.emergencyTargetMonths = Number(document.querySelector('#emergencyTargetMonths')?.value) === 12 ? 12 : 6;
  settings.essentialCategories = [...document.querySelectorAll('[data-finance-list="essential"]:checked')].map(input=>input.value);
  settings.fixedExpenseCategories = [...document.querySelectorAll('[data-finance-list="fixed"]:checked')].map(input=>input.value);
  settings.liquidAssetClasses = [...document.querySelectorAll('[data-finance-list="liquid"]:checked')].map(input=>input.value);
  settings.splitPercentages = percentages;
  save(); render(); toast('Critérios financeiros salvos');
}
const baseActFinanceTools = act;
act = function(action,id,index) {
  if (action === 'save-finance-tool-settings') { saveFinanceToolSettings(); return; }
  return baseActFinanceTools(action,id,index);
};

function addExpenseSplitControls() {
  const form = document.querySelector('#modalForm'), grid = form?.querySelector('.form-grid');
  if (!form || !grid || form.querySelector('[name="splitExpense"]')) return;
  const people = db.people || [], presets = financePercentages();
  const wrapper = document.createElement('div'); wrapper.className = 'field span2 expense-split-control';
  wrapper.innerHTML = `<label class="finance-choice split-toggle"><input type="checkbox" name="splitExpense"><span>Dividir esta despesa entre pessoas</span></label><div class="split-panel" hidden><div class="field"><label for="splitModel">Modelo de rateio</label><select name="splitModel" id="splitModel"><option value="equal">Igualitário</option><option value="percent">Definir percentuais</option></select></div><div class="split-people">${people.map(person=>`<div class="split-person-row"><label class="finance-choice"><input type="checkbox" name="splitPeople" value="${financeEsc(person)}"><span>${financeEsc(person)}</span></label><label class="split-percent-field" hidden><input type="number" min="0" max="100" step="0.01" value="${presets[person]??''}" data-split-custom-percent="${financeEsc(person)}" disabled aria-label="Percentual de ${financeEsc(person)}"><span>%</span></label></div>`).join('')}</div><div class="split-percent-total" aria-live="polite" hidden></div><small>O valor digitado é o total da compra. No modo percentual, ajuste a porcentagem de cada pessoa selecionada até somar 100%. A divisão fecha o total, incluindo os centavos.</small></div>`;
  grid.append(wrapper);
  const toggle = wrapper.querySelector('[name="splitExpense"]'), panel = wrapper.querySelector('.split-panel');
  toggle.addEventListener('change',()=>panel.hidden=!toggle.checked);
  const modelSelect = wrapper.querySelector('#splitModel'), percentTotal = wrapper.querySelector('.split-percent-total');
  const updateSplitPercentUi = () => {
    const percentMode = modelSelect.value === 'percent'; let sum = 0, selectedCount = 0;
    wrapper.querySelectorAll('.split-person-row').forEach(row => {
      const checkbox = row.querySelector('[name="splitPeople"]'), field = row.querySelector('.split-percent-field'), input = row.querySelector('[data-split-custom-percent]');
      field.hidden = !percentMode; input.disabled = !percentMode || !checkbox.checked;
      if (checkbox.checked) { selectedCount++; sum += Number(input.value) || 0; }
    });
    percentTotal.hidden = !percentMode;
    percentTotal.textContent = selectedCount ? `Total selecionado: ${sum.toLocaleString('pt-BR',{maximumFractionDigits:2})}%` : 'Selecione as pessoas e informe os percentuais.';
    percentTotal.classList.toggle('is-valid',selectedCount>0&&Math.abs(sum-100)<=0.01);
    percentTotal.classList.toggle('is-invalid',selectedCount>0&&Math.abs(sum-100)>0.01);
  };
  wrapper.addEventListener('change',event=>{ if (event.target.matches('[name="splitPeople"],#splitModel')) updateSplitPercentUi(); });
  wrapper.addEventListener('input',event=>{ if (event.target.matches('[data-split-custom-percent]')) updateSplitPercentUi(); });
  updateSplitPercentUi();
  const baseSubmit = form.onsubmit;
  form.onsubmit = function(event) {
    if (!toggle.checked) return baseSubmit.call(this,event);
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { document.querySelector('#modal')?.close('cancel'); return; }
    const selectedPeople = [...wrapper.querySelectorAll('[name="splitPeople"]:checked')].map(input=>input.value);
    if (!selectedPeople.length) { toast('Selecione ao menos uma pessoa para dividir a despesa.'); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    data.amount = Number(data.amount); data.installments = Number(data.installments) || 1;
    data.recurring = form.elements.recurring?.checked || false;
    data.future = form.elements.future?.checked || false;
    const firstPart = Number(data.startPart || 1);
    if (!(data.amount > 0) || data.installments < 1 || data.installments > 120 || (!data.recurring && (firstPart < 1 || firstPart > data.installments))) { toast('Confira valor, quantidade de parcelas e parcela inicial.'); return; }
    const totalCents = Math.round(data.amount*100), shares = [];
    if (data.splitModel === 'percent') {
      const customPercentages = Object.fromEntries([...wrapper.querySelectorAll('[data-split-custom-percent]')].map(input=>[input.dataset.splitCustomPercent,Number(input.value)]));
      const selectedSum = selectedPeople.reduce((sum,person)=>sum+(customPercentages[person]||0),0);
      if (selectedPeople.some(person=>!Number.isFinite(customPercentages[person])||customPercentages[person]<0||customPercentages[person]>100)||Math.abs(selectedSum-100)>0.01) { toast('Ajuste os percentuais das pessoas selecionadas para totalizar 100%.'); return; }
      let allocated = 0;
      selectedPeople.forEach((person,index)=>{ const cents = index===selectedPeople.length-1 ? totalCents-allocated : Math.floor(totalCents*customPercentages[person]/100); shares.push({person,cents}); allocated+=cents; });
    } else {
      const each = Math.floor(totalCents/selectedPeople.length), remainder = totalCents%selectedPeople.length;
      selectedPeople.forEach((person,index)=>shares.push({person,cents:each+(index<remainder?1:0)}));
    }
    const groupId = crypto.randomUUID(), entries = [];
    for (const share of shares) {
      if (share.cents <= 0) continue;
      const amount = share.cents/100, seriesId = crypto.randomUUID();
      const base = {...data,kind:'expense',person:share.person,amount,part:firstPart,installments:data.recurring?0:data.installments,paid:0,seriesId,splitGroupId:groupId,splitModel:data.splitModel,splitTotalCents:totalCents,splitShareCents:share.cents};
      delete base.splitExpense; delete base.splitPeople; delete base.splitModel; delete base.startPart; delete base.splitPercentages;
      if (data.recurring) entries.push({...base,id:crypto.randomUUID(),month:data.month,due:data.month,recurring:true,installments:0});
      else if (data.installments > 1) {
        const [year,month] = data.month.split('-').map(Number), first = new Date(year,month-1,1);
        for (let part=firstPart;part<=data.installments;part++) { const date=new Date(first.getFullYear(),first.getMonth()+part-firstPart,1), due=isoMonth(date); entries.push({...base,id:crypto.randomUUID(),month:due,due,part,ord:entries.length+1,recurring:false}); }
      } else entries.push({...base,id:crypto.randomUUID(),month:data.month,due:data.month,ord:entries.length+1,recurring:false});
    }
    if (!entries.length) { toast('O valor é pequeno demais para gerar parcelas individuais.'); return; }
    prioritizeNewExpenses(entries.length); entries.forEach((entry,index)=>entry.ord=index+1); db.items.push(...entries);
    save(); toast(`Despesa dividida em ${shares.filter(x=>x.cents>0).length} partes`); document.querySelector('#modal')?.close('saved'); render();
  };
}
const baseOpenItemFinanceTools = openItem;
openItem = function(kind,id) {
  baseOpenItemFinanceTools(kind,id);
  if (kind === 'expense' && !id) addExpenseSplitControls();
};

document.head.insertAdjacentHTML('beforeend', `<style>
.finance-tool-card{margin-top:16px}.finance-tool-result{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:baseline;padding:12px 0;color:var(--muted,#a6b2c8)}.finance-tool-result>strong{font:700 1.35rem Manrope, sans-serif;color:var(--text,#f4f5fa)}.finance-tool-result span strong{color:var(--text,#f4f5fa)}.finance-tool-footnote{display:block;margin-top:12px;color:var(--muted,#98a5bd);line-height:1.5}.finance-progress{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin:8px 0 14px}.finance-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#83c6ac,#c5a365)}.finance-settings-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:20px;margin:18px 0}.finance-settings-columns h3,.finance-tool-card h3{font-size:.95rem;margin:0 0 4px}.finance-settings-columns p{font-size:.8rem;color:var(--muted,#98a5bd);margin:0 0 10px}.finance-choice-list,.split-people{display:flex;flex-wrap:wrap;gap:8px}.finance-choice{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(173,187,211,.2);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.025);cursor:pointer}.finance-choice input{width:auto;margin:0;accent-color:#c4a166}.finance-choice small{color:var(--muted,#98a5bd)}.split-toggle{margin:4px 0}.split-panel{padding:14px;border:1px solid rgba(173,187,211,.2);border-radius:12px;background:rgba(255,255,255,.025)}.split-panel[hidden]{display:none}.split-panel>.field{max-width:330px;margin-bottom:12px}.split-people{margin:8px 0 12px}.split-person-row{display:flex;align-items:center;gap:8px}.split-percent-field{display:flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid rgba(173,187,211,.2);border-radius:9px;background:rgba(255,255,255,.035)}.split-percent-field[hidden]{display:none}.split-percent-field input{width:76px;padding:5px 6px;border:0;background:transparent;text-align:right}.split-percent-field input:disabled{opacity:.55}.split-percent-field>span{color:var(--muted,#98a5bd)}.split-percent-total{font-size:.84rem;font-weight:700;color:var(--muted,#98a5bd);margin:4px 0 10px}.split-percent-total.is-valid{color:#80c5ac}.split-percent-total.is-invalid{color:#dca270}.split-panel>small{display:block;color:var(--muted,#98a5bd);line-height:1.5}.savings-chart{height:155px;display:grid;grid-template-columns:repeat(12,minmax(28px,1fr));gap:6px;align-items:end;margin:18px 0 22px}.saving-month{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;min-width:0}.saving-month>span{height:95px;width:min(24px,80%);display:flex;align-items:flex-end;background:rgba(255,255,255,.035);border-radius:6px 6px 2px 2px;overflow:hidden}.saving-month i{display:block;width:100%;border-radius:5px 5px 0 0;background:#80c5ac}.saving-month.negative i{background:#d88a91}.saving-month small{color:var(--muted,#98a5bd);text-transform:capitalize}.saving-month b{font-size:.7rem;white-space:nowrap}.finance-tool-table{width:100%;border-collapse:collapse;font-size:.82rem}.finance-tool-table th,.finance-tool-table td{padding:10px 9px;border-bottom:1px solid rgba(173,187,211,.14);text-align:right;white-space:nowrap}.finance-tool-table th:first-child,.finance-tool-table td:first-child{text-align:left}.finance-tool-table thead th{color:var(--muted,#98a5bd);font-size:.72rem}.finance-tool-table .dre-total{font-weight:700;color:var(--text,#f4f5fa)}.finance-tool-table .dre-total th{border-top:1px solid rgba(173,187,211,.3)}.split-percent-settings{margin:8px 0 14px}.split-percent-settings .field{max-width:240px}@media(max-width:700px){.savings-chart{gap:2px}.saving-month b{font-size:.6rem}.finance-tool-table{font-size:.72rem}.finance-tool-table th,.finance-tool-table td{padding:8px 6px}.dre-panel .table-wrap{overflow-x:auto}}
</style>`);
