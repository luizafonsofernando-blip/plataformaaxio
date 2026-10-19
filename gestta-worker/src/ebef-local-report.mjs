// Relatorio E-BEF local, gerado somente com dados JA validados pelo auditor.
// Contem CNPJs e nomes: proteger pasta reports/ e nunca anexar ao GitHub.
// Nenhum acesso ao Gestta, Supabase, LUCE ou rede neste modulo.
import ExcelJS from 'exceljs';
import {mkdir,open,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {ascii} from './normalize.mjs';

const NAVY='12213B',BLUE='244A79',SILVER='E7ECF2',WHITE='FFFFFF';
const SUCCESS='DDF3E8',WARNING='FFF2D7',RED='F9E2E2',TEXT='172B49';
const dash=v=>v===null||v===undefined?'':String(v);
const safeText=v=>{
  const value=dash(v).replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  return /^[=+@\-]/.test(value)?"'"+value:value;
};
const displayDate=iso=>!iso?'':iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const statusOf=t=>ascii(t.status_gestta);
const isConcluded=t=>['CONCLUIDA','CONCLUIDO'].includes(statusOf(t));
const isOpen=t=>['ABERTA','ABERTO'].includes(statusOf(t));
const groupName=t=>t.tipo_tarefa==='declaracao'?'Declaração':'Verificação';
function initSheet(wb,name,headers,widths){
  const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:4}]});
  ws.mergeCells(1,1,1,headers.length);
  const heading=ws.getCell(1,1);
  heading.value='LUCE SISTEMAS  |  CONTROLE E-BEF';
  heading.font={name:'Aptos Display',bold:true,size:16,color:{argb:WHITE}};
  heading.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  ws.getRow(1).height=31;
  ws.mergeCells(2,1,2,headers.length);
  ws.getCell(2,1).value='Espelho Gestta • não comprova transmissão de declaração • arquivo confidencial';
  ws.getCell(2,1).font={name:'Aptos',size:10,color:{argb:BLUE},italic:true};
  ws.getRow(2).height=23;
  ws.columns=widths.map(width=>({width}));
  const hdr=ws.getRow(4);
  hdr.values=headers;
  hdr.height=26;
  hdr.eachCell(cell=>{
    cell.font={name:'Aptos',bold:true,size:10,color:{argb:WHITE}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:BLUE}};
    cell.alignment={vertical:'middle',wrapText:true};
    cell.border={bottom:{style:'thin',color:{argb:'CBD5E1'}}};
  });
  ws.autoFilter={from:{row:4,column:1},to:{row:4,column:headers.length}};
  ws.pageSetup={fitToPage:true,fitToWidth:1,fitToHeight:0,orientation:'landscape'};
  return ws;
}
function styleRows(ws,first,last,statusColumn){
  for(let r=first;r<=last;r++){
    const row=ws.getRow(r);
    row.height=24;
    row.eachCell({includeEmpty:true},(cell,col)=>{
      cell.font={name:'Aptos',size:10,color:{argb:TEXT}};
      cell.alignment={vertical:'middle',wrapText:false};
      if(r%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F5F7FA'}};
      if(col===statusColumn){
        const v=ascii(cell.value);
        const color=/CONCLUID/.test(v)?SUCCESS:/ABERT|PENDENT/.test(v)?WARNING:RED;
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};
        cell.font={name:'Aptos',size:10,bold:true,color:{argb:TEXT}};
      }
    });
  }
}
function verifiedReviewed(reviewed){
  if(!reviewed||!reviewed.summary||!Array.isArray(reviewed.tasks)||
    reviewed.summary.distinctTasks!==reviewed.tasks.length ||
    reviewed.summary.uniqueCnpjs<0||
    reviewed.summary.completeWindows!==true ||
    reviewed.summary.writesPerformed!==false ||
    reviewed.summary.allUsersProven!==false){
    throw new Error('Auditoria mensal incompleta; arquivo nao gerado.');
  }
  if(new Set(reviewed.tasks.map(t=>t.source_key)).size!==reviewed.tasks.length){
    throw new Error('ID repetido; arquivo nao gerado.');
  }
  for(const t of reviewed.tasks){
    if(!/^\d{14}$/.test(t.cnpj??'')||
      !/^[a-f0-9]{24}$/.test(t.gestta_id??'')||
      !['verificacao','declaracao'].includes(t.tipo_tarefa)||
      !['string'].includes(typeof t.cliente)){
      throw new Error('Tarefa inconsistente; arquivo nao gerado.');
    }
  }
}

export function buildEbefLocalWorkbook(reviewed){
  verifiedReviewed(reviewed);
  const {summary,tasks}=reviewed;
  const wb=new ExcelJS.Workbook();
  wb.creator='LUCE Sistemas • Relatorio local';
  wb.title='Controle E-BEF - '+summary.month;
  wb.subject='Acompanhamento de tarefas Gestta, sem comprovar transmissao';
  const dashSheet=wb.addWorksheet('Painel', {
    views:[{state:'frozen',ySplit:2}]
  });
  dashSheet.columns=[{width:36},{width:25},{width:34},{width:26}];
  dashSheet.mergeCells('A1:D2');
  dashSheet.getCell('A1').value='LUCE  |  PAINEL E-BEF';
  dashSheet.getCell('A1').font={bold:true,size:20,color:{argb:WHITE}};
  dashSheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};
  dashSheet.getRow(1).height=26;dashSheet.getRow(2).height=20;
  const metrics=[
    ['Competência consultada',summary.month],
    ['Empresas distintas',summary.uniqueCnpjs],
    ['Tarefas únicas',summary.distinctTasks],
    ['Abertas',summary.statusCounts?.aberta??0],
    ['Concluídas no Gestta',summary.statusCounts?.concluida??0],
    ['Com impedimento',summary.statusCounts?.impedimento??0],
    ['Desconsideradas',summary.statusCounts?.desconsiderada??0],
    ['Tarefas de verificação',summary.categories?.verificacao??0],
    ['Tarefas de declaração',summary.categories?.declaracao??0],
    ['Registros brutos / duplicados',summary.rawRows+' / '+summary.overlapDuplicates],
    ['Envio à LUCE','NÃO REALIZADO'],
    ['Declaração transmitida','NÃO COMPROVADA'],
    ['Abrangência dos usuários','NÃO COMPROVADA'],
  ];
  let r=4;
  for(const [label,value] of metrics){
    const line=dashSheet.getRow(r++);
    line.values=[label,value];
    line.height=27;
    line.getCell(1).font={bold:true,color:{argb:BLUE},size:11};
    line.getCell(2).font={color:{argb:TEXT},bold:true,size:11};
    for(let c=1;c<=2;c++)line.getCell(c).fill={type:'pattern',
      pattern:'solid',fgColor:{argb:(r%2===0?'EDF2F7':'F8FAFC')}};
  }
  dashSheet.mergeCells('A19:D20');
  dashSheet.getCell('A19').value='ATENÇÃO: conclusão no Gestta não é comprovante de transmissão da E-BEF. Conferir protocolos e obrigações no controle oficial.';
  dashSheet.getCell('A19').alignment={wrapText:true,vertical:'middle'};
  dashSheet.getCell('A19').fill={type:'pattern',pattern:'solid',fgColor:{argb:WARNING}};
  dashSheet.getCell('A19').font={bold:true,color:{argb:TEXT},size:10};
  dashSheet.getRow(19).height=29;dashSheet.getRow(20).height=22;
  const byCnpj=new Map();
  for(const t of tasks){
    let data=byCnpj.get(t.cnpj);
    if(!data){
      data={cnpj:t.cnpj,cliente:t.cliente,quantidade:0,
        abertas:0,concluidas:0,outras:0,verificacao:0,declaracao:0};
      byCnpj.set(t.cnpj,data);
    }
    data.quantidade++;
    data[t.tipo_tarefa]++;
    if(isConcluded(t))data.concluidas++;
    else if(isOpen(t))data.abertas++;
    else data.outras++;
  }
  const companySheet=initSheet(wb,'Empresas',
    ['CNPJ','Empresa','Tarefas','Abertas','Concluídas','Outras',
     'Verificação','Declaração','Situação do Gestta'],
    [20,50,13,13,16,13,17,17,31]);
  const companies=[...byCnpj.values()].sort((a,b)=>a.cliente.localeCompare(b.cliente,'pt-BR'));
  for(const c of companies){
    const status=c.abertas?'PENDENTES':c.outras?'REVISAR':'CONCLUÍDAS NO GESTTA';
    const row=companySheet.addRow([
      c.cnpj,safeText(c.cliente),c.quantidade,c.abertas,c.concluidas,
      c.outras,c.verificacao,c.declaracao,status
    ]);
    row.getCell(1).numFmt='@';
  }
  styleRows(companySheet,5,companySheet.rowCount,9);
  const taskSheet=initSheet(wb,'Tarefas',
    ['CNPJ','Empresa','Categoria','Status Gestta','Descrição da tarefa',
     'Departamento','Responsável','Data Meta','Competência','Concluída em','ID Gestta'],
    [20,48,17,20,62,26,28,18,16,19,30]);
  const order=[...tasks].sort((a,b)=>
    a.cnpj.localeCompare(b.cnpj)||a.vencimento.localeCompare(b.vencimento)||
    a.gestta_id.localeCompare(b.gestta_id));
  for(const t of order){
    const row=taskSheet.addRow([
      t.cnpj,safeText(t.cliente),groupName(t),safeText(t.status_gestta),
      safeText(t.tarefa),safeText(t.departamento),safeText(t.responsavel),
      displayDate(t.vencimento),t.competencia,
      displayDate(t.concluido_em),t.gestta_id
    ]);
    row.getCell(1).numFmt='@';row.getCell(11).numFmt='@';
  }
  styleRows(taskSheet,5,taskSheet.rowCount,4);
  return wb;
}

// Somente apos consentimento de armazenamento LOCAL. Arquivo nao sera sobrescrito.
export async function saveEbefLocalWorkbook(reviewed,{directory}={}){
  const wb=buildEbefLocalWorkbook(reviewed);
  const folder=resolve(directory??resolve(process.cwd(),'reports'));
  await mkdir(folder,{recursive:true,mode:0o700});
  const filename='LUCE_EBEF_'+reviewed.summary.month.replace('-','_')+
    '_'+randomBytes(5).toString('hex')+'.xlsx';
  const filepath=join(folder,filename);
  const buffer=await wb.xlsx.writeBuffer();
  let handle;
  try{
    handle=await open(filepath,'wx',0o600);
    await handle.writeFile(buffer);
    await handle.close();
    return {filepath,filename,records:reviewed.tasks.length,
      companies:reviewed.summary.uniqueCnpjs};
  }catch{
    if(handle){await handle.close().catch(()=>{});await unlink(filepath).catch(()=>{});}
    throw new Error('Nao foi possivel salvar relatorio local com seguranca.');
  }
}
