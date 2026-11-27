/* PF/PJ workspaces kept in separate namespaces inside the authenticated state. */
function isBusinessProfile() { return activeFinanceProfile === 'PJ'; }
function businessFiscalData() { return db.settings.companyProfile || {}; }
function financeProfileSettingsCard() { return `<div class="spacer"></div><section class="card finance-profile-settings"><div class="section-head"><div><h2>Finalidade da conta</h2><p>Os dados pessoais e empresariais ficam em ambientes financeiros separados, dentro do mesmo acesso.</p></div></div><div class="field"><label for="financeProfilePreference">Perfil financeiro</label><select id="financeProfilePreference"><option value="PF" ${isBusinessProfile()?'':'selected'}>Minha Conta Pessoal (PF)</option><option value="PJ" ${isBusinessProfile()?'selected':''} ${hasFeature('profile.pj')?'':'disabled hidden'}>Minha Empresa (PJ)</option></select></div></section>`; }
function companyFiscalSettingsCard() {
  const company = businessFiscalData();
  return `<div class="spacer"></div><section class="card company-profile-card"><div class="section-head"><div><h2>Dados fiscais da empresa</h2><p>Informações comerciais deste ambiente PJ.</p></div><span class="stat-icon">▤</span></div><div class="form-grid"><div class="field"><label for="companyLegalName">Razão social</label><input id="companyLegalName" maxlength="150" autocomplete="organization" value="${esc(company.legalName||'')}"></div><div class="field"><label for="companyTradeName">Nome fantasia</label><input id="companyTradeName" maxlength="100" value="${esc(company.tradeName||'')}"></div><div class="field"><label for="companyCnpj">CNPJ</label><input id="companyCnpj" inputmode="numeric" autocomplete="off" maxlength="18" placeholder="00.000.000/0001-00" aria-describedby="companyCnpjHelp" value="${esc(company.cnpj||'')}"><small id="companyCnpjHelp">Se informado, o CNPJ será conferido pelos dígitos verificadores.</small></div><div class="field"><label for="companyTaxRegime">Regime tributário</label><select id="companyTaxRegime"><option value="" ${!company.taxRegime?'selected':''}>Selecione</option><option value="MEI" ${company.taxRegime==='MEI'?'selected':''}>MEI</option><option value="Simples Nacional" ${company.taxRegime==='Simples Nacional'?'selected':''}>Simples Nacional</option><option value="Lucro Presumido" ${company.taxRegime==='Lucro Presumido'?'selected':''}>Lucro Presumido</option><option value="Lucro Real" ${company.taxRegime==='Lucro Real'?'selected':''}>Lucro Real</option></select></div><div class="field"><label for="companyPixKey">Chave Pix CNPJ / cobrança</label><input id="companyPixKey" maxlength="120" autocomplete="off" value="${esc(company.pixKey||'')}"></div><div class="field"><label for="companyDueDay">Dia padrão de vencimento</label><input id="companyDueDay" type="number" min="1" max="31" step="1" required value="${Number(company.dueDay)||10}"></div></div><button class="btn secondary" data-action="save-company-profile">Salvar dados fiscais</button></section>`;
}
const baseBusinessSettings = settingsWithOwner;
settingsWithOwner = function() { return baseBusinessSettings() + financeProfileSettingsCard() + (isBusinessProfile() ? companyFiscalSettingsCard() : ''); };
document.addEventListener('change',event=>{if(event.target?.id==='financeProfilePreference')switchFinanceProfile(event.target.value)});

function formatCnpj(value) {
  const digits=String(value||'').replace(/\D/g,'').slice(0,14);
  return digits.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
}
function isValidCnpj(value) {
  const digits=String(value||'').replace(/\D/g,'');
  if(!/^\d{14}$/.test(digits)||/^([0-9])\1{13}$/.test(digits))return false;
  const digit=(base,weights)=>{const sum=[...base].reduce((total,n,index)=>total+Number(n)*weights[index],0),remainder=sum%11;return remainder<2?0:11-remainder};
  const first=digit(digits.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  const second=digit(digits.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return digits.endsWith(`${first}${second}`);
}
document.addEventListener('input',event=>{if(event.target?.id==='companyCnpj'){const digits=String(event.target.value||'').replace(/\D/g,'');event.target.dataset.tooManyDigits=digits.length>14?'true':'';event.target.value=formatCnpj(event.target.value)}});
function saveCompanyFiscalSettings() {
  const legalNameInput=document.querySelector('#companyLegalName'),tradeNameInput=document.querySelector('#companyTradeName'),cnpjInput=document.querySelector('#companyCnpj'),taxRegimeInput=document.querySelector('#companyTaxRegime'),dueDayInput=document.querySelector('#companyDueDay'),pixKeyInput=document.querySelector('#companyPixKey');
  const legalName=(legalNameInput?.value||'').trim(),tradeName=(tradeNameInput?.value||'').trim(),digits=(cnpjInput?.value||'').replace(/\D/g,''),taxRegime=taxRegimeInput?.value||'',pixKey=(pixKeyInput?.value||'').trim(),rawDueDay=dueDayInput?.value||'',dueDay=Number(rawDueDay);
  const reject=(message,input)=>{toast(message);input?.focus();input?.setAttribute('aria-invalid','true');};
  [legalNameInput,tradeNameInput,cnpjInput,taxRegimeInput,dueDayInput,pixKeyInput].forEach(input=>input?.removeAttribute('aria-invalid'));
  if(legalName.length>150){reject('A razão social deve ter até 150 caracteres.',legalNameInput);return;}
  if(tradeName.length>100){reject('O nome fantasia deve ter até 100 caracteres.',tradeNameInput);return;}
  if(pixKey.length>120){reject('A chave Pix deve ter até 120 caracteres.',pixKeyInput);return;}
  if(cnpjInput?.dataset.tooManyDigits==='true'){reject('O CNPJ deve conter exatamente 14 dígitos.',cnpjInput);return;}
  if(digits&&!isValidCnpj(digits)){reject('Informe um CNPJ válido, incluindo os dígitos verificadores.',cnpjInput);return;}
  const hasFiscalRegistration=Boolean(legalName||tradeName||digits||taxRegime);
  if(hasFiscalRegistration&&!(legalName||tradeName)){reject('Informe a razão social ou o nome fantasia da empresa.',legalNameInput);return;}
  const validTaxRegimes=['MEI','Simples Nacional','Lucro Presumido','Lucro Real'];
  if(hasFiscalRegistration&&!taxRegime){reject('Selecione o regime tributário da empresa.',taxRegimeInput);return;}
  if(taxRegime&&!validTaxRegimes.includes(taxRegime)){reject('Selecione um regime tributário válido.',taxRegimeInput);return;}
  if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31){reject('O dia padrão de vencimento deve ser um número inteiro entre 1 e 31.',dueDayInput);return;}
  db.settings.companyProfile={legalName,tradeName,cnpj:digits?formatCnpj(digits):'',taxRegime,pixKey,dueDay};
  save();render();toast('Dados fiscais da empresa salvos');
}
const baseBusinessAct=act;
act=function(action,id,index){if(action==='save-company-profile'){saveCompanyFiscalSettings();return;}if(action==='business-whatsapp'){openBusinessWhatsApp(id,index||selected());return;}if(action==='business-receivables-reset'){businessReceivablesFilters={month:'',client:''};render();return;}return baseBusinessAct(action,id,index)};
document.addEventListener('change',event=>{if(event.target?.id==='businessReceivablesMonth'){businessReceivablesFilters.month=event.target.value||'';render();}if(event.target?.id==='businessReceivablesClient'){businessReceivablesFilters.client=event.target.value||'';render();}});

function addBusinessEntryFields(kind,item,form) {
  const grid=form?.querySelector('.form-grid');if(!grid)return;
  if(kind==='expense'){
    const labels={fixed:'Custos fixos',tax:'Impostos / tributos',payroll:'Pró-labore / folha',variable:'Custos variáveis'};
    const field=document.createElement('div');field.className='field';field.innerHTML=`<label for="businessExpenseType">Classificação empresarial</label><select id="businessExpenseType" name="businessExpenseType">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${item?.businessExpenseType?item.businessExpenseType===key?'selected':'':key==='variable'?'selected':''}>${label}</option>`).join('')}</select>`;grid.append(field);const responsible=form.querySelector('[name="person"]')?.previousElementSibling;if(responsible)responsible.textContent='Fornecedor / responsável';
  } else if(kind==='income'){
    const clientField=document.createElement('div');clientField.className='field';clientField.innerHTML=`<label for="businessCounterparty">Cliente / pagador</label><select id="businessCounterparty" name="counterparty" required><option value="">Selecione um cliente</option>${(db.people||[]).filter(person=>person!==ownerName()).map(person=>`<option value="${esc(person)}" ${item?.counterparty===person?'selected':''}>${esc(person)}</option>`).join('')}</select><small>Cadastre clientes em Ajustes → Clientes, fornecedores e parceiros.</small>`;grid.append(clientField);
    const field=document.createElement('div');field.className='field';const value=item?.invoiceStatus||'not_applicable';field.innerHTML=`<label for="invoiceStatus">Nota fiscal</label><select id="invoiceStatus" name="invoiceStatus"><option value="not_applicable" ${value==='not_applicable'?'selected':''}>Não aplicável</option><option value="no" ${value==='no'?'selected':''}>Não emitida</option><option value="yes" ${value==='yes'?'selected':''}>Emitida</option></select>`;grid.append(field);
  }
  const details=document.createElement('details');details.className='business-entry-details';details.style.gridColumn='1 / -1';details.innerHTML=`<summary>Mais detalhes empresariais (opcional)</summary><div class="form-grid"><div class="field"><label for="businessCostCenter">Centro de custo</label><input id="businessCostCenter" name="costCenter" maxlength="80" value="${esc(item?.costCenter||'')}" placeholder="Ex.: Operações"></div><div class="field"><label for="businessDocumentReference">Documento de referência</label><input id="businessDocumentReference" name="documentReference" maxlength="120" value="${esc(item?.documentReference||'')}" placeholder="Ex.: contrato, pedido ou NF"></div></div>`;grid.append(details);
}
const baseBusinessOpenItem=openItem;
openItem=function(kind,id){baseBusinessOpenItem(kind,id);if(!isBusinessProfile())return;const form=document.querySelector('#modalForm');addBusinessEntryFields(kind,id?db.items.find(item=>item.id===id):null,form)};
const baseBusinessOpenSettingEntry=openSettingEntry;
openSettingEntry=function(type){baseBusinessOpenSettingEntry(type);if(!isBusinessProfile()||type!=='person')return;const title=document.querySelector('#modalTitle'),label=document.querySelector('#modalBody label');if(title)title.textContent='Adicionar cliente / fornecedor';if(label)label.textContent='Nome do cliente / fornecedor'};
const baseBusinessQuickExpense=quickExpense;
quickExpense=function(){
  baseBusinessQuickExpense();
  if(!isBusinessProfile())return;
  const form=document.querySelector('#modalForm'),body=document.querySelector('#modalBody');
  if(!form||!body)return;
  const before=new Set(db.items.map(item=>item.id)),field=document.createElement('div');
  field.className='field';
  field.innerHTML='<label for="quickBusinessExpenseType">Classificação empresarial</label><select id="quickBusinessExpenseType"><option value="fixed">Custos fixos</option><option value="tax">Impostos / tributos</option><option value="payroll">Pró-labore / folha</option><option value="variable" selected>Custos variáveis</option></select>';
  const details=document.createElement('details');
  details.className='business-entry-details';
  details.innerHTML='<summary>Mais detalhes empresariais (opcional)</summary><div class="form-grid"><div class="field"><label for="quickBusinessCostCenter">Centro de custo</label><input id="quickBusinessCostCenter" maxlength="80" placeholder="Ex.: Operações"></div><div class="field"><label for="quickBusinessDocumentReference">Documento de referência</label><input id="quickBusinessDocumentReference" maxlength="120" placeholder="Ex.: contrato, pedido ou NF"></div></div>';
  body.append(field,details);
  const previous=form.onsubmit;
  form.onsubmit=function(event){
    const kind=field.querySelector('select').value,costCenter=details.querySelector('#quickBusinessCostCenter').value.trim(),documentReference=details.querySelector('#quickBusinessDocumentReference').value.trim();
    previous.call(this,event);
    if(!document.querySelector('#modal').open){
      const created=db.items.filter(item=>!before.has(item.id));
      if(created.length){created.forEach(item=>{item.businessExpenseType=kind;if(costCenter)item.costCenter=costCenter;if(documentReference)item.documentReference=documentReference});save();render()}
    }
  };
};

const businessExpenseTypes={fixed:'Custo fixo',tax:'Imposto / tributo',payroll:'Pró-labore / folha',variable:'Custo variável'};
const baseBusinessItemsTable=itemsTable;
itemsTable=function(items,...args){if(!isBusinessProfile())return baseBusinessItemsTable(items,...args);const decorated=items.map(item=>{const labels=[];if(item.kind==='income'){const status=item.invoiceStatus==='no'&&remaining(item)>0?'⚠ Nota fiscal pendente':({yes:'NF emitida',no:'NF não emitida',not_applicable:'NF não aplicável'}[item.invoiceStatus]||'NF não informada');labels.push(status);if(item.counterparty)labels.push('Cliente: '+item.counterparty)}if(item.kind==='expense'&&item.businessExpenseType)labels.push(businessExpenseTypes[item.businessExpenseType]||'Despesa operacional');if(item.costCenter)labels.push('Centro de custo: '+item.costCenter);if(item.documentReference)labels.push('Documento: '+item.documentReference);return labels.length?{...item,notes:[item.notes,...labels].filter(Boolean).join(' · ')}:item});return baseBusinessItemsTable(decorated,...args)};
let businessReceivablesFilters={month:'',client:''};
function businessReceivablesPanel(){
  const month=businessReceivablesFilters.month||selected(),allRows=typeItems('income',month),clients=[...new Set([...(db.people||[]).filter(person=>person!==ownerName()),...allRows.map(item=>item.counterparty).filter(Boolean),businessReceivablesFilters.client].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const rows=allRows.filter(item=>!businessReceivablesFilters.client||item.counterparty===businessReceivablesFilters.client),billedRows=rows.filter(item=>!item.future),billed=billedRows.reduce((sum,item)=>sum+Number(item.amount||0),0),received=billedRows.reduce((sum,item)=>sum+Math.min(Number(item.amount||0),Math.max(0,paid(item,month))),0),open=billedRows.reduce((sum,item)=>sum+remaining(item,month),0),pendingInvoices=billedRows.filter(item=>item.invoiceStatus==='no').length;
  const body=rows.length?rows.map(item=>{const client=item.counterparty||'Cliente não informado',openAmount=item.future?0:remaining(item,month),invoice=item.invoiceStatus==='no'&&!item.future?'<span class="badge pending business-invoice-warning" role="status">Nota fiscal pendente</span>':item.invoiceStatus==='no'?'<span class="badge">Não emitida</span>':item.invoiceStatus==='yes'?'<span class="badge paid">Emitida</span>':item.invoiceStatus==='not_applicable'?'<span class="badge">Não aplicável</span>':'<span class="badge">Não informada</span>';return `<tr><td><strong>${esc(client)}</strong><div class="metric">${esc(item.name||'Faturamento')}${item.installments>1?` · parcela ${item.part||1}/${item.installments}`:''}${item.future?' · previsto':''}</div></td><td class="currency">${item.future?'—':money(item.amount)}</td><td class="currency">${money(Math.min(Number(item.amount||0),Math.max(0,paid(item,month))))}</td><td class="currency">${item.future?`${money(item.amount)}<div><span class="badge">Previsto</span></div>`:`${money(openAmount)}${openAmount>0?'<div><span class="badge pending">Em aberto</span></div>':''}`}</td><td>${invoice}</td><td class="no-print">${openAmount>0?`<button class="mini-btn" data-action="business-whatsapp" data-id="${esc(client)}" data-index="${esc(month)}">Cobrar</button>`:''}</td></tr>`}).join(''):'<tr><td colspan="6">Nenhum lançamento encontrado para este cliente e período.</td></tr>';
  return `<div class="spacer"></div><section class="card business-receivables-card"><div class="section-head"><div><h2>Contas a receber</h2><p>Filtre por cliente e mês. Os avisos de nota fiscal aparecem junto ao respectivo recebimento.</p></div></div><div class="business-receivables-filters"><div class="field"><label for="businessReceivablesMonth">Período</label><input id="businessReceivablesMonth" type="month" value="${esc(month)}"></div><div class="field"><label for="businessReceivablesClient">Cliente</label><select id="businessReceivablesClient"><option value="">Todos os clientes</option>${clients.map(client=>`<option value="${esc(client)}" ${client===businessReceivablesFilters.client?'selected':''}>${esc(client)}</option>`).join('')}</select></div><button type="button" class="btn secondary" data-action="business-receivables-reset">Usar mês do topo</button></div><div class="grid stats business-receivables-summary">${statsCard('Faturado',money(billed),monthLabel(month),'↗','positive')}${statsCard('Recebido',money(received),'No período selecionado','✓','positive')}${statsCard('Em aberto',money(open),'Valores a receber','◷',open?'negative':'positive')}${statsCard('Notas fiscais pendentes',String(pendingInvoices),'Lançamentos sem emissão informada','▤',pendingInvoices?'negative':'positive')}</div><div class="table-wrap"><table><thead><tr><th>Cliente / lançamento</th><th>Faturado</th><th>Recebido</th><th>Em aberto</th><th>Nota fiscal</th><th class="no-print">Ação</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}
const baseBusinessCollectionPage=collectionPage;
collectionPage=function(){return isBusinessProfile()?businessReceivablesPanel():baseBusinessCollectionPage()};
function openBusinessWhatsApp(client,month=selected()){const items=typeItems('income',month).filter(item=>(item.counterparty||'Cliente não informado')===client&&remaining(item,month)>0);if(!items.length){toast('Não há valor em aberto para este cliente neste período.');return}const company=businessFiscalData(),amount=items.reduce((sum,item)=>sum+remaining(item,month),0),phone=db.settings.peoplePhones?.[client],dueDay=Number(company.dueDay)||10,message=`Olá ${client}, segue o detalhamento da cobrança referente aos serviços de ${longMonthLabel(month)}, com vencimento no dia ${dueDay}.\n\nValor em aberto: ${money(amount)}\n${company.legalName||company.tradeName?`Empresa: ${company.tradeName||company.legalName}\n`:''}${company.cnpj?`CNPJ: ${company.cnpj}\n`:''}${company.pixKey?`Chave Pix CNPJ: ${company.pixKey}\n`:''}\nEm caso de dúvidas, fico à disposição. Obrigado!`;if(!openWhatsAppChat(phone,message)){toast('Cadastre o telefone deste cliente em Ajustes → Clientes, fornecedores e parceiros.');setPage('ajustes')}}

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
function businessRevenueReport(month){
  const rows=typeItems('income',month).filter(item=>!item.future),groups=new Map();
  rows.forEach(item=>{const client=item.counterparty||'Cliente não informado',row=groups.get(client)||{count:0,billed:0,received:0,open:0,pendingInvoices:0};row.count++;row.billed+=Number(item.amount||0);row.received+=Math.min(Number(item.amount||0),Math.max(0,paid(item,month)));row.open+=remaining(item,month);if(item.invoiceStatus==='no')row.pendingInvoices++;groups.set(client,row)});
  const billed=rows.reduce((sum,item)=>sum+Number(item.amount||0),0),received=rows.reduce((sum,item)=>sum+Math.min(Number(item.amount||0),Math.max(0,paid(item,month))),0),open=rows.reduce((sum,item)=>sum+remaining(item,month),0);
  const table=groups.size?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Lançamentos</th><th>Faturado</th><th>Recebido</th><th>Em aberto</th><th>NF pendente</th></tr></thead><tbody>${[...groups].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).map(([client,row])=>`<tr><td>${esc(client)}</td><td>${row.count}</td><td>${money(row.billed)}</td><td>${money(row.received)}</td><td>${money(row.open)}</td><td>${row.pendingInvoices?`<span class="badge pending">${row.pendingInvoices} pendente(s)</span>`:'Em dia'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum faturamento registrado neste período.</div>';
  return `<section class="card business-report-card"><div class="section-head"><div><h2>Faturamento</h2><p>Valores lançados por cliente em ${monthLabel(month)}.</p></div></div><div class="grid stats business-report-summary">${statsCard('Faturado',money(billed),'Lançamentos não previstos','↗','positive')}${statsCard('Recebido',money(received),'Pagamentos registrados','✓','positive')}${statsCard('A receber',money(open),'Saldo em aberto','◷',open?'negative':'positive')}</div>${table}</section>`;
}
function businessExpenseReport(month,taxOnly){
  const rows=typeItems('expense',month).filter(item=>!item.future&&(taxOnly?item.businessExpenseType==='tax':item.businessExpenseType!=='tax'));
  const total=rows.reduce((sum,item)=>sum+Number(item.amount||0),0),paidTotal=rows.reduce((sum,item)=>sum+Math.min(Number(item.amount||0),Math.max(0,paid(item,month))),0),open=rows.reduce((sum,item)=>sum+remaining(item,month),0),title=taxOnly?'Tributos':'Despesas operacionais',description=taxOnly?'Impostos e tributos classificados nos lançamentos.':'Custos fixos, variáveis, pró-labore e demais despesas, sem tributos.';
  return `<section class="card business-report-card"><div class="section-head"><div><h2>${title}</h2><p>${description} · ${monthLabel(month)}</p></div></div><div class="grid stats business-report-summary">${statsCard('Lançado',money(total),`${rows.length} lançamento(s)`,'↘','negative')}${statsCard('Pago',money(paidTotal),'Pagamentos registrados','✓','positive')}${statsCard('Em aberto',money(open),'Saldo pendente','◷',open?'negative':'positive')}</div>${itemsTable(rows,true)}</section>`;
}
reportsPage=function(){if(!isBusinessProfile())return baseBusinessReports();const month=selected();return `${welcome('Relatórios gerenciais',null,'')}<div class="welcome no-print business-report-intro" style="margin-top:-10px"><p>Faturamento, recebimentos, despesas operacionais e tributos em relatórios separados para ${monthLabel(month)}.</p><button class="btn primary" data-action="print">⇩ Exportar PDF</button></div><div class="business-report-stack">${businessRevenueReport(month)}${businessReceivablesPanel()}<div class="grid two-col business-expense-reports">${businessExpenseReport(month,false)}${businessExpenseReport(month,true)}</div></div>`};

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
  const words=isBusinessProfile()?BUSINESS_WORDS:[...BUSINESS_WORDS].reverse().map(([from,to])=>[to,from]);
  const translate=value=>{for(const [from,to] of words)value=value.replaceAll(from,to);return value};
  if(root.id==='nav'){
    root.querySelectorAll('[data-page]').forEach(button=>{const node=[...button.childNodes].find(child=>child.nodeType===Node.TEXT_NODE);if(!node)return;const current=node.nodeValue.trim();if(button.dataset.lastBusinessLabel!==current)button.dataset.pfLabel=current;const label=translate(button.dataset.pfLabel||current);node.nodeValue=` ${label}`;button.dataset.lastBusinessLabel=label});
    return;
  }
  if(root.id==='pageTitle'){
    const current=root.textContent.trim();if(root.dataset.lastBusinessTitle!==current)root.dataset.pfTitle=current;const title=translate(root.dataset.pfTitle||current);root.textContent=title;root.dataset.lastBusinessTitle=title;return;
  }
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())walker.currentNode.nodeValue=translate(walker.currentNode.nodeValue);
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

