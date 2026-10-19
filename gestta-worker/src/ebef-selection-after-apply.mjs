// Homologacao E-BEF apos Filtrar: inspeciona as tres opcoes efetivamente
// marcadas, sem confiar no texto resumido do seletor e sem baixar XLSX.
// Pesquisa no dropdown nao modifica registros no Gestta.
import {validateEbefOptionNames,taskSearchLocator,ebefMenuItemsLocator,menuItemCheckbox}
  from './task-filter.mjs';

export function assertEbefThreeSelected(records) {
  if(!Array.isArray(records) || records.length!==3 ||
     records.some(item=>!item || typeof item.name!=='string' ||
       typeof item.checked!=='boolean')) {
    throw new Error('Selecao E-BEF pos-Filtrar: estrutura diferente de tres checkboxes.');
  }
  validateEbefOptionNames(records.map(item=>item.name));
  if(records.some(item=>item.checked!==true)){
    throw new Error('Selecao E-BEF pos-Filtrar: existe checkbox desmarcado.');
  }
  return {found:3,checked:3,completeRendered:true};
}

export async function verifyEbefCheckboxesAfterApply(page) {
  const trigger=page.locator('#gestta-multiselect-dropdown-5-p');
  if(await trigger.count()!==1 || !(await trigger.isVisible())) {
    throw new Error('Seletor E-BEF pos-Filtrar ausente ou ambiguo.');
  }
  // Nao clicar em X, botoes internos nem controles de filtros adjacentes.
  const hit=await trigger.evaluate(el=>{
    const r=el.getBoundingClientRect();
    if(r.width<70 || r.height<10 || r.height>110){
      return {safe:false,reason:'dimensoes'};
    }
    const x=Math.min(12,Math.floor(r.width/4)),y=Math.floor(r.height/2);
    const node=document.elementFromPoint(r.left+x,r.top+y);
    if(!node || !(el===node || el.contains(node))){
      return {safe:false,reason:'ponto_encoberto'};
    }
    for(let parent=node;parent&&parent!==el;parent=parent.parentElement){
      if(parent.matches('a,button,input,[role="button"]')){
        return {safe:false,reason:'controle_secundario'};
      }
    }
    return {safe:true,x,y};
  });
  if(!hit.safe)throw new Error('Abertura segura do filtro E-BEF nao confirmada: '+hit.reason);
  if(await trigger.getAttribute('aria-expanded')!=='true'){
    await trigger.click({position:{x:hit.x,y:hit.y},timeout:10000});
  }
  if(await trigger.getAttribute('aria-expanded')!=='true'){
    throw new Error('Dropdown E-BEF nao confirmou abertura pos-Filtrar.');
  }

  const search=taskSearchLocator(page);
  try{await search.first().waitFor({state:'visible',timeout:15000});}
  catch{throw new Error('Busca E-BEF nao apareceu apos abrir filtro.');}
  if(await search.count()!==1 || !(await search.isVisible())){
    throw new Error('Busca E-BEF pos-Filtrar ausente ou ambigua.');
  }
  await search.fill('bef',{timeout:10000});
  if((await search.inputValue()).trim().toLowerCase()!=='bef'){
    throw new Error('Busca E-BEF pos-Filtrar nao confirmou termo.');
  }
  const rows=ebefMenuItemsLocator(page);
  try{await rows.nth(2).waitFor({state:'attached',timeout:15000});}
  catch{throw new Error('Menos de 3 itens E-BEF visiveis no DOM apos Filtrar.');}
  if(await rows.count()!==3){
    throw new Error('Busca E-BEF pos-Filtrar nao retornou exatamente 3 opcoes.');
  }

  const records=[];
  for(let i=0;i<3;i++){
    const row=rows.nth(i);
    await row.scrollIntoViewIfNeeded({timeout:10000});
    if(!(await row.isVisible())){
      throw new Error('Item E-BEF pos-Filtrar nao esta visivel.');
    }
    const checkbox=menuItemCheckbox(row);
    if(await checkbox.count()!==1 || !(await checkbox.isVisible())){
      throw new Error('Checkbox E-BEF pos-Filtrar nao e unico e visivel.');
    }
    records.push({name:(await row.innerText()).trim(),checked:await checkbox.isChecked()});
  }
  // Nao imprimir nomes brutos no terminal.
  return assertEbefThreeSelected(records);
}
