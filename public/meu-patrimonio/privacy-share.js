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
function pixField(id,value){value=String(value);return id+String(value.length).padStart(2,'0')+value}
function pixCrc16(value){let crc=0xFFFF;for(let i=0;i<value.length;i++){crc^=value.charCodeAt(i)<<8;for(let bit=0;bit<8;bit++)crc=crc&0x8000?(crc<<1)^0x1021:crc<<1;crc&=0xFFFF}return crc.toString(16).toUpperCase().padStart(4,'0')}
function pixSafeText(value,max){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)||'NAO INFORMADO'}
function pixPaymentPayload(key,receiver,city,amount){
  const merchant=pixField('00','br.gov.bcb.pix')+pixField('01',key.trim()),additional=pixField('05','***');
  const value='000201010211'+pixField('26',merchant)+'52040000'+'5303986'+pixField('54',Number(amount).toFixed(2))+'5802BR'+pixField('59',pixSafeText(receiver,25))+pixField('60',pixSafeText(city,15))+pixField('62',additional)+'6304';
  return value+pixCrc16(value)
}
function currentPersonBill(person){
  const group=monthStats(selected()).groups[person];if(!group?.items?.length)return null;
  return{person,month:selected(),items:group.items,total:Number(group.total||0),received:Number(group.received||0),open:Number(group.open||0)}
}
function openPixDetailsSettings(){
  showModal('Dados para QR Pix','<div class="field"><label>Chave Pix</label><textarea name="pix" required maxlength="2000">'+esc(db.settings.pix||'')+'</textarea><small>Informe a chave cadastrada no banco. O QR é criado localmente para cada valor em aberto.</small></div><div class="form-grid"><div class="field"><label>Nome do recebedor</label><input name="pixRecipientName" required maxlength="25" value="'+esc(db.settings.pixRecipientName||ownerName())+'"></div><div class="field"><label>Cidade da conta</label><input name="pixCity" required maxlength="15" value="'+esc(db.settings.pixCity||'Fortaleza')+'"></div></div>',()=>{
    const values=Object.fromEntries(new FormData(document.querySelector('#modalForm')).entries());
    db.settings.pix=String(values.pix||'').trim();db.settings.pixRecipientName=pixSafeText(values.pixRecipientName,25);db.settings.pixCity=pixSafeText(values.pixCity,15);
    save();toast('Dados Pix salvos')
  })
}
openPixSettings=openPixDetailsSettings;
function createBillCardCanvas(bill,payload){
  const qr=qrcode(0,'M');qr.addData(payload);qr.make();
  const qrImage=new Image(),canvas=document.createElement('canvas'),rowHeight=64,width=1000,header=280,footer=450;
  canvas.width=width;canvas.height=header+bill.items.length*rowHeight+footer;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,width,canvas.height);gradient.addColorStop(0,'#242a38');gradient.addColorStop(1,'#171b26');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,canvas.height);
  ctx.strokeStyle='#c39d60';ctx.lineWidth=4;ctx.strokeRect(28,28,width-56,canvas.height-56);
  ctx.fillStyle='#c39d60';ctx.font='700 24px Arial';ctx.fillText('MEU PATRIMONIO',64,78);
  ctx.fillStyle='#eef1f7';ctx.font='700 38px Arial';ctx.fillText('Resumo de despesas',64,140);
  ctx.fillStyle='#abb3c4';ctx.font='24px Arial';ctx.fillText(bill.person+' · '+longMonthLabel(bill.month),64,190);
  ctx.fillStyle='#c39d60';ctx.font='700 20px Arial';ctx.fillText('ITENS',64,245);
  bill.items.forEach((item,index)=>{const y=header+index*rowHeight;ctx.fillStyle='#eef1f7';ctx.font='22px Arial';ctx.fillText(String(item.name||'').slice(0,48),64,y);if(item.installments>1){ctx.fillStyle='#abb3c4';ctx.font='16px Arial';ctx.fillText('Parcela '+(item.part||1)+'/'+item.installments,64,y+24)}ctx.textAlign='right';ctx.fillStyle='#eef1f7';ctx.font='600 22px Arial';ctx.fillText(money(item.amount),width-64,y);ctx.textAlign='left';ctx.strokeStyle='#394152';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(64,y+36);ctx.lineTo(width-64,y+36);ctx.stroke()});
  const totalsY=header+bill.items.length*rowHeight+30;ctx.fillStyle='#abb3c4';ctx.font='22px Arial';ctx.fillText('TOTAL DOS ITENS',64,totalsY);ctx.textAlign='right';ctx.fillStyle='#eef1f7';ctx.font='700 30px Arial';ctx.fillText(money(bill.total),width-64,totalsY);ctx.textAlign='left';
  ctx.fillStyle='#abb3c4';ctx.font='20px Arial';ctx.fillText('EM ABERTO',64,totalsY+54);ctx.fillStyle='#c39d60';ctx.font='700 36px Arial';ctx.fillText(money(bill.open),64,totalsY+104);
  return new Promise((resolve,reject)=>{qrImage.onload=()=>{ctx.fillStyle='#fff';ctx.fillRect(width-330,totalsY+25,260,260);ctx.drawImage(qrImage,width-325,totalsY+30,250,250);ctx.fillStyle='#abb3c4';ctx.font='18px Arial';ctx.textAlign='center';ctx.fillText('PAGUE COM PIX',width-200,totalsY+315);ctx.fillText('QR gerado para o valor em aberto',width-200,totalsY+343);ctx.textAlign='left';ctx.fillStyle='#abb3c4';ctx.font='16px Arial';ctx.fillText('QR estático · confira os dados no app do banco',64,canvas.height-56);resolve(canvas)};qrImage.onerror=reject;qrImage.src=qr.createDataURL(8,4)})
}
async function openPersonBillCard(person){
  const bill=currentPersonBill(person);if(!bill)return;
  if(!db.settings.pix){toast('Cadastre a chave Pix e os dados do recebedor.');openPixDetailsSettings();return}
  if(bill.open<=0){toast('Não há valor em aberto para gerar QR de pagamento.');return}
  const payload=pixPaymentPayload(db.settings.pix,db.settings.pixRecipientName||ownerName(),db.settings.pixCity||'Fortaleza',bill.open),message=collectionMessage(person,monthLabel(bill.month),monthStats(bill.month).groups[person],db.settings.pix);
  let canvas;try{canvas=await createBillCardCanvas(bill,payload)}catch{toast('Não foi possível criar o QR Pix neste navegador.');return}
  const dataUrl=canvas.toDataURL('image/png');
  showModal('Cartão Pix · '+person,'<div class="bill-card-preview"><img alt="Resumo visual de cobrança com QR Pix" src="'+dataUrl+'"><div class="bill-card-actions"><button type="button" class="btn secondary" id="saveBillCard">Salvar imagem</button><button type="button" class="btn primary" id="shareBillCard">Compartilhar imagem</button><button type="button" class="btn secondary" id="openBillWhatsApp">Abrir WhatsApp</button></div><small>QR Pix com valor em aberto. Confira beneficiário e valor antes de confirmar no banco.</small></div>',()=>{});
  const save=()=>new Promise(resolve=>canvas.toBlob(blob=>{if(!blob){toast('Não foi possível salvar a imagem.');resolve();return}const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='cobranca-'+person.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+bill.month+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);resolve()},'image/png'));
  document.querySelector('#saveBillCard').onclick=save;
  document.querySelector('#shareBillCard').onclick=async()=>{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)return;const file=new File([blob],'resumo-pix.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Resumo Pix · '+person,text:'Resumo de '+longMonthLabel(bill.month)})}catch(error){if(error.name!=='AbortError')toast('Compartilhamento cancelado. Você ainda pode salvar a imagem.')}}else{await save();toast('Imagem salva. Anexe-a à conversa no WhatsApp.')}}
  document.querySelector('#openBillWhatsApp').onclick=()=>{document.querySelector('#modal').close();if(!openWhatsAppChat(db.settings.peoplePhones?.[person],message)){toast('Cadastre o WhatsApp de '+person+' em Ajustes → Pessoas.');setPage('ajustes')}}
}
const collectionPageWithBillCard=collectionPage;
collectionPage=function(){return collectionPageWithBillCard().replace(/(<button class="btn secondary" data-action="whatsapp" data-id="([^"]+)"[^>]*>↗ WhatsApp<\/button>)/g,'$1<button type="button" class="btn secondary" data-action="bill-card" data-id="$2">Cartão visual</button>')};
