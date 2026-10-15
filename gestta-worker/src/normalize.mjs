import { createHash } from 'node:crypto';

export function ascii(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeDocument(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits)) {
    throw new Error('CNPJ ausente ou inválido (são exigidos 14 dígitos, inclusive zeros à esquerda).');
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

export function normalizeRow(row) {
  const tarefa = String(row.tarefa ?? '').trim().replace(/\s+/g, ' ');
  const statusGestta = ascii(row.status);
  const cliente = String(row.cliente ?? '').trim().replace(/\s+/g, ' ');
  const departamento = String(row.departamento ?? '').trim();
  const responsavel = String(row.responsavel ?? '').trim();
  const titulo = ascii(tarefa);
  // Duas fases distintas do fluxo E-BEF. Não inferir obrigação ou transmissão.
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
  // Sem ID da tarefa no relatório: a chave lógica muda se o título mudar.
  const sourceKey = createHash('sha256').update(cnpj + '|' + competencia + '|' + ascii(tarefa)).digest('hex');
  return {
    source_key: sourceKey, cnpj, competencia, tarefa, tipo_tarefa: tipoTarefa, cliente, departamento,
    responsavel, status_gestta: statusGestta,
  };
}

export function validateUniqueRows(tasks) {
  const used = new Set();
  for (const task of tasks) {
    if (used.has(task.source_key)) {
      throw new Error('Tarefas duplicadas por CNPJ + competência + título. Verifique o Gestta.');
    }
    used.add(task.source_key);
  }
  return tasks;
}
