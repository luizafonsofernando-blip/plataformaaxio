// Painel E-BEF hospedado: somente GET em API com JWT validado pelo servidor.
// Credenciais do Supabase e registros de clientes jamais aparecem em logs.
(function(){
  'use strict';
  if(document.body.dataset.ebefMode!=='cloud')return;
  const $=id=>document.getElementById(id);
  const session=window.LuceModuleSession?.get();
  if(!session?.access_token)return; // login existente permanece ativo.
  const date=new Date();
  const month=String(date.getFullYear())+'-'+String(date.getMonth()+1).padStart(2,'0');
  $('cloudMonth').value=month;
  let pending=null;
  async function load(){
    const panel=window.LuceEbefPanel;
    const value=$('cloudMonth').value;
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)){
      panel.reset('Selecione um mês válido.',true);return;
    }
    pending?.abort();
    const controller=new AbortController();
    pending=controller;
    $('cloudRefresh').disabled=true;
    panel.reset('Consultando dados autorizados no servidor LUCE…');
    try{
      const url=new URL('/api/ebef/overview',window.location.origin);
      url.searchParams.set('month',value);
      const response=await fetch(url.toString(),{
        method:'GET',cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+session.access_token,Accept:'application/json'},
        signal:controller.signal
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok){
        const errors={
          login_required:'Entre novamente para consultar o E-BEF.',
          session_expired:'Sessão expirada. Entre novamente.',
          access_not_configured:'O acesso ao E-BEF ainda não foi habilitado para usuários.',
          ebef_access_denied:'Seu usuário ainda não possui autorização para visualizar o E-BEF.',
          ebef_database_not_provisioned:'O módulo está preparado, mas a base E-BEF ainda não foi provisionada.',
          ebef_read_unavailable:'Consulta indisponível. Os dados locais continuam preservados.'
        };
        throw Error(errors[result.error]||'Não foi possível consultar os dados E-BEF.');
      }
      if(result?.origin!=='luce_cloud'||result?.month!==value){
        throw Error('Resposta do servidor E-BEF inconsistente.');
      }
      if(pending===controller)panel.load(result);
    }catch(err){
      if(err.name!=='AbortError'&&pending===controller)
        panel.reset(err.message||'Falha na leitura E-BEF.',true);
    }finally{
      if(pending===controller){
        pending=null;$('cloudRefresh').disabled=false;
      }
    }
  }
  $('cloudRefresh').addEventListener('click',()=>void load());
  $('cloudMonth').addEventListener('change',()=>void load());
  $('cloudLogout').addEventListener('click',()=>window.LuceModuleSession?.logout());
  void load();
})();
