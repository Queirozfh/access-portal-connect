/* A subtle dashboard refresh inspired by compact financial activity cards. */
const originalEnhancedHome = enhancedHome;
function dashboardCategoryCard(month){
  const expenses=typeItems('expense',month), totals=new Map();
  expenses.forEach(item=>{const name=item.category||'Outros';totals.set(name,(totals.get(name)||0)+Number(item.amount||0))});
  const rows=[...totals].sort((a,b)=>b[1]-a[1]),sum=rows.reduce((n,row)=>n+row[1],0),colors=['#c39d60','#82c7ae','#8aa8d1','#c88bb3','#d98d79','#8c92ad'];
  if(!rows.length)return `<section class="card category-spend-card"><div class="section-head"><div><h2>Gastos por categoria</h2><p>${esc(monthLabel(month))}</p></div><span class="category-card-icon">◌</span></div><div class="empty">As categorias aparecerão aqui quando houver despesas no período.</div></section>`;
  const segments=rows.map(([,value],i)=>`<i style="width:${sum?value/sum*100:0}%;--category-color:${colors[i%colors.length]}" aria-hidden="true"></i>`).join('');
  const list=rows.slice(0,5).map(([name,value],i)=>`<div class="category-spend-row"><i style="--category-color:${colors[i%colors.length]}" aria-hidden="true">${name.toLocaleUpperCase('pt-BR').slice(0,1)}</i><span><strong>${esc(name)}</strong><small>${sum?Math.round(value/sum*100):0}% das despesas</small></span><b>${money(value)}</b></div>`).join('');
  return `<section class="card category-spend-card"><div class="section-head"><div><h2>Gastos por categoria</h2><p>${esc(monthLabel(month))} · ${rows.length} ${rows.length===1?'categoria':'categorias'}</p></div><span class="category-card-icon">◌</span></div><strong class="category-spend-total">${money(sum)}</strong><div class="category-spend-bar" role="img" aria-label="Distribuição de gastos por categoria">${segments}</div><div class="category-spend-list">${list}</div></section>`;
}
function dashboardActivityCards(month){
  const rows=db.items.filter(item=>inMonth(item,month)).sort((a,b)=>String(b.due||b.month).localeCompare(String(a.due||a.month))).slice(0,6);
  if(!rows.length)return '<div class="empty"><strong>Nenhum lançamento neste mês</strong>Adicione uma entrada ou despesa para começar.</div>';
  return `<div class="dashboard-activity-list">${rows.map(item=>{const income=item.kind==='income',category=item.category|| (income?'Receita':'Despesa'),letter=category.toLocaleUpperCase('pt-BR').slice(0,1),part=item.installments>1?`Parcela ${item.part||1}/${item.installments} · `:'';return `<article class="dashboard-activity-row"><span class="dashboard-activity-icon ${income?'income':'expense'}" aria-hidden="true">${letter}</span><span class="dashboard-activity-copy"><strong>${esc(item.name)}</strong><small>${esc(category)} · ${part}${esc(monthLabel(item.due||item.month))}</small></span><b class="${income?'positive':'negative'}">${income?'+ ':''}${money(item.amount)}</b></article>`}).join('')}</div>`;
}
enhancedHome=function(){
  const html=originalEnhancedHome();
  if(typeof isBusinessProfile==='function'&&isBusinessProfile())return html;
  const month=selected();
  let refreshed=html.replace('<div class="grid two-col premium-panels">',`${dashboardCategoryCard(month)}<div class="grid two-col premium-panels">`);
  return refreshed;
};
