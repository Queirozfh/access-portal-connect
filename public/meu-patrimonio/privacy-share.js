const DEVICE_LOCK_PREFIX='cdm-device-biometric:';
function deviceBiometricConfigKey(){return DEVICE_LOCK_PREFIX+String(authUser?.id||accountRow||'profile')}
function deviceBiometricConfig(){try{return JSON.parse(localStorage.getItem(deviceBiometricConfigKey())||'null')}catch{return null}}
function deviceBiometricLockEnabled(){return !!deviceBiometricConfig()?.credentialId}
function toBase64Url(bytes){let binary='';for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromBase64Url(text){let value=text.replace(/-/g,'+').replace(/_/g,'/');while(value.length%4)value+='=';return Uint8Array.from(atob(value),char=>char.charCodeAt(0))}
function webAuthnAvailable(){return isSecureContext&&!!navigator.credentials&&!!window.PublicKeyCredential}
async function enableDeviceBiometrics(){
  try{
    if(!webAuthnAvailable()||!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable)throw Error('Este navegador não oferece biometria de plataforma neste endereço seguro.');
    if(!await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())throw Error('Não foi encontrada biometria configurada neste aparelho.');
    const challenge=crypto.getRandomValues(new Uint8Array(32)),userId=new TextEncoder().encode(String(authUser?.id||accountRow||'profile'));
    const credential=await navigator.credentials.create({publicKey:{challenge,rp:{name:'Meu Patrimônio',id:location.hostname},user:{id:userId,name:authUser?.email||'perfil',displayName:authUser?.name||'Meu Patrimônio'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'discouraged',userVerification:'required'},timeout:60000,attestation:'none'}});
    if(!credential)throw Error('O aparelho não concluiu o cadastro biométrico.');
    localStorage.setItem(deviceBiometricConfigKey(),JSON.stringify({credentialId:toBase64Url(credential.rawId),rpId:location.hostname,createdAt:new Date().toISOString()}));
    toast('Biometria ativada neste aparelho.');render();
  }catch(error){toast(error.message==='NotAllowedError'?'Cadastro biométrico cancelado.':error.message||'Não foi possível ativar a biometria.')}
}
function showDeviceBiometricLock(){
  if(!deviceBiometricLockEnabled()||!authUser)return;
  document.querySelector('#modal')?.open&&document.querySelector('#modal').close();
  document.body.classList.add('device-biometric-locked');
  let gate=document.getElementById('deviceBiometricGate');
  if(!gate){gate=document.createElement('section');gate.id='deviceBiometricGate';gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');document.body.append(gate)}
  gate.innerHTML='<div class="device-biometric-card"><div class="device-biometric-icon">◉</div><div class="eyebrow">MEU PATRIMÔNIO</div><h1>App protegido</h1><p>Confirme sua identidade com a biometria deste aparelho para ver seus dados.</p><button type="button" class="btn primary" id="deviceBiometricUnlock">Desbloquear com biometria</button><button type="button" class="btn secondary" id="deviceBiometricPassword">Sair e entrar com senha</button><small id="deviceBiometricError" aria-live="polite"></small></div>';
  gate.querySelector('#deviceBiometricUnlock').onclick=unlockWithDeviceBiometrics;
  gate.querySelector('#deviceBiometricPassword').onclick=()=>{localStorage.removeItem(deviceBiometricConfigKey());if(window.doLogout)window.doLogout();else{localStorage.removeItem('cdm-sessao');location.reload()}};
  gate.querySelector('#deviceBiometricUnlock').focus();
}
async function unlockWithDeviceBiometrics(){
  const config=deviceBiometricConfig(),errorNode=document.querySelector('#deviceBiometricError');
  try{
    if(!config?.credentialId||!webAuthnAvailable())throw Error('Biometria indisponível neste navegador.');
    const assertion=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:config.rpId||location.hostname,allowCredentials:[{type:'public-key',id:fromBase64Url(config.credentialId)}],userVerification:'required',timeout:60000}});
    if(!assertion||toBase64Url(assertion.rawId)!==config.credentialId)throw Error('A credencial deste aparelho não confere.');
    const authData=new Uint8Array(assertion.response.authenticatorData);
    if(authData.length<33||(authData[32]&4)===0)throw Error('O aparelho não confirmou a biometria.');
    document.body.classList.remove('device-biometric-locked');document.getElementById('deviceBiometricGate')?.remove();refreshAccess();
  }catch(error){if(errorNode)errorNode.textContent=error.name==='NotAllowedError'?'Biometria cancelada ou não reconhecida. Tente novamente.':error.message||'Não foi possível desbloquear.'}
}
function deviceBiometricSettingsPanel(){
  const enabled=deviceBiometricLockEnabled(),supported=webAuthnAvailable();
  return '<div class="spacer"></div><section class="card"><div class="section-head"><div><h2>Trava biométrica deste aparelho</h2><p>Ao voltar ao app após deixá-lo em segundo plano, os valores ficam ocultos até o desbloqueio.</p></div><span class="stat-icon">◉</span></div><p class="metric">'+(enabled?'Ativada somente neste navegador e neste perfil.':'A biometria acrescenta uma trava visual local depois do login da conta.')+'</p><div class="person-ledger-actions">'+(enabled?'<button type="button" class="btn secondary" data-action="device-biometric-disable">Desativar neste aparelho</button>':supported?'<button type="button" class="btn primary" data-action="device-biometric-enable">Ativar biometria</button>':'<button type="button" class="btn secondary" disabled>Requer navegador compatível e HTTPS</button>')+'</div><small>Usa Face ID, Touch ID, Windows Hello ou a biometria oferecida pelo sistema. O aparelho pode oferecer o código de desbloqueio como alternativa.</small></section>'
}
const settingsWithDeviceBiometrics=settingsWithOwner;
settingsWithOwner=function(){return settingsWithDeviceBiometrics()+deviceBiometricSettingsPanel()};
const actWithDeviceBiometrics=act;
act=function(action,id,index){
  if(action==='device-biometric-enable'){enableDeviceBiometrics();return}
  if(action==='device-biometric-disable'){localStorage.removeItem(deviceBiometricConfigKey());document.body.classList.remove('device-biometric-locked');document.getElementById('deviceBiometricGate')?.remove();toast('Trava biométrica desativada neste aparelho.');render();return}
  if(action==='bill-card'){openPersonBillCard(id);return}
  actWithDeviceBiometrics(action,id,index)
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&authUser&&deviceBiometricLockEnabled())showDeviceBiometricLock()});
function currentPersonBill(person){
  const group=monthStats(selected()).groups[person];if(!group?.items?.length)return null;
  return{person,month:selected(),items:group.items,total:Number(group.total||0),received:Number(group.received||0),open:Number(group.open||0)}
}
function createBillCardCanvas(bill){
  const canvas=document.createElement('canvas'),rowHeight=64,width=1000,header=280,footer=70;
  canvas.width=width;canvas.height=header+bill.items.length*rowHeight+footer;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,width,canvas.height);gradient.addColorStop(0,'#242a38');gradient.addColorStop(1,'#171b26');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,canvas.height);
  ctx.strokeStyle='#c39d60';ctx.lineWidth=4;ctx.strokeRect(28,28,width-56,canvas.height-56);
  ctx.fillStyle='#c39d60';ctx.font='700 24px Arial';ctx.fillText('MEU PATRIMONIO',64,78);
  ctx.fillStyle='#eef1f7';ctx.font='700 38px Arial';ctx.fillText('Resumo de despesas',64,140);
  ctx.fillStyle='#abb3c4';ctx.font='24px Arial';ctx.fillText(bill.person+' · '+longMonthLabel(bill.month),64,190);
  ctx.fillStyle='#c39d60';ctx.font='700 20px Arial';ctx.fillText('ITENS',64,245);
  bill.items.forEach((item,index)=>{const y=header+index*rowHeight;ctx.fillStyle='#eef1f7';ctx.font='22px Arial';ctx.fillText(String(item.name||'').slice(0,48),64,y);if(item.installments>1){ctx.fillStyle='#abb3c4';ctx.font='16px Arial';ctx.fillText('Parcela '+(item.part||1)+'/'+item.installments,64,y+24)}ctx.textAlign='right';ctx.fillStyle='#eef1f7';ctx.font='600 22px Arial';ctx.fillText(money(item.amount),width-64,y);ctx.textAlign='left';ctx.strokeStyle='#394152';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(64,y+36);ctx.lineTo(width-64,y+36);ctx.stroke()});
  return canvas
}
async function openPersonBillCard(person){
  const bill=currentPersonBill(person);if(!bill)return;
  const group=monthStats(bill.month).groups[person],pix=db.settings.pix||'';
  let message=collectionMessage(person,monthLabel(bill.month),group,pix);if(!pix)message=message.replace('\nPix: \n','\n');
  const canvas=createBillCardCanvas(bill),dataUrl=canvas.toDataURL('image/png');
  showModal('Resumo visual · '+person,'<div class="bill-card-preview"><img alt="Resumo visual das despesas" src="'+dataUrl+'"><div class="bill-card-actions"><button type="button" class="btn secondary" id="saveBillCard">Salvar imagem</button><button type="button" class="btn primary" id="shareBillCard">Compartilhar imagem</button><button type="button" class="btn secondary" id="openBillWhatsApp">Abrir WhatsApp</button></div><small>Imagem somente com os itens e seus valores, sem QR Pix.</small></div>',()=>{});
  const save=()=>new Promise(resolve=>canvas.toBlob(blob=>{if(!blob){toast('Não foi possível salvar a imagem.');resolve();return}const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='resumo-despesas-'+person.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+bill.month+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);resolve()},'image/png'));
  document.querySelector('#saveBillCard').onclick=save;
  document.querySelector('#shareBillCard').onclick=async()=>{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)return;const file=new File([blob],'resumo-despesas.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Resumo de despesas · '+person,text:'Resumo de '+longMonthLabel(bill.month)})}catch(error){if(error.name!=='AbortError')toast('Compartilhamento cancelado. Você ainda pode salvar a imagem.')}}else{await save();toast('Imagem salva. Anexe-a à conversa no WhatsApp.')}}
  document.querySelector('#openBillWhatsApp').onclick=()=>{document.querySelector('#modal').close();if(!openWhatsAppChat(db.settings.peoplePhones?.[person],message)){toast('Cadastre o WhatsApp de '+person+' em Ajustes → Pessoas.');setPage('ajustes')}}
}
const collectionPageWithBillCard=collectionPage;
collectionPage=function(){return collectionPageWithBillCard().replace(/(<button class="btn secondary" data-action="whatsapp" data-id="([^"]+)"[^>]*>↗ WhatsApp<\/button>)/g,'$1<button type="button" class="btn secondary" data-action="bill-card" data-id="$2">Cartão visual</button>')};
