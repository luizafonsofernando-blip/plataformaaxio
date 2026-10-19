'use strict';
// Controle 100% local: File API -> memoria. Sem fetch, storage, API ou uploads.
const $=id=>document.getElementById(id);
let records=[],period='',view='companies';
const dataCells=['cnpj','empresa','categoria','status','titulo',
  'departamento','responsavel','dataMeta','competencia','concluidoEm','id'];
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const kind=status=>{
  const s=normalize(status);
  return s==='ABERTA'||s==='ABERTO'?'open':
    s==='CONCLUIDA'||s==='CONCLUIDO'?'done':'other';
};
const textNode=(tag,value,className)=>{
  const el=document.createElement(tag);
  el.textContent=value==null?'':String(value);
  if(className)el.className=className;
  return el;
};
const dateLabel=iso=>!iso?'—':iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
function notice(message,error=false){
  $('notice').textContent=message;
  $('notice').classList.toggle('error',error);
}
function validateData(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
     data.schema!=='luce-ebef-local/v1' ||
     data.origin!=='arquivo_local' ||
     data.sync!==false ||
     data.coverage!=='usuarios_nao_comprovados' ||
     data.transmission!=='nao_comprovada' ||
     !/^20\d{2}-(0[1-9]|1[0-2])$/.test(data.month??'')||
     !Array.isArray(data.tasks) ||
     data.tasks.length<1||data.tasks.length>20000){
    throw Error('Arquivo de painel invalido. Prepare novamente a partir do Excel LUCE.');
  }
  const ids=new Set();
  for(const row of data.tasks){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       dataCells.some(field=>typeof row[field]!=='string' || row[field].length>1000) ||
       !/^\d{14}$/.test(row.cnpj)||
       !/^[a-f0-9]{24}$/.test(row.id)||
       !['Verificação','Declaração'].includes(row.categoria)||
       !row.empresa.trim()||!row.status.trim()||
       ids.has(row.id)){
      throw Error('Arquivo com tarefa inconsistente ou ID duplicado.');
    }
    ids.add(row.id);
  }
  return data;
}
function matches(row){
  const query=normalize($('search').value);
  const status=$('status').value;
  const category=$('category').value;
  if(status!=='all'&&kind(row.status)!==status)return false;
  if(category!=='all'&&row.categoria!==category)return false;
  return !query||normalize([row.cnpj,row.empresa,row.titulo,
    row.responsavel,row.departamento,row.id].join(' ')).includes(query);
}
function td(row,value,cls){
  row.append(textNode('td',value,cls));
}
function pill(row,label,status){
  const cell=document.createElement('td');
  const chip=textNode('span',label,'pill '+status);
  cell.append(chip);row.append(cell);
}
function showHead(labels){
  const tr=document.createElement('tr');
  labels.forEach(h=>tr.append(textNode('th',h)));
  $('thead').replaceChildren(tr);
}
function render(){
  const filtered=records.filter(matches);
  const body=$('tbody');
  body.replaceChildren();
  $('tableTitle').textContent=view==='companies'?'Empresas':'Tarefas';
  $('tabCompanies').classList.toggle('active',view==='companies');
  $('tabTasks').classList.toggle('active',view==='tasks');
  $('tabCompanies').setAttribute('aria-pressed',String(view==='companies'));
  $('tabTasks').setAttribute('aria-pressed',String(view==='tasks'));
  $('period').textContent=period?'Consulta '+period:'Período —';
  if(view==='companies'){
    showHead(['Empresa','CNPJ','Tarefas','Em aberto','Concluídas','Situação']);
    const grouped=new Map();
    for(const t of filtered){
      const x=grouped.get(t.cnpj)||{
        cnpj:t.cnpj,empresa:t.empresa,count:0,open:0,done:0,other:0
      };
      x.count++;x[kind(t.status)]++;grouped.set(t.cnpj,x);
    }
    const list=[...grouped.values()].sort((a,b)=>
      a.empresa.localeCompare(b.empresa,'pt-BR'));
    for(const item of list.slice(0,500)){
      const tr=document.createElement('tr');
      td(tr,item.empresa,'company');td(tr,item.cnpj,'mono');
      td(tr,item.count);td(tr,item.open);td(tr,item.done);
      pill(tr,item.open?'Pendente':item.other?'Revisar':'Concluída no Gestta',
        item.open?'open':item.other?'other':'done');
      body.append(tr);
    }
    $('count').textContent=list.length+' empresas encontradas'+
      (list.length>500?' (primeiras 500 exibidas)':'');
  }else{
    showHead(['Empresa','CNPJ','Tarefa','Status','Data Meta','Responsável']);
    const list=[...filtered].sort((a,b)=>
      a.empresa.localeCompare(b.empresa,'pt-BR') ||
      a.dataMeta.localeCompare(b.dataMeta));
    for(const item of list.slice(0,500)){
      const tr=document.createElement('tr');
      td(tr,item.empresa,'company');td(tr,item.cnpj,'mono');
      td(tr,item.titulo);
      pill(tr,item.status,kind(item.status));
      td(tr,dateLabel(item.dataMeta));td(tr,item.responsavel);
      body.append(tr);
    }
    $('count').textContent=list.length+' tarefas encontradas'+
      (list.length>500?' (primeiras 500 exibidas)':'');
  }
  if(body.children.length===0){
    const tr=document.createElement('tr');
    const cell=textNode('td',records.length?
      'Nenhum resultado para os filtros atuais.':'Nenhum arquivo carregado.','empty');
    cell.colSpan=6;tr.append(cell);body.append(tr);
  }
}
function metrics(){
  const companies=new Set(records.map(t=>t.cnpj)).size;
  const open=records.filter(t=>kind(t.status)==='open').length;
  const done=records.filter(t=>kind(t.status)==='done').length;
  $('mCompanies').textContent=companies||'—';
  $('mTasks').textContent=records.length||'—';
  $('mOpen').textContent=records.length?open:'—';
  $('mDone').textContent=records.length?done:'—';
  $('subInfo').textContent=period?
    'Recorte '+period+' • somente espelho das tarefas Gestta':
    'Importe um arquivo para visualizar sua carteira.';
}
$('fileInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  // Nunca manter dados anteriores quando a importacao falha.
  records=[];period='';
  ['search','status','category','clear'].forEach(id=>$(id).disabled=true);
  $('search').value='';$('status').value='all';$('category').value='all';
  try{
    if(!file.name.toLowerCase().endsWith('.json')||file.size>8*1024*1024){
      throw Error('Selecione um JSON local válido de até 8 MB.');
    }
    const parsed=validateData(JSON.parse(await file.text()));
    records=parsed.tasks;period=parsed.month;
    ['search','status','category','clear'].forEach(id=>$(id).disabled=false);
    notice('Painel carregado localmente: '+records.length+
      ' tarefas. Nenhuma informação foi enviada para servidores.');
  }catch(err){
    notice(err instanceof SyntaxError?
      'O arquivo não contém um JSON válido.':err.message,true);
  }finally{
    e.target.value='';metrics();render();
  }
});
$('search').addEventListener('input',render);
$('status').addEventListener('change',render);
$('category').addEventListener('change',render);
$('clear').addEventListener('click',()=>{
  $('search').value='';$('status').value='all';$('category').value='all';render();
});
$('tabCompanies').addEventListener('click',()=>{view='companies';render()});
$('tabTasks').addEventListener('click',()=>{view='tasks';render()});
render();
