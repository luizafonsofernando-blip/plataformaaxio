import { createHash } from 'node:crypto';

export function ascii(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeDocument(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits)) {
    throw new Error('CNPJ ausente ou inválido (exigidos 14 dígitos, inclusive zeros à esquerda).');
  }
  return digits;
}

const MONTHS = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

export function normalizeCompetence(value) {
  const v = ascii(value);
  let year, month;
  let match = v.match(/^(20\d{2})-(0?[1-9]|1[0-2])$/);
  if (match) {
    [, year, month] = match;
  } else {
    match = v.match(/^(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})$/);
    if (match) [, month, year] = match;
    else {
      match = v.match(/^([A-Z]+)\s*\/\s*(20\d{2})$/);
      if (!match || !MONTHS[match[1]]) throw new Error('Competência não reconhecida: ' + String(value).slice(0, 40));
      year = match[2]; month = MONTHS[match[1]];
    }
  }
  return String(year) + '-' + String(month).padStart(2, '0');
}

export function normalizeDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Data inválida no relatório.');
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (value < 1 || value > 100000) throw new Error('Número de data Excel fora do intervalo.');
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  let y, m, d;
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (match) [, y, m, d] = match;
  else {
    match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) throw new Error('Data não reconhecida no relatório.');
    [, d, m, y] = match;
  }
  const expected = y + '-' + m + '-' + d;
  if (new Date(expected + 'T00:00:00Z').toISOString().slice(0, 10) !== expected) {
    throw new Error('Data inválida no relatório.');
  }
  return expected;
}

function normalizedFlag(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const v = ascii(value);
  if (['SIM', 'S', 'TRUE', 'VERDADEIRO', '1'].includes(v)) return true;
  if (['NAO', 'N', 'FALSE', 'FALSO', '0'].includes(v)) return false;
  throw new Error('Indicador booleano desconhecido no relatório.');
}

function normalizeGesttaId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const id = String(value).trim().replace(/^"|"$/g, '').toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('ID da tarefa Gestta em formato inesperado.');
  return id;
}

export function normalizeRow(row) {
  const tarefa = String(row.tarefa ?? '').trim().replace(/\s+/g, ' ');
  const statusGestta = ascii(row.status);
  const cliente = String(row.cliente ?? '').trim().replace(/\s+/g, ' ');
  const departamento = String(row.departamento ?? '').trim();
  const responsavel = String(row.responsavel ?? '').trim();
  const titulo = ascii(tarefa);
  const tipoTarefa = /^DECLARACAO DE EBEF(?:\s*\||$)/.test(titulo) ? 'declaracao'
    : /^VERIFICAR NECESSIDADE DE EBEF(?:\s*\||$)/.test(titulo) ? 'verificacao'
    : null;
  if (!tipoTarefa) throw new Error('Tarefa fora das duas categorias autorizadas E-BEF.');
  if (!cliente || !statusGestta || !responsavel) throw new Error('Cliente, status ou responsável em branco.');
  for (const [key, value] of Object.entries({ tarefa, cliente, departamento, responsavel, statusGestta })) {
    if (value.length > 500) throw new Error('Campo ' + key + ' excedeu 500 caracteres.');
  }
  const cnpj = normalizeDocument(row.cnpjCpf);
  const competencia = normalizeCompetence(row.competencia);
  const gesttaId = normalizeGesttaId(row.gesttaId);
  // Um mesmo ID reaparece em exportacoes posteriores. Não derivar identidade de título, status ou responsável.
  const sourceKey = createHash('sha256')
    .update(gesttaId ? 'gestta-id:' + gesttaId : cnpj + '|' + competencia + '|' + titulo).digest('hex');
  const tipoRegistro = String(row.tipoRegistro ?? '').trim();
  if (tipoRegistro.length > 100) throw new Error('Tipo de registro excedeu o limite.');
  return {
    source_key: sourceKey, gestta_id: gesttaId, cnpj, competencia,
    tarefa, tipo_tarefa: tipoTarefa, tipo_registro: tipoRegistro,
    cliente, departamento, responsavel, status_gestta: statusGestta,
    vencimento: normalizeDate(row.vencimento),
    data_legal: normalizeDate(row.dataLegal),
    concluido_em: normalizeDate(row.dataConclusao),
    feito_atrasado: normalizedFlag(row.feitoAtrasado),
    feito_com_multa: normalizedFlag(row.feitoComMulta),
    baixado: normalizedFlag(row.baixado),
  };
}

export function validateUniqueRows(tasks) {
  const used = new Set();
  for (const task of tasks) {
    if (used.has(task.source_key)) {
      throw new Error('Identificador de tarefa duplicado no mesmo arquivo. Verifique o Gestta.');
    }
    used.add(task.source_key);
  }
  return tasks;
}
