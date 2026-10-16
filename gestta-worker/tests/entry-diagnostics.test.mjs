import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEntryUrl,categorizeEntry,inspectEntry} from '../src/entry-diagnostics.mjs';

test('classifica somente rota, sem revelar URL ou token da sessao',()=>{
  assert.equal(classifyEntryUrl('https://app.gestta.com.br/dashboard-v2/#/dashboard-v2?token=segredo'),'dashboard');
  assert.equal(classifyEntryUrl('https://app.gestta.com.br/#/sidebar/task/overview/dashboard/123'),'tarefas');
  assert.equal(classifyEntryUrl('https://app.gestta.com.br/login'),'possivel_login');
  assert.equal(classifyEntryUrl('https://contas.exemplo.com/sso'),'fora_do_gestta');
  assert.equal(classifyEntryUrl('nao_e_url'),'endereco_indisponivel');
});

test('distingue menu ausente, login e menu unico visivel',()=>{
  const base={calendarioVisivel:false,senhaVisivel:false,
    menuTarefasVisivel:false,menuTarefasQuantidade:0,rota:'dashboard',readyState:'complete'};
  assert.equal(categorizeEntry(base),'dashboard_sem_menu_tarefas');
  assert.equal(categorizeEntry({...base,senhaVisivel:true}),'autenticacao_possivelmente_necessaria');
  assert.equal(categorizeEntry({...base,menuTarefasQuantidade:1,menuTarefasVisivel:true}),'menu_tarefas_disponivel');
  assert.equal(categorizeEntry({...base,menuTarefasQuantidade:2,menuTarefasVisivel:true}),'menu_tarefas_ambiguo');
  assert.equal(categorizeEntry({...base,calendarioVisivel:true}),'tarefas_carregadas');
});

test('conta o MESMO getByText exato da navegacao sem clicar',async()=>{
  let clicked=0;
  const locator={
    count:async()=>1,first:()=>locator,isVisible:async()=>true,
    click:async()=>{clicked++;},
  };
  const page={
    url:()=> 'https://app.gestta.com.br/dashboard-v2/#/dashboard-v2',
    evaluate:async()=>({readyState:'complete',calendarioVisivel:false,
      senhaVisivel:false,formSenhaCount:0}),
    getByText:(text,options)=>{
      assert.equal(text,'Tarefas');
      assert.deepEqual(options,{exact:true});
      return locator;
    },
    frames:()=>[{}],
  };
  const info=await inspectEntry(page);
  assert.equal(info.menuTarefasQuantidade,1);
  assert.equal(info.menuTarefasVisivel,true);
  assert.equal(info.diagnostico,'menu_tarefas_disponivel');
  assert.equal(clicked,0);
});

test('nao inclui dados pessoais na saida da leitura',async()=>{
  const page={
    url:()=> 'https://app.gestta.com.br/login?token=segredo',
    evaluate:async()=>({readyState:'complete',calendarioVisivel:false,
      senhaVisivel:true,formSenhaCount:1}),
    getByText:()=>({count:async()=>0}),
    frames:()=>[{}],
  };
  const result=await inspectEntry(page);
  assert.equal(result.diagnostico,'autenticacao_possivelmente_necessaria');
  assert.equal(JSON.stringify(result).includes('segredo'),false);
  assert.equal(JSON.stringify(result).includes('login?'),false);
});
