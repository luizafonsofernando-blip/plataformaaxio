// Leitura SOMENTE-LEITURA do dropdown Departamento no Gestta.
// A tela contém milhares de toggles de outros filtros. O Inspector e o
// diagnóstico headless identificaram 21 nomes válidos e um ancestral com
// 22 toggles. O 22º NUNCA será aceito como departamento adicional:
// somente um item que se identifique exatamente como controle "Selecionar
// todos" ou "Desselecionar todos" pode ser ignorado.
// Não capturar/imprimir nomes de clientes, HTML, URL, sessão ou credenciais.
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';
import { summarizeDepartmentSnapshots } from './department-structure.mjs';

export const ALLOWED_EXTRA_LABELS = Object.freeze([
  'SELECIONAR TODOS',
  'DESSELECIONAR TODOS',
]);

export function summarizeScopedResult(raw) {
  const safe = {
    found:raw.found===true,
    candidateScopes:raw.candidateScopes??0,
    visibleSelectAllCandidates:raw.visibleSelectAllCandidates??0,
    nearbyToggleCounts:raw.nearbyToggleCounts??[],
    nearbyCandidateProfiles:raw.nearbyCandidateProfiles??[],
    ignoredSelectAllControls:raw.ignoredSelectAllControls??0,
  };
  if (raw.found !== true) return safe;
  const summary=summarizeDepartmentSnapshots(raw.snapshots);
  return {...safe,...summary};
}

export async function inspectScopedDepartments(page) {
  const raw = await page.evaluate(({expected, allowedExtras}) => {
    const normalize = text => String(text ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim().toUpperCase();
    const expectedNames = new Set(expected.map(normalize));
    const extras = new Set(allowedExtras);
    const isVisible = el => {
      const rect=el.getBoundingClientRect();
      const style=window.getComputedStyle(el);
      return rect.width>0 && rect.height>0 && style.visibility!=='hidden' &&
        style.display!=='none';
    };
    const anchors=[...document.querySelectorAll('[role="menuitem"], a')]
      .filter(node=>extras.has(normalize(node.textContent)) && isVisible(node));
    const nearCounts=new Set();
    const profiles=[];
    const scopes=new Set();
    for (const anchor of anchors) {
      let node=anchor.parentElement;
      for(let depth=0; node && depth<12;depth++,node=node.parentElement) {
        const toggles=[...node.querySelectorAll('.gestta-multiselect-dropdown__item-toggle')];
        if(toggles.length>0 && toggles.length<=100) nearCounts.add(toggles.length);
        // Não processar as estruturas amplas de outros menus. Um contêiner
        // legítimo terá 21 departamentos ou 21 + 1 controle de seleção.
        if(toggles.length!==expectedNames.size &&
           toggles.length!==expectedNames.size+1) continue;
        const names=toggles.map(toggle=>normalize(toggle.closest('li')?.textContent));
        const known=names.filter(name=>expectedNames.has(name));
        const distinct=new Set(known);
        const unknown=names.filter(name=>!expectedNames.has(name));
        const allowedExtraCount=unknown.filter(name=>extras.has(name)).length;
        const valid=known.length===expectedNames.size &&
          distinct.size===expectedNames.size &&
          unknown.length===allowedExtraCount && unknown.length<=1;
        // Apenas contagens (nunca os nomes não reconhecidos) saem da página.
        profiles.push({
          toggles:toggles.length,
          expectedDistinct:distinct.size,
          expectedMatches:known.length,
          unknownCount:unknown.length,
          selectionControlCount:allowedExtraCount,
          valid,
        });
        if(valid) {
          scopes.add(node);
          break; // Menor ancestral válido para esta âncora.
        }
      }
    }
    const base={
      found:scopes.size===1,
      candidateScopes:scopes.size,
      visibleSelectAllCandidates:anchors.length,
      nearbyToggleCounts:[...nearCounts].sort((a,b)=>a-b),
      nearbyCandidateProfiles:profiles.slice(0,12),
      ignoredSelectAllControls:0,
      snapshots:[],
    };
    if(scopes.size!==1)return base;
    const scope=[...scopes][0];
    const toggles=[...scope.querySelectorAll('.gestta-multiselect-dropdown__item-toggle')];
    const safeClasses=el=>[...el?.classList||[]]
      .filter(x=>/^[\w-]{1,64}$/.test(x)).slice(0,8);
    const snapshots=[];
    for (const toggle of toggles) {
      const li=toggle.closest('li');
      const label=String(li?.textContent||'').trim().replace(/\s+/g,' ').slice(0,160);
      const normalized=normalize(label);
      if(extras.has(normalized)) {
        base.ignoredSelectAllControls++;
        continue;
      }
      // Não transferir nomes que não correspondam aos departamentos
      // explicitamente autorizados: seria violação de escopo.
      if(!expectedNames.has(normalized)) {
        return {...base,found:false,snapshots:[]};
      }
      const checkbox=toggle.querySelector('.checkbox-item');
      const inner=checkbox?.matches('input[type="checkbox"]') ? checkbox :
        checkbox?.querySelector('input[type="checkbox"]');
      const ariaNode=[checkbox,toggle,li].find(el=>
        el && el.getAttribute('aria-checked')!==null);
      snapshots.push({
        label,
        elementTag:checkbox?.tagName.toLowerCase()||'none',
        toggleTag:toggle.tagName.toLowerCase(),
        checkboxClasses:safeClasses(checkbox),
        toggleClasses:safeClasses(toggle),
        checkboxRole:checkbox?.getAttribute('role')||'',
        inputType:inner?.type||null,
        inputChecked:inner ? Boolean(inner.checked):null,
        ariaChecked:ariaNode?.getAttribute('aria-checked')??null,
        dataState:checkbox?.getAttribute('data-state')||'',
      });
    }
    if(snapshots.length!==expectedNames.size) {
      return {...base,found:false,snapshots:[]};
    }
    return {...base,snapshots};
  },{expected:REQUIRED_DEPARTMENTS,allowedExtras:ALLOWED_EXTRA_LABELS});
  return summarizeScopedResult(raw);
}
