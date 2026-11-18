import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { scanFile } from './scan-secrets.mjs';

const publicDirs = [
  'app', 'assets', 'comunicados-orteconte', 'contratos', 'ebef',
  'property', 'radar-legislativo', 'radar-sindical', 'review-folha', 'luce-sign', 'reforma-tributaria'
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
await rm(join(output, 'reforma-tributaria', 'preview.html'), { force: true });
await rm(join(output, 'reforma-tributaria', 'preview.js'), { force: true });
for (const entry of [...publicDirs, ...publicFiles]) {
  await cp(entry, join(output, entry), {
    recursive: true,
    filter: path => !internal.test(path.split(/[\\/]/).at(-1))
      && !/(?:^|[\\/])reforma-tributaria[\\/]preview\.(?:html|js)$/i.test(path)
  });
}
await verify(output);
