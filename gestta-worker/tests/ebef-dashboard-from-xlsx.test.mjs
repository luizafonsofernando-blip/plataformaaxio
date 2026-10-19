import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildEbefLocalWorkbook} from '../src/ebef-local-report.mjs';
import {readEbefDashboardData,saveEbefDashboardData}
  from '../src/ebef-dashboard-from-xlsx.mjs';

function synthetic(){
  const tasks=[
    {source_key:'a'.repeat(64),gestta_id:'a'.repeat(24),
      cnpj:'01234567000189',cliente:'EMPRESA DE TESTE',
      tipo_tarefa:'verificacao',status_gestta:'ABERTA',
      tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
      competencia:'2026-09',vencimento:'2026-10-19',
      departamento:'Tecnico',responsavel:'Pessoa Teste',concluido_em:null},
    {source_key:'b'.repeat(64),gestta_id:'b'.repeat(24),
      cnpj:'98765432000100',cliente:'OUTRA EMPRESA',
      tipo_tarefa:'verificacao',status_gestta:'CONCLUIDA',
      tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
      competencia:'2026-10',vencimento:'2026-10-31',
      departamento:'Tecnico',responsavel:'Pessoa Teste',
      concluido_em:'2026-10-19'},
  ];
  return {tasks,summary:{month:'2026-10',uniqueCnpjs:2,distinctTasks:2,
    completeWindows:true,writesPerformed:false,allUsersProven:false,
    rawRows:4,overlapDuplicates:2,categories:{verificacao:2,declaracao:0},
    statusCounts:{aberta:1,concluida:1,impedimento:0,desconsiderada:0}}};
}
test('converter abre Excel real LUCE e gera JSON com nomes e IDs consistentes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'luce-dash-test-'));
  try{
    const path=join(dir,'LUCE_EBEF_2026_10_aabbccddee.xlsx');
    const wb=buildEbefLocalWorkbook(synthetic());
    await wb.xlsx.writeFile(path);
    const converted=await readEbefDashboardData(path);
    assert.equal(converted.schema,'luce-ebef-local/v1');
    assert.equal(converted.tasks.length,2);
    assert.equal(converted.tasks[0].cnpj.length,14);
    assert.equal(converted.tasks[0].competencia,'2026-09');
    assert.equal(converted.sync,false);
    assert.equal(converted.coverage,'usuarios_nao_comprovados');
    const out=await saveEbefDashboardData(path,dir);
    assert.equal(out.tasks,2);
    assert.equal(out.companies,2);
    assert.match(out.dest,/painel_[a-f0-9]{8}\.json$/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('converter rejeita entrada que nao e XLSX Luce',async()=>{
  await assert.rejects(()=>readEbefDashboardData('arquivo.json'),/XLSX/);
});
