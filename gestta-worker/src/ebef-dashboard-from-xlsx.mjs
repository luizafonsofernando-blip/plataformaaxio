// Adapta o Excel local homologado em um JSON para visualizacao, SEM REDE.
// Uso: node src/ebef-dashboard-from-xlsx.mjs --input=reports/ARQUIVO.xlsx
import ExcelJS from 'exceljs';
import {stat,mkdir,open,unlink} from 'node:fs/promises';
import {basename,dirname,join,resolve,extname} from 'node:path';
import {randomBytes} from 'node:crypto';

const MAX_BYTES=12*1024*1024;
const MAX_ROWS=20000;
const HEADERS=[
  'CNPJ','Empresa','Categoria','Status Gestta','Descrição da tarefa',
  'Departamento','Responsável','Data Meta','Competência','Concluída em','ID Gestta'
];
function value(cell){
  const x=cell.value;
  if(x==null)return '';
  if(typeof x==='object'){
    if('richText' in x)return x.richText.map(part=>part.text||'').join('');
    if('text' in x)return String(x.text);
    return '';
  }
  return String(x);
}
function stripFormulaProtection(x){
  const text=String(x).trim();
  return text.startsWith("'")&&/^[=+@\-]/.test(text.slice(1))?
    text.slice(1):text;
}
export async function readEbefDashboardData(xlsxPath){
  if(extname(xlsxPath).toLowerCase()!=='.xlsx')throw Error('Informe um XLSX gerado pela LUCE.');
  const info=await stat(xlsxPath);
  if(!info.isFile()||info.size===0||info.size>MAX_BYTES){
    throw Error('Arquivo fora do limite permitido.');
  }
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet=workbook.getWorksheet('Tarefas');
  const panel=workbook.getWorksheet('Painel');
  if(!sheet||!panel||!workbook.getWorksheet('Empresas')){
    throw Error('Excel nao possui as tres abas esperadas da LUCE.');
  }
  if(sheet.rowCount<5||sheet.rowCount-4>MAX_ROWS){
    throw Error('Quantidade de linhas nao autorizada.');
  }
  const found=HEADERS.map((_,i)=>value(sheet.getRow(4).getCell(i+1)).trim());
  if(HEADERS.some((header,i)=>found[i]!==header)){
    throw Error('Cabecalho de tarefas inesperado; importacao cancelada.');
  }
  const month=value(panel.getCell('B4')).trim();
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){
    throw Error('Mes nao reconhecido no Excel.');
  }
  const tasks=[],seen=new Set();
  const safeDate=x=> {
    if(!x)return '';
    if(!/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/20\d{2}$/.test(x)){
      throw Error('Data de tarefa invalida.');
    }
    const [dd,mm,yyyy]=x.split('/');
    const d=new Date(yyyy+'-'+mm+'-'+dd+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==yyyy+'-'+mm+'-'+dd){
      throw Error('Data de tarefa invalida.');
    }
    return yyyy+'-'+mm+'-'+dd;
  };
  for(let i=5;i<=sheet.rowCount;i++){
    const row=sheet.getRow(i);
    if(!row.hasValues)continue;
    const fields=HEADERS.map((_,j)=>stripFormulaProtection(value(row.getCell(j+1))));
    const [cnpj,empresa,categoria,status,titulo,departamento,responsavel,
      meta,competencia,conclusao,id]=fields;
    if(!/^\d{14}$/.test(cnpj)||!/^[a-f0-9]{24}$/.test(id)||
       !empresa||!status||!titulo||!responsavel||
       !['Verificação','Declaração'].includes(categoria)||
       !/^20\d{2}-(0[1-9]|1[0-2])$/.test(competencia)||
       seen.has(id)){
      throw Error('Linha inconsistente ou ID duplicado; importacao cancelada.');
    }
    seen.add(id);
    tasks.push({cnpj,empresa,categoria,status,titulo,departamento,
      responsavel,dataMeta:safeDate(meta),
      competencia,concluidoEm:safeDate(conclusao),id});
  }
  if(tasks.length===0)throw Error('O Excel nao possui tarefas.');
  const cnps=new Set(tasks.map(x=>x.cnpj));
  if(Number(panel.getCell('B5').value)!==cnps.size||
     Number(panel.getCell('B6').value)!==tasks.length){
    throw Error('Contagens do Painel divergem das tarefas.');
  }
  return {
    schema:'luce-ebef-local/v1',
    month,origin:'arquivo_local',coverage:'usuarios_nao_comprovados',
    transmission:'nao_comprovada',sync:false,
    tasks,
  };
}
export async function saveEbefDashboardData(xlsxPath,outFolder){
  const data=await readEbefDashboardData(xlsxPath);
  const folder=resolve(outFolder??dirname(resolve(xlsxPath)));
  await mkdir(folder,{recursive:true,mode:0o700});
  const outName=basename(xlsxPath,'.xlsx')+'_painel_'+
    randomBytes(4).toString('hex')+'.json';
  const dest=join(folder,outName);
  let handle;
  try{
    handle=await open(dest,'wx',0o600);
    await handle.writeFile(JSON.stringify(data),'utf8');
    await handle.close();
    return {dest,companies:new Set(data.tasks.map(x=>x.cnpj)).size,
      tasks:data.tasks.length};
  }catch{
    if(handle){await handle.close().catch(()=>{});await unlink(dest).catch(()=>{});}
    throw Error('Nao foi possivel preparar o arquivo do painel.');
  }
}
