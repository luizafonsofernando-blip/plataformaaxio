// Painel LUCE E-BEF exclusivamente no proprio computador.
// HTTP vinculado a 127.0.0.1 + rota secreta aleatoria por execucao.
// Sem banco, sem cookies, sem persistencia do JSON e sem rede externa.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';

const LOOPBACK='127.0.0.1';
const DEFAULT_CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
function headers(type) {
  return {
    'Content-Type':type,
    'Cache-Control':'no-store, max-age=0',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Content-Security-Policy':DEFAULT_CSP,
  };
}
export function createLocalEbefDashboard({report,html,script,style}){
  if(!report||report.schema!=='luce-ebef-local/v1'||
     report.sync!==false||!Array.isArray(report.tasks)||
     report.tasks.length===0 ||
     ![html,script,style].every(v=>typeof v==='string'&&v.length>0)){
    throw new Error('Relatorio nao validado para visualizacao local.');
  }
  const token=randomBytes(32).toString('hex');
  const root='/session/'+token+'/';
  // Variante apenas para o servidor local. Ao abrir index.html via arquivo,
  // o CSP permanece com connect-src none (sem solicitacoes HTTP).
  const localHtml=html.replace("connect-src 'none'","connect-src 'self'")
    .replace('<a class="back" href="../index.html">← Voltar ao ecossistema</a>',
      '<span class="back">Painel local protegido • LUCE E-BEF</span>');
  const payload=JSON.stringify(report);
  const items=new Map([
    ['', ['text/html; charset=utf-8',localHtml]],
    ['index.html',['text/html; charset=utf-8',localHtml]],
    ['app.js',['text/javascript; charset=utf-8',script]],
    ['style.css',['text/css; charset=utf-8',style]],
    ['report',['application/json; charset=utf-8',payload]],
  ]);
  const server=createServer((req,res)=>{
    const port=server.address()?.port;
    if(req.headers.host!==LOOPBACK+':'+port){
      res.writeHead(403,headers('text/plain; charset=utf-8'));
      res.end('Acesso local invalido.');return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){
      res.writeHead(405,{...headers('text/plain; charset=utf-8'),Allow:'GET, HEAD'});
      res.end();return;
    }
    // Validar caminho e query (nenhuma rota alternativa).
    const path=req.url??'';
    if(!path.startsWith(root)||path.includes('?')||path.includes('#')){
      res.writeHead(404,headers('text/plain; charset=utf-8'));
      res.end('Nao encontrado.');return;
    }
    const key=path.slice(root.length);
    const asset=items.get(key);
    if(!asset){
      res.writeHead(404,headers('text/plain; charset=utf-8'));
      res.end('Nao encontrado.');return;
    }
    const [contentType,body]=asset;
    res.writeHead(200,headers(contentType));
    if(req.method==='HEAD')res.end();
    else res.end(body);
  });
  server.headersTimeout=10_000;
  server.requestTimeout=10_000;
  server.timeout=30_000;
  return {
    server,
    async listen(){
      await new Promise((resolve,reject)=>{
        server.once('error',reject);
        server.listen(0,LOOPBACK,()=>{
          server.removeListener('error',reject);
          resolve();
        });
      });
      return 'http://'+LOOPBACK+':'+server.address().port+root;
    },
    close(){return new Promise((resolve,reject)=>
      server.close(err=>err?reject(err):resolve()));},
  };
}
