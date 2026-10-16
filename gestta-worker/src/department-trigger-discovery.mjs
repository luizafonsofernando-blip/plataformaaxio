import { inspectDepartmentTriggerLayout } from './department-trigger-layout.mjs';
// Encontra o dropdown de Departamento quando o Gestta mantém seleções
// e deixa de exibir "Todos departamentos" (ex.: "Contábil +16").
// Nunca clica por índice, por texto do departamento ou em botão X.
// Apenas identifica um ID de dropdown relacionado ao título Departamento.
export function validateDepartmentTriggerDiscovery(diagnostic) {
  if (!diagnostic || diagnostic.labelCount!==1 || diagnostic.candidateCount!==1 ||
      !/^gestta-multiselect-dropdown-\d+-p$/.test(diagnostic.candidateId||'') ||
      diagnostic.depth < 1 || diagnostic.depth > 5) {
    throw new Error('Campo Departamento preenchido: contêiner não identificado '+
      'de forma segura (titulos='+ (diagnostic?.labelCount ?? '?')+
      '; candidatos='+ (diagnostic?.candidateCount ?? '?')+
      '; profundidade='+ (diagnostic?.depth ?? '?')+'). Nada foi clicado.');
  }
  return '#'+diagnostic.candidateId;
}

export async function discoverDepartmentTrigger(page) {
  const diagnostic=await page.evaluate(() => {
    // Inspeciona apenas o título do campo, jamais nomes de clientes ou
    // texto de departamentos. Retorna só identificador DOM e contagens.
    const labels=[...document.querySelectorAll('label, span, div, strong, b')]
      .filter(el=>el.children.length===0 &&
        el.textContent?.trim().normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'').toUpperCase()==='DEPARTAMENTO');
    if(labels.length!==1) {
      return {labelCount:labels.length,candidateCount:0,depth:0,candidateId:''};
    }
    let parent=labels[0].parentElement;
    for(let depth=1;parent && depth<=5;depth++,parent=parent.parentElement) {
      const candidates=[...parent.querySelectorAll(
        '[id^="gestta-multiselect-dropdown-"][id$="-p"]'
      )];
      // Não confundir o departamento com todos os dropdowns da tela:
      // tomar somente o primeiro ancestral com um único ID de dropdown.
      if(candidates.length!==0){
        return {labelCount:1,candidateCount:candidates.length,
          depth,candidateId:candidates.length===1?candidates[0].id:''};
      }
    }
    return {labelCount:1,candidateCount:0,depth:0,candidateId:''};
  });
  const selector=validateDepartmentTriggerDiscovery(diagnostic);
  const control=page.locator(selector);
  const count=await control.count();
  if(count!==1 || !(await control.isVisible())){
    throw new Error('Controle identificado para Departamento não é único e visível '+
      '(correspondências='+count+'). Nada foi clicado.');
  }
  return control;
}


// Alternativa baseada na lista de 21 departamentos homologada em vez de
// um texto "Departamento" (que não foi encontrado na interface real).
export function resolveDepartmentTriggerFromRows(layout) {
  if(!layout || layout.uniqueGroupCount!==1 || layout.matchedDepartmentRows!==21){
    throw new Error('Nao foi encontrado um unico grupo com os 21 departamentos. Nada foi clicado.');
  }
  const scoped=(layout.ancestors||[]).filter(item=>
    item.depth<=3 && item.descendantToggleCount===22 &&
    item.descendantDropdownCount===1 &&
    item.descendantDropdownIds?.length===1 &&
    /^gestta-multiselect-dropdown-\d+-p$/.test(item.descendantDropdownIds[0])
  );
  const candidates=[...new Set(scoped.map(item=>item.descendantDropdownIds[0]))];
  if(candidates.length!==1){
    throw new Error('Dropdown de Departamento nao encontrado exclusivamente no grupo '+
      '21+1 (candidatos='+candidates.length+'). Nada foi clicado.');
  }
  return '#'+candidates[0];
}

// Nunca clicar no centro de um contêiner que pode incluir o pequeno botão X.
// Escolhe um ponto à esquerda, verifica por hit-test que não está sobre
// botões, inputs, links nem sobre uma opção do menu. Falha em caso de dúvida.
export async function discoverDepartmentTriggerByRows(page) {
  const layout=await inspectDepartmentTriggerLayout(page);
  const css=resolveDepartmentTriggerFromRows(layout);
  const control=page.locator(css);
  if(await control.count()!==1 || !(await control.isVisible())){
    throw new Error('Campo de Departamento identificado, mas nao esta unico/visivel. Nada foi clicado.');
  }
  const hit=await control.evaluate(el=>{
    const rect=el.getBoundingClientRect();
    if(rect.width<50 || rect.height<12 || rect.height>130){
      return {safe:false,reason:'dimensao_incomum'};
    }
    const x=Math.min(12,Math.floor(rect.width/4));
    const y=Math.floor(rect.height/2);
    const target=document.elementFromPoint(rect.left+x,rect.top+y);
    if(!target || !el.contains(target)) {
      return {safe:false,reason:'controle_encoberto'};
    }
    for(let cursor=target;cursor && cursor!==el;cursor=cursor.parentElement){
      if(cursor.matches('button,input,select,a,[role="button"],.gestta-multiselect-dropdown__item-toggle')){
        return {safe:false,reason:'area_interativa_insegura'};
      }
    }
    return {safe:true,x,y};
  });
  if(!hit?.safe){
    throw new Error('Nao ha ponto seguro para abrir o campo Departamento ('+
      String(hit?.reason||'desconhecido')+'). Nada foi clicado.');
  }
  return {control,position:{x:hit.x,y:hit.y}};
}
