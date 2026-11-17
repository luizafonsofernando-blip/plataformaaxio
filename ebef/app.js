import {statuses,selectableStatuses,selectableStatus,statusLabel,stages,colors,key,done,exempt,open,today,days,priority,next,normalize,stats,metricMatches,owners,responsibleNames,canonicalOwner,progress,inspectSheet,importRows,completeCnpj} from './domain.js';
import {attachCompanyLookup,qsaForSave} from './company-lookup.js';
import {db,local,persist,check,all,signIn,registerAccount,recoverAccount} from './store.js';

const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const date=x=>x ? x.slice(0,10).split('-').reverse().join('/') : '—';
const nav={'Dashboard':'chart','Declarações':'file','Pendências':'clock','Consulta CNPJ':'search'};
const iconPaths={
  search:'M14 14l4 4M15 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
  chart:'M3 3v14h14M7 13V9m4 4V6m4 7V3',
  file:'M6 2h6l4 4v12H4V2h2Zm6 0v5h4M7 10h6m-6 4h6',
  clock:'M10 5v5l3 2M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',

  building:'M2 18h16M4 18V4h8v14m0-10h4v10M7 7h2m-2 4h2m-2 4h2',
  check:'m4 10 4 4 8-8',
  upload:'M10 13V3M6 7l4-4 4 4M3 12v5h14v-5',
  shield:'M10 2 3 5v5c0 4 3 6 7 8 4-2 7-4 7-8V5l-7-3Zm-3 8 2 2 4-4',
  trend:'m3 15 5-5 3 3 6-7m-5 0h5v5'
};
const icon=name=>'<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+iconPaths[name]+'"/></svg>';
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
  return (!filters.year||r.year===Number(filters.year)) && (!filters.owner||(canonicalOwner(r.owner)||'Sem responsável')===filters.owner)
    && (!filters.status||selectableStatus(r.status)===filters.status) && (!filters.from||(period&&period>=filters.from)) && (!filters.to||(period&&period<=filters.to));
});
const sortedIssues=rows=>rows.filter(r=>open(r)||done(r)&&!r.sent).sort((a,b)=>(open(a)?days(a)??1e7:1e8)-(open(b)?days(b)??1e7:1e8)||a.company.localeCompare(b.company,'pt-BR'));
const heading=(title,sub,actions='')=>'<div class="print-title"><h1>Luce Sistemas · '+esc(title)+'</h1></div><div class="heading"><div><div class="eyebrow">CONTROLE E-BEF</div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div><div class="actions">'+actions+'</div></div>';
function filterBar(){
  const years=[...new Set(state.rows.map(r=>r.year))].sort((a,b)=>b-a);
  return '<form class="panel filters" id="filters">'+select('year','Ano de referência',years,filters.year,'Todos os anos')+
    select('owner','Responsável',[...responsibleNames,...(state.rows.some(r=>!r.owner)?['Sem responsável']:[])],filters.owner,'Todos')+select('status','Status',selectableStatuses,filters.status,'Todos')+
    input('from','Período inicial',filters.from,'date','min="1000-01-01" max="9999-12-31"')+
    input('to','Período final',filters.to,'date','min="1000-01-01" max="9999-12-31"')+
    (page==='Declarações'?input('search','Pesquisar empresa ou CNPJ',filters.search,'search'):page==='Pendências'?select('issue','Ocorrência',[['unstarted','Não Iniciado'],['waiting','Aguardando Cliente'],['owner','Sem responsável'],['sent','Envio sem data'],['urgent','Vencidas ou próximas'],['done','Concluídas']],filters.issue,'Principais pendências'):'')+
    button('Limpar','clear')+'</form>';
}
function company(r){return '<strong>'+esc(r.company)+'</strong><small>'+esc(r.cnpj)+' · '+esc(r.establishment)+' · '+r.year+'</small>';}
function editButton(r){return button('Editar','edit:'+esc(r.id));}
const pendingStatusColors={'Não iniciada':'red','Aguardando cliente':'yellow'};
const statusColors={
  'Aguardando cliente':'yellow','Enviada':'green','Dispensado':'neutral'
};
function issuesTable(rows,highlightStatus=false){
  return table(['Empresa','Status','Responsável','Vencimento','Prioridade','Próxima ação',''],rows.map(r=>{
    const [color,label]=priority(r);
    const statusColor=(highlightStatus&&pendingStatusColors[selectableStatus(r.status)])||statusColors[selectableStatus(r.status)];
    return [company(r),badge(statusLabel(r.status),statusColor),esc(r.owner||'—'),date(r.due),badge(label,color),done(r)&&r.sent?'—':esc(next(r)),editButton(r)].map((x,i)=>i===3&&open(r)&&days(r)!==null?x+'<small>'+Math.abs(days(r))+' d '+(days(r)<0?'de atraso':days(r)===0?'· vence hoje':'restantes')+'</small>':x);
  }),'Nenhuma pendência neste recorte.');
}
const dashboardCards=[
  ['companies','building','Empresas cadastradas'],
  ['sent','check','Enviadas'],
  ['pending','upload','Pendentes de envio'],
  ['waiting','clock','Aguardando Cliente'],
  ['exempt','shield','Empresas dispensadas'],
  ['rate','trend','Taxa de envio']
];
function showMetric(metric){
  const card=dashboardCards.find(([id])=>id===metric);
  if(!card) return;
  const rows=scoped().filter(metricMatches[metric]);
  rows.sort((a,b)=>(metric==='urgent'?days(a)-days(b):0)||a.company.localeCompare(b.company,'pt-BR')||b.year-a.year);
  const summary=stats(rows);
  const detail=metric==='rate'
    ? summary.sent+' de '+rows.length+' declarações obrigadas concluídas'+(summary.rate===null?'':' · '+summary.rate+'%')
    : rows.length+' '+(rows.length===1?'declaração neste recorte':'declarações neste recorte');
  show(card[2],'<p>'+detail+'</p>'+table(['Empresa','Status','Responsável','Vencimento','Envio',''],rows.map(r=>[
    company(r),badge(statusLabel(r.status),statusColors[selectableStatus(r.status)]),esc(r.owner||'—'),date(r.due),date(r.sent),editButton(r)
  ]),'Nenhum registro neste recorte.'));
}
function dashboard(rows){
  const s=stats(rows);
  const counts=selectableStatuses.map(([st])=>rows.filter(r=>selectableStatus(r.status)===st).length);
  const chartColors=selectableStatuses.map(([st])=>colors[statuses.indexOf(st)]);
  let end=0;
  const segments=counts.flatMap((count,i)=>{
    if(!count) return [];
    const start=end; end+=100*count/rows.length;
    return [chartColors[i]+' '+start+'% '+end+'%'];
  });
  const monthly=Array.from({length:12},(_,i)=>rows.filter(r=>done(r)&&r.sent&&Number(r.sent.slice(5,7))===i+1).length);
  const max=Math.max(1,...monthly);
  return '<div class="metrics">'+dashboardCards.map(([id,symbol,label])=>{
    const n=id==='rate'?(s.rate===null?'—':s.rate+'%'):s[id];
    return '<button type="button" class="metric" aria-haspopup="dialog" data-action="metric:'+id+'"><i aria-hidden="true">'+icon(symbol)+'</i><strong>'+n+'</strong><span>'+label+'</span></button>';
  }).join('')+'</div>'+
    '<div class="chart-grid">'+section('Declarações por status','<div class="ring-grid"><div class="ring" style="background:'+(segments.length?'conic-gradient('+segments.join(',')+')':'#e6edf7')+'"><b>'+rows.length+'</b></div><div class="legend">'+selectableStatuses.map(([,label],i)=>'<div><i style="background:'+chartColors[i]+'"></i>'+label+'<b>'+counts[i]+'</b></div>').join('')+'</div></div>')+
    section('Envios por mês','<p>Distribuição pela data de envio registrada</p><div class="bars">'+monthly.map((n,i)=>{
      const month=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i];
      return '<div class="bar" title="'+month+' · '+n+' '+(n===1?'envio':'envios')+'"><b>'+n+'</b><i style="height:'+Math.round(n/max*107)+'px"></i><span>'+month+'</span></div>';
    }).join('')+'</div>')+'</div>'+
    '<div class="progress">'+section('Conclusão da carteira',track(s.rate)+'<p>'+s.sent+' de '+(s.sent+s.pending)+' declarações obrigadas concluídas'+(s.rate===null?'':' · '+s.rate+'%')+'</p>')+'</div>'+
    '<div class="stack">'+section('Pendências e próximos vencimentos',issuesTable(sortedIssues(rows).slice(0,6)),button('Ver pendências','page:Pendências'))+
    section('Execução por responsável',table(['Responsável','Concluídas','Pendentes','Taxa'],owners(rows).map(r=>[esc(r.name),r.sent,r.pending,r.rate===null?'—':r.rate+'%'])))+'</div>';
}

function declarations(rows){
  const q=normalize(filters.search), compact=q.replaceAll(' ','');
  rows=rows.filter(r=>!q||normalize(r.company).includes(q)||r.cnpj.toLowerCase().includes(compact)).sort((a,b)=>a.company.localeCompare(b.company,'pt-BR')||b.year-a.year);
  return section('Declarações ('+rows.length+')',table(['Empresa','Status / etapa','Responsável','Início','Limite','Envio','Andamento','Observações','Última atualização',''],rows.map(r=>{
    const n=progress(r,state.rules);
    return [company(r),badge(statusLabel(r.status),statusColors[selectableStatus(r.status)])+'<small>'+esc(r.stage)+'</small>',esc(r.owner||'—'),date(r.start),date(r.due),date(r.sent),n===null?'—':n+'%',esc(r.notes||'—'),'<span class="updated">'+date(r.updated_at||r.source_updated)+'</span>',editButton(r)];
  }),'Nenhuma declaração cadastrada neste recorte.'));
}
const lookupDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?date(value):'';
const yesNo=value=>value===true?'Sim':value===false?'Não':'';
function companyDetails(data){
  const fields=items=>'<dl class="lookup-fields">'+items.map(([label,value])=>
    '<div><dt>'+esc(label)+'</dt><dd>'+esc(value??'—')+'</dd></div>'
  ).join('')+'</dl>';
  const fallback=value=>value===''||value==null?'—':value;
  const addressItems=a=>[
    ['Logradouro',a.street],['Bairro',a.neighborhood],['Município',a.city],['UF',a.state]
  ];
  const address=data.address||{};
  const activity=data.primaryActivity||{};
  const capital=data.capital!=null&&data.capital!==''&&Number.isFinite(Number(data.capital))
    ?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(data.capital)):'';
  const card=(title,items)=>section(title,fields(items.map(([label,value])=>[label,fallback(value)])));
  return '<div class="stack">'+card(data.legalName,[
    ['CNPJ',data.cnpj],['Nome fantasia',data.tradeName],['Estabelecimento',data.establishment],
    ['Situação cadastral',data.status],['Data da situação',lookupDate(data.statusDate)],['Motivo da situação',data.statusReason],
    ['Data de abertura (início da atividade)',lookupDate(data.openingDate)],['Natureza jurídica',data.legalNature],
    ['Porte',data.size],['Capital social',capital],['Código de qualificação do responsável',data.representativeQualification||''],
    ['Simples Nacional',yesNo(data.simpleTax)],['MEI',yesNo(data.mei)],['Situação especial',data.specialStatus],
    ['E-mail cadastral',data.email],['Telefones',data.phones?.join(' · ')]
  ])+card('Endereço cadastral',[
    ...addressItems(address),['Número',address.number],['Complemento',address.complement],['CEP',address.cep]
  ])+(data.postal?card('Endereço por CEP',[
    ...addressItems(data.postal),['Fonte postal',data.postal.service]
  ]):'')+section('Atividades econômicas (CNAE)',table(['Tipo','Código','Descrição'],[
    ...(activity.code?[[esc('Principal'),esc(activity.code),esc(activity.description||'—')]]:[]),
    ...(data.secondaryActivities||[]).map(a=>['Secundária',esc(a.code),esc(a.description||'—')])
  ],'A base não retornou CNAEs.'))+
  section('Quadro de Sócios e Administradores',table(['Nome','Qualificação','Tipo'],(data.qsa||[])
    .map(p=>[esc(p.name),esc(p.qualification||'—'),esc(p.type||'—')]),data.qsa?'Nenhum integrante retornado.':'QSA indisponível na base consultada.'))+
  section('Representantes legais informados',table(['Nome','Qualificação','Sócio representado'],(data.representatives||[])
    .map(p=>[esc(p.name),esc(p.qualification||'—'),esc(p.partner||'—')]),'A base não informou nomes de representantes legais.'))+'</div>';
}
const consultedCompanies=new WeakMap();
async function consultCompany(form){
  const cnpj=completeCnpj(form.elements.cnpj.value);
  const output=$('cnpj-results');
  if(!cnpj){output.textContent='Informe um CNPJ completo com 14 caracteres.';return;}
  output.textContent='Consultando dados cadastrais…';
  try{
    const token=check(await db.auth.getSession()).session?.access_token;
    if(!token) throw Error('Sua sessão expirou. Entre novamente para consultar.');
    const response=await fetch('/api/cnpj/'+encodeURIComponent(cnpj)+'?module=ebef&details=1',{
      headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(18000)
    });
    const result=await response.json();
    if(!response.ok) throw Error(result.error||'Consulta indisponível.');
    if(result.cnpj!==cnpj) throw Error('A consulta detalhada está indisponível. Tente novamente.');
    if(form.isConnected){
      output.innerHTML=companyDetails(result)+
        '<form id="save-consulted-company" class="panel actions">'+
        (result.establishment?'':select('establishment','Estabelecimento',['Matriz','Filial'],'Matriz'))+
        '<button type="submit" class="primary">Salvar declaração</button></form>';
      consultedCompanies.set($('save-consulted-company'),result);
    }
  }catch(error){
    if(form.isConnected) output.textContent=error.name==='TimeoutError'?'A consulta demorou demais. Tente novamente.':error.message;
  }
}
function render(){
  $('app').dataset.view=role?({'Dashboard':'dashboard','Declarações':'declarations'}[page]||''):'';
  $('account').innerHTML=role?esc(preview?'Prévia neste navegador':role)+' '+button(preview?'Sair da prévia':'Sair','logout'):'';
  $('nav').innerHTML=role?Object.entries(nav).map(([label,symbol])=>'<button type="button" class="'+(label===page?'active':'')+'" '+(label===page?'aria-current="page" ':'')+'data-action="page:'+label+'"><span class="nav-icon" aria-hidden="true">'+icon(symbol)+'</span>'+label+'</button>').join(''):'';
  if(!role){
    $('app').innerHTML='<section class="panel login"><div class="eyebrow">LUCE SISTEMAS</div><h1>Controle E-BEF</h1>'+
      (db?(user?'<p>Esta conta ainda não tem acesso ao módulo E-BEF.</p>'+button('Sair','logout'):'<p>Use sua conta Luce Sistemas.</p><form id="login">'+input('identifier','E-mail ou usuário','','text','required autocomplete="username"')+input('password','Senha','','password','required autocomplete="current-password"')+'<button class="primary">Entrar</button></form><div class="actions account-actions">'+button('Criar usuário','register-account')+button('Recuperar senha','recover-account')+'</div>'):
      '<p>O ambiente compartilhado aguarda configuração do Supabase. A prévia grava somente neste navegador. Use dados de teste.</p><div class="actions" style="margin-top:16px">'+button('Abrir prévia local','preview',true)+'</div>')+'</section>';
    return;
  }
  const report=button('Relatórios','reports');
  if(page==='Consulta CNPJ'){
    $('app').innerHTML=heading('Consulta CNPJ','Consulte dados cadastrais públicos da empresa e confira o endereço na base de CEP.')+
      '<form id="company-query" class="panel filters">'+input('cnpj','CNPJ','','text','required maxlength="22" autocomplete="off" placeholder="00.000.000/0000-00"')+
      '<button class="primary">Consultar</button></form><div id="cnpj-results" aria-live="polite"></div>';
    return;
  }
  const add=button('Nova declaração','new',true), imp=admin()?button('Importar planilha','import'):'';
  const headings={
    Dashboard:heading('Dashboard','Acompanhe as declarações, os envios e os prazos da carteira.',report+add),
    Declarações:heading('Declarações','Cadastre empresas e atualize o andamento de cada exercício.',imp+report+add),
    Pendências:heading('Pendências','Priorize os próximos vencimentos e complete os dados de envio.',report)
  };
  $('app').innerHTML=headings[page]+filterBar()+'<div id="filter-results">'+filteredResults()+'</div>';
}
function filteredResults(){
  const rows=scoped();
  if(page==='Dashboard') return dashboard(rows);
  if(page==='Declarações') return declarations(rows);
  const issue=filters.issue;
  const matches={unstarted:r=>selectableStatus(r.status)==='Não iniciada',waiting:metricMatches.waiting,owner:r=>open(r)&&!r.owner,sent:metricMatches.undated,urgent:metricMatches.urgent,done};
  const issues=issue?rows.filter(matches[issue]).sort((a,b)=>(days(a)??1e7)-(days(b)??1e7)):sortedIssues(rows);
  return section('Acompanhamento de prazos',issuesTable(issues,true));
}
function show(title,body){
  $('modal-content').innerHTML='<div class="section-head"><h2 id="dialog-title">'+esc(title)+'</h2>'+button('Fechar','close')+'</div>'+body;
  if(!modal.open) modal.showModal();
}
function accountDialog(kind){
  const registration=kind==='register-account';
  const fields=registration?
    input('name','Nome','','text','required minlength="2" maxlength="80" autocomplete="name"')+
    input('username','Usuário','','text','required minlength="3" maxlength="60" autocomplete="username"'):
    '';
  const email=input('email','E-mail','','email','required autocomplete="email"');
  const passwordFields=registration?
    input('password','Senha','','password','required minlength="6" maxlength="20" autocomplete="new-password"')+
    input('confirmation','Confirmar senha','','password','required minlength="6" maxlength="20" autocomplete="new-password"'):
    '';
  show(registration?'Criar usuário':'Recuperar senha','<form id="'+kind+'" class="stack">'+fields+email+passwordFields+
    '<p id="account-feedback" role="status"></p><div class="actions"><button class="primary">'+
    (registration?'Solicitar cadastro':'Enviar link de recuperação')+'</button></div></form>');
  $('modal-content').querySelector('input').focus();
}
async function submitAccount(form){
  const {elements}=form;
  const email=elements.email.value.trim().toLowerCase();
  const feedback=form.querySelector('#account-feedback');
  if(form.id==='register-account'){
    const password=elements.password.value;
    if(password!==elements.confirmation.value) throw Error('As senhas não conferem.');
    await registerAccount({name:elements.name.value.trim(),username:elements.username.value.trim(),email,password});
    form.reset();
    feedback.textContent='Confirme o e-mail da Luce para entrar no E-BEF e acompanhar suas declarações.';
  }else{
    await recoverAccount(email);
    feedback.textContent='Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha.';
  }
}
function editor(r={}){
  const values={year:Number(today().slice(0,4)),status:statuses[0],establishment:'Matriz',...r};
  const companyFields='<div>'+input('cnpj','CNPJ',values.cnpj,'text','required maxlength="22" autocomplete="off"')+
    '<button type="button" id="lookup-cnpj">'+(r.id?'Consultar QSA':'Consultar CNPJ')+'</button><p id="lookup-status" role="status"></p></div>'+
    input('company','Razão social',values.company,'text','required maxlength="250"')+
    select('establishment','Estabelecimento',['Matriz','Filial'],values.establishment)+
    '<section class="wide qsa" id="lookup-qsa" aria-labelledby="qsa-title" hidden><h3 id="qsa-title">Quadro de sócios e administradores (QSA)</h3><div id="lookup-qsa-entries"></div>'+
    '<p>Use o QSA como ponto de partida. Confira a participação, os direitos de voto, o controle e a cadeia societária antes de definir os beneficiários finais.</p>'+
    '<p><a href="https://www.gov.br/pt-br/servicos/informar-beneficiario-final-a-receita-federal" target="_blank" rel="noopener noreferrer">Orientações da Receita Federal</a></p></section>';
  const declarationFields=r.id?
    input('year','Ano de referência',values.year,'number','required min="1900" max="2200"')+
    select('status','Status',selectableStatuses,selectableStatus(values.status))+input('stage','Etapa',values.stage,'text','maxlength="150" list="stage-options"')+
    '<datalist id="stage-options">'+opts(Object.keys(stages))+'</datalist>'+
    select('owner','Responsável',responsibleNames.map(name=>[name,name]),canonicalOwner(values.owner),'Sem responsável')+input('start','Data de início',values.start,'date')+input('due','Data-limite',values.due,'date')+input('sent','Data de envio',values.sent,'date')+
    '<label class="wide">Pendências e observações<textarea name="notes" rows="3" maxlength="4000">'+esc(values.notes)+'</textarea></label>'+
    '<fieldset class="wide gov-fields"><legend>Acesso gov.br</legend><div class="grid">'+
    input('gov_cpf','CPF (opcional)',values.gov_cpf,'text','maxlength="14" inputmode="numeric" autocomplete="off"')+
    '<label>GOV (observação opcional)<textarea name="gov_observation" rows="2" maxlength="300" placeholder="Ex.: procuração ativa" aria-describedby="gov-guidance">'+esc(values.gov_observation)+'</textarea></label>'+
    '</div><p id="gov-guidance">Registre a situação do acesso. Mantenha a senha com o titular da conta.</p></fieldset>':'';
  show(r.id?'Editar declaração':'Nova declaração','<form id="editor" data-id="'+esc(r.id)+'" data-version="'+esc(r.updated_at)+'"><div class="grid">'+
    companyFields+(r.id?declarationFields:select('owner','Responsável',responsibleNames.map(name=>[name,name]),canonicalOwner(values.owner),'Sem responsável'))+'</div>'+
    '<div class="actions">'+(r.id?button('Histórico','audit:'+esc(r.id)):'')+'<button class="primary">Salvar declaração</button></div></form>');
  const form=$('editor');
  attachCompanyLookup(form,modal,{
    autofill:!r.id,
    savedQsa:r.qsa,
    getAccessToken:db?async()=>check(await db.auth.getSession()).session?.access_token:undefined
  });
  if(!r.id){
    form.elements.cnpj.focus();
    return;
  }
  let filled=false;
  form.elements.sent.addEventListener('input',()=>{filled=false;});
  form.elements.status.addEventListener('change',()=>{
    const changed=done({status:form.elements.status.value})&&form.elements.status.value!==selectableStatus(r.status);
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
async function save(form,consultedCompany){
  const data=consultedCompany?{
    cnpj:consultedCompany.cnpj,
    company:consultedCompany.legalName,
    establishment:consultedCompany.establishment??form.elements.establishment.value,
    owner:''
  }:fromForm(form);
  const old=state.rows.find(r=>r.id===form.dataset.id);
  data.owner=canonicalOwner(data.owner);
  if(data.owner&&!responsibleNames.includes(data.owner)) throw Error('Selecione Luiz, Ester ou Estefania como responsável.');
  if(form.dataset.id&&old?.updated_at!==form.dataset.version) throw Error('O registro mudou. Feche o formulário e abra a versão mais recente.');
  data.cnpj=completeCnpj(data.cnpj);
  data.year=old?Number(data.year):Number(today().slice(0,4));
  if(!old) Object.assign(data,{status:statuses[0],stage:'',notes:''});
  if(old){
    if(data.status===selectableStatus(old.status)) data.status=old.status;
    const cpf=(data.gov_cpf||'').replace(/[.\s-]/g,'');
    if(cpf&&!/^\d{11}$/.test(cpf)) throw Error('Informe um CPF com 11 dígitos ou deixe o campo em branco.');
    data.gov_cpf=cpf||null;
    data.gov_observation=data.gov_observation||null;
  }
  if(!data.cnpj) throw Error('Informe um CNPJ válido no formato de 14 caracteres.');
  if(!data.company) throw Error('Informe a razão social.');
  if(state.rows.some(r=>r.id!==old?.id&&key(r)===key(data))) throw Error('Já existe uma declaração para este CNPJ e ano.');
  if(exempt(data)&&(!old||!exempt(old)||old.establishment!==data.establishment||old.cnpj!==data.cnpj||old.year!==data.year)){
    if(!confirm('Confirma a dispensa desta declaração?')) return;
  }
  if(exempt(data)&&data.establishment==='Filial'&&!data.stage) data.stage='Somente matriz';
  for(const k of ['start','due','sent']) data[k]=data[k]||null;
  if(old&&(old.stage!==data.stage||old.status!==data.status)) data.progress_source=null;
  const qsa=consultedCompany?(Array.isArray(consultedCompany.qsa)?consultedCompany.qsa:undefined):await qsaForSave(form,data.cnpj);
  if(form.elements?.cnpj&&completeCnpj(form.elements.cnpj.value)!==data.cnpj) throw Error('O CNPJ mudou durante a consulta. Confira o cadastro e salve novamente.');
  if(qsa!==undefined) data.qsa=qsa;
  else if(old&&old.cnpj!==data.cnpj) data.qsa=null;
  let savedId=old?.id;
  if(preview){
    const current=local();
    const existing=current.rows.find(r=>key(r)===key(data));
    if(existing&&existing.id!==old?.id) throw Error('Este CNPJ e ano já estão cadastrados.');
    if(old&&current.rows.find(r=>r.id===old.id)?.updated_at!==old.updated_at) throw Error('O registro mudou. Reabra a versão mais recente.');
    const record={...old,...data,id:old?.id||crypto.randomUUID(),updated_at:new Date().toISOString()};
    savedId=record.id;
    current.rows=[...current.rows.filter(r=>r.id!==record.id),record];
    current.audit.push({declaration_id:record.id,changed_at:record.updated_at,actor:'Prévia local',before:old,after:record});persist(current);
  }else if(old){
    const changed=check(await db.from('ebef_declarations').update(data).eq('id',old.id).eq('updated_at',old.updated_at).select('id'));
    if(!changed.length) throw Error('O registro mudou. Feche o formulário e abra a versão mais recente.');
  }else{
    const inserted=check(await db.from('ebef_declarations').insert(data).select('id').single());
    savedId=inserted.id;
  }
  await refresh();
  modal.close();
  if(!old){
    page='Declarações';
    for(const filter of Object.keys(filters)) filters[filter]='';
  }
  render();
  if(!old) $('app').querySelector(`[data-action="edit:${savedId}"]`)?.focus();
  message(qsa!==undefined?'Declaração e QSA salvos.':!old||old.cnpj!==data.cnpj?'Declaração salva. QSA indisponível na consulta.':'Declaração salva.');
}
function importer(){
  show('Importar planilha','<form id="read-file" class="stack">'+input('file','Arquivo ODS, XLSX ou CSV','','file','required accept=".ods,.xlsx,.csv"')+
    input('fallback','Ano para linhas sem ano de referência','','number','min="1900" max="2200"')+
    '<p>As observações de origem ficam fora da importação para proteger dados de acesso. Os envios históricos mantêm a data original, inclusive quando estiver vazia.</p><div class="actions"><button class="primary">Gerar prévia</button></div></form>');
}
let importData;
async function readFile(form){
  const file=form.elements.file.files[0];
  if(!file||!file.size||!/\.(?:ods|xlsx|csv)$/i.test(file.name)) throw Error('Selecione uma planilha ODS, XLSX ou CSV válida.');
  if(file.size>15*1024*1024) throw Error('Selecione uma planilha de até 15 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const zip=bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4;
  if(zip===/\.csv$/i.test(file.name)) throw Error('O conteúdo da planilha não corresponde ao formato indicado.');
  const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const book=XLSX.read(bytes,{cellDates:true,raw:true,sheetRows:15002});
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
    entries=[['Empresas cadastradas',statsRows.companies],['Empresas obrigadas',statsRows.obligedCompanies],['Enviadas',statsRows.sent],['Pendentes',statsRows.pending],['Em andamento',statsRows.active],['Aguardando Cliente',statsRows.waiting],['Dispensadas',statsRows.exempt],['Taxa de envio',statsRows.rate===null?'—':statsRows.rate+'%'],['Prazos em atenção',statsRows.urgent],['Envios sem data',statsRows.undated]];
  }else if(kind==='owners'){
    title='Produtividade por responsável';cols=['Responsável','Enviadas','Pendentes','Taxa'];
    entries=owners(rows).map(r=>[r.name,r.sent,r.pending,r.rate===null?'—':r.rate+'%']);
  }else{
    title=kind==='sent'?'Envios por período':'Declarações pendentes';
    cols=['Razão social','CNPJ','Estabelecimento','Ano','Status','Etapa','Responsável','Início','Prazo','Data de envio'];
    entries=rows.filter(kind==='sent'?r=>done(r)&&r.sent:open).map(r=>[r.company,r.cnpj,r.establishment,r.year,statusLabel(r.status),r.stage,r.owner,date(r.start),date(r.due),date(r.sent)]);
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
    area.innerHTML='<h1>'+esc(title)+'</h1><p>Luce Sistemas · '+date(today())+'</p>'+table(cols,entries.map(row=>row.map(esc)));
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
async function activate(session){
  if(stream){await db.removeChannel(stream);stream=null;}
  user=session?.user||null;
  role=null;
  state={rows:[],rules:[],audit:[]};
  if(user){
    role=check(await db.rpc('ebef_access_level'))||null;
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
  if(kind==='page'){if(Object.hasOwn(nav,arg)){page=arg;render();}return;}
  if(kind==='preview'){preview=true;role='Administrador';state=local();render();return;}
  if(kind==='logout'){
    if(preview){preview=false;role=null;state={rows:[],rules:[],audit:[]};page='Dashboard';render();}
    else {check(await db.auth.signOut({scope:'local'}));await activate(null);}
    return;
  }
  if(kind==='close'){modal.close();importData=null;return;}
  if(!user&&(kind==='register-account'||kind==='recover-account')){accountDialog(kind);return;}
  if(!role) return;
  if(kind==='metric') showMetric(arg);
  if(kind==='clear'){Object.keys(filters).forEach(k=>filters[k]='');render();}
  if(kind==='new') editor();
  if(kind==='edit'){const row=state.rows.find(r=>r.id===arg);if(row) editor(row);}
  if(kind==='audit') await audit(arg);
  if(kind==='import'&&admin()){importData=null;importer();}
  if(kind==='reports') reportDialog();
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');
  if(target) action(target.dataset.action).catch(e=>message(e.message));
});
document.addEventListener('change',event=>{
  const {form,name,value,validity}=event.target;
  if(form?.id==='filters'&&validity.valid&&filters[name]!==value){
    filters[name]=value;
    $('filter-results').innerHTML=filteredResults();
  }
  if(form?.id==='commit-import'&&name==='sheet'){
    try {importPreview(Number(value));} catch(e){message(e.message);importer();}
  }
});
document.addEventListener('input',event=>{
  const {form,name,value}=event.target;
  if(form?.id==='filters'&&name==='search'){
    filters.search=value;
    $('filter-results').innerHTML=filteredResults();
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
    if(form.id==='register-account'||form.id==='recover-account') await submitAccount(form);
    if(form.id==='editor') await save(form);
    if(form.id==='company-query'&&role) await consultCompany(form);
    if(form.id==='save-consulted-company'&&role){
      const company=consultedCompanies.get(form);
      if(company) await save(form,company);
    }
    if(form.id==='read-file'&&admin()) await readFile(form);
    if(form.id==='commit-import'&&admin()) await commitImport(form);
    if(form.id==='report-form') await report(form,submit?.value||'xlsx');
  }catch(e){
    const feedback=form.querySelector('#account-feedback');
    if(feedback) feedback.textContent=e.message;
    else message(e.message);
  }
  finally{if(submit) submit.disabled=false;}
});
window.addEventListener('storage',()=>{if(preview) refresh().then(render).catch(e=>message(e.message));});
render();
if(db){
  try {await activate(check(await db.auth.getSession()).session);}
  catch(e){message(e.message);}
  db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&user) setTimeout(()=>activate(null).catch(e=>message(e.message)),0);});
}
