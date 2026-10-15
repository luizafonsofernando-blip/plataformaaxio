import ExcelJS from 'exceljs';
import { ascii, normalizeRow, validateUniqueRows } from './normalize.mjs';

const FIELDS = {
  status: ['STATUS'],
  cliente: ['CLIENTE'],
  cnpjCpf: ['CNPJ/CPF'],
  departamento: ['DEPARTAMENTO'],
  responsavel: ['RESPONSAVEL'],
  competencia: ['COMPETENCIA'],
  gesttaId: ['ID'],
  tipoRegistro: ['TIPO'],
  vencimento: ['VENCIMENTO'],
  dataLegal: ['DATA LEGAL'],
  dataConclusao: ['DATA DE CONCLUSAO'],
  feitoAtrasado: ['FEITO ATRASADO'],
  feitoComMulta: ['FEITO COM MULTA'],
  baixado: ['BAIXADO'],
};
const REQUIRED = ['status', 'cliente', 'cnpjCpf', 'departamento', 'responsavel', 'competencia'];
const DATE_FIELDS = new Set(['vencimento', 'dataLegal', 'dataConclusao']);

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v && typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map(part => part.text).join('').trim();
  }
  if (v && typeof v === 'object' && v.text) return String(v.text).trim();
  return String(cell.text ?? v).trim();
}

function dateCellValue(cell) {
  const v = cell.value;
  if (v instanceof Date || typeof v === 'number') return v;
  if (v && typeof v === 'object' && v.result !== undefined) return v.result;
  return cellText(cell);
}

export async function parseGesttaXlsx(filePath, { expectedWindow, allowEmpty = false } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  let sheet, positions;
  for (const candidate of wb.worksheets) {
    const headers = new Map();
    candidate.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers.set(ascii(cellText(cell)), col);
    });
    const titleColumn = headers.get('NOME') ?? headers.get('TAREFA');
    const mapping = Object.fromEntries(
      Object.entries(FIELDS).map(([name, labels]) => [
        name, labels.map(label => headers.get(label)).find(Boolean),
      ])
    );
    if (titleColumn && REQUIRED.every(name => mapping[name])) {
      sheet = candidate;
      positions = { tarefa: titleColumn, ...mapping };
      break;
    }
  }
  if (!sheet) throw new Error('XLSX incompatível: faltam colunas obrigatórias do Gestta.');
  if (expectedWindow && !positions.vencimento) {
    throw new Error('Relatório mensal sem Vencimento; impossível verificar o filtro de Data Meta.');
  }
  if (expectedWindow && !positions.gesttaId) {
    throw new Error('Relatório mensal sem Id do Gestta: não é seguro conciliar períodos sobrepostos.');
  }

  const tasks = [];
  for (let row = 2; row <= sheet.rowCount; row++) {
    const data = Object.fromEntries(
      Object.entries(positions)
        .map(([key, col]) => [key, col
          ? (DATE_FIELDS.has(key) ? dateCellValue(sheet.getRow(row).getCell(col)) :
            cellText(sheet.getRow(row).getCell(col)))
          : null])
    );
    if (Object.values(data).every(v => v === null || v === undefined || v === '')) continue;
    let task;
    try { task = normalizeRow(data); }
    catch (error) { throw new Error('Linha ' + row + ': ' + error.message, { cause: error }); }
    if (expectedWindow && !task.gestta_id) {
      throw new Error('Linha ' + row + ': Id da tarefa ausente. Exportação mensal cancelada.');
    }
    if (expectedWindow &&
        (!task.vencimento || task.vencimento < expectedWindow.start || task.vencimento > expectedWindow.end)) {
      throw new Error('Linha ' + row + ': Data Meta (' + String(task.vencimento) +
        ') fora do período ' + expectedWindow.start + ' a ' + expectedWindow.end +
        '. Confira os filtros antes de sincronizar.');
    }
    tasks.push(task);
  }
  if (!allowEmpty && tasks.length === 0) throw new Error('Nenhuma tarefa encontrada: sincronização cancelada.');
  return validateUniqueRows(tasks);
}
