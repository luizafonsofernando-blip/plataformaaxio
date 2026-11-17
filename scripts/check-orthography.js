import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set(["node_modules", ".vercel", "backups", "output", "dist", "build"]);
const ignoredFiles = new Set(["pdf.worker.mjs", "html2canvas.min.js", "security_best_practices_report.md"]);
const ignoredPathParts = [
  `${path.sep}property${path.sep}assets${path.sep}`,
  `${path.sep}cerne${path.sep}assets${path.sep}`,
  `${path.sep}contratos${path.sep}assets${path.sep}`,
  `${path.sep}plataformaaxio-integration${path.sep}`,
];
const extensions = new Set([".html", ".js", ".css", ".ts", ".tsx", ".md"]);

const suspiciousPatterns = [
  { label: "mojibake UTF-8", pattern: /Ã[\u0080-\u00ff]|Â[\u0080-\u00ff]|â(?:€|„|œ|˜|™|“|”|‘|’|–|—|€¦)/g },
  { label: "caractere de substituição", pattern: /\uFFFD/g },
  {
    label: "acento substituído por ?",
    pattern:
      /\b(?:N|n)\?o\b|\bposs\?vel\b|\bd\?gitos\b|\busu\?rios?\b|\binv\?lid[ao]s?\b|\bSess\?o\b|\bVoc\?\b|\bpermiss\?o\b|\best\?\b|\bj\?\b|\bs\?o\b|\bselecion\?vel\b|\baprova\?\?o\b|\ba\?\?o\b|\bopera\?\?o\b|\bdescri\?\?o\b|\bhist\?rico\b|\bs\?cios?\b|\brespons\?vel\b|\bobrigat\?rio\b/g,
  },
];

function shouldIgnore(file) {
  if (ignoredFiles.has(path.basename(file))) return true;
  return ignoredPathParts.some((part) => file.includes(part));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (extensions.has(path.extname(entry.name).toLowerCase()) && !shouldIgnore(full)) files.push(full);
  }
  return files;
}

const findings = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { label, pattern } of suspiciousPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push(`${rel}:${index + 1} ${label}: ${line.trim().slice(0, 180)}`);
      }
    }
  });
}

if (findings.length) {
  console.error(`Foram encontrados ${findings.length} possíveis problemas de ortografia/encoding.`);
  console.error(findings.slice(0, 120).join("\n"));
  if (findings.length > 120) console.error(`...mais ${findings.length - 120} ocorrência(s).`);
  process.exit(1);
}

console.log("Checagem de ortografia/encoding concluída sem ocorrências suspeitas.");
