// Somente controles de filtro visual do Gestta. Não modifica tarefas,
// não clica em Filtrar e não acessa dados dos usuários além de checkboxes.
import {inspectUsersPopup} from './users-filter-inspection.mjs';

export function requireSelectAllConsent(args) {
  if(args.length!==1 || args[0]!=='--confirm-select-all'){
    throw new Error('Teste exige apenas --confirm-select-all.');
  }
  return true;
}

export function validateUsersBeforeSelect(info) {
  if(!info || info.found!==true ||
     !['uuid_class_confirmed','geometric_provisional'].includes(info.menuAssociation) ||
     info.nearbyMenus!==1 || info.controlCount!==1 ||
     info.disabledInputCount!==0 || info.unknownInputCount!==0 ||
     info.inputCheckboxCount<1 || info.uncheckedCount<1 ||
     info.checkedCount+info.uncheckedCount!==info.inputCheckboxCount) {
    throw new Error('Menu Usuarios nao validado para selecionar todos. Nada sera marcado.');
  }
  return true;
}

export async function inspectSelectAllTarget(page,id) {
  if(!/^gestta-multiselect-dropdown-\d+-p$/.test(id)){
    throw new Error('Identificador do campo Usuarios invalido.');
  }
  const raw=await page.evaluate(id=>{
    const trigger=document.getElementById(id);
    if(!trigger || trigger.getAttribute('aria-expanded')!=='true') {
      return {safe:false,reason:'gatilho_nao_expandido'};
    }
    const container=trigger.closest('.mixed-topfilter__filter--user');
    if(!container || !container.contains(trigger)){
      return {safe:false,reason:'fora_da_secao_usuarios'};
    }
    const rect=trigger.getBoundingClientRect();
    const menus=[...document.querySelectorAll('.gestta-multiselect-dropdown__menu')];
    const visible=el=>{
      const r=el.getBoundingClientRect(),css=getComputedStyle(el);
      return r.width>0&&r.height>0&&css.display!=='none'&&css.visibility!=='hidden';
    };
    const near=menus.map((menu,index)=>({menu,index})).filter(({menu})=>{
      if(!visible(menu))return false;
      const r=menu.getBoundingClientRect();
      return r.left<=rect.right+80&&r.right>=rect.left-80&&
        r.top>=rect.top-30&&r.top<rect.bottom+620;
    });
    if(near.length!==1)return {safe:false,reason:'menus_proximos_ambiguos'};
    const {menu,index}=near[0];
    const norm=s=>String(s??'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
    const selectItems=[...menu.querySelectorAll('li')]
      .filter(li=>norm(li.textContent)==='SELECIONAR TODOS');
    if(selectItems.length!==1)return {
      safe:false,reason:'selecionar_todos_nao_unico',
      matches:selectItems.length,
    };
    const item=selectItems[0];
    const anchors=[...item.querySelectorAll('a')].filter(visible);
    if(anchors.length!==1)return {
      safe:false,reason:'link_de_selecao_ambiguo',matches:anchors.length,
    };
    const inputs=[...menu.querySelectorAll('input[type="checkbox"]')];
    const unchecked=inputs.filter(input=>!input.checked).length;
    if(!inputs.length || !unchecked){
      return {safe:false,reason:'checkboxes_ja_marcados_ou_ausentes'};
    }
    return {
      safe:true,menuIndex:index,nearbyMenus:near.length,
      selectAllCount:selectItems.length,
      checkboxCount:inputs.length,uncheckedCount:unchecked,
    };
  },id);
  return raw;
}

export async function selectUsersAllVisualOnly(page,id,before){
  validateUsersBeforeSelect(before);
  const target=await inspectSelectAllTarget(page,id);
  if(!target.safe){
    throw new Error('Acao Selecionar todos bloqueada: '+target.reason);
  }
  const menu=page.locator('.gestta-multiselect-dropdown__menu').nth(target.menuIndex);
  const select=menu.locator('li').filter({
    hasText:/^\s*Selecionar todos\s*$/i,
  }).locator('a');
  const count=await select.count();
  if(count!==1 || !(await select.isVisible()) || !(await select.isEnabled())){
    throw new Error('Link Selecionar todos ausente, oculto ou ambiguo.');
  }
  // Confirmar que o mesmo menu ainda está sob o campo expandido antes
  // do clique. Não confiar num índice de lista caso a tela tenha mudado.
  const recheck=await inspectSelectAllTarget(page,id);
  if(!recheck.safe || recheck.menuIndex!==target.menuIndex ||
     recheck.checkboxCount!==target.checkboxCount ||
     recheck.uncheckedCount!==target.uncheckedCount){
    throw new Error('O menu Usuarios mudou antes do clique. Nada foi marcado.');
  }
  await select.click({timeout:15000});
  let after;
  for(let i=0;i<5;i++){
    await page.waitForTimeout(800);
    after=await inspectUsersPopup(page,id);
    if(after.found && after.inputCheckboxCount===before.inputCheckboxCount &&
       after.checkedCount===before.inputCheckboxCount &&
       after.uncheckedCount===0 && after.unknownInputCount===0){
      return {beforeChecked:before.checkedCount,afterChecked:after.checkedCount,
        visibleCheckboxes:after.inputCheckboxCount,confirmedRendered:true,
        allUsersProven:false};
    }
    // Sem segundo clique; uma tentativa de selecionar todos é suficiente.
  }
  throw new Error('O Gestta nao confirmou todos os checkboxes apos o clique. '+
    'Nao houve Filtrar, exportacao ou sincronizacao.');
}
