import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseGesttaXlsx } from './parse-report.mjs';

export async function syncFile(filePath, { dryRun = false } = {}) {
  const tasks = await parseGesttaXlsx(filePath);
  const counts = tasks.reduce((map, row) => {
    map[row.status_gestta] = (map[row.status_gestta] || 0) + 1;
    return map;
  }, {});
  console.log('Relatório validado: ' + tasks.length + ' tarefas | Situações: ' + JSON.stringify(counts));
  if (dryRun) {
    console.log('SIMULAÇÃO: nenhum dado enviado ao banco da Luce.');
    return { tasks: tasks.length, counts, dryRun: true };
  }
  const syncUrl = process.env.LUCE_SYNC_URL?.trim();
  const token = process.env.LUCE_SYNC_TOKEN?.trim();
  if (!syncUrl || !token || token.length < 32) {
    throw new Error('Configure LUCE_SYNC_URL e LUCE_SYNC_TOKEN (32+ caracteres).');
  }
  const url = new URL(syncUrl);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('LUCE_SYNC_URL deve usar HTTPS.');
  }
  const bytes = await readFile(filePath);
  const fileSha256 = createHash('sha256').update(bytes).digest('hex');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'gestta', export_sha256: fileSha256, tasks }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('Sincronização HTTP ' + response.status + '. Verifique a Vercel e a migração SQL.');
    }
    const result = await response.json();
    if (result?.ok !== true) throw new Error('Resposta inesperada do servidor Luce.');
    console.log('SINCRONIZAÇÃO CONCLUÍDA: ' + result.synced + ' tarefas recebidas pela Luce.');
    return result;
  } finally { clearTimeout(timer); }
}
