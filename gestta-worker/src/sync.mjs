import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseGesttaXlsx } from './parse-report.mjs';

function summarize(tasks) {
  const statuses = {}, categories = {};
  for (const task of tasks) {
    statuses[task.status_gestta] = (statuses[task.status_gestta] || 0) + 1;
    categories[task.tipo_tarefa] = (categories[task.tipo_tarefa] || 0) + 1;
  }
  console.log('Relatório validado: ' + tasks.length +
    ' tarefas | Categorias: ' + JSON.stringify(categories) +
    ' | Situações: ' + JSON.stringify(statuses));
  return { statuses, categories };
}

export async function syncTasks(tasks, exportSha256, { dryRun = false } = {}) {
  const counts = summarize(tasks);
  if (dryRun) {
    console.log('SIMULAÇÃO: nenhum dado enviado ao banco da Luce.');
    return { tasks: tasks.length, ...counts, dryRun: true };
  }
  if (!tasks.length) {
    console.log('Nenhuma tarefa no intervalo. Nenhuma gravação necessária.');
    return { ok: true, synced: 0, ...counts };
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
  let synced = 0;
  // Lotes pequenos por causa do limite de 600 KiB da API Vercel.
  for (let i = 0; i < tasks.length; i += 250) {
    const slice = tasks.slice(i, i + 250);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'gestta', export_sha256: exportSha256, tasks: slice }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Sincronização HTTP ' + response.status + ', lote ' + (Math.floor(i/250) + 1) +
          '. Foram enviados ' + synced + ' registros em lotes anteriores; repita após corrigir.');
      }
      const result = await response.json();
      if (result?.ok !== true || result.synced !== slice.length) {
        throw new Error('Resposta inesperada do servidor Luce no lote ' + (Math.floor(i/250)+1));
      }
      synced += slice.length;
    } finally { clearTimeout(timer); }
  }
  console.log('SINCRONIZAÇÃO CONCLUÍDA: ' + synced + ' tarefas recebidas pela Luce.');
  return { ok: true, synced, ...counts };
}

export async function syncFile(filePath, { dryRun = false } = {}) {
  const tasks = await parseGesttaXlsx(filePath);
  const fileSha256 = createHash('sha256').update(await readFile(filePath)).digest('hex');
  return syncTasks(tasks, fileSha256, { dryRun });
}
