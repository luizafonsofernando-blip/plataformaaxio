import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'reforma-tributaria');
const output = join(here, 'dist');

await mkdir(output, { recursive: true });
for (const [name, target] of [['preview.html', 'index.html'], ['preview.js', 'preview.js'], ['style.css', 'style.css']]) {
  await rm(join(output, target), { force: true });
  await cp(join(source, name), join(output, target));
}
await cp(join(here, 'vercel.json'), join(output, 'vercel.json'));
