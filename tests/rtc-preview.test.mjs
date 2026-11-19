import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('RTC visual preview has no API, persistence or enabled save action', async () => {
  const html = await readFile(new URL('../reforma-tributaria/preview.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../reforma-tributaria/preview.js', import.meta.url), 'utf8');
  assert.match(html, /Prévia visual · sem banco/);
  assert.match(html, /não consulta ou grava dados/);
  assert.match(html, /<button type="submit" disabled/);
  assert.match(html, /<script src="preview\.js" defer><\/script>/);
  assert.doesNotMatch(html + script, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|\/api\/rtc\//);
});

test('RTC visual preview bundle contains only static UI assets', async () => {
  await import('../infra/rtc-preview/build.mjs');
  const assets = await readdir(new URL('../infra/rtc-preview/dist/', import.meta.url));
  assert.deepEqual(assets.sort(), ['index.html', 'preview.js', 'style.css', 'vercel.json']);
  const config = JSON.parse(await readFile(new URL('../infra/rtc-preview/vercel.json', import.meta.url), 'utf8'));
  assert.match(config.headers[0].headers.find((header) => header.key === 'Content-Security-Policy').value, /connect-src 'none'/);
});
