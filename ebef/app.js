import {statuses,defaults,stages,colors,key,done,exempt,open,today,days,priority,next,normalize,stats,owners,progress,inspectSheet,importRows,normalizeCnpj} from './domain.js';
import {db,local,persist,check,all,signIn} from './store.js';

const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const date=x=>x ? x.slice(0,10).split('-').reverse().join('/') : '—';
const nav={'Dashboard':'◫','Declarações':'▤','Pendências':'◷','Configurações':'⚙'};
const filters={year:'',owner:'',status:'',from:'',to:'',search:'',issue:''};
const modal=$('modal');
let state={rows:[],rules:[],audit:[]}, page='Dashboard', user=null, role=null, preview=false, timer, stream;
const admin=()=>role==='Administrador';
const message=x=>{clearTimeout(timer);$('notice').textContent=x;timer=setTimeout(()=>$('notice').textContent='',5500);};
const opts=(items,value,placeholder)=> (placeholder?'<option value="">'+esc(placeholder)+'</option>':'')+items.map(item=>{
  const [v,l]=Array.isArray(item)?item:[item,item];
  return '<option value="'+esc(v)+'" '+(String(v)===String(value)?'selected':'')+'>'+esc(l)+'</option>';
}).join('');
const button=(label,action,primary=false)=>'<button type="button" '+(primary?'class="primary" ':'')+'data-action="'+action+'">'+esc(label)+'</button>';
const input=(name,label,value='',type='text',extra='')=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
const select=(name,label,items,value,placeholder)=>'<label>'+esc(label)+'<select name="'+name+'">'+opts(items,value,placeholder)+'</select></label>';
const badge=(label,color='')=>'<span class="badge '+color+'">'+esc(label)+'</span>';
const track=n=>'<div class="track" role="progressbar" aria-label="Conclusão" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(n??0)+'"><i style="width:'+(n??0)+'%"></i></div>';
const section=(title,body,actions='')=>'<section class="panel"><div class="section-head"><h2>'+esc(title)+'</h2>'+actions+'</div>'+body+'</section>';
const table=(cols,rows,empty='Nenhum registro encontrado.')=>'<div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+ (rows.length?rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join(''):'<tr><td class="empty" colspan="'+cols.length+'">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';
const scoped=()=>state.rows.filter(r=>{
  const period=r.sent||r.due||r.start;
  return (!filters.year||r.year===Number(filters.year)) && (!filters.owner||(r.owner||'Sem responsável')===filters.owner)
    && (!filters.status||r.status===filters.status) && (!filters.from||(period&&period>=filters.from)) && (!filters.to||(period&&period<=filters.to));
});
const sortedIssues=rows=>rows.filter(r=>open(r)||done(r)&&!r.sent).sort((a,b)=>(open(a)?days(a)??1e7:1e8)-(open(b)?days(b)??1e7:1e8)||a.company.localeCompare(b.company,'pt-BR'));
const heading=(title,sub,actions='')=>'<div class="print-title"><h1>Orteconte · '+esc(title)+'</h1></div><div class="heading"><div><div class="eyebrow">CONTROLE E-BEF</div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div><div class="actions">'+actions+'</div></div>';
function filterBar(){
  const years=[...new Set(state.rows.map(r=>r.year))].sort((a,b)=>b-a);
  return '<form class="panel filters" id="filters">'+select('year','Ano de referência',years,filters.year,'Todos os anos')+
    select('owner','Responsável',owners(state.rows).map(r=>r.name),filters.owner,'Todos')+select('status','Status',statuses,filters.status,'Todos')+
    input('from','Período inicial',filters.from,'date')+input('to','Período final',filters.to,'date')+
    (page==='Declarações'?input('search','Pesquisar empresa ou CNPJ',filters.search,'search'):page==='Pendências'?select('issue','Ocorrência',[['waiting','Aguardando cliente'],['owner','Sem responsável'],['sent','Envio sem data'],['urgent','Vencidas ou próximas'],['done','Concluídas']],filters.issue,'Principais pendências'):'')+
    button('Limpar','clear')+'</form>';
}
function company(r){return '<strong>'+esc(r.company)+'</strong><small>'+esc(r.cnpj)+' · '+esc(r.establishment)+' · '+r.year+'</small>';}
function editButton(r){return button('Editar','edit:'+esc(r.id));}
function issuesTable(rows){
  return table(['Empresa','Status','Responsável','Vencimento','Prioridade','Próxima ação',''],rows.map(r=>{
    const [color,label]=priority(r);
    return [company(r),badge(r.status),esc(r.owner||'—'),date(r.due),badge(label,color),done(r)&&r.sent?'—':esc(next(r)),editButton(r)].map((x,i)=>i===3&&open(r)&&days(r)!==null?x+'<small>'+Math.abs(days(r))+' d '+(days(r)<0?'de atraso':days(r)===0?'· vence hoje':'restantes')+'</small>':x);
  }),'Nenhuma pendência neste recorte.');
}
function dashboard(rows){
  const s=stats(rows);
  const cards=[['▦',s.companies,'Empresas cadastradas'],['◎',s.obligedCompanies,'Empresas obrigadas'],['✓',s.sent,'Enviadas e retificadas'],['◷',s.pending,'Pendentes de envio'],['◫',s.active,'Em andamento'],['◌',s.waiting,'Aguardando cliente'],['◇',s.exempt,'Empresas dispensadas'],['↗',s.rate===null?'—':s.rate+'%','Taxa de envio'],['!',s.urgent,'Prazos em atenção'],['□',s.undated,'Envios sem data']];
  const counts=statuses.map(st=>rows.filter(r=>r.status===st).length);
  let end=0;
  const segments=counts.flatMap((count,i)=>{
    if(!count) return [];
    const start=end; end+=100*count/rows.length;
    return [colors[i]+' '+start+'% '+end+'%'];
  });
  const monthly=Array.from({length:12},(_,i)=>rows.filter(r=>done(r)&&r.sent&&Number(r.sent.slice(5,7))===i+1).length);
  const max=Math.max(1,...monthly);
  return '<div class="metrics">'+cards.map(([icon,n,label])=>'<div class="metric"><i aria-hidden="true">'+icon+'</i><strong>'+n+'</strong><span>'+label+'</span></div>').join('')+'</div>'+
    '<div class="chart-grid">'+section('Declarações por status','<div class="ring-grid"><div class="ring" style="background:'+(segments.length?'conic-gradient('+segments.join(',')+')':'#e6edf7')+'"><b>'+rows.length+'</b></div><div class="legend">'+statuses.map((st,i)=>'<div><i style="background:'+colors[i]+'"></i>'+st+'<b>'+counts[i]+'</b></div>').join('')+'</div></div>')+
    section('Envios por mês','<p>Distribuição pela data de envio registrada</p><div class="bars">'+monthly.map((n,i)=>'<div class="bar"><b>'+n+'</b><i style="height:'+Math.round(n/max*107)+'px"></i><span>'+['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i]+'</span></div>').join('')+'</div>')+'</div>'+
    '<div class="progress">'+section('Conclusão da carteira',track(s.rate)+'<p>'+s.sent+' de '+(s.sent+s.pending)+' declarações obrigadas concluídas'+(s.rate===null?'':' · '+s.rate+'%')+'</p>')+'</div>'+
    '<div class="stack">'+section('Pendências e próximos vencimentos',issuesTable(sortedIssues(rows).slice(0,6)),button('Ver pendências','page:Pendências'))+
    section('Execução por responsável',table(['Responsável','Concluídas','Pendentes','Taxa'],owners(rows).map(r=>[esc(r.name),r.sent,r.pending,r.rate===null?'—':r.rate+'%'])))+'</div>';
}
function declarations(rows){
  const q=normalize(filters.search), compact=q.replaceAll(' ','');
  rows=rows.filter(r=>!q||normalize(r.company).includes(q)||r.cnpj.toLowerCase().includes(compact)).sort((a,b)=>a.company.localeCompare(b.company,'pt-BR')||b.year-a.year);
  return section('Declarações ('+rows.length+')',table(['Empresa','Status / etapa','Responsável','Início','Limite','Envio','Andamento','Observações','Última atualização',''],rows.map(r=>{
    const n=progress(r,state.rules);
    return [company(r),badge(r.status,done(r)?'green':'')+'<small>'+esc(r.stage)+'</small>',esc(r.owner||'—'),date(r.start),date(r.due),date(r.sent),n===null?'—':n+'%',esc(r.notes||'—'),'<span class="updated">'+date(r.updated_at||r.source_updated)+'</span>',editButton(r)];
  }),'Nenhuma declaração cadastrada neste recorte.'));
}
function settings(){
  const rules=state.rules.map(r=>[esc(r.status),esc(r.stage||'—'),r.value+'%',button('Remover','rule-remove:'+esc(r.id))]);
  return '<div class="stack">'+section('Parâmetros de andamento','<p>O percentual segue a etapa registrada ou o status, conforme a planilha de controle.</p><div class="grid">'+
    table(['Status','Percentual'],statuses.map((s,i)=>[s,defaults[i]+'%']))+
    table(['Etapa','Percentual'],Object.entries(stages).map(([name,value])=>[name,value+'%']))+'</div>'+
    (admin()?'<form id="rule-form" class="filters">'+select('status','Status',statuses.filter(s=>!['Enviada','Retificada','Dispensado'].includes(s)))+
    input('stage','Etapa')+input('value','Percentual','','number','required min="0" max="100" step="any"')+'<button class="primary">Salvar regra</button></form>'+
    table(['Status','Etapa','Percentual',''],rules):''))+
    section('Histórico de alterações','<p>Abra uma declaração e selecione Histórico para consultar o autor e os campos alterados.</p>')+'</div>';
}
function render(){
  $('account').innerHTML=role?esc(preview?'Prévia neste navegador':role)+' '+button(preview?'Sair da prévia':'Sair','logout'):'';
  $('nav').innerHTML=role?Object.entries(nav).map(([label,icon])=>'<button type="button" class="'+(label===page?'active':'')+'" '+(label===page?'aria-current="page" ':'')+'data-action="page:'+label+'"><span aria-hidden="true">'+icon+'</span>'+label+'</button>').join(''):'';
  if(!role){
    $('app').innerHTML='<section class="panel login"><div class="eyebrow">ORTECONTE CONTABILIDADE</div><h1>Controle E-BEF</h1>'+
      (db?(user?'<p>Esta conta ainda não tem acesso ao módulo E-BEF.</p>'+button('Sair','logout'):'<p>Use sua conta Luce Sistemas.</p><form id="login">'+input('identifier','E-mail ou usuário','','text','required autocomplete="username"')+input('password','Senha','','password','required autocomplete="current-password"')+'<button class="primary">Entrar</button></form>'):
      '<p>O ambiente compartilhado aguarda configuração do Supabase. A prévia grava somente neste navegador. Use dados de teste.</p><div class="actions" style="margin-top:16px">'+button('Abrir prévia local','preview',true)+'</div>')+'</section>';
    return;
  }
  const rows=scoped();
  const report=button('Relatórios','reports');
  const add=button('Nova declaração','new',true), imp=admin()?button('Importar planilha','import'):'';
  if(page==='Dashboard') $('app').innerHTML=heading('Dashboard','Acompanhe as declarações, os envios e os prazos da carteira.',report+add)+filterBar()+dashboard(rows);
  if(page==='Declarações') $('app').innerHTML=heading('Declarações','Cadastre empresas e atualize o andamento de cada exercício.',imp+report+add)+filterBar()+declarations(rows);
  if(page==='Pendências'){
    const issue=filters.issue;
    const matches={waiting:r=>r.status==='Aguardando cliente',owner:r=>open(r)&&!r.owner,sent:r=>done(r)&&!r.sent,urgent:r=>open(r)&&r.due&&days(r)<=10,done};
    $('app').innerHTML=heading('Pendências','Priorize os próximos vencimentos e complete os dados de envio.',report)+filterBar()+section('Acompanhamento de prazos',issuesTable(issue?rows.filter(matches[issue]).sort((a,b)=>(days(a)??1e7)-(days(b)??1e7)):sortedIssues(rows)));
  }
  if(page==='Configurações') $('app').innerHTML=heading('Configurações','Consulte os parâmetros de andamento e o acesso da sua conta.')+settings();
}
function show(title,body){
  $('modal-content').innerHTML='<div class="section-head"><h2>'+esc(title)+'</h2>'+button('Fechar','close')+'</div>'+body;
  if(!modal.open) modal.showModal();
}
function editor(r={}){
  const values={year:Number(today().slice(0,4)),status:statuses[0],establishment:'Matriz',...r};
  show(r.id?'Editar declaração':'Nova declaração','<form id="editor" data-id="'+esc(r.id)+'" data-version="'+esc(r.updated_at)+'"><div class="grid">'+
    input('company','Razão social',values.company,'text','required maxlength="250"')+input('cnpj','CNPJ',values.cnpj,'text','required maxlength="22"')+
    select('establishment','Estabelecimento',['Matriz','Filial'],values.establishment)+input('year','Ano de referência',values.year,'number','required min="1900" max="2200"')+
    select('status','Status',statuses,values.status)+input('stage','Etapa',values.stage,'text','maxlength="150" list="stage-options"')+
    '<datalist id="stage-options">'+opts(Object.keys(stages))+'</datalist>'+
    input('owner','Responsável',values.owner,'text','maxlength="150"')+input('start','Data de início',values.start,'date')+input('due','Data-limite',values.due,'date')+input('sent','Data de envio',values.sent,'date')+
    '<label class="wide">Pendências e observações<textarea name="notes" rows="3" maxlength="4000">'+esc(values.notes)+'</textarea></label></div>'+
    '<div class="actions">'+(r.id?button('Histórico','audit:'+esc(r.id)):'')+'<button class="primary">Salvar declaração</button></div></form>');
  const form=$('editor');
  let filled=false;
  form.elements.sent.addEventListener('input',()=>{filled=false;});
  form.elements.status.addEventListener('change',()=>{
    const changed=done({status:form.elements.status.value})&&form.elements.status.value!==r.status;
    if(changed&&!form.elements.sent.value){form.elements.sent.value=today();filled=true;}
    if(!changed&&filled){form.elements.sent.value='';filled=false;}
  });
}
async function refresh(){
  if(preview){state=local();return;}
  const [rows,rules]=await Promise.all([all('ebef_declarations'),all('ebef_progress_rules')]);
  state={rows,rules,audit:[]};
}
function fromForm(form){return Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,typeof v==='string'?v.trim():v]));}
async function save(form){
  const data=fromForm(form), old=state.rows.find(r=>r.id===form.dataset.id);
  if(form.dataset.id&&old?.updated_at!==form.dataset.version) throw Error('O registro mudou. Feche o formulário e abra a versão mais recente.');
  data.cnpj=normalizeCnpj(data.cnpj); data.year=Number(data.year);
  if(!data.cnpj) throw Error('Informe um CNPJ válido no formato de 14 caracteres.');
  if(!data.company) throw Error('Informe a razão social.');
  if(state.rows.some(r=>r.id!==old?.id&&key(r)===key(data))) throw Error('Já existe uma declaração para este CNPJ e ano.');
  if(exempt(data)&&(!old||!exempt(old)||old.establishment!==data.establishment||old.cnpj!==data.cnpj||old.year!==data.year)){
    if(!confirm('Confirma a dispensa desta declaração?')) return;
  }
  if(exempt(data)&&data.establishment==='Filial'&&!data.stage) data.stage='Somente matriz';
  for(const k of ['start','due','sent']) data[k]=data[k]||null;
  if(old&&(old.stage!==data.stage||old.status!==data.status)) data.progress_source=null;
  if(preview){
    const current=local();
    const existing=current.rows.find(r=>key(r)===key(data));
    if(existing&&existing.id!==old?.id) throw Error('Este CNPJ e ano já estão cadastrados.');
    if(old&&current.rows.find(r=>r.id===old.id)?.updated_at!==old.updated_at) throw Error('O registro mudou. Reabra a versão mais recente.');
    const record={...old,...data,id:old?.id||crypto.randomUUID(),updated_at:new Date().toISOString()};
    current.rows=[...current.rows.filter(r=>r.id!==record.id),record];
    current.audit.push({declaration_id:record.id,changed_at:record.updated_at,actor:'Prévia local',before:old,after:record});persist(current);
  }else if(old){
    const changed=check(await db.from('ebef_declarations').update(data).eq('id',old.id).eq('updated_at',old.updated_at).select('id'));
    if(!changed.length) throw Error('O registro mudou. Feche o formulário e abra a versão mais recente.');
  }else check(await db.from('ebef_declarations').insert(data));
  await refresh();modal.close();render();message('Declaração salva.');
}
function importer(){
  show('Importar planilha','<form id="read-file" class="stack">'+input('file','Arquivo ODS, XLSX ou CSV','','file','required accept=".ods,.xlsx,.csv"')+
    input('fallback','Ano para linhas sem ano de referência','','number','min="1900" max="2200"')+
    '<p>As observações de origem ficam fora da importação para proteger dados de acesso. Os envios históricos mantêm a data original, inclusive quando estiver vazia.</p><div class="actions"><button class="primary">Gerar prévia</button></div></form>');
}
let importData;
async function readFile(form){
  const file=form.elements.file.files[0];
  if(file.size>15*1024*1024) throw Error('Selecione uma planilha de até 15 MB.');
  const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const book=XLSX.read(await file.arrayBuffer(),{cellDates:true,raw:true,sheetRows:15002});
  const sheets=book.SheetNames.flatMap(name=>{
    const grid=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true});
    const header=inspectSheet(grid);
    return header?[{name,grid,header}]:[];
  });
  if(!sheets.length) throw Error('Nenhuma aba contém os cabeçalhos de razão social e CNPJ.');
  importData={sheets,year:form.elements.fallback.value};
  importPreview(0);
}
function importPreview(index){
  const {grid,header}=importData.sheets[index];
  if(grid.length>=15002) throw Error('A aba excede o limite de 15 mil linhas. Divida a planilha antes de importar.');
  const parsed=importRows(grid,header,importData.year);
  const counts=new Map();
  for(const p of parsed) if(p.row) counts.set(key(p.row),(counts.get(key(p.row))||0)+1);
  const existing=new Map(state.rows.map(r=>[key(r),r]));
  importData.preview=parsed.map(p=>p.row ? {...p,existing:existing.get(key(p.row)),duplicate:counts.get(key(p.row))>1} : p);
  const available=importData.preview.filter(p=>p.row&&!p.duplicate);
  const errors=parsed.filter(p=>p.error).length;
  const duplicates=importData.preview.filter(p=>p.duplicate).length;
  const conflicts=available.filter(p=>p.existing).length;
  const warnings=available.filter(p=>p.warning).length;
  show('Prévia da importação','<form id="commit-import">'+select('sheet','Aba',importData.sheets.map((s,i)=>[i,s.name]),index)+
    '<p>'+available.length+' linhas válidas · '+conflicts+' existentes · '+duplicates+' duplicadas no arquivo · '+errors+' inválidas · '+warnings+' avisos.</p>'+
    table(['Linha','Empresa','Status','Envio','Resultado'],importData.preview.map(p=>[p.line,p.row?company(p.row):'—',esc(p.row?.status||'—'),date(p.row?.sent),esc(p.error||(p.duplicate?'Duplicada no arquivo · ignorada':p.existing?'Existente · ignorada por padrão':'Nova'))+(p.warning?'<small>'+esc(p.warning)+'</small>':'')]))+
    (conflicts?'<label class="check"><input type="checkbox" name="overwrite">Sobrescrever '+conflicts+' registros existentes</label>':'')+
    (available.some(p=>exempt(p.row))?'<label class="check"><input type="checkbox" name="exemption">Confirmo as dispensas selecionadas para importação</label>':'')+
    '<div class="actions">'+button('Trocar arquivo','import')+'<button class="primary" '+(!available.length?'disabled':'')+'>Confirmar importação</button></div></form>');
}
async function commitImport(form){
  const overwrite=form.elements.overwrite?.checked;
  const included=importData.preview.filter(p=>p.row&&!p.duplicate&&(!p.existing||overwrite));
  if(!included.length) throw Error('Nenhuma linha selecionada para importação.');
  if(included.some(p=>exempt(p.row))&&!form.elements.exemption?.checked) throw Error('Confirme as dispensas antes de importar.');
  const records=included.map(({row,existing})=>({row:{...row,notes:existing?.notes||''},id:existing?.id||null,expected:existing?.updated_at||null}));
  if(preview){
    const current=local(), existing=new Map(current.rows.map(r=>[key(r),r])), stamp=new Date().toISOString();
    for(const item of records){
      const before=existing.get(key(item.row));
      if(before&&(before.id!==item.id||before.updated_at!==item.expected)||!before&&item.id) throw Error('A carteira mudou. Reabra a prévia antes de importar.');
      const after={...item.row,id:item.id||crypto.randomUUID(),updated_at:stamp};
      existing.set(key(after),after);
      current.audit.push({declaration_id:after.id,actor:'Prévia local',changed_at:stamp,before,after});
    }
    current.rows=[...existing.values()];persist(current);
  }else check(await db.rpc('ebef_import',{items:records}));
  importData=null;await refresh();modal.close();render();message(included.length+' declarações importadas.');
}
function reportDialog(){
  show('Exportar relatório','<form id="report-form" class="stack">'+select('kind','Relatório',[['summary','Resumo geral'],['pending','Declarações pendentes'],['sent','Envios realizados por período'],['owners','Produtividade por responsável']])+
    '<p>O relatório usa os filtros da página. Para envios por período, somente datas de envio registradas são consideradas.</p><div class="actions"><button name="format" value="xlsx">Planilha XLSX</button><button class="primary" name="format" value="pdf">Imprimir / salvar em PDF</button></div></form>');
}
async function report(form,format){
  const kind=form.elements.kind.value;
  const rows=scoped();
  const statsRows=stats(rows);
  let title, cols, entries;
  if(kind==='summary'){
    title='Resumo geral';cols=['Indicador','Valor'];
    entries=[['Empresas cadastradas',statsRows.companies],['Empresas obrigadas',statsRows.obligedCompanies],['Enviadas e retificadas',statsRows.sent],['Pendentes',statsRows.pending],['Em andamento',statsRows.active],['Aguardando cliente',statsRows.waiting],['Dispensadas',statsRows.exempt],['Taxa de envio',statsRows.rate===null?'—':statsRows.rate+'%'],['Prazos em atenção',statsRows.urgent],['Envios sem data',statsRows.undated]];
  }else if(kind==='owners'){
    title='Produtividade por responsável';cols=['Responsável','Enviadas e retificadas','Pendentes','Taxa'];
    entries=owners(rows).map(r=>[r.name,r.sent,r.pending,r.rate===null?'—':r.rate+'%']);
  }else{
    title=kind==='sent'?'Envios por período':'Declarações pendentes';
    cols=['Razão social','CNPJ','Estabelecimento','Ano','Status','Etapa','Responsável','Início','Prazo','Data de envio'];
    entries=rows.filter(kind==='sent'?r=>done(r)&&r.sent:open).map(r=>[r.company,r.cnpj,r.establishment,r.year,r.status,r.stage,r.owner,date(r.start),date(r.due),date(r.sent)]);
  }
  if(format==='xlsx'){
    const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([cols,...entries]),title.slice(0,31));
    XLSX.writeFile(book,'E-BEF-'+kind+'.xlsx');
  }else{
    modal.close();
    const area=document.createElement('div');
    area.className='print-report';
    area.innerHTML='<h1>'+esc(title)+'</h1><p>Orteconte Contabilidade · '+date(today())+'</p>'+table(cols,entries.map(row=>row.map(esc)));
    document.body.append(area);
    try {window.print();} finally {area.remove();}
  }
}
async function audit(id){
  const labels={company:'Razão social',cnpj:'CNPJ',establishment:'Estabelecimento',year:'Ano',status:'Status',stage:'Etapa',owner:'Responsável',start:'Início',due:'Prazo',sent:'Envio',notes:'Observações',source_updated:'Data de atualização na origem',progress_source:'Andamento na origem'};
  const history=preview ? local().audit.filter(a=>a.declaration_id===id).reverse() : check(await db.from('ebef_audit').select().eq('declaration_id',id).order('changed_at',{ascending:false}));
  const display=x=>x==null||x===''?'—':esc(x);
  show('Histórico de alterações',table(['Data e hora','Autor','Alterações'],history.map(a=>[
    esc(new Date(a.changed_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})),esc(a.actor),
    a.before?Object.entries(labels).filter(([k])=>a.before[k]!==a.after[k]).map(([k,v])=>v+' · '+display(a.before[k])+' → '+display(a.after[k])).join('<br>')||'Atualização sem mudança de conteúdo':'Cadastro'
  ]))+'<div class="actions">'+button('Voltar à declaração','edit:'+id)+'</div>');
}
async function rule(form){
  const data=fromForm(form);
  data.value=Number(data.value);
  data.stage=normalize(data.stage);
  if(preview){
    const current=local();
    current.rules=current.rules.filter(r=>r.stage!==data.stage||r.status!==data.status);
    current.rules.push({...data,id:crypto.randomUUID()});persist(current);
  }else check(await db.from('ebef_progress_rules').upsert(data,{onConflict:'status,stage'}));
  await refresh();render();message('Regra salva.');
}
async function activate(session){
  if(stream){await db.removeChannel(stream);stream=null;}
  user=session?.user||null;
  role=null;
  state={rows:[],rules:[],audit:[]};
  if(user){
    role=check(await db.from('ebef_members').select('role').eq('id',user.id).maybeSingle())?.role||null;
    if(role){
      await refresh();
      stream=db.channel('ebef-carteira');
      for(const name of ['ebef_declarations','ebef_progress_rules']){
        stream.on('postgres_changes',{event:'*',schema:'public',table:name},()=>refresh().then(render).catch(e=>message(e.message)));
      }
      stream.subscribe();
    }
  }
  render();
}
async function action(value){
  const [kind,arg]=value.split(':');
  if(kind==='page'){page=arg;render();return;}
  if(kind==='preview'){preview=true;role='Administrador';state=local();render();return;}
  if(kind==='logout'){
    if(preview){preview=false;role=null;state={rows:[],rules:[],audit:[]};page='Dashboard';render();}
    else {check(await db.auth.signOut({scope:'local'}));await activate(null);}
    return;
  }
  if(kind==='close'){modal.close();importData=null;return;}
  if(!role) return;
  if(kind==='clear'){Object.keys(filters).forEach(k=>filters[k]='');render();}
  if(kind==='new') editor();
  if(kind==='edit'){const row=state.rows.find(r=>r.id===arg);if(row) editor(row);}
  if(kind==='audit') await audit(arg);
  if(kind==='import'&&admin()){importData=null;importer();}
  if(kind==='reports') reportDialog();
  if(kind==='rule-remove'&&admin()&&confirm('Remover esta regra de andamento?')){
    if(preview){const current=local();current.rules=current.rules.filter(r=>r.id!==arg);persist(current);}
    else check(await db.from('ebef_progress_rules').delete().eq('id',arg));
    await refresh();render();
  }
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');
  if(target) action(target.dataset.action).catch(e=>message(e.message));
});
document.addEventListener('change',event=>{
  const {form,name,value}=event.target;
  if(form?.id==='filters'){filters[name]=value;render();}
  if(form?.id==='commit-import'&&name==='sheet'){
    try {importPreview(Number(value));} catch(e){message(e.message);importer();}
  }
});
document.addEventListener('input',event=>{
  const {form,name,value}=event.target;
  if(form?.id==='filters'&&name==='search'){
    filters.search=value;
    const pos=event.target.selectionStart;
    render();
    const field=$('filters').elements.search;
    field.focus();field.setSelectionRange(pos,pos);
  }
});
document.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target, submit=event.submitter;
  if(submit) submit.disabled=true;
  try{
    if(form.id==='login'){
      const session=await signIn(form.elements.identifier.value,form.elements.password.value);
      await activate(session);
    }
    if(form.id==='editor') await save(form);
    if(form.id==='read-file'&&admin()) await readFile(form);
    if(form.id==='commit-import'&&admin()) await commitImport(form);
    if(form.id==='report-form') await report(form,submit?.value||'xlsx');
    if(form.id==='rule-form'&&admin()) await rule(form);
  }catch(e){message(e.message);}
  finally{if(submit) submit.disabled=false;}
});
window.addEventListener('storage',()=>{if(preview) refresh().then(render).catch(e=>message(e.message));});
render();
if(db){
  try {await activate(check(await db.auth.getSession()).session);}
  catch(e){message(e.message);}
  db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&user) setTimeout(()=>activate(null).catch(e=>message(e.message)),0);});
}
