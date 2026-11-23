const closedMonths=()=>db.settings.closedMonths||(db.settings.closedMonths=[]);
const monthIsClosed=month=>closedMonths().includes(month);
const personRollovers=()=>db.settings.personRollovers||(db.settings.personRollovers={});
const rolloverKey=(month,person)=>`${month}|${person}`;
const personRolloverOn=(month,person)=>personRollovers()[rolloverKey(month,person)]!==false;
const personNamesForLedger=()=>[...new Set([...db.people,...db.items.filter(x=>x.kind==='expense').map(x=>x.person||ownerName()),...(db.reimbursements||[]).map(x=>x.person)].filter(Boolean))];
function monthSequenceEnding(end,count){let [year,month]=end.split('-').map(Number);return Array.from({length:count},(_,i)=>{let d=new Date(year,month-count+i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})}
function personLedger(person,end=selected()){
  let known=[...db.items.map(x=>x.month||x.due),...(db.reimbursements||[]).map(x=>x.month)].filter(Boolean).sort(),start=known[0]||end,[sy,sm]=start.split('-').map(Number),[ey,em]=end.split('-').map(Number),count=Math.max(1,Math.min(240,(ey-sy)*12+em-sm+1)),months=monthSequenceEnding(end,count),balance=0,rows=[];
  for(const month of months){let opening=balance,items=typeItems('expense',month).filter(x=>(x.person||ownerName())===person),charges=items.reduce((sum,x)=>sum+Number(x.amount||0),0),received=monthStats(month).groups[person]?.received||0;balance=Math.round((opening+charges-received)*100)/100;rows.push({month,opening,charges,received,closing:balance})}
  const current=rows.at(-1)||{month:end,opening:0,charges:0,received:0,closing:0};return{rows,previous:current.opening,current,closing:current.closing};
}
function personSettlement(person,month=selected()){
  const ledger=personLedger(person,month),useRollover=personRolloverOn(month,person),amount=useRollover?Math.max(0,Math.round((ledger.previous+ledger.current.charges-ledger.current.received)*100)/100):Math.max(0,Math.round((ledger.current.charges-ledger.current.received)*100)/100);
  return{...ledger,useRollover,amount,credit:useRollover?Math.max(0,-(ledger.previous+ledger.current.charges-ledger.current.received)):0};
}
function openPersonLedger(person){
  const ledger=personLedger(person),rows=ledger.rows.slice(-12);
  showModal(`Extrato acumulado · ${person}`,`<p>Transferências são abatidas do saldo mês a mês. Saldo positivo é valor a receber; negativo é crédito da pessoa.</p><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Gastos</th><th>Transferiu</th><th>Saldo anterior</th><th>Saldo acumulado</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${monthLabel(r.month)}</td><td>${money(r.charges)}</td><td>${money(r.received)}</td><td>${money(r.opening)}</td><td class="${r.closing>0?'negative':r.closing<0?'positive':''}"><strong>${r.closing<0?`Crédito ${money(-r.closing)}`:r.closing>0?`Deve ${money(r.closing)}`:'Quitado'}</strong></td></tr>`).join('')}</tbody></table></div>`,()=>{});
}
function openPersonTransfer(person){
  const settlement=personSettlement(person);if(settlement.amount<=0){toast(settlement.credit?`${person} tem ${money(settlement.credit)} de crédito acumulado.`:`${person} não tem saldo pendente.`);return}
  showModal(`Registrar transferência · ${person}`,`<p>Acerto sugerido para ${monthLabel(selected())}: <strong>${money(settlement.amount)}</strong>${settlement.useRollover?` · incluindo saldo anterior de ${money(settlement.previous)}`:''}</p><div class="field"><label>Valor recebido (R$)</label><input name="amount" type="number" min="0.01" max="${settlement.amount}" step="0.01" required></div><div class="field"><label>Data da transferência</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>`,()=>{let f=new FormData(document.querySelector('#modalForm')),amount=Number(f.get('amount'));if(amount<=0||amount>personSettlement(person).amount){toast('O valor excede o saldo acumulado em aberto.');return false}db.reimbursements.push({id:crypto.randomUUID(),person,month:selected(),date:f.get('date'),amount,unallocated:amount,carryApplied:settlement.useRollover});save();toast('Transferência registrada no extrato')});
}
function setPersonRollover(person){const key=rolloverKey(selected(),person);personRollovers()[key]=!personRolloverOn(selected(),person);save();render()}
function personHistoryPanel(){
  const month=selected(),names=personNamesForLedger().filter(person=>person!==ownerName()&&personLedger(person,month).rows.some(row=>row.charges||row.received||row.closing));if(!names.length)return'';
  return `<div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Extrato acumulado por pessoa</h2><p>Últimos meses · saldos transitados entram no acerto quando ativados</p></div></div><div class="grid two-col">${names.map(person=>{let settlement=personSettlement(person,month),g=monthStats(month).groups[person]||{total:0,received:0},status=settlement.closing>0?`Deve ${money(settlement.closing)}`:settlement.closing<0?`Crédito ${money(-settlement.closing)}`:'Quitado';return `<article class="card person-ledger-card"><div class="section-head"><h3>${esc(person)}</h3><strong>${status}</strong></div><div class="person-ledger-stats"><span>Gastos no mês <b>${money(g.total)}</b></span><span>Transferiu <b>${money(g.received)}</b></span><span>Acerto sugerido <b>${money(settlement.amount)}</b></span></div><div class="person-ledger-actions"><button class="mini-btn" data-action="person-ledger" data-id="${esc(person)}">Ver extrato</button><button class="mini-btn" data-action="reimburse-person" data-id="${esc(person)}" ${settlement.amount<=0?'disabled':''}>Registrar transferência</button><button class="mini-btn" data-action="carry-toggle" data-id="${esc(person)}">Saldo anterior: ${settlement.useRollover?'incluir':'ignorar'}</button>${settlement.closing<=0&&g.total>0?`<button class="mini-btn" data-action="receipt" data-id="${esc(person)}">Gerar recibo de quitação</button>`:''}<button class="mini-btn" data-action="settlement-whatsapp" data-id="${esc(person)}">WhatsApp</button></div></article>`}).join('')}</div></section>`;
}
const baseCollectionPageWithLedger=collectionPage;
collectionPage=function(){return baseCollectionPageWithLedger()+personHistoryPanel()};

function settlementMessage(person){
  const month=selected(),ledger=personLedger(person,month),current=ledger.current,opening=personSettlement(person,month).useRollover?current.opening:0,closing=Math.max(0,opening+current.charges-current.received),credit=Math.max(0,-(opening+current.charges-current.received));
  return `Olá, ${person}! Segue o acerto de ${longMonthLabel(month)}.\n\nGastos do mês: ${money(current.charges)}\nTransferências registradas: ${money(current.received)}\nSaldo anterior considerado: ${money(opening)}\n${credit?`Crédito remanescente: ${money(credit)}`:`Saldo em aberto: ${money(closing)}`}\n\n${closing<=0?'Mês quitado. Obrigado!':'O valor pode ser transferido pelo Pix já combinado. Obrigado!'}`;
}
function openPersonWhatsApp(person){
  const phone=db.settings.peoplePhones?.[person];if(!openWhatsAppChat(phone,settlementMessage(person))){toast('Cadastre o WhatsApp de '+person+' em Ajustes → Pessoas.');setPage('ajustes')}
}
function openPersonReceipt(person){
  const ledger=personLedger(person),r=ledger.current;if(!r.charges||ledger.closing>0.005){toast('O extrato ainda mostra um saldo em aberto para este mês.');return}
  const message=`🧾 RECIBO DE QUITAÇÃO\n\nPessoa: ${person}\nCompetência: ${longMonthLabel(selected())}\nGastos atribuídos: ${money(r.charges)}\nTransferências registradas: ${money(r.received)}\nResultado: QUITADO\n\nRecibo gerado pelo Meu Patrimônio.`;
  if(!openWhatsAppChat(db.settings.peoplePhones?.[person],message)){toast('Cadastre o WhatsApp de '+person+' em Ajustes → Pessoas.');setPage('ajustes')}
}

function quickExpense(){
  const cards=db.cards||[];showModal('Lançamento rápido',`<div class="field"><label>Nome do gasto</label><input name="name" required maxlength="90" placeholder="Ex.: mercado, remédio"></div><div class="form-grid"><div class="field"><label>Valor (R$)</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0,00"></div><div class="field"><label>Pessoa</label><select name="person">${db.people.map(person=>`<option ${person===ownerName()?'selected':''}>${esc(person)}</option>`).join('')}</select></div></div><div class="field"><label>Cartão</label><select name="cardId"><option value="">Sem cartão</option>${cards.map(card=>`<option value="${esc(card.id)}">${esc(card.name)}</option>`).join('')}</select></div><small>Será lançado em ${monthLabel(selected())} e aparecerá no topo da lista.</small>`,()=>{let f=new FormData(document.querySelector('#modalForm')),name=String(f.get('name')||'').trim(),amount=Number(f.get('amount'));if(!name||amount<=0){toast('Informe o nome e um valor válido.');return false}prioritizeNewExpenses(1);db.items.push({id:crypto.randomUUID(),seriesId:crypto.randomUUID(),kind:'expense',name,amount,month:selected(),due:selected(),person:String(f.get('person')||ownerName()),category:'Outros',cardId:String(f.get('cardId')||''),installments:1,part:1,paid:0,ord:1,quickEntry:true});save();toast('Gasto registrado no topo')});
  document.querySelector('#modalBody [name="name"]')?.focus();
}

const baseOpenAssetForClass=openAsset;
openAsset=function(id){
  const existingIds=new Set(db.assets.map(a=>a.id));baseOpenAssetForClass(id);const form=document.querySelector('#modalForm'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;
  const asset=db.assets.find(a=>a.id===id),field=document.createElement('div');field.className='field span2';field.innerHTML=`<label for="assetClass">Alocação patrimonial</label><select id="assetClass" name="assetClass"><option value="emergency">Reserva de emergência</option><option value="fixedIncome">Renda fixa</option><option value="checking">Contas correntes</option><option value="international">Dólar / internacional</option><option value="other">Outros ativos</option></select>`;grid.append(field);field.querySelector('select').value=asset?.assetClass||(asset?.currency==='USD'?'international':'checking');
  const previous=form.onsubmit;form.onsubmit=function(event){let assetClass=field.querySelector('select').value;previous.call(this,event);if(!document.querySelector('#modal').open){let saved=id?db.assets.find(a=>a.id===id):db.assets.find(a=>!existingIds.has(a.id));if(saved){saved.assetClass=assetClass;save();render()}}};
};

function assetClassValues(month){
  const labels={emergency:'Reserva de emergência',fixedIncome:'Renda fixa',checking:'Contas correntes',international:'Dólar / internacional',other:'Outros ativos'},groups=new Map();for(const asset of db.assets.filter(a=>a.month<=month)){const key=`${(asset.bank||asset.name||'Instituição').toLowerCase()}|${asset.assetClass|| (asset.currency==='USD'?'international':'checking')}`,entry=groups.get(key)||{assetClass:asset.assetClass||(asset.currency==='USD'?'international':'checking'),value:0};entry.value+=Number(asset.delta??asset.balance??0);groups.set(key,entry)}const totals={};for(const {assetClass,value} of groups.values())totals[assetClass]=(totals[assetClass]||0)+value;return{labels,totals,grand:Object.values(totals).reduce((sum,value)=>sum+value,0)};
}
function portfolioAllocationPanel(){
  const allocation=assetClassValues(selected()),rows=Object.entries(allocation.totals).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]),colors={emergency:'#c39d60',fixedIncome:'#80a9d6',checking:'#80c5ac',international:'#a995d8',other:'#d88a91'},parts=[],sum=allocation.grand;let cursor=0;for(const[key,value]of rows){let start=cursor;cursor+=sum?value/sum*360:0;parts.push(`${colors[key]||'#97b58b'} ${start}deg ${cursor}deg`)}const months=monthSequenceEnding(selected(),12),net=months.map(month=>({month,total:assetTotal(month)})),max=Math.max(1,...net.map(x=>Math.max(0,x.total)));return `<div class="spacer"></div><section class="card portfolio-allocation"><div class="section-head"><div><h2>Alocação da carteira</h2><p>Distribuição dos ativos registrados até ${monthLabel(selected())}</p></div></div>${rows.length?`<div class="allocation-layout"><div class="allocation-donut" role="img" aria-label="Distribuição percentual do patrimônio" style="background:conic-gradient(${parts.join(',')})"><span><small>Ativos</small><strong>${money(sum)}</strong></span></div><div class="allocation-legend">${rows.map(([key,value])=>`<div><i style="--slice:${colors[key]||'#97b58b'}"></i><span>${esc(allocation.labels[key]||key)}</span><strong>${money(value)}</strong><small>${sum?(100*value/sum).toLocaleString('pt-BR',{maximumFractionDigits:1}):0}%</small></div>`).join('')}</div></div>`:'<div class="empty">Classifique os movimentos patrimoniais para montar a carteira.</div>'}<div class="section-head networth-heading"><div><h2>Patrimônio líquido estimado</h2><p>Somente aportes e retiradas registrados em movimentações patrimoniais; gastos e faturas não entram</p></div></div><div class="networth-chart" role="img" aria-label="Patrimônio acumulado dos últimos 12 meses com base em aportes e retiradas">${net.map(point=>{let value=point.total,height=Math.max(3,Math.min(100,Math.max(0,value)/max*100));return `<div class="networth-point" title="${monthLabel(point.month)} · ${money(value)}"><strong>${money(value)}</strong><i style="height:${height}%"></i><small>${monthLabel(point.month)}</small></div>`}).join('')}</div></section>`;
}
const baseAssetsPageForAllocation=assetsPage;
assetsPage=function(){return baseAssetsPageForAllocation()+portfolioAllocationPanel()};

function privacyMaskText(node){if(!privacyEnabled||node.nodeType!==Node.TEXT_NODE||!node.nodeValue||!/(?:R\$|US\$)\s*[\d.,]+/i.test(node.nodeValue))return;let original=node.nodeValue;privacyOriginals.set(node,original);node.nodeValue=original.replace(/(?:R\$|US\$)\s*[\d.,]+/gi,'R$ •••••')}
function privacyMaskAttributes(root=document.body){if(!privacyEnabled||!root)return;const nodes=[root,...(root.querySelectorAll?.('[aria-label],[title]')||[])];for(const node of nodes)for(const attr of ['aria-label','title']){let value=node.getAttribute?.(attr);if(!value||!/(?:R\$|US\$)\s*[\d.,]+/i.test(value))continue;let stored=privacyTrackedNodes.get(node)||new Map();stored.set(attr,value);privacyTrackedNodes.set(node,stored);node.setAttribute(attr,value.replace(/(?:R\$|US\$)\s*[\d.,]+/gi,'R$ •••••'))}}
const privacyOriginals=new Map();let privacyEnabled=localStorage.getItem('cdm-hide-values')==='1';
function setPrivacy(enabled){privacyEnabled=enabled;document.body.classList.toggle('privacy-mode',enabled);localStorage.setItem('cdm-hide-values',enabled?'1':'0');const button=document.querySelector('#privacyToggle');if(button){button.textContent=enabled?'◎':'◉';button.setAttribute('aria-label',enabled?'Mostrar valores':'Ocultar valores');button.title=enabled?'Mostrar valores':'Ocultar valores'}if(enabled){const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode())privacyMaskText(walker.currentNode);privacyMaskAttributes()}else{for(const[node,value]of privacyOriginals)if(node.isConnected)node.nodeValue=value;privacyOriginals.clear();for(const[node,attrs]of privacyTrackedNodes)if(node.isConnected)for(const[attr,value]of attrs)node.setAttribute(attr,value);privacyTrackedNodes.clear()}}
const privacyTrackedNodes=new Map();
const privacyObserver=new MutationObserver(records=>{if(!privacyEnabled)return;for(const record of records){if(record.type==='characterData')privacyMaskText(record.target);if(record.type==='attributes')privacyMaskAttributes(record.target);for(const node of record.addedNodes||[]){if(node.nodeType===Node.TEXT_NODE)privacyMaskText(node);else if(node.nodeType===Node.ELEMENT_NODE){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);while(walker.nextNode())privacyMaskText(walker.currentNode);privacyMaskAttributes(node)}}}});privacyObserver.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title']});if(privacyEnabled)setPrivacy(true);

function closeOrReopenMonth(month=selected()){
  let closed=monthIsClosed(month);if(closed){if(!confirm(`Reabrir ${longMonthLabel(month)} para edição?`))return;db.settings.closedMonths=closedMonths().filter(value=>value!==month)}else{if(!monthSettled(month)||(!monthStats(month).items.length&&!monthStats(month).bills.length)){toast('Confira todos os pagamentos e acertos antes de fechar este mês.');return}if(!confirm(`Fechar ${longMonthLabel(month)}? Os registros desse mês ficarão bloqueados para edição.`))return;db.settings.closedMonths=[...new Set([...closedMonths(),month])]}save();render();
}
function updateMonthLockUi(){const button=document.querySelector('#monthLockButton');if(!button)return;const closed=monthIsClosed(selected());button.textContent=closed?'🔒':'🔓';button.setAttribute('aria-label',closed?'Reabrir mês':'Fechar mês');button.title=closed?'Reabrir mês':'Fechar mês';button.classList.toggle('month-is-closed',closed);}
const baseRenderWithFinance=render;
render=function(){baseRenderWithFinance();updateMonthLockUi();const content=document.querySelector('#content');if(monthIsClosed(selected())&&content&&!content.querySelector('.closed-month-notice'))content.insertAdjacentHTML('afterbegin',`<div class="notice closed-month-notice">🔒 ${longMonthLabel(selected())} está fechado. Reabra pelo cadeado para alterar registros.</div>`)};
const lockedMonthActions=new Set(['add-income','add-expense','quick-expense','edit','partial','mark-paid','undo-receipt','reimburse','reimburse-person','delete','delete-selected','move-item','add-bill','edit-bill','delete-bill','toggle-bill','add-asset','edit-asset','delete-asset','move-person','save-people','remove-person','save-owner','month-hide','carry-toggle']);
document.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target)return;if(monthIsClosed(selected())&&lockedMonthActions.has(target.dataset.action)){event.preventDefault();event.stopImmediatePropagation();toast('Este mês está fechado. Reabra pelo cadeado antes de alterar os dados.')}},true);
document.addEventListener('change',event=>{if(monthIsClosed(selected())&&event.target.matches('[data-order-item]')){event.stopImmediatePropagation();toast('Este mês está fechado. Reabra pelo cadeado antes de reordenar.');render()}},true);

const baseActWithFinance=act;
act=function(action,id,index){
  if(action==='month-lock'){closeOrReopenMonth();return}
  if(action==='month-unlock'){closeOrReopenMonth(id);return}
  if(action==='privacy-toggle'){setPrivacy(!privacyEnabled);return}
  if(action==='quick-expense'){quickExpense();return}
  if(action==='person-ledger'){openPersonLedger(id);return}
  if(action==='reimburse-person'){openPersonTransfer(id);return}
  if(action==='carry-toggle'){setPersonRollover(id);return}
  if(action==='receipt'){openPersonReceipt(id);return}
  if(action==='settlement-whatsapp'){openPersonWhatsApp(id);return}
  baseActWithFinance(action,id,index);
};

const baseSettingsWithClosedMonths=settingsWithOwner;
settingsWithOwner=function(){return baseSettingsWithClosedMonths()+`<div class="spacer"></div><section class="card"><div class="section-head"><h2>Fechamento contábil</h2></div>${closedMonths().length?closedMonths().sort().map(month=>`<div class="settings-row"><span>🔒 ${longMonthLabel(month)}</span><button class="mini-btn" data-action="month-unlock" data-id="${month}">Reabrir</button></div>`).join(''):'<p class="metric">Nenhum mês fechado. O fechamento fica disponível no cadeado do topo após quitar e conferir o mês.</p>'}</section>`};
