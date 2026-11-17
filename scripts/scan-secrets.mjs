import { readFile } from 'node:fs/promises';

const signatures = [
  ['chave privada', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['chave secreta Supabase', /\bsb_secret_[\w-]{16,}/],
  ['token GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['chave AWS', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['credencial de conexão', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:\/@]+:[^\s\/@]+@/i]
];

export async function scanFile(path) {
  const content = await readFile(path, 'utf8');
  for (const [name, pattern] of signatures) {
    if (pattern.test(content)) throw new Error(`Possível ${name} em ${path}`);
  }
  for (const jwt of content.matchAll(/\beyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)) {
    let payload;
    try { payload = JSON.parse(Buffer.from(jwt[1], 'base64url')); }
    catch { continue; }
    if (payload.role !== 'anon') throw new Error(`JWT potencialmente confidencial em ${path}`);
  }
}
