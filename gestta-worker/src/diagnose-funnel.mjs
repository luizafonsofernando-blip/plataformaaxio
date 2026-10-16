// Identifica somente a ESTRUTURA dos controles de filtro da tela Tarefas.
// Uso: npm run diagnose:funnel
// Não abre Inspector, não pausa, não exige clicks nem imprime dados de clientes.
// Preferência por Chromium headless para contornar interação travada no Windows.
// Não clica no FUNIL nem altera status/departamentos; apenas seleciona
// os 3 filtros visuais E-BEF já homologados.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';

const url = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (url.protocol !== 'https:' || url.hostname !== 'app.gestta.com.br') {
  throw new Error('Somente https://app.gestta.com.br/ pode ser consultado.');
}

const profile=resolve(process.cwd(), '.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});

function diagnosticsSafe(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const sanitizeTokens = value => String(value||'')
    .split(/\s+/).filter(token => /^[a-z0-9_-]{1,64}$/i.test(token)).slice(0,12);
  const sanitizeName = value => {
    const v=String(value||'').trim();
    return /^(filtrar|filtro|filtros|filter|filters|expandir|abrir filtros|filtros avan[cç]ados)$/i.test(v) ? v : '';
  };
  return list.map(item=>({
    index:item.index,
    visible:!!item.visible,
    buttonClasses:sanitizeTokens(item.buttonClasses),
    iconClasses:sanitizeTokens(item.iconClasses),
    svgClasses:sanitizeTokens(item.svgClasses),
    parentClasses:sanitizeTokens(item.parentClasses),
    buttonName:sanitizeName(item.buttonName),
    buttonTitle:sanitizeName(item.buttonTitle),
    svgPathCount:Math.min(20,Math.max(0,Number(item.svgPathCount)||0)),
    svgSignature:typeof item.svgSignature==='string' && /^[MLHVCSQTAZmlhvcsqtaz0-9., -]{1,140}$/.test(item.svgSignature)
      ?item.svgSignature.slice(0,140):'',
  }));
}

async function inspectPage(page) {
  // DOM lido apenas localmente. Sai do contexto do browser SOMENTE propriedades
  // de ícones e classes. NUNCA texto de tarefas, URLs, cookies ou HTML.
  const collected=await page.locator('button').evaluateAll(buttons=>buttons.map((el,index)=>{
    const rect=el.getBoundingClientRect();
    const icon=el.querySelector('i, [class*="filter"], [class*="funnel"]');
    const svg=el.querySelector('svg');
    const path=svg?.querySelector('path');
    return {
      index,visible:rect.width>0 && rect.height>0,
      buttonClasses:el.className && typeof el.className==='string'?el.className:'',
      iconClasses:icon?.getAttribute('class')||'',
      svgClasses:svg?.getAttribute('class')||'',
      parentClasses:el.parentElement?.getAttribute('class')||'',
      buttonName:el.getAttribute('aria-label')||'',
      buttonTitle:el.getAttribute('title')||'',
      svgPathCount:svg?.querySelectorAll('path').length||0,
      svgSignature:path?.getAttribute('d')?.slice(0,140)||'',
    };
  }));
  const safe=diagnosticsSafe(collected);
  console.log('FUNIL: botoes_encontrados='+safe.length);
  // Indice 4 veio do Inspector, mas serve EXCLUSIVAMENTE como dica de
  // diagnostico (nunca sera acionado automaticamente pelo indice).
  const fifth=safe.find(x=>x.index===4);
  console.log('FUNIL: candidato_indice_4='+JSON.stringify(fifth||null));
  const icons=safe.filter(x=>(x.iconClasses+' '+x.svgClasses+' '+x.buttonClasses+' '+x.buttonName+' '+x.buttonTitle)
    .toLowerCase().match(/filter|funnel|funil|filtrar/));
  console.log('FUNIL: botoes_com_indicador_de_filtro='+JSON.stringify(icons));
  if(!fifth){
    console.log('FUNIL: indice do Inspector nao identificado nesta renderizacao.');
  } else if(!fifth.iconClasses && !fifth.svgClasses && !fifth.svgSignature){
    console.log('FUNIL: candidato nao possui marca de icone reconhecivel; ainda nao clicar automaticamente.');
  }
}

let context;
try {
  console.log('Diagnostico de estrutura do funil SEM Inspector, cliques manuais ou exportacoes.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('Nao foram confirmadas as 3 tarefas E-BEF.');
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3');
  await inspectPage(page);
  console.log('Diagnostico concluido. Nenhum botao de filtro foi acionado.');
} catch (error) {
  console.error('FALHA NO DIAGNOSTICO DO FUNIL: '+error.message);
  process.exitCode=1;
} finally {
  if(context)await context.close();
}
