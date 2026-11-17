import {completeCnpj} from './domain.js';

const lookups=new WeakMap();

export async function qsaForSave(form,cnpj){
  const lookup=lookups.get(form);
  if(!lookup) return undefined;
  await lookup.finish();
  return lookup.result?.cnpj===cnpj?lookup.result.partners:undefined;
}

export function attachCompanyLookup(form,dialog,{autofill=true,getAccessToken,savedQsa}={}){
  const {cnpj,company,establishment}=form.elements;
  const status=form.querySelector('#lookup-status');
  const button=form.querySelector('#lookup-cnpj');
  const qsa=form.querySelector('#lookup-qsa');
  const entries=form.querySelector('#lookup-qsa-entries');
  let timer,request,lastCnpj=completeCnpj(cnpj.value),filled=new Map();
  const lookupState={finish(){
    if(timer!==undefined) startLookup();
    return lookupState.pending;
  }};
  lookups.set(form,lookupState);

  function reset(){
    clearTimeout(timer);
    timer=undefined;
    request?.abort();
    request=null;
    button.disabled=false;
  }

  function showQsa(partners){
    entries.replaceChildren();
    if(partners?.length){
      const list=document.createElement('ul');
      for(const partner of partners){
        const item=document.createElement('li');
        item.textContent=[partner.name,partner.type,partner.qualification].filter(Boolean).join(' · ');
        list.append(item);
      }
      entries.append(list);
    }else{
      entries.textContent=partners?'A consulta não encontrou integrantes no QSA.':'A base consultada não disponibilizou o QSA.';
    }
    qsa.hidden=false;
  }

  if(Array.isArray(savedQsa)){
    showQsa(savedQsa);
    status.textContent='QSA salvo nesta declaração.';
  }

  async function lookup(){
    reset();
    const value=completeCnpj(cnpj.value);
    if(!value){
      status.textContent='Informe um CNPJ completo para consultar.';
      return;
    }
    const controller=new AbortController();
    request=controller;
    button.disabled=true;
    status.textContent='Consultando dados cadastrais…';
    const previous=new Map([[company,company.value],[establishment,establishment.value]]);
    try{
      const accessToken=await getAccessToken?.();
      if(controller.signal.aborted) return;
      const response=await fetch('/api/cnpj/'+encodeURIComponent(value)+'?module=ebef',{
        headers:accessToken?{Authorization:'Bearer '+accessToken}:{},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])
      });
      const data=await response.json();
      if(!response.ok) throw Error(data.error||'Consulta indisponível.');
      if(request!==controller||!dialog.open||!form.isConnected||completeCnpj(cnpj.value)!==value) return;
      for(const [field,result] of autofill?[[company,data.legalName],[establishment,data.establishment]]:[]){
        if(result&&field.value===previous.get(field)){
          field.value=result;
          filled.set(field,result);
        }
      }
      if(Array.isArray(data.qsa)){
        lookupState.result={cnpj:value,partners:data.qsa};
        showQsa(data.qsa);
      }else if(!lookupState.result&&!(Array.isArray(savedQsa)&&value===originalCnpj)){
        showQsa(null);
      }
      status.textContent=Array.isArray(data.qsa)?'QSA consultado. Será gravado ao salvar a declaração.':'A consulta não disponibilizou o QSA.';
    }catch(error){
      if(!controller.signal.aborted&&form.isConnected&&dialog.open){
        status.textContent=(error.name==='TimeoutError'?'A consulta demorou demais.':error.message)+' Você pode tentar novamente ou preencher os dados manualmente.';
      }
    }finally{
      if(request===controller){request=null;button.disabled=false;}
    }
  }

  const originalCnpj=lastCnpj;
  const startLookup=()=>{lookupState.pending=lookup();};
  cnpj.addEventListener('input',()=>{
    const value=completeCnpj(cnpj.value);
    if(value===lastCnpj) return;
    lastCnpj=value;
    lookupState.result=undefined;
    qsa.hidden=true;
    reset();
    for(const [field,previous] of filled){
      if(field.value===previous) field.value=field===establishment?'Matriz':'';
    }
    filled=new Map();
    status.textContent='';
    if(value===originalCnpj&&Array.isArray(savedQsa)){
      showQsa(savedQsa);
      status.textContent='QSA salvo nesta declaração.';
    }
    if(value) timer=setTimeout(startLookup,350);
  });
  button.addEventListener('click',startLookup);
  dialog.addEventListener('close',reset,{once:true});
}
