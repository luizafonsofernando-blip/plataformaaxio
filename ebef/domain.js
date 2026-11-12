export const statuses = ['Não iniciada','Em andamento','Aguardando cliente','Em revisão','Pronta para envio','Enviada','Retificação','Retificada','Dispensado'];
export const defaults = [0,25,35,70,85,100,50,100,100];
export const stages = {
  'Conferência inicial':10,'Coleta de dados':25,'Validação':40,'Geração da declaração':55,
  'Revisão':70,'Transmissão':85,'Pós-envio / recibo':95,'Concluído':100,'Somente matriz':100
};
export const colors = ['#a2b1c7','#387fec','#eaad4e','#8e79dc','#4fc3d3','#2da681','#db7c53','#136e66','#637897'];
export const key = r => r.cnpj + '/' + r.year;
export const done = r => ['Enviada','Retificada'].includes(r.status);
export const exempt = r => r.status === 'Dispensado';
export const open = r => !done(r) && !exempt(r);
export const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
export const days = (r, now=today()) => r.due ? Math.round((Date.parse(r.due)-Date.parse(now))/86400000) : null;
export const priority = r => done(r) ? ['green','Concluída'] : exempt(r) ? ['','Dispensado'] : days(r) === null ? ['','Sem prazo'] : days(r) < 0 ? ['red','Vencida'] : days(r) <= 3 ? ['orange','Até 3 dias'] : days(r) <= 10 ? ['yellow','Até 10 dias'] : ['','No prazo'];
export const next = r => done(r) ? 'Registrar data de envio' : ['Iniciar declaração','Prosseguir com a preparação','Solicitar informações ao cliente','Revisar declaração','Enviar declaração','','Concluir retificação','',''][statuses.indexOf(r.status)];
export const normalize = x => String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,' ').trim();
export const stats = rows => {
  const sent = rows.filter(done), pending = rows.filter(open), required = sent.length + pending.length;
  return {companies:new Set(rows.map(r=>r.cnpj)).size, obligedCompanies:new Set(rows.filter(r=>!exempt(r)).map(r=>r.cnpj)).size, sent:sent.length, pending:pending.length,
    active:rows.filter(r=>['Em andamento','Em revisão','Pronta para envio','Retificação'].includes(r.status)).length,
    waiting:new Set(rows.filter(r=>r.status==='Aguardando cliente').map(r=>r.cnpj)).size,
    exempt:new Set(rows.filter(exempt).map(r=>r.cnpj)).size, rate:required ? Math.round(100*sent.length/required) : null,
    urgent:pending.filter(r=>r.due && days(r)<=10).length, undated:sent.filter(r=>!r.sent).length};
};
export const owners = rows => [...new Set(rows.map(r=>r.owner||'Sem responsável'))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(name=>{
  const selected=rows.filter(r=>(r.owner||'Sem responsável')===name);
  return {name,...stats(selected)};
});
export function progress(r, rules){
  if(exempt(r)||done(r)) return 100;
  const stage=normalize(r.stage);
  const sourceStage=Object.keys(stages).find(name=>name!=='Somente matriz'&&normalize(name)===stage);
  const override=rules.find(rule=>rule.status===r.status&&normalize(rule.stage)===stage);
  const base=rules.find(rule=>rule.status===r.status&&!rule.stage);
  return override?.value ?? stages[sourceStage] ?? base?.value ?? defaults[statuses.indexOf(r.status)];
}
export function historicalDate(value){
  if(value==null || value==='') return null;
  if(value instanceof Date){
    if(Number.isNaN(value.getTime())) throw Error('Data inválida');
    return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
  }
  const s=String(value).trim();
  const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso=br ? [br[3],br[2].padStart(2,'0'),br[1].padStart(2,'0')].join('-') : s.match(/^\d{4}-\d{2}-\d{2}(?:$|T| )/)?.[0].slice(0,10);
  if(typeof value==='number' && value>=1 && value<2958466) return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  if(!iso || Number.isNaN(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10)!==iso) throw Error('Data inválida');
  return iso;
}
const aliases={
  company:['razao social','empresa','nome empresarial','nome da empresa','cliente','razao social da empresa'],
  cnpj:['cnpj','cnpj da empresa'], establishment:['tipo','estabelecimento','tipo de estabelecimento','matriz filial','matriz ou filial'],
  year:['ano','ano base','ano de referencia','exercicio','referencia'], status:['status','status da declaracao','situacao','situacao e bef'],
  stage:['etapa','etapa de andamento','andamento','andamento etapa'], owner:['responsavel','analista','operador'],
  start:['data de inicio','inicio','data inicio'], due:['prazo','data limite','vencimento','data limite para envio','prazo de envio'],
  sent:['data efetiva de envio','data de envio','data envio','envio','data de transmissao'],
  updated_at:['ultima atualizacao','atualizacao'],
  progress_source:['percentual de andamento','percentual','progresso','andamento %','% andamento']
};
export function inspectSheet(grid){
  for(let i=0;i<Math.min(grid.length,60);i++){
    const cells=grid[i].map(normalize);
    const columns=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,cells.findIndex(c=>names.map(normalize).includes(c))]));
    const report = cells.includes('dias restantes') && cells.includes('proxima acao');
    if(columns.cnpj>=0 && columns.company>=0 && !report) return {columns, index:i};
  }
  return null;
}
export function importRows(grid, header, fallbackYear){
  const {columns,index}=header;
  return grid.slice(index+1).flatMap((cells,i)=>{
    const value=k=>cells[columns[k]] ?? '';
    const str=k=>String(value(k)).trim();
    if(!str('company')&&!str('cnpj')) return [];
    try {
      const cnpj=normalizeCnpj(str('cnpj'));
      const year=Number(str('year')||fallbackYear);
      const rawStatus=normalize(str('status'));
      const status=statuses.find(s=>normalize(s)===rawStatus) || ({dispensada:'Dispensado',enviado:'Enviada',retificado:'Retificada',pendente:'Não iniciada','nao iniciado':'Não iniciada'})[rawStatus] || (rawStatus ? '' : statuses[0]);
      const rawType=normalize(str('establishment'));
      const establishment=rawType==='filial' ? 'Filial' : rawType==='matriz' || !rawType ? 'Matriz' : '';
      if(!str('company')) throw Error('Razão social ausente');
      if(!cnpj) throw Error('CNPJ ausente ou inválido');
      if(!Number.isInteger(year)||year<1900||year>2200) throw Error('Informe o ano de referência');
      if(!status||!establishment) throw Error('Confira status e estabelecimento');
      const p=str('progress_source');
      const n=Number(p.replace('%','').replace(',','.'));
      const source=p && Number.isFinite(n) && n>=0 && n<=100 ? (typeof value('progress_source')==='number' && n<=1 ? n*100 : n) : null;
      let start=null, warning='';
      try {start=historicalDate(value('start'));} catch {warning='Conteúdo sem data na coluna Início · início em branco';}
      return [{line:index+i+2, warning, row:{company:str('company'),cnpj,year,status,establishment,stage:str('stage')||(status==='Dispensado'&&establishment==='Filial'?'Somente matriz':''),
        owner:str('owner'),start,due:historicalDate(value('due')),sent:historicalDate(value('sent')),
        source_updated:historicalDate(value('updated_at')),progress_source:source}}];
    } catch(e){return [{line:index+i+2,error:e.message}];}
  });
}
export const normalizeCnpj = value => {
  const s=value.toUpperCase().replace(/[.\/\s-]/g,'');
  return /^[A-Z0-9]{12}[0-9]{2}$/.test(s) ? s : /^\d{1,13}$/.test(s) ? s.padStart(14,'0') : '';
};
