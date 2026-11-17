import { cp, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanFile } from './scan-secrets.mjs';

const publicDirs = [
  'app', 'assets', 'comunicados-orteconte', 'contratos', 'ebef',
  'property', 'radar-legislativo', 'radar-sindical', 'review-folha', 'reforma-tributaria'
];
const publicFiles = ['index.html', 'luce-logo.svg', 'luce-property-demo.html', 'script.js', 'styles.css'];
const output = '.luce-public';
const internal = /^(?:\.|node_modules$|.*\.(?:map|sql|bak|log|pem|key|ts|tsx)$)/i;

async function verify(path) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await verify(child);
    else await scanFile(child);
  }
}

await mkdir(output, { recursive: true });
for (const entry of [...publicDirs, ...publicFiles]) {
  await cp(entry, join(output, entry), {
    recursive: true,
    filter: path => !internal.test(path.split(/[\\/]/).at(-1))
  });
}
await verify(output);
