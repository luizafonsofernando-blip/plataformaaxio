// Diagnóstico SEM CLICAR, de um escopo restrito para o menu Departamento.
// O Gestta tem milhares de .gestta-multiselect-dropdown__item-toggle no DOM.
// Ancoramos no item visível "Selecionar todos" do menu aberto e só aceitamos
// um contêiner único com EXATAMENTE os 21 departamentos esperados.
// Não expor nomes de outros itens, HTML, URL, sessão ou dados de clientes.
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';
import { summarizeDepartmentSnapshots } from './department-structure.mjs';

export async function inspectScopedDepartments(page) {
  const raw = await page.evaluate(expected => {
    const normalize = text => String(text ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim().toUpperCase();
    const expectedNames=new Set(expected.map(normalize));
    const isVisible=element=>{
      const rect=element.getBoundingClientRect();
      const style=window.getComputedStyle(element);
      return rect.width>0 && rect.height>0 && style.visibility!=='hidden' &&
        style.display!=='none';
    };
    // O Inspector identificou o "Selecionar todos" como menuitem > a.
    // "Desselecionar todos" é somente fallback de leitura pós-seleção.
    const anchors=[...document.querySelectorAll('[role="menuitem"], a')]
      .filter(node=>{
        const txt=normalize(node.textContent);
        return (txt==='SELECIONAR TODOS' || txt==='DESSELECIONAR TODOS') &&
          isVisible(node);
      });
    const scopeCandidates=new Set();
    const nearCounts=new Set();
    for (const anchor of anchors) {
      let node=anchor.parentElement;
      for(let depth=0;node && depth<12;depth++,node=node.parentElement){
        const toggleNodes=node.querySelectorAll('.gestta-multiselect-dropdown__item-toggle');
        if(toggleNodes.length>0 && toggleNodes.length<=100)nearCounts.add(toggleNodes.length);
        if(toggleNodes.length!==expectedNames.size)continue;
        const names=[...toggleNodes].map(toggle=>{
          const li=toggle.closest('li');
          return normalize(li?.textContent);
        });
        if(new Set(names).size===expectedNames.size &&
           names.every(name=>expectedNames.has(name))) {
          scopeCandidates.add(node);
          break;
        }
      }
    }
    // A lista dos candidatos encontrados não inclui dados das opções estranhas.
    if(scopeCandidates.size!==1) {
      return {found:false, candidateScopes:scopeCandidates.size,
        visibleSelectAllCandidates:anchors.length,
        nearbyToggleCounts:[...nearCounts].sort((a,b)=>a-b), snapshots:[]};
    }
    const scope=[...scopeCandidates][0];
    const toggles=scope.querySelectorAll('.gestta-multiselect-dropdown__item-toggle');
    const safeClasses=el=>[...el?.classList||[]]
      .filter(x=>/^[\w-]{1,64}$/.test(x)).slice(0,8);
    const snapshots=[...toggles].map(toggle=>{
      const li=toggle.closest('li');
      const checkbox=toggle.querySelector('.checkbox-item');
      const inner=checkbox?.matches('input[type="checkbox"]') ? checkbox :
        checkbox?.querySelector('input[type="checkbox"]');
      const ariaNode=[checkbox,toggle,li].find(node=>
        node && node.getAttribute('aria-checked')!==null);
      return {
        label:String(li?.textContent||'').trim().replace(/\s+/g,' ').slice(0,160),
        elementTag:checkbox?.tagName.toLowerCase()||'none',
        toggleTag:toggle.tagName.toLowerCase(),
        checkboxClasses:safeClasses(checkbox),
        toggleClasses:safeClasses(toggle),
        checkboxRole:checkbox?.getAttribute('role')||'',
        inputType:inner?.type||null,
        inputChecked:inner ? Boolean(inner.checked):null,
        ariaChecked:ariaNode?.getAttribute('aria-checked')??null,
        dataState:checkbox?.getAttribute('data-state')||'',
      };
    });
    return {found:true,candidateScopes:1,visibleSelectAllCandidates:anchors.length,
      nearbyToggleCounts:[...nearCounts].sort((a,b)=>a-b),snapshots};
  },REQUIRED_DEPARTMENTS);
  const safe={
    found:raw.found,
    candidateScopes:raw.candidateScopes,
    visibleSelectAllCandidates:raw.visibleSelectAllCandidates,
    nearbyToggleCounts:raw.nearbyToggleCounts,
  };
  return raw.found
    ? {...safe, ...summarizeDepartmentSnapshots(raw.snapshots)}
    : safe;
}
