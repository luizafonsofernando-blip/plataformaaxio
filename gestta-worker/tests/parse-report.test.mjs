import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { parseGesttaXlsx } from '../src/parse-report.mjs';
import { normalizeRow, normalizeDate } from '../src/normalize.mjs';

const HEADER = ['Id','Nome','Tipo','Status','Cliente','CNPJ/CPF','Departamento','Responsável',
  'Vencimento','Data Legal','Competência','Data de Conclusão','Feito atrasado','Feito com multa','Baixado'];
const BASE = ['"6acfb9c26e28e360f8616d21"','VERIFICAR NECESSIDADE DE EBEF | TÉCNICO | FT',
  'ORDEM DE SERVIÇO','ABERTO','CLIENTE EXEMPLO LTDA','01234567000189','Técnico',
  'COLABORADOR EXEMPLO',46310.125,null,'outubro/2026',null,'Não','Não','Não'];

async function withWorkbook(rows, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'luce-ebef-unit-'));
  try {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Tarefas');
    sheet.addRow(HEADER);
    rows.forEach(row => sheet.addRow(row));
    const path = join(dir,'teste.xlsx');
    await wb.xlsx.writeFile(path);
    return await fn(path);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('interpreta 15 colunas com ID interno, data Excel e indicadores', async () => {
  await withWorkbook([BASE], async path => {
    const rows = await parseGesttaXlsx(path, { expectedWindow: { start:'2026-10-01', end:'2026-10-30' } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].gestta_id,'6acfb9c26e28e360f8616d21');
    assert.equal(rows[0].tipo_tarefa,'verificacao');
    assert.equal(rows[0].vencimento,'2026-10-15');
    assert.equal(rows[0].feito_atrasado,false);
    assert.equal(rows[0].baixado,false);
  });
});
test('rejeita exportacao fora da Data Meta escolhida', async () => {
  await withWorkbook([BASE], async path => {
    await assert.rejects(() => parseGesttaXlsx(path, {
      expectedWindow: {start:'2026-09-01',end:'2026-09-30'}
    }), /fora do período/);
  });
});
test('mes sem tarefas e aceito apenas quando solicitado', async () => {
  await withWorkbook([], async path => {
    assert.deepEqual(await parseGesttaXlsx(path, {
      expectedWindow:{start:'2026-10-01',end:'2026-10-30'},allowEmpty:true,
    }), []);
    await assert.rejects(() => parseGesttaXlsx(path), /Nenhuma tarefa/);
  });
});
test('mesma tarefa muda titulo/responsavel sem alterar a chave com ID', () => {
  const task = {
    tarefa: BASE[1], status:BASE[3], cliente:BASE[4], cnpjCpf:BASE[5],
    departamento:BASE[6], responsavel:BASE[7], competencia:BASE[10], gesttaId:BASE[0],
  };
  const original = normalizeRow(task);
  const alterada = normalizeRow({...task,
    tarefa:'DECLARAÇÃO DE EBEF | TÉCNICO',
    responsavel:'OUTRO RESPONSAVEL',status:'CONCLUÍDO',
  });
  assert.equal(original.source_key,alterada.source_key);
  assert.notEqual(original.tipo_tarefa,alterada.tipo_tarefa);
  assert.equal(normalizeDate(46310.125), '2026-10-15');
});
