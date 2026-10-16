// Metadados APENAS dos filtros na barra superior do Gestta.
// Não serializar nomes/valores desconhecidos (podem ser dados de clientes).
export function summarizeGlobalFilterDiagnostics(raw) {
  if(!raw || !Array.isArray(raw.dropdowns) || !raw.matches) {
    throw new Error('Diagnostico global incompleto.');
  }
  return {
    textualMatches:raw.matches,
    dateRangeVisible:raw.dateRangeVisible,
    totalTopDropdowns:raw.dropdowns.length,
    dropdowns:raw.dropdowns,
  };
}

export async function inspectGlobalFilters(page) {
  const textLocators={
    clients:page.getByText(/^Todos\s+(?:os\s+)?clientes$/i),
    users:page.getByText(/^Todos\s+(?:os\s+)?usu[aá]rios$/i),
    dataMeta:page.getByText(/^Data\s+Meta$/i),
  };
  const matches={};
  for(const [key,locator]of Object.entries(textLocators)){
    const count=await locator.count();
    matches[key]={count,visible:count===1?await locator.isVisible():false};
  }
  const raw=await page.evaluate(()=>{
    const normalized=s=>String(s??'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
    const safeId=id=>/^gestta-multiselect-dropdown-\d+-p$/.test(id||'')?id:'';
    const safeClasses=el=>[...el.classList||[]]
      .filter(c=>/^[a-z0-9_-]{1,65}$/i.test(c)).slice(0,7);
    const visible=el=>{
      const r=el.getBoundingClientRect();
      const css=getComputedStyle(el);
      return r.width>0 && r.height>0 && css.display!=='none' &&
        css.visibility!=='hidden';
    };
    const range=document.querySelector('#date-range');
    const dateRangeVisible=Boolean(range&&visible(range));
    const targets=[...document.querySelectorAll('[id^="gestta-multiselect-dropdown-"][id$="-p"]')]
      .filter(el=>{
        if(!visible(el))return false;
        const rect=el.getBoundingClientRect();
        return rect.top>=0 && rect.top<160 && rect.width>=65 && rect.height<110;
      }).slice(0,9);
    const classify=el=>{
      const inputs=[...el.querySelectorAll('input,textarea,select')];
      const attrs=inputs.flatMap(i=>[
        i.value,i.placeholder,i.getAttribute('aria-label'),i.getAttribute('title'),
      ]);
      const all=[el.textContent,el.getAttribute('aria-label'),
        el.getAttribute('title'),...attrs].map(normalized);
      const equals={
        allClients:all.some(s=>/^(TODOS\s+(OS\s+)?CLIENTES)$/.test(s)),
        allUsers:all.some(s=>/^(TODOS\s+(OS\s+)?USUARIOS)$/.test(s)),
        dataMeta:all.some(s=>s==='DATA META'),
      };
      const contains={
        clientes:all.some(s=>/\bCLIENTES\b/.test(s)),
        usuarios:all.some(s=>/\bUSUARIOS\b/.test(s)),
        dataMeta:all.some(s=>/\bDATA META\b/.test(s)),
      };
      const r=el.getBoundingClientRect();
      return {
        id:safeId(el.id),tag:el.tagName.toLowerCase(),classes:safeClasses(el),
        // Geometria aproximada para identificar a coluna sem revelar dados.
        x:Math.round(r.x/10)*10,width:Math.round(r.width/10)*10,
        inputs:inputs.length,buttons:el.querySelectorAll('button').length,
        equals,contains,
        inputHasNonemptyValue:inputs.some(i=>Boolean(String(i.value??'').trim())),
      };
    };
    return {dateRangeVisible,dropdowns:targets.map(classify)};
  });
  return summarizeGlobalFilterDiagnostics({...raw,matches});
}
