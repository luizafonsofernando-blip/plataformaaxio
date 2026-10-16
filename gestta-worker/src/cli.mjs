import 'dotenv/config';
import { resolve } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setupLogin, exportReport } from './export-report.mjs';
import { parseGesttaXlsx } from './parse-report.mjs';
import { buildMonthWindows, brazilRange } from './month-windows.mjs';
import { syncFile, syncTasks } from './sync.mjs';

function option(args, key) {
  const prefix = '--' + key + '=';
  const v = args.find(a => a.startsWith(prefix));
  return v ? v.slice(prefix.length) : undefined;
}
async function backfill(args, { dryRun, auto }) {
  const from = option(args, 'from') || process.env.GESTTA_START_MONTH || '2026-01';
  const recentArg = option(args, 'recent');
  const recentMonths = recentArg === undefined ? undefined : Number(recentArg);
  const windows = buildMonthWindows({ from, recentMonths });
  console.log('Planejamento: ' + windows.length + ' exportações, de ' +
    brazilRange(windows[0]) + ' até ' + brazilRange(windows.at(-1)));
  if (!auto) console.log('MODO ASSISTIDO: selecione e exporte cada intervalo no Gestta; a leitura pode ser simulada.');
  const latestById = new Map();
  const digest = createHash('sha256');
  let repeated = 0;
  // Importa e valida TODAS as janelas antes do primeiro envio. Em erro, nada é enviado neste lote.
  for (const [i, window] of windows.entries()) {
    console.log('\nEtapa ' + (i + 1) + '/' + windows.length + ' — ' + brazilRange(window));
    const downloaded = await exportReport({ auto, window });
    try {
      const tasks = await parseGesttaXlsx(downloaded.filepath, { expectedWindow: window, allowEmpty: true });
      digest.update(window.start + '/' + window.end + ':');
      digest.update(await readFile(downloaded.filepath));
      for (const task of tasks) {
        if (latestById.has(task.source_key)) repeated++;
        latestById.set(task.source_key, task);
      }
      console.log('Exportação válida: ' + tasks.length + ' tarefas; acumuladas: ' + latestById.size);
    } finally {
      await rm(downloaded.folder, { recursive: true, force: true });
    }
  }
  if (repeated) console.log('Atenção: ' + repeated + ' repetições de ID reconciliadas, prevalecendo a observação mais recente.');
  return syncTasks([...latestById.values()], digest.digest('hex'), { dryRun });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'login') return setupLogin();
  if (command !== 'sync') {
    throw new Error('Use npm run login ou npm run sync -- [--file ARQUIVO.xlsx | --backfill] [--dry-run] [--auto].');
  }
  const fileIndex = args.indexOf('--file');
  const filePath = fileIndex === -1 ? null : args[fileIndex + 1];
  if (fileIndex !== -1 && (!filePath || filePath.startsWith('--'))) {
    throw new Error('Informe o caminho do XLSX após --file.');
  }
  const dryRun = args.includes('--dry-run');
  const auto = args.includes('--auto');
  const monthly = args.includes('--backfill');
  if (filePath && monthly) throw new Error('--file não pode ser combinado com --backfill.');
  if (filePath) return syncFile(resolve(filePath), { dryRun });
  if (!monthly) throw new Error('Selecione --file ARQUIVO.xlsx para um relatório ou --backfill para todos os meses.');
  return backfill(args, { dryRun, auto });
}

main().catch(error => { console.error('ERRO: ' + error.message); process.exitCode = 1; });
