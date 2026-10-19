// Diagnostico de navegacao na tela Tarefas. Abre APENAS o menu lateral
// homologado uma vez. Nao marca filtros, nao baixa XLSX nem sincroniza.
// Loga somente categorias de rotas e presenca de elementos sem URLs/HTML.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sidebarTasksLocator} from './task-navigation.mjs';
import {inspectEntry,classifyEntryUrl} from './entry-diagnostics.mjs';
import {withDeadline} from './timeout-utils.mjs';

if(process.argv.length!==2){
  throw new Error('Diagnostico de navegacao nao recebe parametros.');
}
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:' || target.hostname!=='app.gestta.com.br'){
  throw new Error('Endereco Gestta nao autorizado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});

export function summarizeTaskNavigationObservation(state){
  if(!state || !Array.isArray(state.pages)){
    throw new Error('Observacao de navegacao invalida.');
  }
  return {
    taskViewConfirmed:state.pages.some(page=>page.calendarioVisivel===true),
    possibleLogin:state.pages.some(page=>page.diagnostico==='autenticacao_possivelmente_necessaria' ||
      page.rota==='possivel_login'),
    taskRoutes:state.pages.filter(page=>page.rota==='tarefas').length,
    dashboardRoutes:state.pages.filter(page=>page.rota==='dashboard').length,
    pages:state.pages.length,
  };
}

async function safeSnapshot(context,label){
  const pages=[];
  for(const page of context.pages()){
    if(page.isClosed())continue;
    const route=classifyEntryUrl(page.url());
    if(route==='fora_do_gestta'||route==='endereco_indisponivel'){
      pages.push({rota:route,calendarioVisivel:false,diagnostico:'nao_inspecionado'});
      continue;
    }
    try {
      const data=await withDeadline('Ler tela Gestta',
        ()=>inspectEntry(page),12000);
      const frameCounts=[];
      for(const frame of page.frames().slice(0,8)){
        if(frame===page.mainFrame())continue;
        if(classifyEntryUrl(frame.url())==='fora_do_gestta')continue;
        try{
          const calendars=await frame.locator('#date-range').count();
          frameCounts.push({calendarElements:calendars});
        }catch{frameCounts.push({calendarElements:'indisponivel'});}
      }
      pages.push({
        rota:data.rota,diagnostico:data.diagnostico,
        readyState:data.readyState,calendarioVisivel:data.calendarioVisivel,
        senhaVisivel:data.senhaVisivel,
        menuTarefasQuantidade:data.menuTarefasQuantidade,
        menuTarefasVisivel:data.menuTarefasVisivel,
        frames:data.frames,frameCounts,
      });
    }catch {
      pages.push({rota:route,diagnostico:'leitura_indisponivel',
        calendarioVisivel:false});
    }
  }
  console.log('DIAG_NAV_'+label+': '+JSON.stringify(pages));
  return summarizeTaskNavigationObservation({pages});
}

let context;
try{
  console.log('DIAG_NAV: somente menu Tarefas; sem filtros, XLSX ou sincronizacao.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  await first.waitForTimeout(5000);
  const initial=await safeSnapshot(context,'INICIAL');
  if(initial.taskViewConfirmed){
    console.log('DIAG_NAV: tela Tarefas ja estava aberta; nenhum clique necessario.');
  }else if(initial.possibleLogin){
    console.log('DIAG_NAV: possivel autenticacao; sem clicar em Tarefas.');
  }else{
    const gestta=context.pages().filter(page=>{
      try{return !page.isClosed() &&
        new URL(page.url()).hostname==='app.gestta.com.br';}
      catch{return false;}
    });
    if(gestta.length!==1){
      console.log('DIAG_NAV: numero ambiguo de abas Gestta; sem clicar.');
    }else{
      const sidebar=sidebarTasksLocator(gestta[0]);
      try{await sidebar.first().waitFor({state:'visible',timeout:12000});}
      catch{console.log('DIAG_NAV: menu Tarefas indisponivel; sem clicar.');}
      if(await sidebar.count()===1 && await sidebar.isVisible()){
        await sidebar.click({timeout:10000});
        console.log('DIAG_NAV: menu Tarefas clicado UMA vez.');
        await gestta[0].waitForTimeout(2000);
        await safeSnapshot(context,'APOS_2S');
        await gestta[0].waitForTimeout(6000);
        await safeSnapshot(context,'APOS_8S');
        await gestta[0].waitForTimeout(7000);
        const final=await safeSnapshot(context,'APOS_15S');
        console.log('DIAG_NAV: '+(final.taskViewConfirmed?
          'calendario encontrado.':'calendario nao confirmado.'));
      }else{
        console.log('DIAG_NAV: menu Tarefas nao e unico/visivel; sem clicar.');
      }
    }
  }
  console.log('DIAG_NAV: terminado. Nenhum XLSX gerado ou transmitido.');
}catch {
  console.error('DIAG_NAV: falha na navegacao; sem download nem sincronizacao.');
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('DIAG_NAV: Chromium demorou a fechar.');}
  }
}
