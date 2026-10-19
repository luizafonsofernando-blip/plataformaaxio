// Classifica checkboxes visiveis no filtro Usuarios sem registrar nomes,
// emails, HTML ou outros dados pessoais. SOMENTE LEITURA do DOM.
import {usersPortalClassFromTrigger} from './users-portal-menu.mjs';

const KINDS=['option','control','unknown'];
export function summarizeUsersCheckboxKinds(entries) {
  if(!Array.isArray(entries) || entries.some(x=>!x ||
      !KINDS.includes(x.kind) || typeof x.checked!=='boolean' ||
      typeof x.disabled!=='boolean')) {
    throw new Error('Diagnostico de natureza dos checkboxes invalido.');
  }
  const summarize=xs=>({
    count:xs.length,checked:xs.filter(x=>x.checked).length,
    unchecked:xs.filter(x=>!x.checked).length,
    disabled:xs.filter(x=>x.disabled).length,
  });
  const groups=Object.fromEntries(KINDS.map(kind=>[
    kind,summarize(entries.filter(x=>x.kind===kind))]));
  return {total:summarize(entries),groups,allUsersProven:false};
}

export async function inspectUsersCheckboxKinds(page,id){
  const portalClass=usersPortalClassFromTrigger(id);
  const result=await page.evaluate(({id,portalClass})=>{
    const trigger=document.getElementById(id);
    if(!trigger || trigger.getAttribute('aria-expanded')!=='true'){
      return {found:false,reason:'menu_nao_expandido'};
    }
    const rect=trigger.getBoundingClientRect();
    const visible=el=>{
      const box=el.getBoundingClientRect(),style=getComputedStyle(el);
      return box.width>0 && box.height>0 &&
        style.display!=='none' && style.visibility!=='hidden';
    };
    const near=[...document.querySelectorAll('.gestta-multiselect-dropdown__menu')]
      .filter(menu=>{
        if(!visible(menu))return false;
        const r=menu.getBoundingClientRect();
        return r.left<=rect.right+80 && r.right>=rect.left-80 &&
          r.top>=rect.top-30 && r.top<rect.bottom+620;
      });
    const matches=near.filter(menu=>menu.classList.contains(portalClass));
    const strong=matches.length===1 && near.length===1;
    const provisional=matches.length===0 && near.length===1;
    if(!strong && !provisional)return {found:false,reason:'menu_ambiguo'};
    const menu=strong?matches[0]:near[0];
    const norm=s=>String(s??'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim().toUpperCase();
    const list=[...menu.querySelectorAll('input[type="checkbox"]')].map(input=>{
      const li=input.closest('li');
      const label=li?norm(li.textContent):'';
      const isControl=label==='SELECIONAR TODOS'||label==='DESSELECIONAR TODOS';
      // Sem li reconhecido ou sem toggle de item, nao presumir usuario.
      const isOption=li && !isControl &&
        Boolean(li.querySelector('.gestta-multiselect-dropdown__item-toggle'));
      return {kind:isControl?'control':isOption?'option':'unknown',
        checked:Boolean(input.checked),disabled:Boolean(input.disabled)};
    });
    return {found:true,
      association:strong?'uuid_class_confirmed':'geometric_provisional',
      entries:list};
  },{id,portalClass});
  if(!result.found)return result;
  return {found:true,association:result.association,
    ...summarizeUsersCheckboxKinds(result.entries)};
}
