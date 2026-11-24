import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const attempts=new Map<string,{count:number;until:number}>();

export const Route=createFileRoute('/api/public/register')({
  server:{handlers:{POST:async({request})=>{
    const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown';
    const now=Date.now();let attempt=attempts.get(ip);
    if(!attempt||attempt.until<=now){attempt={count:0,until:now+15*60*1000};attempts.set(ip,attempt)}
    if(attempt.count>=5)return json({error:'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.'},429);
    attempt.count++;
    let body:{email?:unknown;password?:unknown};try{body=await request.json()}catch{return json({error:'Dados do cadastro inválidos.'},400)}
    const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>255)return json({error:'Informe um e-mail válido.'},400);
    if(password.length<8||password.length>72)return json({error:'A senha deve ter entre 8 e 72 caracteres.'},400);
    const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_PUBLISHABLE_KEY'];
    if(!url||!key)return json({error:'O cadastro está temporariamente indisponível.'},503);
    const authClient=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await authClient.auth.signUp({email,password});
    if(error)return json({error:'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.'},400);
    const user=data.user;
    if(!user)return json({error:'Não foi possível concluir o cadastro. Tente novamente.'},400);
    if(Array.isArray(user.identities)&&user.identities.length===0)return json({ok:true,confirmationRequired:true});
    try{
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      const {data:fresh,error:lookupError}=await supabaseAdmin.auth.admin.getUserById(user.id);
      if(lookupError||!fresh.user)throw new Error('Cadastro indisponível.');
      const metadata=(fresh.user.app_metadata||{}) as Record<string,unknown>;
      const [{error:levelError},{error:stateError}]=await Promise.all([
        supabaseAdmin.auth.admin.updateUserById(user.id,{app_metadata:{...metadata,access_level:1}}),
        supabaseAdmin.from('app_state').upsert({id:user.id,json:JSON.stringify({v:1,titular:'Eu',people:[],incomes:[],bills:[],purchases:[],received:[],hidden:[]}),updated_at:new Date().toISOString()}),
      ]);
      if(levelError||stateError)throw new Error('Cadastro indisponível.');
    }catch{
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      await supabaseAdmin.auth.admin.deleteUser(user.id).catch(()=>{});
      await supabaseAdmin.from('app_state').delete().eq('id',user.id);
      return json({error:'Não foi possível preparar a conta. Tente novamente mais tarde.'},503);
    }
    return json({ok:true,confirmationRequired:!data.session,session:data.session});
  }}}
});
