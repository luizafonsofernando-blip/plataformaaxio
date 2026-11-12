import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.99.2';

export const db=createClient(
  'https://prznhgwiibcazuwlwvnt.supabase.co',
  'sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4',
  {auth:{storage:sessionStorage,storageKey:'luce-auth-ebef',detectSessionInUrl:false}}
);

export async function signIn(identifier,password){
  const response=await fetch('/api/onboarding/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({identifier:identifier.trim().toLowerCase(),password}),
    signal:AbortSignal.timeout(12000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(result.message||'Não foi possível entrar com as credenciais Luce.');
  const {access_token,refresh_token}=result;
  if(!access_token||!refresh_token) throw Error('O portal não retornou uma sessão válida.');
  return check(await db.auth.setSession({access_token,refresh_token})).session;
}
const localKey='luce-ebef-preview-v1';
export const local=()=>JSON.parse(localStorage.getItem(localKey)||'{"rows":[],"rules":[],"audit":[]}');
export const persist=data=>localStorage.setItem(localKey,JSON.stringify(data));
export function check(result){
  if(result.error) throw Error(result.error.message);
  return result.data;
}
export async function all(table){
  const rows=[];
  for(let offset=0;;offset+=500){
    const page=check(await db.from(table).select().order('id').range(offset,offset+499));
    rows.push(...page);
    if(page.length<500) return rows;
  }
}
