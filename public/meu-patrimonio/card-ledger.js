function filterInvoiceCardDetails(container){
  const selectedTab=container.querySelector('[data-invoice-tab].active')?.dataset.invoiceTab||'all',query=(container.querySelector('[data-invoice-search]')?.value||'').trim().toLocaleLowerCase('pt-BR');
  let visible=0;
  container.querySelectorAll('.invoice-ledger-row').forEach(row=>{const shown=(selectedTab==='all'||row.dataset.invoiceType===selectedTab)&&(!query||row.textContent.toLocaleLowerCase('pt-BR').includes(query));row.hidden=!shown;if(shown)visible++});
  const empty=container.querySelector('.invoice-ledger-empty');if(empty)empty.hidden=visible>0;
}
document.addEventListener('click',event=>{const tab=event.target.closest('[data-invoice-tab]');if(!tab)return;const container=tab.closest('.invoice-composition');if(!container)return;container.querySelectorAll('[data-invoice-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});filterInvoiceCardDetails(container)});
document.addEventListener('input',event=>{if(event.target.matches('[data-invoice-search]')){const container=event.target.closest('.invoice-composition');if(container)filterInvoiceCardDetails(container)}});
