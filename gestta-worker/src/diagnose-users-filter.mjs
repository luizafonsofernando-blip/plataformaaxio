// Inspeção direcionada do dropdown Usuários: apenas ABRE o menu.
// Não marca usuários, não executa Filtrar, não exporta e não transmite.
// Somente IDs seguros, contagens e estados são impressos no terminal.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ensureTasksView} from './task-navigation.mjs';
import {selectEbefTasks} from './task-filter.mjs';
import {
  inspectUserDropdownTopology,openUsersFilterForInspection,inspectUsersPopup,
} from './users-filter-inspection.mjs';
import {withDeadline} from './timeout-utils.mjs';
import {inspectUsersPopupStructure} from './users-popup-structure.mjs';

const url=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(url.protocol!=='https:'||url.hostname!=='app.gestta.com.br'){
  throw new Error('Endereco nao autorizado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
try{
  console.log('USUARIOS: diagnostico SEM MARCAR, SEM FILTRAR, SEM DOWNLOAD, SEM SINCRONIZAR.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const initial=context.pages()[0]||await context.newPage();
  await initial.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const selected=await selectEbefTasks(page);
  if(selected.selected!==3)throw new Error('Selecao E-BEF diferente de 3/3.');
  console.log('USUARIOS: tarefas=3/3.');
  const topology=await withDeadline('Inspecao da barra superior',
    ()=>inspectUserDropdownTopology(page),15000);
  console.log('USERS_TRIGGER: '+JSON.stringify(topology));
  if(!topology.topologyConfirmed){
    console.log('USUARIOS: controle nao identificado com seguranca. Nenhum menu foi aberto.');
  }else{
    const id=await openUsersFilterForInspection(page,topology);
    // Gestta pode carregar as opções após o primeiro clique.
    await page.waitForTimeout(1500);
    let popup=await withDeadline('Inspecao de menu Usuarios',
      ()=>inspectUsersPopup(page,id),15000);
    if(!popup.found){
      await page.waitForTimeout(3500);
      popup=await withDeadline('Reinspecao do menu Usuarios',
        ()=>inspectUsersPopup(page,id),15000);
    }
    console.log('USERS_POPUP: '+JSON.stringify(popup));
    if(!popup.found){
      const structure=await withDeadline('Estrutura do menu Usuarios',
        ()=>inspectUsersPopupStructure(page,id),15000);
      console.log('USERS_STRUCTURE: '+JSON.stringify(structure));
      console.log('USUARIOS: painel de opcoes ainda NAO confirmado. Nao houve alteracao.');
    }else{
      console.log('USUARIOS: menu identificado apenas para leitura. Nenhum checkbox acionado.');
    }
  }
  console.log('USUARIOS: SEM DOWNLOAD E SEM SINCRONIZACAO.');
}catch(error){
  const msg=String(error.message||'');
  if(/^(Topologia do campo Usuarios|Controle Usuarios|Nao foi confirmado ponto seguro)/.test(msg)){
    console.error('FALHA DIAGNOSTICO USUARIOS: '+msg.slice(0,180));
  }else {
    console.error('FALHA DIAGNOSTICO USUARIOS: etapa nao concluida; verificar sessao ou interface.');
  }
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Encerrar Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium demorou a encerrar; feche apenas a instancia de teste.');}
  }
}
