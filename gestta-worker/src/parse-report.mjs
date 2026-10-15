import ExcelJS from 'exceljs';
import { ascii, normalizeRow, validateUniqueRows } from './normalize.mjs';

const COLS = {
  TAREFA: 'tarefa', STATUS: 'status', CLIENTE: 'cliente', 'CNPJ/CPF': 'cnpjCpf',
  DEPARTAMENTO: 'departamento', RESPONSAVEL: 'responsavel', COMPETENCIA: 'competencia',
};
const REQUIRED = Object.keys(COLS);

function cellText(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((item) => item.text).join('').trim();
  }
  if (typeof value === 'object' && value.text) return String(value.text).trim();
  return String(cell.text ?? value).trim();
}

export async function parseGesttaXlsx(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  let ws, positions;
  for (const sheet of wb.worksheets) {
    const headers = [];
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNum) => {
      headers[colNum] = ascii(cellText(cell));
    });
    const map = new Map(headers.map((v, i) => [v, i]).filter(([v]) => v));
    if (REQUIRED.every((name) => map.has(name))) {
      ws = sheet;
      positions = Object.fromEntries(REQUIRED.map((name) => [COLS[name], map.get(name)]));
      break;
    }
  }
  if (!ws) throw new Error('XLSX incompatível: faltam as sete colunas esperadas do Gestta.');
  const tasks = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const data = Object.fromEntries(
      Object.entries(positions).map(([k, c]) => [k, cellText(ws.getRow(r).getCell(c))])
    );
    if (Object.values(data).every((v) => !v)) continue;
    try { tasks.push(normalizeRow(data)); }
    catch (error) { throw new Error('Linha ' + r + ': ' + error.message, { cause: error }); }
  }
  if (tasks.length === 0) throw new Error('Nenhuma tarefa encontrada: sincronização cancelada.');
  return validateUniqueRows(tasks);
}
