import 'dotenv/config';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { setupLogin, exportReport } from './export-report.mjs';
import { syncFile } from './sync.mjs';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'login') return setupLogin();
  if (command !== 'sync') {
    throw new Error('Use npm run login ou npm run sync -- --file ARQUIVO.xlsx --dry-run ou --auto.');
  }
  const fileIndex = args.indexOf('--file');
  const filePath = fileIndex === -1 ? null : args[fileIndex + 1];
  if (fileIndex !== -1 && (!filePath || filePath.startsWith('--'))) {
    throw new Error('Informe o caminho do XLSX após --file.');
  }
  const dryRun = args.includes('--dry-run');
  const auto = args.includes('--auto');
  if (filePath) return syncFile(resolve(filePath), { dryRun });
  const downloaded = await exportReport({ auto });
  try { return await syncFile(downloaded.filepath, { dryRun }); }
  finally { await rm(downloaded.folder, { recursive: true, force: true }); }
}

main().catch((error) => { console.error('ERRO: ' + error.message); process.exitCode = 1; });
