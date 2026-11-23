/* Simulador de financiamento veicular (Tabela Price, 1ª prestação sem entrada). */
(function(root){
function pv(n,i,p){return i===0?p*n:p*(1-Math.pow(1+i,-n))/i}
function solveFinancing(f){
  var n=f.n,i=f.rate==null?null:f.rate/100,p=f.payment,v=f.principal;
  var missing=['n','rate','payment','principal'].filter(function(k){return f[k]==null||!isFinite(f[k])});
  if(missing.length!==1)throw new Error('Preencha exatamente 3 dos 4 campos.');
  if((n!=null&&n<=0)||(p!=null&&p<=0)||(v!=null&&v<=0)||(i!=null&&i<0))throw new Error('Use valores positivos.');
  var m=missing[0];
  if(m==='payment')p=i===0?v/n:v*i/(1-Math.pow(1+i,-n));
  if(m==='principal')v=pv(n,i,p);
  if(m==='n'){if(i===0)n=v/p;else{var x=1-v*i/p;if(x<=0)throw new Error('A prestação não cobre os juros: o financiamento nunca seria quitado.');n=-Math.log(x)/Math.log(1+i)}}
  if(m==='rate'){if(p*n<v)throw new Error('O total das prestações é menor que o valor financiado.');
    if(Math.abs(p*n-v)<1e-9)i=0;else{var lo=0,hi=1;while(pv(n,hi,p)>v)hi*=2;for(var k=0;k<200;k++){var mid=(lo+hi)/2;if(pv(n,mid,p)>v)lo=mid;else hi=mid}i=(lo+hi)/2}}
  if(m==='n')n=Math.round(n*100)/100;var total=p*n;
  return{n:n,rate:i*100,payment:p,principal:v,total:total,interest:total-v,annualRate:(Math.pow(1+i,12)-1)*100,solved:m};
}
/* Evolução mês a mês (Tabela Price): prestação, juros, amortização e saldo devedor. */
function financingSchedule(r){
  var i=r.rate/100,balance=r.principal,rows=[],months=Math.ceil(r.n-1e-9);
  for(var k=1;k<=months;k++){
    var interest=balance*i,amort=r.payment-interest;
    if(k===months&&Math.abs(r.n-Math.round(r.n))>1e-9){amort=balance}
    var pay=k===months?interest+amort:r.payment;
    balance=Math.max(0,balance-amort);
    rows.push({month:k,payment:pay,interest:interest,amortization:amort,balance:balance});
    if(balance<=0)break;
  }
  return rows;
}
/* Pagamento antecipado de uma parcela (deságio): valor presente da prestação
   trazida "monthsAhead" meses antes do vencimento, à taxa do contrato. */
function discountToPresent(payment,ratePct,monthsAhead){
  if(!(payment>0)||!(ratePct>=0)||!(monthsAhead>=0))throw new Error('Use valores positivos.');
  var i=ratePct/100,present=payment/Math.pow(1+i,monthsAhead);
  return{present:present,discount:payment-present,monthsAhead:monthsAhead};
}
root.solveFinancing=solveFinancing;root.financingSchedule=financingSchedule;root.discountToPresent=discountToPresent;
if(typeof module!=='undefined')module.exports={solveFinancing:solveFinancing,financingSchedule:financingSchedule,discountToPresent:discountToPresent};
if(typeof document==='undefined'||typeof planPage!=='function')return;
var nf=function(v,d){return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})};
var parse=function(s){s=String(s||'').trim();if(!s)return null;s=s.replace(/\s|R\$|%/g,'');if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');var v=Number(s);return isFinite(v)?v:NaN};
var basePlan=planPage,baseBind=bindPage;
var fields=[['finN','Nº de meses',''],['finRate','Taxa de juros mensal (%)',''],['finPayment','Valor da prestação (R$)','Considera-se que a 1ª prestação não é no ato'],['finPrincipal','Valor financiado (R$)','Não inclui o valor da entrada']];
planPage=function(){return basePlan()+'<section class="card" style="margin-top:16px"><div class="section-head"><div><h2>Financiamento veicular</h2><p>Prestações fixas (Tabela Price). Preencha 3 campos e deixe em branco o que deseja descobrir.</p></div></div><form id="finForm"><div class="form-grid">'+fields.map(function(f){return '<div class="field"><label for="'+f[0]+'">'+f[1]+'</label><input id="'+f[0]+'" inputmode="decimal" autocomplete="off">'+(f[2]?'<small style="opacity:.7">'+f[2]+'</small>':'')+'</div>'}).join('')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">Calcular</button><button type="button" class="btn secondary" id="finReport">Relatório</button><button type="button" class="btn secondary" id="finClear">Limpar</button></div></form><div id="finResult" style="margin-top:14px"></div><div id="finReportOut" style="margin-top:14px"></div></section>'};
bindPage=function(){baseBind();var form=document.getElementById('finForm');if(!form)return;var ids=['finN','finRate','finPayment','finPrincipal'],out=document.getElementById('finResult'),report=document.getElementById('finReportOut');
  document.getElementById('finClear').onclick=function(){ids.forEach(function(id){document.getElementById(id).value=''});out.innerHTML='';report.innerHTML=''};
  var lastSolved=null;ids.forEach(function(id,ix){document.getElementById(id).addEventListener('input',function(){if(lastSolved===['n','rate','payment','principal'][ix])lastSolved=null})});
  var solve=function(){var v=ids.map(function(id){return parse(document.getElementById(id).value)});
    if(v.some(function(x){return Number.isNaN(x)}))throw new Error('Há um número inválido.');
    var keys=['n','rate','payment','principal'];
    if(v.every(function(x){return x!=null&&isFinite(x)})){var k=keys.indexOf(lastSolved);v[k<0?3:k]=null}
    var r=solveFinancing({n:v[0],rate:v[1],payment:v[2],principal:v[3]});lastSolved=r.solved;return r};
  var fill=function(r){document.getElementById('finN').value=nf(r.n,2);document.getElementById('finRate').value=nf(r.rate,6);document.getElementById('finPayment').value=nf(r.payment,2);document.getElementById('finPrincipal').value=nf(r.principal,2)};
  form.onsubmit=function(e){e.preventDefault();
    try{var r=solve();fill(r);report.innerHTML='';
      out.innerHTML='<p>O total desse financiamento de <strong>'+nf(r.n,2)+'</strong> parcelas de <strong>R$ '+nf(r.payment,2)+'</strong> é <strong>R$ '+nf(r.total,2)+'</strong>, sendo <strong>R$ '+nf(r.interest,2)+'</strong> de juros.</p><p style="opacity:.75">Taxa equivalente anual: '+nf(r.annualRate,2)+'% a.a.</p>';
    }catch(err){out.innerHTML='<p style="color:var(--danger,#c0392b)">'+err.message+'</p>'}};
  document.getElementById('finReport').onclick=function(){
    try{var r=solve();fill(r);
      var rows=financingSchedule(r);
      var body=rows.map(function(row){return '<tr><td>'+row.month+'</td><td>R$ '+nf(row.payment,2)+'</td><td>R$ '+nf(row.interest,2)+'</td><td>R$ '+nf(row.amortization,2)+'</td><td>R$ '+nf(row.balance,2)+'</td></tr>'}).join('');
      report.innerHTML='<div class="section-head" style="margin-top:8px"><div><h3 style="margin:0">Resultado da análise</h3><p style="opacity:.7;margin:4px 0 0">Recomendações são estimativas, não aconselhamento financeiro.</p></div><button type="button" class="btn secondary" id="finPrint">Imprimir / PDF</button></div>'
        +'<p>O total desse financiamento de <strong>'+nf(r.n,2)+'</strong> parcelas de <strong>R$ '+nf(r.payment,2)+'</strong> é <strong>R$ '+nf(r.total,2)+'</strong>, sendo <strong>R$ '+nf(r.interest,2)+'</strong> de juros. Taxa equivalente anual: <strong>'+nf(r.annualRate,2)+'% a.a.</strong></p>'
        +'<div style="overflow:auto;max-height:420px"><table class="table" id="finTable"><thead><tr><th>Mês</th><th>Prestação</th><th>Juros</th><th>Amortização</th><th>Saldo devedor</th></tr></thead><tbody>'+body+'</tbody></table></div>'
        +'<div style="margin-top:16px;border-top:1px solid var(--border,#ddd);padding-top:14px"><h3 style="margin:0 0 4px">Pagamento antecipado de parcela</h3><p style="opacity:.7;margin:0 0 10px">Simule quanto custa quitar uma parcela antes do vencimento, com o desconto dos juros futuros (deságio à taxa do contrato).</p>'
        +'<div class="form-grid"><div class="field"><label for="finAdvMonth">Parcela a antecipar (nº)</label><input id="finAdvMonth" inputmode="numeric" autocomplete="off" placeholder="Ex.: 48"></div><div class="field"><label for="finAdvAt">Pagando no mês (nº)</label><input id="finAdvAt" inputmode="numeric" autocomplete="off" placeholder="Ex.: 1"></div></div>'
        +'<button type="button" class="btn secondary" id="finAdvCalc">Simular antecipação</button><div id="finAdvOut" style="margin-top:10px"></div></div>';
      var advText='';
      document.getElementById('finAdvCalc').onclick=function(){
        var advOut=document.getElementById('finAdvOut');
        try{
          var m=parse(document.getElementById('finAdvMonth').value),at=parse(document.getElementById('finAdvAt').value);
          if(m==null||at==null)throw new Error('Informe a parcela a antecipar e o mês do pagamento.');
          m=Math.floor(m);at=Math.floor(at);
          var total=Math.ceil(r.n-1e-9);
          if(m<1||m>total)throw new Error('A parcela deve estar entre 1 e '+total+'.');
          if(at<1||at>=m)throw new Error('O mês do pagamento deve ser anterior à parcela (entre 1 e '+(m-1)+').');
          var pay=m===total&&Math.abs(r.n-Math.round(r.n))>1e-9?rows[rows.length-1].payment:r.payment;
          var d=discountToPresent(pay,r.rate,m-at);
          advText='Antecipando a parcela '+m+' (de R$ '+nf(pay,2)+') no mês '+at+', ela sai por R$ '+nf(d.present,2)+': economia de R$ '+nf(d.discount,2)+' em juros que deixariam de correr nos '+d.monthsAhead+' meses antecipados.';
          advOut.innerHTML='<p>'+advText+'</p><p style="opacity:.7">Estimativa pelo deságio financeiro à taxa do contrato ('+nf(r.rate,6)+'% a.m.); confirme o valor com o banco, que pode aplicar tarifas.</p>';
        }catch(err){advText='';advOut.innerHTML='<p style="color:var(--danger,#c0392b)">'+err.message+'</p>'}
      };
      document.getElementById('finPrint').onclick=function(){
        var w=window.open('','_blank');if(!w)return;
        w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — Financiamento veicular</title><style>body{font-family:sans-serif;margin:32px;color:#222}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:5px 8px;text-align:right}th:first-child,td:first-child{text-align:left}thead{background:#f0f0f0}h1{font-size:18px}.note{color:#666;font-size:12px}</style></head><body>'
          +'<h1>Resultado da análise — Financiamento veicular</h1><p class="note">Recomendações são estimativas, não aconselhamento financeiro.</p>'
          +'<p>Financiamento de <strong>'+nf(r.n,2)+'</strong> parcelas de <strong>R$ '+nf(r.payment,2)+'</strong>: total de <strong>R$ '+nf(r.total,2)+'</strong>, sendo <strong>R$ '+nf(r.interest,2)+'</strong> de juros. Taxa: '+nf(r.rate,6)+'% a.m. ('+nf(r.annualRate,2)+'% a.a.). Valor financiado: R$ '+nf(r.principal,2)+'.</p>'
          +'<table><thead><tr><th>Mês</th><th>Prestação</th><th>Juros</th><th>Amortização</th><th>Saldo devedor</th></tr></thead><tbody>'+body+'</tbody></table>'
          +(advText?'<h2 style="font-size:15px">Pagamento antecipado de parcela</h2><p>'+advText+'</p><p class="note">Estimativa pelo deságio financeiro à taxa do contrato; confirme o valor com o banco, que pode aplicar tarifas.</p>':'')
          +'</body></html>');
        w.document.close();w.focus();w.print();
      };
    }catch(err){report.innerHTML='<p style="color:var(--danger,#c0392b)">'+err.message+'</p>'}};
};
})(typeof window!=='undefined'?window:globalThis);

/* Simulador de troca: calcula a entrada líquida e compara a nova parcela ao
   fluxo mensal e à média recente de compras nos cartões cadastrados. */
(function(){
  var basePlanWithTrade = planPage, baseBindWithTrade = bindPage;
  var fmt = function(value){return Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})};
  var parseValue = function(value){var text=String(value||'').trim();if(text.indexOf(',')>=0)text=text.replace(/\./g,'').replace(',','.');var number=Number(text);return text===''?null:number};
  planPage = function(){
    return basePlanWithTrade() + `<section class="card vehicle-trade-card"><div class="section-head"><div><h2>Simulador de troca de veículo</h2><p>Estime a entrada líquida do carro atual e a prestação do próximo veículo.</p></div><span class="stat-icon">🚘</span></div><div class="form-grid"><div class="field"><label for="tradeCurrentValue">Valor de mercado do veículo atual (FIPE, R$)</label><input id="tradeCurrentValue" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ex.: 55.000"></div><div class="field"><label for="tradeDebt">Saldo devedor do financiamento atual (R$)</label><input id="tradeDebt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ex.: 18.000"></div><div class="field"><label for="tradeNewValue">Valor do novo veículo (R$)</label><input id="tradeNewValue" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Ex.: 82.000"></div><div class="field"><label for="tradeMonths">Prazo do novo financiamento (meses)</label><input id="tradeMonths" type="number" min="1" max="120" step="1" value="60"></div><div class="field"><label for="tradeRate">Taxa mensal do novo financiamento (%)</label><input id="tradeRate" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="Informe a taxa da proposta"></div></div><div id="vehicleTradeResult" class="vehicle-trade-result" aria-live="polite"><p>Preencha os valores e a taxa oferecida para ver a simulação.</p></div><small class="finance-tool-footnote">Estimativa pela Tabela Price, sem tarifas, seguro, documentação ou outros custos. A média das faturas considera despesas vinculadas a cartões nos seis meses completos anteriores e não soma registros de fatura à parte.</small></section>`;
  };
  function priorMonths(end,count){var parts=end.split('-').map(Number);return Array.from({length:count},function(_,i){var date=new Date(parts[0],parts[1]-2-(count-1-i),1);return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')})}
  function cardInvoiceAverage(){var months=priorMonths(selected(),6);return months.reduce(function(total,month){return total+typeItems('expense',month).filter(function(item){return item.cardId&&!item.future}).reduce(function(sum,item){return sum+Number(item.amount||0)},0)},0)/months.length}
  function renderTradeEstimate(){
    var output=document.getElementById('vehicleTradeResult');if(!output)return;
    var fipe=parseValue(document.getElementById('tradeCurrentValue').value),debt=parseValue(document.getElementById('tradeDebt').value),price=parseValue(document.getElementById('tradeNewValue').value),term=parseValue(document.getElementById('tradeMonths').value),rate=parseValue(document.getElementById('tradeRate').value);
    if([fipe,debt,price,term,rate].some(function(value){return value===null})){output.innerHTML='<p>Preencha os cinco campos para calcular a troca.</p>';return}
    if([fipe,debt,price,term,rate].some(function(value){return !Number.isFinite(value)})||fipe<0||debt<0||price<=0||term<1||term>120||Math.floor(term)!==term||rate<0){output.innerHTML='<p class="vehicle-trade-warning">Confira os valores. O prazo deve ser de 1 a 120 meses e os valores não podem ser negativos.</p>';return}
    var equity=fipe-debt,principal=price-equity,payment=0,interest=0;
    if(principal>0){try{var estimate=solveFinancing({n:term,rate:rate,payment:null,principal:principal});payment=estimate.payment;interest=estimate.interest}catch(error){output.innerHTML='<p class="vehicle-trade-warning">'+error.message+'</p>';return}}
    var habitual=cardInvoiceAverage(),balance=Number(totals().bal||0),after=balance-payment,ratio=balance>0?payment/balance*100:Infinity,status,description;
    if(principal<=0){status='positive';description='A entrada líquida cobre o valor do novo veículo; não há saldo a financiar.'}
    else if(balance>0&&ratio<=30){status='positive';description='A prestação estimada usa até 30% do saldo mensal previsto após os compromissos cadastrados.'}
    else if(balance>0&&payment<=balance){status='caution';description='A prestação cabe no saldo mensal previsto, mas consome mais de 30% dele. Revise a margem para imprevistos.'}
    else{status='negative';description='A prestação estimada supera o saldo mensal previsto após os compromissos cadastrados.'}
    var netHtml=equity<0?`<p class="vehicle-trade-warning">O saldo devedor supera o valor FIPE em <strong>R$ ${fmt(-equity)}</strong>; essa diferença aumenta o valor a financiar.</p>`:'';
    output.innerHTML=`<div class="vehicle-trade-summary"><div><small>Entrada líquida real</small><strong class="${equity<0?'negative-text':''}">R$ ${fmt(equity)}</strong><span>FIPE R$ ${fmt(fipe)} − saldo devedor R$ ${fmt(debt)}</span></div><div><small>${principal>0?'Diferença a financiar':'Valor excedente da entrada'}</small><strong>R$ ${fmt(Math.abs(principal))}</strong><span>Novo veículo R$ ${fmt(price)} − entrada líquida</span></div><div><small>Nova prestação estimada</small><strong>R$ ${fmt(payment)}</strong><span>${principal>0?term+' meses · '+fmt(rate)+'% a.m. · juros estimados R$ '+fmt(interest):'Sem novo financiamento'}</span></div></div>${netHtml}<div class="vehicle-trade-budget ${status}"><strong>${status==='positive'?'Boa margem':status==='caution'?'Atenção ao orçamento':'Fora do saldo previsto'}</strong><span>${description}</span></div><div class="vehicle-trade-comparison"><span>Faturas habituais médias <strong>R$ ${fmt(habitual)}/mês</strong></span><span>Faturas + nova prestação <strong>R$ ${fmt(habitual+payment)}/mês</strong></span><span>Saldo mensal previsto atual <strong>R$ ${fmt(balance)}</strong></span><span>Saldo após a nova prestação <strong>R$ ${fmt(after)}</strong></span></div>`;
  }
  bindPage=function(){
    baseBindWithTrade();
    var fields=['tradeCurrentValue','tradeDebt','tradeNewValue','tradeMonths','tradeRate'].map(function(id){return document.getElementById(id)}).filter(Boolean);
    fields.forEach(function(field){field.addEventListener('input',renderTradeEstimate)});
  };
  document.head.insertAdjacentHTML('beforeend','<style>.vehicle-trade-card{margin-top:16px}.vehicle-trade-result{margin-top:14px}.vehicle-trade-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.vehicle-trade-summary>div{display:flex;flex-direction:column;gap:5px;padding:14px;border:1px solid var(--border,rgba(173,187,211,.18));border-radius:12px;background:rgba(255,255,255,.025)}.vehicle-trade-summary small,.vehicle-trade-summary span{color:var(--muted,#98a5bd);font-size:.8rem}.vehicle-trade-summary strong{font:700 1.2rem Manrope,sans-serif;color:var(--text,#f4f5fa)}.vehicle-trade-summary .negative-text,.vehicle-trade-warning{color:#d88a91}.vehicle-trade-budget{display:flex;flex-direction:column;gap:4px;padding:12px 14px;margin:12px 0;border-radius:10px;border:1px solid rgba(173,187,211,.18)}.vehicle-trade-budget.positive{background:rgba(128,197,172,.08);border-color:rgba(128,197,172,.32)}.vehicle-trade-budget.caution{background:rgba(195,157,96,.08);border-color:rgba(195,157,96,.36)}.vehicle-trade-budget.negative{background:rgba(216,138,145,.08);border-color:rgba(216,138,145,.36)}.vehicle-trade-budget span,.vehicle-trade-comparison span{color:var(--muted,#98a5bd);font-size:.85rem}.vehicle-trade-comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px 18px}.vehicle-trade-comparison span{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid rgba(173,187,211,.12)}.vehicle-trade-comparison strong{color:var(--text,#f4f5fa);white-space:nowrap}.vehicle-trade-warning{padding:10px 12px;border-radius:8px;background:rgba(216,138,145,.08)}@media(max-width:600px){.vehicle-trade-comparison span{font-size:.78rem}} </style>');
})();
