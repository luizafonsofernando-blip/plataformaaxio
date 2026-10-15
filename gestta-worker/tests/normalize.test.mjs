import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompetence, normalizeDocument, normalizeRow, validateUniqueRows } from '../src/normalize.mjs';

const SAMPLE = {
  tarefa: 'DECLARAÇÃO DE EBEF | TÉCNICO', status: 'ABERTO',
  cliente: 'EMPRESA EXEMPLO LTDA', cnpjCpf: '01.234.567/0001-89',
  departamento: 'Técnico', responsavel: 'Responsável Exemplo', competencia: 'dezembro/2026',
};

test('preserva zeros à esquerda no CNPJ', () => {
  assert.equal(normalizeDocument(SAMPLE.cnpjCpf), '01234567000189');
});

test('reconhece competências', () => {
  assert.equal(normalizeCompetence('dezembro/2026'), '2026-12');
  assert.equal(normalizeCompetence('12/2026'), '2026-12');
  assert.equal(normalizeCompetence('2026-12'), '2026-12');
});

test('rejeita CPF, competência incorreta e outras tarefas', () => {
  assert.throws(() => normalizeDocument('123.456.789-01'));
  assert.throws(() => normalizeCompetence('13/2026'));
  assert.throws(() => normalizeRow({ ...SAMPLE, tarefa: 'IRPF' }));
});

test('gera chave estável e distinta por competência', () => {
  const first = normalizeRow(SAMPLE);
  const second = normalizeRow({ ...SAMPLE, competencia: 'janeiro/2027' });
  assert.match(first.source_key, /^[a-f0-9]{64}$/);
  assert.equal(first.source_key, normalizeRow(SAMPLE).source_key);
  assert.notEqual(first.source_key, second.source_key);
  assert.throws(() => validateUniqueRows([first, first]));
});
