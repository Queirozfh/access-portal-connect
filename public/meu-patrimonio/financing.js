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
          +'</body></html>');
        w.document.close();w.focus();w.print();
      };
    }catch(err){report.innerHTML='<p style="color:var(--danger,#c0392b)">'+err.message+'</p>'}};
};
})(typeof window!=='undefined'?window:globalThis);
