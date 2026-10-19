// UM comando: dashboard local que usa o XLSX Gestta ja salvo.
import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {readEbefDashboardData} from './ebef-dashboard-from-xlsx.mjs';
import {createLocalEbefDashboard} from './ebef-dashboard-local-http.mjs';

async function findNewestExcel(){
  const directory=resolve(process.cwd(),'reports');
  const files=(await readdir(directory)).filter(name=>
    /^LUCE_EBEF_20\d{2}_(0[1-9]|1[0-2])_[a-f0-9]{10}\.xlsx$/.test(name));
  if(!files.length)throw new Error('Nenhum relatorio Excel LUCE na pasta reports/.');
  const entries=await Promise.all(files.map(async name=>{
    const path=join(directory,name);
    const info=await stat(path);
    return {path,modified:info.mtimeMs};
  }));
  return entries.sort((a,b)=>b.modified-a.modified)[0].path;
}
const args=process.argv.slice(2);
if(args.length!==0)throw new Error('Para abrir o painel, use: npm run dashboard:local');
const selected=await findNewestExcel();
const report=await readEbefDashboardData(selected);
const assetDir=resolve(process.cwd(),'..','ebef');
const [html,script,style]=await Promise.all(['index.html','app.js','style.css']
  .map(name=>readFile(join(assetDir,name),'utf8')));
const dashboard=createLocalEbefDashboard({report,html,script,style});
const url=await dashboard.listen();
console.log('LUCE E-BEF: controle local carregado. Empresas='+
  new Set(report.tasks.map(t=>t.cnpj)).size+'; tarefas='+report.tasks.length);
console.log('LUCE E-BEF: Endereco local temporario: '+url);
console.log('LUCE E-BEF: sem download Gestta, JSON e Supabase.');
console.log('LUCE E-BEF: use Ctrl+C no PowerShell para encerrar o painel.');
if(process.platform==='win32'){
  try{
    const child=spawn('explorer.exe',[url],{
      detached:true,stdio:'ignore',windowsHide:true
    });
    child.on('error',()=>{
      console.log('LUCE E-BEF: se o navegador nao abrir, copie o endereco acima.');
    });
    child.unref();
  }catch{
    console.log('LUCE E-BEF: copie o endereco acima no navegador.');
  }
}else{
  console.log('LUCE E-BEF: abra o endereco acima em seu navegador.');
}
