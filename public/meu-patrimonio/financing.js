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
root.solveFinancing=solveFinancing;
if(typeof module!=='undefined')module.exports={solveFinancing:solveFinancing};
if(typeof document==='undefined'||typeof planPage!=='function')return;
var nf=function(v,d){return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})};
var parse=function(s){s=String(s||'').trim();if(!s)return null;s=s.replace(/\s|R\$|%/g,'');if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');var v=Number(s);return isFinite(v)?v:NaN};
var basePlan=planPage,baseBind=bindPage;
var fields=[['finN','Nº de meses',''],['finRate','Taxa de juros mensal (%)',''],['finPayment','Valor da prestação (R$)','Considera-se que a 1ª prestação não é no ato'],['finPrincipal','Valor financiado (R$)','Não inclui o valor da entrada']];
planPage=function(){return basePlan()+'<section class="card" style="margin-top:16px"><div class="section-head"><div><h2>Financiamento veicular</h2><p>Prestações fixas (Tabela Price). Preencha 3 campos e deixe em branco o que deseja descobrir.</p></div></div><form id="finForm"><div class="form-grid">'+fields.map(function(f){return '<div class="field"><label for="'+f[0]+'">'+f[1]+'</label><input id="'+f[0]+'" inputmode="decimal" autocomplete="off">'+(f[2]?'<small style="opacity:.7">'+f[2]+'</small>':'')+'</div>'}).join('')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">Calcular</button><button type="button" class="btn secondary" id="finClear">Limpar</button></div></form><div id="finResult" style="margin-top:14px"></div></section>'};
bindPage=function(){baseBind();var form=document.getElementById('finForm');if(!form)return;var ids=['finN','finRate','finPayment','finPrincipal'],out=document.getElementById('finResult');
  document.getElementById('finClear').onclick=function(){ids.forEach(function(id){document.getElementById(id).value=''});out.innerHTML=''};
  form.onsubmit=function(e){e.preventDefault();var v=ids.map(function(id){return parse(document.getElementById(id).value)});
    try{if(v.some(function(x){return Number.isNaN(x)}))throw new Error('Há um número inválido.');
      var r=solveFinancing({n:v[0],rate:v[1],payment:v[2],principal:v[3]});
      document.getElementById('finN').value=nf(r.n,2);document.getElementById('finRate').value=nf(r.rate,6);document.getElementById('finPayment').value=nf(r.payment,2);document.getElementById('finPrincipal').value=nf(r.principal,2);
      out.innerHTML='<p>O total desse financiamento de <strong>'+nf(r.n,2)+'</strong> parcelas de <strong>R$ '+nf(r.payment,2)+'</strong> é <strong>R$ '+nf(r.total,2)+'</strong>, sendo <strong>R$ '+nf(r.interest,2)+'</strong> de juros.</p><p style="opacity:.75">Taxa equivalente anual: '+nf(r.annualRate,2)+'% a.a.</p>';
    }catch(err){out.innerHTML='<p style="color:var(--danger,#c0392b)">'+err.message+'</p>'}};
};
})(typeof window!=='undefined'?window:globalThis);
