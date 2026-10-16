// Teste SEQUENCIAL e CONTROLADO de datas do Gestta.
// Uma única sessão Chromium, seleção de E-BEF 3/3 apenas uma vez;
// 2 ou 3 janelas de meses distintos. Nunca clica no botao Filtrar,
// nunca baixa XLSX, não acessa endpoints da Luce, não altera tarefas.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ensureTasksView} from './task-navigation.mjs';
import {selectEbefTasks} from './task-filter.mjs';
import {applyDateWindow, readControlText, DATE_SELECTORS, validateDateWindow} from './date-picker.mjs';
import {brazilRange} from './month-windows.mjs';
import {buildSequenceTestOptions} from './sequence-test-options.mjs';
import {withDeadline} from './timeout-utils.mjs';

// Falhar na validação ANTES de acessar o navegador.
const {windows,limit}=buildSequenceTestOptions(process.argv.slice(2));
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Somente a origem HTTPS do Gestta e autorizada.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
const css=process.env.GESTTA_DATE_RANGE_SELECTOR?.trim()||DATE_SELECTORS.range;
const normalized=x=>String(x).replace(/\s/g,'');
let context;
try{
  console.log('SEQUENCIA: TESTE VISUAL SEM FILTRAR, SEM DOWNLOAD, SEM XLSX E SEM SINCRONIZACAO.');
  console.log('SEQUENCIA: janelas='+limit+'; competencias='+[...new Set(windows.map(w=>w.month))].join(','));
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const selected=await selectEbefTasks(page);
  if(selected.selected!==3)throw new Error('Tarefas E-BEF diferentes de 3/3.');
  console.log('SEQUENCIA: tarefas E-BEF=3/3.');

  const range=page.locator(css);
  if(await range.count()!==1 || !(await range.isVisible())){
    throw new Error('Calendario ausente, oculto ou ambiguo.');
  }
  for(const [index,window] of windows.entries()){
    const desired=validateDateWindow(window);
    const current=(await readControlText(range)).trim();
    if(!/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(current)){
      throw new Error('Periodo atual nao reconhecido na janela '+(index+1)+'.');
    }
    console.log('SEQUENCIA: '+(index+1)+'/'+limit+
      ' competencia='+window.month+'; antes='+current+'; solicitado='+desired);
    if(normalized(current)!==normalized(desired)){
      const result=await applyDateWindow(page,window);
      if(normalized(result.applied)!==normalized(desired)){
        throw new Error('Aplicar calendario nao confirmou janela '+(index+1)+'.');
      }
    }
    const observed=(await readControlText(range)).trim();
    if(normalized(observed)!==normalized(desired)){
      throw new Error('Divergencia de periodo na janela '+(index+1)+'.');
    }
    console.log('SEQUENCIA: '+(index+1)+'/'+limit+' CONFIRMADA '+brazilRange(window));
  }
  console.log('SEQUENCIA: '+limit+'/'+limit+
    ' CONFIRMADAS. SUCESSO SEM FILTRAR, SEM DOWNLOAD, SEM XLSX E SEM SINCRONIZACAO.');
}catch(error){
  console.error('FALHA NO TESTE SEQUENCIAL: '+error.message);
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium demorou para fechar. Encerre somente esta instancia.');}
  }
}
