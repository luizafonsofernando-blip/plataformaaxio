// Executa apenas a suite de testes unitarios, sem descobrir scripts RPA
// em src/test-*.mjs, que exigem sessao real/Chromium e consentimento.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const directory=join(root,'tests');
const files=readdirSync(directory,{withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.endsWith('.test.mjs'))
  .map(entry=>join(directory,entry.name)).sort();

if(files.length===0){
  console.error('Nenhum teste unitario encontrado em gestta-worker/tests.');
  process.exitCode=1;
}else{
  console.log('UNITARIOS: '+files.length+' arquivos de testes; sem acionar RPA/Chromium.');
  const result=spawnSync(process.execPath,['--test',...files],{
    cwd:root,stdio:'inherit',windowsHide:true,
  });
  if(result.error){
    console.error('Nao foi possivel executar os testes unitarios: '+result.error.message);
    process.exitCode=1;
  }else{
    process.exitCode=result.status ?? 1;
  }
}
