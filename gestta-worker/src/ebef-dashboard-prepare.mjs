// Prepara o JSON do painel a partir do Excel que JA existe em reports/.
// Sem Gestta, Chromium, HTTP, Supabase ou LUCE API.
import {readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {saveEbefDashboardData} from './ebef-dashboard-from-xlsx.mjs';

async function mostRecentReport(){
  const dir=resolve(process.cwd(),'reports');
  const files=(await readdir(dir)).filter(f=>
    /^LUCE_EBEF_20\d{2}_(0[1-9]|1[0-2])_[a-f0-9]{10}\.xlsx$/.test(f));
  if(!files.length)throw Error('Nenhum Excel LUCE encontrado em reports/.');
  const dated=await Promise.all(files.map(async f=>({
    path:join(dir,f),mtime:(await stat(join(dir,f))).mtimeMs
  })));
  return dated.sort((a,b)=>b.mtime-a.mtime)[0].path;
}
const argv=process.argv.slice(2);
if(argv.length>1||argv.some(arg=>!arg.startsWith('--input='))){
  throw Error('Uso: npm run dashboard:prepare [-- --input=reports/ARQUIVO.xlsx]');
}
const file=argv.length?resolve(argv[0].slice('--input='.length)):await mostRecentReport();
const result=await saveEbefDashboardData(file);
console.log('DASHBOARD_LOCAL: JSON criado em reports/ (dados confidenciais).');
console.log('DASHBOARD_LOCAL: empresas='+result.companies+', tarefas='+result.tasks);
console.log('DASHBOARD_LOCAL: arquivo='+result.dest);
console.log('DASHBOARD_LOCAL: abra ../ebef/index.html e selecione este JSON.');
console.log('DASHBOARD_LOCAL: nenhum acesso ao Gestta ou Supabase.');
