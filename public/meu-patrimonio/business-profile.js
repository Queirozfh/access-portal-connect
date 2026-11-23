/* PF/PJ workspaces kept in separate namespaces inside the authenticated state. */
function isBusinessProfile() { return activeFinanceProfile === 'PJ'; }
function businessFiscalData() { return db.settings.companyProfile || {}; }
function financeProfileSettingsCard() { return `<div class="spacer"></div><section class="card finance-profile-settings"><div class="section-head"><div><h2>Finalidade da conta</h2><p>Os dados pessoais e empresariais ficam em ambientes financeiros separados, dentro do mesmo acesso.</p></div></div><div class="field"><label for="financeProfilePreference">Perfil financeiro</label><select id="financeProfilePreference"><option value="PF" ${isBusinessProfile()?'':'selected'}>Minha Conta Pessoal (PF)</option><option value="PJ" ${isBusinessProfile()?'selected':''} ${hasFeature('profile.pj')?'':'disabled hidden'}>Minha Empresa (PJ)</option></select></div></section>`; }
function companyFiscalSettingsCard() {
  const company = businessFiscalData();
  return `<div class="spacer"></div><section class="card company-profile-card"><div class="section-head"><div><h2>Dados fiscais da empresa</h2><p>Informações comerciais deste ambiente PJ.</p></div><span class="stat-icon">▤</span></div><div class="form-grid"><div class="field"><label for="companyLegalName">Razão social</label><input id="companyLegalName" maxlength="150" value="${esc(company.legalName||'')}"></div><div class="field"><label for="companyTradeName">Nome fantasia</label><input id="companyTradeName" maxlength="100" value="${esc(company.tradeName||'')}"></div><div class="field"><label for="companyCnpj">CNPJ</label><input id="companyCnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0001-00" value="${esc(company.cnpj||'')}"></div><div class="field"><label for="companyTaxRegime">Regime tributário</label><select id="companyTaxRegime"><option value="" ${!company.taxRegime?'selected':''}>Selecione</option><option ${company.taxRegime==='MEI'?'selected':''}>MEI</option><option ${company.taxRegime==='Simples Nacional'?'selected':''}>Simples Nacional</option><option ${company.taxRegime==='Lucro Presumido'?'selected':''}>Lucro Presumido</option></select></div><div class="field"><label for="companyPixKey">Chave Pix CNPJ / cobrança</label><input id="companyPixKey" maxlength="120" value="${esc(company.pixKey||'')}"></div><div class="field"><label for="companyDueDay">Dia padrão de vencimento</label><input id="companyDueDay" type="number" min="1" max="31" value="${Number(company.dueDay)||10}"></div></div><button class="btn secondary" data-action="save-company-profile">Salvar dados fiscais</button></section>`;
}
const baseBusinessSettings = settingsWithOwner;
settingsWithOwner = function() { return baseBusinessSettings() + financeProfileSettingsCard() + (isBusinessProfile() ? companyFiscalSettingsCard() : ''); };
document.addEventListener('change',event=>{if(event.target?.id==='financeProfilePreference')switchFinanceProfile(event.target.value)});

function formatCnpj(value) {
  const digits=String(value||'').replace(/\D/g,'').slice(0,14);
  return digits.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
}
document.addEventListener('input',event=>{if(event.target?.id==='companyCnpj')event.target.value=formatCnpj(event.target.value)});
function saveCompanyFiscalSettings() {
  const cnpjInput=document.querySelector('#companyCnpj'), digits=(cnpjInput?.value||'').replace(/\D/g,'');
  if(digits&&digits.length!==14){toast('Informe um CNPJ com 14 dígitos.');cnpjInput?.focus();return;}
  const dueDay=Number(document.querySelector('#companyDueDay')?.value)||10;
  if(dueDay<1||dueDay>31){toast('O dia de vencimento deve ficar entre 1 e 31.');return;}
  db.settings.companyProfile={legalName:document.querySelector('#companyLegalName')?.value.trim()||'',tradeName:document.querySelector('#companyTradeName')?.value.trim()||'',cnpj:digits?formatCnpj(digits):'',taxRegime:document.querySelector('#companyTaxRegime')?.value||'',pixKey:document.querySelector('#companyPixKey')?.value.trim()||'',dueDay};
  save();render();toast('Dados fiscais da empresa salvos');
}
const baseBusinessAct=act;
act=function(action,id,index){if(action==='save-company-profile'){saveCompanyFiscalSettings();return;}if(action==='business-whatsapp'){openBusinessWhatsApp(id);return;}return baseBusinessAct(action,id,index)};

function addBusinessEntryFields(kind,item,form) {
  const grid=form?.querySelector('.form-grid');if(!grid)return;
  if(kind==='expense'){
    const labels={fixed:'Custos fixos',tax:'Impostos / tributos',payroll:'Pró-labore / folha',variable:'Custos variáveis'};
    const field=document.createElement('div');field.className='field';field.innerHTML=`<label for="businessExpenseType">Classificação empresarial</label><select id="businessExpenseType" name="businessExpenseType">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${item?.businessExpenseType===key?'selected':''}>${label}</option>`).join('')}</select>`;grid.append(field);const responsible=form.querySelector('[name="person"]')?.previousElementSibling;if(responsible)responsible.textContent='Fornecedor / responsável';
  } else if(kind==='income'){
    const clientField=document.createElement('div');clientField.className='field';clientField.innerHTML=`<label for="businessCounterparty">Cliente / pagador</label><select id="businessCounterparty" name="counterparty" required><option value="">Selecione um cliente</option>${(db.people||[]).filter(person=>person!==ownerName()).map(person=>`<option value="${esc(person)}" ${item?.counterparty===person?'selected':''}>${esc(person)}</option>`).join('')}</select><small>Cadastre clientes em Ajustes → Clientes, fornecedores e parceiros.</small>`;grid.append(clientField);
    const field=document.createElement('div');field.className='field';const value=item?.invoiceStatus||'not_applicable';field.innerHTML=`<label for="invoiceStatus">Nota fiscal</label><select id="invoiceStatus" name="invoiceStatus"><option value="not_applicable" ${value==='not_applicable'?'selected':''}>Não aplicável</option><option value="no" ${value==='no'?'selected':''}>Não emitida</option><option value="yes" ${value==='yes'?'selected':''}>Emitida</option></select>`;grid.append(field);
  }
}
const baseBusinessOpenItem=openItem;
openItem=function(kind,id){baseBusinessOpenItem(kind,id);if(!isBusinessProfile())return;const form=document.querySelector('#modalForm');addBusinessEntryFields(kind,id?db.items.find(item=>item.id===id):null,form)};
const baseBusinessOpenSettingEntry=openSettingEntry;
openSettingEntry=function(type){baseBusinessOpenSettingEntry(type);if(!isBusinessProfile()||type!=='person')return;const title=document.querySelector('#modalTitle'),label=document.querySelector('#modalBody label');if(title)title.textContent='Adicionar cliente / fornecedor';if(label)label.textContent='Nome do cliente / fornecedor'};
const baseBusinessQuickExpense=quickExpense;
quickExpense=function(){baseBusinessQuickExpense();if(!isBusinessProfile())return;const form=document.querySelector('#modalForm'),body=document.querySelector('#modalBody');if(!form||!body)return;const before=new Set(db.items.map(item=>item.id)),field=document.createElement('div');field.className='field';field.innerHTML='<label for="quickBusinessExpenseType">Classificação empresarial</label><select id="quickBusinessExpenseType"><option value="fixed">Custos fixos</option><option value="tax">Impostos / tributos</option><option value="payroll">Pró-labore / folha</option><option value="variable" selected>Custos variáveis</option></select>';body.append(field);const previous=form.onsubmit;form.onsubmit=function(event){const kind=field.querySelector('select').value;previous.call(this,event);if(!document.querySelector('#modal').open){const created=db.items.filter(item=>!before.has(item.id));if(created.length){created.forEach(item=>item.businessExpenseType=kind);save();render()}}}};

const businessExpenseTypes={fixed:'Custo fixo',tax:'Imposto / tributo',payroll:'Pró-labore / folha',variable:'Custo variável'};
const baseBusinessItemsTable=itemsTable;
itemsTable=function(items,...args){if(!isBusinessProfile())return baseBusinessItemsTable(items,...args);const decorated=items.map(item=>{const labels=[];if(item.kind==='income'){const status={yes:'NF emitida',no:'NF não emitida',not_applicable:'NF não aplicável'}[item.invoiceStatus]||'NF não informada';labels.push(status);if(item.counterparty)labels.push('Cliente: '+item.counterparty)}if(item.kind==='expense'&&item.businessExpenseType)labels.push(businessExpenseTypes[item.businessExpenseType]||'Despesa operacional');return labels.length?{...item,notes:[item.notes,...labels].filter(Boolean).join(' · ')}:item});return baseBusinessItemsTable(decorated,...args)};
function businessReceivablesPanel(){const groups=new Map();for(const item of typeItems('income',selected())){const client=item.counterparty||'Cliente não informado',row=groups.get(client)||{items:[],total:0,received:0,open:0,withoutInvoice:0};row.items.push(item);row.total+=Number(item.amount||0);row.received+=Math.min(Number(item.amount||0),Math.max(0,paid(item,selected())));row.open+=remaining(item,selected());if(item.invoiceStatus==='no')row.withoutInvoice++;groups.set(client,row)}return `<div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Contas a receber por cliente</h2><p>${monthLabel(selected())} · faturamento, recebimentos e notas fiscais</p></div></div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Faturado</th><th>Recebido</th><th>Em aberto</th><th>Notas fiscais</th></tr></thead><tbody>${[...groups].map(([client,row])=>`<tr><td>${esc(client)}${row.open>0?`<button class="mini-btn" data-action="business-whatsapp" data-id="${esc(client)}">Cobrar no WhatsApp</button>`:''}</td><td>${money(row.total)}</td><td>${money(row.received)}</td><td>${money(row.open)}</td><td>${row.withoutInvoice?`<span class="badge pending">${row.withoutInvoice} pendente(s)</span>`:'Em dia'}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum faturamento registrado neste mês.</td></tr>'}</tbody></table></div></section>`}
const baseBusinessCollectionPage=collectionPage;
collectionPage=function(){return isBusinessProfile()?businessReceivablesPanel():baseBusinessCollectionPage()};
function openBusinessWhatsApp(client){const items=typeItems('income',selected()).filter(item=>(item.counterparty||'Cliente não informado')===client&&remaining(item,selected())>0);if(!items.length){toast('Não há valor em aberto para este cliente neste mês.');return}const company=businessFiscalData(),amount=items.reduce((sum,item)=>sum+remaining(item,selected()),0),phone=db.settings.peoplePhones?.[client],dueDay=Number(company.dueDay)||10,message=`Olá ${client}, segue o detalhamento da cobrança referente aos serviços de ${longMonthLabel(selected())}, com vencimento no dia ${dueDay}.\n\nValor em aberto: ${money(amount)}\n${company.legalName||company.tradeName?`Empresa: ${company.tradeName||company.legalName}\n`:''}${company.cnpj?`CNPJ: ${company.cnpj}\n`:''}${company.pixKey?`Chave Pix CNPJ: ${company.pixKey}\n`:''}\nEm caso de dúvidas, fico à disposição. Obrigado!`;if(!openWhatsAppChat(phone,message)){toast('Cadastre o telefone deste cliente em Ajustes → Clientes, fornecedores e parceiros.');setPage('ajustes')}}

const baseBusinessExpensesPage=expensesPage;
expensesPage=function(){return isBusinessProfile()?listPage('expense'):baseBusinessExpensesPage()};
const baseBusinessHome=enhancedHome;
enhancedHome=function(){if(!isBusinessProfile())return baseBusinessHome();const income=typeItems('income').reduce((sum,item)=>sum+Number(item.amount||0),0),expense=typeItems('expense').filter(item=>!item.future).reduce((sum,item)=>sum+Number(item.amount||0),0),balance=income-expense,unissued=typeItems('income').filter(item=>item.invoiceStatus==='no').length,recent=[...typeItems('income'),...typeItems('expense')].sort((a,b)=>String(b.due||b.month).localeCompare(a.due||a.month)).slice(0,12);return `${welcome('Fluxo de caixa empresarial',null,'Entradas menos saídas do mês selecionado')}<div class="grid stats">${statsCard('Faturamento previsto',money(income),monthLabel(selected()),'↗','positive')}${statsCard('Despesas operacionais',money(expense),monthLabel(selected()),'↘','negative')}${statsCard('Saldo operacional',money(balance),'Entradas menos saídas','◒',balance>=0?'positive':'negative')}${statsCard('Notas fiscais pendentes',String(unissued),'Lançamentos a receber sem NF','▤',unissued?'negative':'positive')}</div><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Movimentações do período</h2><p>Faturamento e despesas operacionais em ${monthLabel(selected())}</p></div><button class="btn secondary" data-page="relatorios">Relatórios gerenciais</button></div>${itemsTable(recent,true)}</section>`};
const baseBusinessAssets=assetsPage;
assetsPage=function(){const html=baseBusinessAssets();if(!isBusinessProfile())return html;const months=priorClosedMonths(selected(),6),average=months.reduce((sum,month)=>sum+typeItems('expense',month).filter(item=>!item.future).reduce((sub,item)=>sub+Number(item.amount||0),0),0)/months.length,values=assetClassValues(selected()).totals,classes=liquidClasses(),cash=classes.reduce((sum,key)=>sum+Number(values[key]||0),0),runway=average>0?cash/average:0,progress=average>0?Math.min(100,runway/(Number(financeSettings().emergencyTargetMonths)||6)*100):0,panel=`<section class="card finance-tool-card"><div class="section-head"><div><h2>Cobertura de caixa operacional</h2><p>Ativos líquidos selecionados ÷ média das despesas operacionais dos seis meses fechados anteriores.</p></div><span class="stat-icon">⌂</span></div>${average>0?`<div class="finance-tool-result"><strong>${runway.toLocaleString('pt-BR',{maximumFractionDigits:1})} meses</strong><span>Caixa estimado cobre ${runway.toLocaleString('pt-BR',{maximumFractionDigits:1})} meses de custos operacionais.</span></div><div class="finance-progress"><i style="width:${progress}%"></i></div><div class="runway-details"><span>Ativos líquidos <b>${money(cash)}</b></span><span>Custo mensal médio <b>${money(average)}</b></span></div>`:'<p class="metric">Registre despesas e saldos patrimoniais para estimar a cobertura de caixa.</p>'}</section>`;return html.replace(/<section class="card runway-panel">[\s\S]*?<\/section>/g,'').replace(/<section class="card finance-tool-card emergency-reserve-panel">[\s\S]*?<\/section>/g,'')+`<div class="spacer"></div>${panel}`};
const baseBusinessPlan=planPage;
planPage=function(){const html=baseBusinessPlan();return isBusinessProfile()?html.replace(/<section class="card finance-tool-card work-hours-card">[\s\S]*?<\/section>/g,''):html};
const baseBusinessInvoices=faturasPage;
faturasPage=function(){const html=baseBusinessInvoices();return isBusinessProfile()?html.replace(/<section class="card finance-tool-card work-hours-card">[\s\S]*?<\/section>/g,''):html};
const baseBusinessReports=reportsPage;
reportsPage=function(){if(!isBusinessProfile())return baseBusinessReports();const income=typeItems('income').filter(item=>!item.future).reduce((sum,item)=>sum+Number(paid(item,selected())),0),expense=typeItems('expense').filter(item=>!item.future).reduce((sum,item)=>sum+Number(item.amount||0),0);return `${welcome('Relatórios gerenciais',null,'')}<div class="welcome no-print" style="margin-top:-10px"><p>Entradas recebidas, despesas operacionais e resultado do período.</p><button class="btn primary" data-action="print">⇩ Exportar PDF</button></div><div class="grid stats">${statsCard('Receitas recebidas',money(income),monthLabel(selected()),'↗','positive')}${statsCard('Saídas operacionais',money(expense),monthLabel(selected()),'↘','negative')}${statsCard('Resultado',money(income-expense),'Entradas menos saídas','◒',income>=expense?'positive':'negative')}</div><div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Movimentações</h2><p>${monthLabel(selected())}</p></div></div>${itemsTable([...typeItems('income'),...typeItems('expense')])}</section>${savingsReportPanel()}`};

const BUSINESS_WORDS=[
  ['Compras, parcelas e assinaturas','Cartões corporativos e despesas operacionais'],
  ['Entradas e parcelas que você recebe','Faturamento e valores a receber'],
  ['Faturas e reembolsos','Cartões corporativos e recebimentos'],
  ['Ordem das pessoas','Ordem dos clientes e fornecedores'],
  ['Compras e parcelas','Cartões corporativos'],
  ['Relatórios financeiros','Relatórios gerenciais'],
  ['DRE pessoal','DRE simplificado'],
  ['Adicionar entrada','Registrar faturamento'],
  ['Início','Fluxo de Caixa'],
  ['Titular','Responsável'],
  ['Faturas','Cartões corporativos'],
  ['A receber','Contas a receber'],
  ['Receitas','Faturamento'],
  ['Entradas','Faturamento'],
  ['Pessoas','Clientes, fornecedores e parceiros'],
  ['Despesas','Despesas operacionais'],
];
function applyBusinessVocabulary(root) {
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){let node=walker.currentNode,value=node.nodeValue;const words=isBusinessProfile()?BUSINESS_WORDS:[...BUSINESS_WORDS].reverse().map(([from,to])=>[to,from]);for(const [from,to] of words)value=value.replaceAll(from,to);node.nodeValue=value}
}
function applyBusinessSettingsMode(){if(!isBusinessProfile())return;for(const id of ['compensationMode','netMonthlyIncome','netHourlyValue','workHoursPerMonth']){const field=document.querySelector('#'+id)?.closest('.field');if(field)field.hidden=true}document.querySelectorAll('.bill-toggle').forEach(node=>node.hidden=true);const columns=document.querySelector('.finance-settings-columns');if(columns){if(columns.children[0])columns.children[0].hidden=true;if(columns.children[1])columns.children[1].hidden=true}const heading=[...document.querySelectorAll('#content h2')].find(node=>node.textContent==='Planejamento e critérios financeiros');if(heading)heading.textContent='Critérios operacionais da empresa'}
function ensureFinanceProfileToggle() {
  const actions=document.querySelector('.top-actions'),logout=document.querySelector('#logoutButton');if(!actions||!logout)return;
  let button=document.querySelector('#financeProfileToggle');
  if(!button){button=document.createElement('button');button.id='financeProfileToggle';button.type='button';button.className='btn secondary finance-profile-toggle';button.addEventListener('click',()=>switchFinanceProfile(isBusinessProfile()?'PF':'PJ'));logout.before(button)}
  button.hidden=!authUser;
  if(authUser){button.textContent=isBusinessProfile()?'PJ · Empresa':'PF · Pessoal';button.title=`Alternar para ${isBusinessProfile()?'Pessoa Física':'Pessoa Jurídica'}`;button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(isBusinessProfile()))}
}
const baseBusinessRender=render;
render=function(){baseBusinessRender();ensureFinanceProfileToggle();applyBusinessVocabulary(document.querySelector('#nav'));applyBusinessVocabulary(document.querySelector('#pageTitle'));applyBusinessVocabulary(document.querySelector('#content'));applyBusinessSettingsMode()};
const baseBusinessProfileMenu=setupProfileMenu;
setupProfileMenu=function(){baseBusinessProfileMenu();ensureFinanceProfileToggle()};

const baseSettlementMessageForBusiness=settlementMessage;
settlementMessage=function(client){if(!isBusinessProfile())return baseSettlementMessageForBusiness(client);const company=businessFiscalData(),ledger=personLedger(client,selected()),dueDay=Number(company.dueDay)||10;return `Olá, ${client}! Segue o detalhamento da cobrança referente aos serviços de ${longMonthLabel(selected())}.\n\nValor: ${money(ledger.current.charges)}\nVencimento: dia ${dueDay} de ${monthLabel(selected())}\n${company.tradeName||company.legalName||company.cnpj?`Empresa: ${company.tradeName||company.legalName||company.cnpj}\n`:''}${company.pixKey?`Chave Pix CNPJ: ${company.pixKey}\n`:''}\nEm caso de dúvidas, fico à disposição. Obrigado!`};

document.head.insertAdjacentHTML('beforeend',`<style>.finance-profile-toggle{white-space:nowrap;font-weight:700;border-color:rgba(195,157,96,.45);color:var(--text,#f4f5fa)}.company-profile-card{margin-top:16px}.company-profile-card .form-grid{margin:14px 0}.business-entry-field{grid-column:span 1}@media(max-width:520px){.finance-profile-toggle{font-size:.75rem;padding:8px}}</style>`);
