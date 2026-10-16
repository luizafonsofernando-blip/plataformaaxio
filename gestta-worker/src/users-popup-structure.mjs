// Inspeção estrutural do menu Usuários após o clique já supervisionado.
// Saída SOMENTE: classes filtradas, contagens, geometria aproximada,
// estados booleanos. Não retorna HTML, texto, IDs de usuários nem URLs.
export function validateUsersPopupStructure(result) {
  if(!result || result.validId!==true || typeof result.visibleCandidates!=='number') {
    throw new Error('Diagnostico de estrutura do menu Usuarios incompleto.');
  }
  return result;
}

export async function inspectUsersPopupStructure(page, id) {
  if(!/^gestta-multiselect-dropdown-\d+-p$/.test(id)){
    throw new Error('Identificador do filtro Usuarios invalido.');
  }
  const raw=await page.evaluate(id=>{
    const trigger=document.getElementById(id);
    if(!trigger)return {validId:true,triggerPresent:false,visibleCandidates:0,nearby:[],ancestors:[]};
    const rect=trigger.getBoundingClientRect();
    const classNames=node=>[...node?.classList||[]]
      .filter(name=>/^[a-z0-9_-]{1,64}$/i.test(name))
      .slice(0,7);
    const isVisible=node=>{
      const r=node.getBoundingClientRect();
      const css=getComputedStyle(node);
      return r.width>0 && r.height>0 && css.display!=='none' &&
        css.visibility!=='hidden' && css.opacity!=='0';
    };
    const ancestry=[];
    let ancestor=trigger;
    for(let depth=0;depth<6 && ancestor;depth++,ancestor=ancestor.parentElement){
      ancestry.push({
        depth, tag:ancestor.tagName.toLowerCase(),
        classes:classNames(ancestor),
        ariaExpanded:ancestor.getAttribute('aria-expanded')==='true',
        isOpenClass:ancestor.classList.contains('open') ||
          ancestor.classList.contains('show'),
        localMenus:ancestor.querySelectorAll(
          '.gestta-multiselect-dropdown__menu,.dropdown-menu,[role="menu"],[role="listbox"]'
        ).length,
        localToggles:ancestor.querySelectorAll(
          '.gestta-multiselect-dropdown__item-toggle'
        ).length,
      });
    }
    const selectors=[
      '.gestta-multiselect-dropdown__menu',
      '.dropdown-menu','[role="menu"]','[role="listbox"]',
      'ul:has(.gestta-multiselect-dropdown__item-toggle)',
    ];
    const nodes=[...new Set(selectors.flatMap(q=>[...document.querySelectorAll(q)]))];
    const nearby=nodes.filter(el=>{
      const r=el.getBoundingClientRect();
      return isVisible(el) &&
        r.left<=rect.right+80 && r.right>=rect.left-80 &&
        r.top>=rect.top-30 && r.top<rect.bottom+620;
    }).map(el=>{
      const r=el.getBoundingClientRect();
      return {
        kind:el.matches('.gestta-multiselect-dropdown__menu')?'gestta_menu':
          el.matches('.dropdown-menu')?'dropdown_menu':
          el.matches('[role="listbox"]')?'listbox':
          el.matches('[role="menu"]')?'menu_role':'ul_com_toggles',
        classes:classNames(el),
        // Deslocamentos relativos ao campo, sem coordenadas ou valores pessoais.
        relativeX:Math.round((r.left-rect.left)/10)*10,
        relativeY:Math.round((r.top-rect.bottom)/10)*10,
        width:Math.round(r.width/10)*10,
        height:Math.round(r.height/10)*10,
        liCount:el.querySelectorAll('li').length,
        toggleCount:el.querySelectorAll(
          '.gestta-multiselect-dropdown__item-toggle'
        ).length,
        inputCheckboxCount:el.querySelectorAll('input[type="checkbox"]').length,
        roleCheckboxCount:el.querySelectorAll('[role="checkbox"]').length,
        anchors:el.querySelectorAll('a').length,
      };
    }).slice(0,8);
    const triggerState={
      visible:isVisible(trigger),
      ariaExpanded:trigger.getAttribute('aria-expanded')==='true',
      ariaHasPopup:trigger.hasAttribute('aria-haspopup'),
      topApprox:Math.round(rect.top/10)*10,
      widthApprox:Math.round(rect.width/10)*10,
      hasOpenParent:ancestry.some(a=>a.isOpenClass),
    };
    return {
      validId:true,triggerPresent:true,triggerState,
      globalMenusCount:nodes.length,
      visibleCandidates:nearby.length,
      nearby,
      ancestors:ancestry,
    };
  },id);
  return validateUsersPopupStructure(raw);
}
