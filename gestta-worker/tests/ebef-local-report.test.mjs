import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildEbefLocalWorkbook,saveEbefLocalWorkbook}
  from '../src/ebef-local-report.mjs';

const task=(i,cnpj,cliente,status)=>({
  source_key:String(i).repeat(64),
  gestta_id:String(i).repeat(24),
  cnpj,cliente,status_gestta:status,
  tipo_tarefa:'verificacao',
  tarefa:'VERIFICAR NECESSIDADE DE EBEF | TECNICO',
  competencia:'2026-10',vencimento:'2026-10-19',
  concluido_em:status==='CONCLUIDA'?'2026-10-19':null,
  departamento:'Tecnico',responsavel:'Pessoa teste',
});
const reviewed=()=>({
  summary:{month:'2026-10',uniqueCnpjs:2,distinctTasks:3,
    completeWindows:true,writesPerformed:false,allUsersProven:false,
    rawRows:6,overlapDuplicates:3,
    statusCounts:{aberta:1,concluida:2,impedimento:0,desconsiderada:0},
    categories:{verificacao:3,declaracao:0}},
  tasks:[
    task('a','01234567000189','=EMPRESA SINTETICA','CONCLUIDA'),
    task('b','01234567000189','=EMPRESA SINTETICA','ABERTA'),
    task('c','98765432000100','OUTRA EMPRESA','CONCLUIDA'),
  ]
});
test('MVP local gera abas com filtros e CNPJs em texto sem considerar transmissao',async()=>{
  const wb=buildEbefLocalWorkbook(reviewed());
  assert.deepEqual(wb.worksheets.map(s=>s.name),['Painel','Empresas','Tarefas']);
  assert.equal(wb.getWorksheet('Empresas').rowCount,6);
  assert.equal(wb.getWorksheet('Tarefas').rowCount,7);
  assert.equal(wb.getWorksheet('Empresas').getRow(5).getCell(1).numFmt,'@');
  assert.equal(wb.getWorksheet('Painel').getCell('B15').value,'NÃO COMPROVADA');
  const names=[5,6].map(r=>wb.getWorksheet('Empresas').getRow(r).getCell(2).value);
  assert.ok(names.includes("'=EMPRESA SINTETICA"));
  assert.equal(wb.getWorksheet('Tarefas').autoFilter.from.row,4);
  const bytes=await wb.xlsx.writeBuffer();
  assert.ok(bytes.length>5000);
});
test('MVP salva relatorio local exclusivo sem permitir dados incompletos',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'luce-ebef-tests-'));
  try{
    const result=await saveEbefLocalWorkbook(reviewed(),{directory:dir});
    assert.match(result.filename,/^LUCE_EBEF_2026_10_[a-f0-9]{10}\.xlsx$/);
    assert.equal(result.records,3);
    assert.equal(result.companies,2);
    const bytes=await readFile(result.filepath);
    assert.ok(bytes.length>5000);
    const invalid=reviewed();
    invalid.summary.completeWindows=false;
    await assert.rejects(()=>saveEbefLocalWorkbook(invalid,{directory:dir}),
      /incompleta/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
