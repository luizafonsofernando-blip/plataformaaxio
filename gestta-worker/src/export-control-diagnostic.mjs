// Só LEITURA de metadados visuais do botão exportar na tela de tarefas.
// Não imprime HTML, URL, nomes de clientes, arquivos ou dados pessoais.
// O seletor final só poderá ser usado DEPOIS da confirmação no Gestta real.
export function summarizeExportCandidates(summary) {
  if(!summary || !Array.isArray(summary.candidates)) {
    throw new Error('Diagnostico do controle de exportacao incompleto.');
  }
  const candidates=summary.candidates.filter(c=>c.visible && c.hasDownloadIcon);
  const unique=candidates.length===1;
  return {
    ...summary,
    visibleDownloadCandidates:candidates.length,
    uniqueExportCandidate:unique,
    exportClassAndIconConfirmed:unique && candidates[0].explicitExportClass===true,
  };
}

export async function inspectExportControl(page) {
  const raw=await page.evaluate(()=>{
    const scope=document.querySelector('.mixed-topfilter__actions');
    if(!scope)return {scopeCount:0,actionsCount:0,candidates:[]};
    const scopes=document.querySelectorAll('.mixed-topfilter__actions');
    const safeClasses=el=>[...(el?.classList||[])]
      .filter(name=>/^[\w-]{1,64}$/.test(name)).slice(0,10);
    const isVisible=el=>{
      const r=el.getBoundingClientRect();
      const st=window.getComputedStyle(el);
      return r.width>0 && r.height>0 && st.visibility!=='hidden' &&
        st.display!=='none';
    };
    const actions=[...scope.querySelectorAll('button,a,[role="button"]')];
    const candidates=actions.filter(node=>
      node.matches('.mixed-topfilter__action--export') ||
      node.querySelector('.fa-download,.glyphicon-download,[class*="icon-download"]')
    );
    return {
      scopeCount:scopes.length,
      actionsCount:actions.length,
      candidates:candidates.slice(0,8).map(el=>({
        tag:el.tagName.toLowerCase(),
        classes:safeClasses(el),
        iconClasses:safeClasses(el.querySelector('.fa-download,.glyphicon-download,[class*="icon-download"]')),
        visible:isVisible(el),
        disabled:Boolean(el.disabled||el.getAttribute('aria-disabled')==='true'),
        explicitExportClass:el.matches('.mixed-topfilter__action--export'),
        hasDownloadIcon:Boolean(el.querySelector('.fa-download,.glyphicon-download,[class*="icon-download"]')),
      })),
    };
  });
  return summarizeExportCandidates(raw);
}
