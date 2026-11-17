import fs from "node:fs";
import path from "node:path";
import { analyzeComplianceExtract, extractComplianceFile } from "../server-assets/sentinela-compliance.mjs";

const source = process.argv[2];
if (!source) throw new Error("Informe o caminho do arquivo.");
const extension = path.extname(source).toLowerCase();
const mime = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".csv": "text/csv",
}[extension] || "application/octet-stream";
const extract = await extractComplianceFile(fs.readFileSync(source), source, mime);
const analysis = analyzeComplianceExtract(extract, source);
console.log(JSON.stringify({
  textSample: extract.text.slice(0, 240),
  tableCount: extract.tables.length,
  sourceKind: analysis.sourceKind,
  period: analysis.period,
  metrics: analysis.metrics,
  caseCount: analysis.cases.length,
  origins: Object.fromEntries([...new Set(analysis.cases.map((item) => item.origin))].map((origin) => [origin, analysis.cases.filter((item) => item.origin === origin).length])),
  warnings: analysis.warnings,
}, null, 2));
