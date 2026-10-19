// Execucao Windows: previsualiza SEM REDE por padrao.
// O envio real exige flag e credencial APENAS do projeto HOMOLOGACAO.
import {readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readEbefDashboardData} from './ebef-dashboard-from-xlsx.mjs';
import {prepareEbefHomologRows,importEbefHomologOnce}
  from './ebef-homolog-import.mjs';

async function mostRecent(){
  const dir=resolve(process.cwd(),'reports');
  const files=(await readdir(dir)).filter(x=>
    /^LUCE_EBEF_2026_10_[0-9a-f]{10}\.xlsx$/.test(x));
  if(!files.length)throw Error('Excel local E-BEF outubro nao encontrado em reports/.');
  const rows=await Promise.all(files.map(async f=>({
    file:join(dir,f),time:(await stat(join(dir,f))).mtimeMs
  })));
  return rows.sort((a,b)=>b.time-a.time)[0].file;
}
const flags=process.argv.slice(2);
if(flags.some(x=>x!=='--confirm-homolog-upload')||
   flags.filter(x=>x==='--confirm-homolog-upload').length>1){
  throw Error('Opcao invalida. Uso: npm run homolog:preview ou homolog:import');
}
const confirmed=flags.includes('--confirm-homolog-upload');
const file=await mostRecent();
const data=await readEbefDashboardData(file);
const {rows,summary}=prepareEbefHomologRows(data);
console.log('LUCE E-BEF HOMOLOGACAO: '+JSON.stringify(summary));
if(!confirmed){
  console.log('MODO PREVIEW: SEM REDE E SEM GRAVACAO. Revise os dados e a autorizacao.');
}else{
  const key=process.env.EBEF_HOMOLOG_SERVICE_ROLE_KEY;
  if(process.env.EBEF_HOMOLOG_SUPABASE_URL!==
      'https://xwpwjwbpahdphksggatm.supabase.co'){
    throw Error('URL de homologacao nao confirmada. Nenhuma escrita.');
  }
  console.log('ENVIANDO EXCLUSIVAMENTE AO PROJETO E-BEF HOMOLOGACAO...');
  const result=await importEbefHomologOnce(rows,{
    key,confirmed:true
  });
  console.log('HOMOLOGACAO_RESULTADO_SEM_DADOS_CLIENTES: '+JSON.stringify(result));
  console.log('Nenhuma sincronizacao em banco de producao executada.');
}
