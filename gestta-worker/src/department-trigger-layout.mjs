// Apenas metadados estruturais necessários para localizar o dropdown
// Departamento QUANDO JA SELECIONADO. Nenhum texto de cliente é retornado.
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';

export async function inspectDepartmentTriggerLayout(page) {
  return page.evaluate(expected => {
    const normalize = txt=>String(txt??'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
    const wanted=new Set(expected.map(normalize));
    const extras=new Set(['SELECIONAR TODOS','DESSELECIONAR TODOS']);
    const toggleSelector='.gestta-multiselect-dropdown__item-toggle';
    const idSelector='[id^="gestta-multiselect-dropdown-"][id$="-p"]';
    const safeClasses=el=>[...el?.classList||[]].filter(x=>/^[a-z0-9_-]{1,60}$/i.test(x)).slice(0,6);
    const safeId=id=>/^gestta-multiselect-dropdown-\d+-p$/.test(id||'')?id:'';
    const toggles=[...document.querySelectorAll(toggleSelector)];
    const knownToggles=toggles.filter(toggle=>
      wanted.has(normalize(toggle.closest('li')?.textContent))
    );
    const groups=new Set();
    const profiles=[];
    // Escopo: 21 nomes conhecidos +, no máximo, o seletor "Selecionar todos".
    for(const toggle of knownToggles) {
      let node=toggle.parentElement;
      for(let depth=0;node && depth<11;depth++,node=node.parentElement){
        const members=[...node.querySelectorAll(toggleSelector)];
        if(members.length!==wanted.size && members.length!==wanted.size+1) continue;
        const labels=members.map(el=>normalize(el.closest('li')?.textContent));
        const matches=labels.filter(label=>wanted.has(label));
        const others=labels.filter(label=>!wanted.has(label));
        if(matches.length===wanted.size && new Set(matches).size===wanted.size &&
           others.every(label=>extras.has(label))) {
          groups.add(node);
          break;
        }
      }
    }
    const scoped=[...groups];
    const group=scoped.length===1?scoped[0]:null;
    const ancestors=[];
    if(group){
      let ancestor=group;
      for(let depth=0;ancestor && depth<9;depth++,ancestor=ancestor.parentElement) {
        const dropIds=[...ancestor.querySelectorAll(idSelector)]
          .map(el=>safeId(el.id)).filter(Boolean);
        const visibleIds=dropIds.slice(0,4);
        const closestIds=[safeId(ancestor.id)].filter(Boolean);
        const toggleCount=ancestor.querySelectorAll(toggleSelector).length;
        ancestors.push({
          depth,
          tag:ancestor.tagName?.toLowerCase()||'',
          classes:safeClasses(ancestor),
          id:closestIds[0]||'',
          descendantDropdownIds:visibleIds,
          descendantDropdownCount:dropIds.length,
          descendantToggleCount:toggleCount,
          buttons:ancestor.querySelectorAll('button').length,
          inputs:ancestor.querySelectorAll('input').length,
        });
      }
    }
    // Descobrir por que o método anterior não encontrou o título sem
    // serializar textos de outros campos.
    const labelTags=['label','span','div','strong','b','p','h3','h4','small'];
    const labelCandidates=[...document.querySelectorAll(labelTags.join(','))]
      .filter(el=>normalize(el.textContent)==='DEPARTAMENTO');
    const visible = el=>{
      const rect=el.getBoundingClientRect();
      const style=window.getComputedStyle(el);
      return rect.width>0&&rect.height>0 && style.display!=='none' &&
        style.visibility!=='hidden';
    };
    const labels=labelCandidates.slice(0,8).map(el=>({
      tag:el.tagName.toLowerCase(),children:el.children.length,
      classes:safeClasses(el),visible:visible(el),
    }));
    // Nenhum nome/valor do dropdown é retornado; só números e classes CSS.
    return {
      totalToggles:toggles.length,matchedDepartmentRows:knownToggles.length,
      uniqueGroupCount:groups.size,
      labelCandidateCount:labelCandidates.length,
      labelCandidates:labels,ancestors,
    };
  }, REQUIRED_DEPARTMENTS);
}
