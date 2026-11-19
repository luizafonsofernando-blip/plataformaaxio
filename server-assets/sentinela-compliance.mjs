import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import formidable from "formidable";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import * as XLSX from "xlsx";

export const COMPLIANCE_UPLOAD_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXTENSION = Object.freeze({
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".csv": "text/csv",
});

const CASE_STATUSES = new Set([
  "identified", "analysis", "assigned", "action_requested", "waiting_responsible",
  "waiting_client", "waiting_payment", "waiting_agency", "regularizing", "resolved", "closed",
]);
const PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const ORIGINS = new Set(["internal", "external", "maed", "manual", "import"]);

function formValue(fields, name, max = 500) {
  const value = Array.isArray(fields[name]) ? fields[name][0] : fields[name];
  return String(value || "").trim().slice(0, max);
}

function parseForm(request) {
  const form = formidable({ maxFileSize: COMPLIANCE_UPLOAD_BYTES, multiples: false, allowEmptyFiles: false });
  return new Promise((resolve, reject) => form.parse(request, (error, fields, files) => error ? reject(error) : resolve({ fields, files })));
}

function cleanFilename(value) {
  const parsed = path.parse(String(value || "fonte-compliance"));
  const name = parsed.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "fonte-compliance";
  return `${name}${parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10)}`;
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

function compact(value, max = 5000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function elementValues(node, suffix, output = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => elementValues(item, suffix, output));
    return output;
  }
  if (!node || typeof node !== "object") return output;
  Object.entries(node).forEach(([key, value]) => {
    if (key === suffix || key.endsWith(`:${suffix}`)) output.push(value);
    elementValues(value, suffix, output);
  });
  return output;
}

function xmlText(node) {
  const chunks = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value === null || value === undefined) return;
    if (typeof value !== "object") return;
    Object.entries(value).forEach(([key, child]) => {
      if (key === "#text") chunks.push(String(child));
      else visit(child);
    });
  };
  visit(node);
  return compact(chunks.join(" "));
}

function parseXml(xml) {
  return new XMLParser({ preserveOrder: true, ignoreAttributes: true, trimValues: false }).parse(xml);
}

async function readZip(buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const expandedBytes = Object.values(zip.files).reduce((total, entry) => total + Number(entry?._data?.uncompressedSize || 0), 0);
  if (expandedBytes > 24 * 1024 * 1024) throw Object.assign(new Error("O arquivo compactado excede o limite seguro de processamento."), { status: 413 });
  return zip;
}

async function extractDocx(buffer) {
  const zip = await readZip(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw Object.assign(new Error("O arquivo Word não possui uma estrutura reconhecida."), { status: 422 });
  const parsed = parseXml(await entry.async("string"));
  const paragraphs = elementValues(parsed, "p").map(xmlText).filter(Boolean);
  const tables = elementValues(parsed, "tbl").map((table) => elementValues(table, "tr").map((row) => elementValues(row, "tc").map(xmlText))).filter((table) => table.length);
  return { text: paragraphs.join("\n"), tables };
}

async function extractPptx(buffer) {
  const zip = await readZip(buffer);
  const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!slideNames.length) throw Object.assign(new Error("A apresentação não possui slides reconhecíveis."), { status: 422 });
  const tables = [];
  const slides = [];
  for (const name of slideNames) {
    const parsed = parseXml(await zip.file(name).async("string"));
    const lines = elementValues(parsed, "t").map(xmlText).filter(Boolean);
    slides.push(lines.join("\n"));
    tables.push(lines);
  }
  return { text: slides.join("\n\n"), tables };
}

function spreadsheetExtract(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, dense: true });
  const tables = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }).map((row) => row.map((cell) => compact(cell, 5000))));
  return { text: tables.flat(2).filter(Boolean).join("\n"), tables };
}

async function extractPdf(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 250); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  await document.destroy();
  return { text: pages.join("\n"), tables: [] };
}

function extractCsv(buffer) {
  let value = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if ((value.match(/�/g) || []).length > 2) value = new TextDecoder("windows-1252").decode(buffer);
  const workbook = XLSX.read(value, { type: "string", raw: false });
  const tables = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }));
  return { text: value, tables };
}

export async function extractComplianceFile(buffer, filename, mimetype = "") {
  const extension = path.extname(filename || "").toLowerCase();
  if (!MIME_BY_EXTENSION[extension]) throw Object.assign(new Error("Use um arquivo Word, PDF, PowerPoint, Excel, ODS ou CSV."), { status: 415 });
  const declared = String(mimetype || "").toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== MIME_BY_EXTENSION[extension] && !(extension === ".csv" && declared.startsWith("text/"))) {
    throw Object.assign(new Error("O conteúdo do arquivo não corresponde ao formato informado."), { status: 415 });
  }
  if ([".docx", ".pptx", ".xlsx", ".ods"].includes(extension) && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    throw Object.assign(new Error("O arquivo compactado possui assinatura inválida."), { status: 422 });
  }
  if (extension === ".pdf" && buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw Object.assign(new Error("O PDF possui assinatura inválida."), { status: 422 });
  }
  if (extension === ".docx") return extractDocx(buffer);
  if (extension === ".pptx") return extractPptx(buffer);
  if ([".xlsx", ".ods"].includes(extension)) return spreadsheetExtract(buffer);
  if (extension === ".pdf") return extractPdf(buffer);
  return extractCsv(buffer);
}

function parseInteger(value) {
  const match = String(value || "").match(/\d[\d.]*/);
  return match ? Number(match[0].replace(/\./g, "")) : null;
}

function parseDecimal(value) {
  const match = String(value || "").match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function parseMoneyCents(value) {
  const source = String(value || "");
  const match = source.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i) || source.match(/([\d.]+(?:,\d{1,2})?)/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

function dateFromBr(value) {
  const match = String(value || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) ? null : iso;
}

function monthPeriod(text, filename) {
  const months = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const plain = normalized(text);
  const reference = plain.match(/periodo de referencia\s+([a-z]+)\s+(\d{4})/) || plain.match(/([a-z]+)\s+(\d{4})/);
  const through = plain.match(/atualizad[ao]\s+ate\s+(\d{2})\s+(\d{2})\s+(\d{4})/);
  let year = reference ? Number(reference[2]) : null;
  let month = reference ? months[reference[1]] : null;
  const filenameDate = String(filename || "").match(/(\d{2})[._-](\d{2})[._-](\d{4})/);
  if ((!year || !month) && filenameDate) { year = Number(filenameDate[3]); month = Number(filenameDate[2]); }
  const start = year && month ? `${year}-${String(month).padStart(2, "0")}-01` : null;
  const endDate = through ? `${through[3]}-${through[2]}-${through[1]}` : filenameDate ? `${filenameDate[3]}-${filenameDate[2]}-${filenameDate[1]}` : null;
  return { start, end: endDate || start };
}

function keyedIndicators(tables) {
  const result = new Map();
  tables.forEach((table) => {
    const header = table[0]?.map(normalized) || [];
    if (!header[0]?.includes("indicador")) return;
    table.slice(1).forEach((row) => {
      if (row[0]) result.set(normalized(row[0]), compact(row[1], 300));
    });
  });
  return result;
}

function indicator(indicators, fragments, parser = parseInteger) {
  for (const [key, value] of indicators) {
    if (fragments.every((fragment) => key.includes(fragment))) return parser(value);
  }
  return null;
}

function categoryFrom(value) {
  const text = normalized(value);
  if (text.includes("dctfweb") || text.includes("dctf web")) return "dctfweb";
  if (text.includes("inss") || text.includes("gps")) return "inss_gps";
  if (text.includes("fgts")) return "fgts";
  if (text.includes("simples") || text.includes("das")) return "simples_das";
  if (text.includes("pis") || text.includes("cofins")) return "pis_cofins";
  if (text.includes("irpj") || text.includes("csll") || text.includes("irrf") || text.includes("csrf")) return "irpj_csll";
  if (text.includes("pgfn") || text.includes("divida ativa")) return "pgfn";
  if (text.includes("parcelamento") || text.includes("exigibilidade")) return "installment";
  if (text.includes("processo")) return "process";
  if (text.includes("maed")) return "maed";
  return "other";
}

function caseFingerprint(item) {
  return createHash("sha256").update([
    normalized(item.companyName), item.origin, normalized(item.obligation), normalized(item.competence), normalized(item.title), String(item.amountCents || ""),
  ].join("|")).digest("hex");
}

function priorityFor(item) {
  const detail = normalized(`${item.title} ${item.description}`);
  if (detail.includes("inscricao inapta") || detail.includes("termo de exclusao")) return ["critical", "Risco cadastral ou de exclusão expresso na fonte."];
  if (item.origin === "maed" || detail.includes("vencid")) return ["high", "Multa ou vencimento identificado na fonte."];
  if ((item.amountCents || 0) >= 1000000) return ["high", "Valor financeiro relevante identificado na fonte."];
  return ["normal", "Acompanhamento operacional sem gatilho crítico expresso."];
}

function rowCases(tables) {
  const cases = [];
  tables.forEach((table) => {
    if (!Array.isArray(table) || table.length < 2) return;
    const header = table[0].map(normalized);
    const companyIndex = header.findIndex((value) => value === "empresa" || value.includes("razao social"));
    if (companyIndex < 0) return;
    const obligationIndex = header.findIndex((value) => value.includes("obrigacao"));
    const competenceIndex = header.findIndex((value) => value.includes("competencia"));
    const amountIndex = header.findIndex((value) => value === "valor" || value.includes("valor total"));
    const observationIndex = header.findIndex((value) => value.includes("observacao") || value.includes("situacao registrada"));
    const responsibleIndex = header.findIndex((value) => value.includes("responsavel"));
    const taxesIndex = header.findIndex((value) => value.includes("impostos"));
    const gesttaIndex = header.findIndex((value) => value.includes("gestta"));
    const isMaed = obligationIndex >= 0 && amountIndex >= 0 && observationIndex >= 0;
    const isInternal = competenceIndex >= 0 && responsibleIndex >= 0;
    const isExternal = taxesIndex >= 0 && gesttaIndex >= 0;
    if (!isMaed && !isInternal && !isExternal) return;

    table.slice(1).forEach((row) => {
      const companyName = compact(row[companyIndex], 180);
      if (!companyName) return;
      const obligation = compact(row[isExternal ? taxesIndex : obligationIndex >= 0 ? obligationIndex : competenceIndex], 500);
      const description = compact(row[observationIndex >= 0 ? observationIndex : gesttaIndex], 5000);
      const assignedName = compact(row[responsibleIndex], 160) || null;
      const amountCents = parseMoneyCents(row[amountIndex] || description);
      const resolved = /conclu|resolvid|regularizad|sem pendencia/i.test(normalized(description));
      const item = {
        companyName,
        categoryCode: isMaed ? "maed" : categoryFrom(obligation || description),
        origin: isMaed ? "maed" : isExternal ? "external" : "internal",
        obligation: obligation || (isInternal ? "DCTFWeb" : "Acompanhamento fiscal"),
        competence: compact(row[competenceIndex], 300) || null,
        title: isMaed ? "MAED identificada" : isExternal ? "Acompanhamento externo" : "Pendência de DCTFWeb",
        description: description || null,
        status: resolved ? "resolved" : assignedName ? "assigned" : "analysis",
        assignedName,
        department: assignedName?.match(/[-–]\s*([A-Za-zÀ-ÿ ]+)$/)?.[1]?.trim() || null,
        amountCents,
        dueAt: dateFromBr(description),
        gesttaTask: isExternal ? compact(row[gesttaIndex], 1000) || "Em análise" : null,
        resolvedAt: resolved ? new Date().toISOString() : null,
      };
      const [priority, priorityReason] = priorityFor(item);
      item.priority = priority;
      item.priorityReason = priorityReason;
      item.fingerprint = caseFingerprint(item);
      cases.push(item);
    });
  });
  return [...new Map(cases.map((item) => [item.fingerprint, item])).values()];
}

export function analyzeComplianceExtract(extract, filename = "") {
  const indicators = keyedIndicators(extract.tables || []);
  const period = monthPeriod(extract.text, filename);
  const metrics = {
    monitoredCompanies: indicator(indicators, ["empresas", "analisadas"]) ?? indicator(indicators, ["empresas", "unicas", "analisadas"]),
    dctfwebIdentified: indicator(indicators, ["dctfweb", "identificada"]) ?? indicator(indicators, ["dctfweb", "analisadas"]),
    resolvedCases: indicator(indicators, ["dctfweb", "resolvidas"]) ?? indicator(indicators, ["pendencia", "dctfweb", "resolvida"]),
    openCases: indicator(indicators, ["dctfweb", "ainda", "aberto"]) ?? indicator(indicators, ["pendencia", "dctfweb", "ainda", "aberto"]),
    assignedOpenCases: indicator(indicators, ["abertas", "responsavel", "atribuido"]),
    unassignedOpenCases: indicator(indicators, ["abertas", "sem", "responsavel"]),
    regularCompanies: indicator(indicators, ["empresas", "sem", "pendencia"]),
    maedCompanies: indicator(indicators, ["maed", "geradas"]),
    maedAmountCents: indicator(indicators, ["maed", "geradas"], parseMoneyCents),
    averageResponseDays: indicator(indicators, ["tempo", "medio", "resposta"], parseDecimal),
  };
  const cases = rowCases(extract.tables || []);
  const sourceKind = normalized(extract.text).includes("relatorio gerencial") ? "general_report" : normalized(extract.text).includes("apresentacao executiva") ? "executive_presentation" : "other";
  const warnings = [];
  if (!/\b\d{14}\b/.test(String(extract.text || "").replace(/\D/g, ""))) warnings.push("A fonte não possui CNPJ padronizado; empresas serão reconciliadas por correspondência exata de nome e as demais ficarão em revisão.");
  if (!cases.length) warnings.push("Nenhuma linha operacional foi reconhecida. Somente os indicadores consolidados poderão formar o snapshot.");
  if (!period.start || !period.end) warnings.push("O período não pôde ser identificado com segurança e deverá ser revisado.");
  return {
    sourceKind,
    period,
    metrics,
    cases,
    warnings,
    label: compact(extract.text.split(/\n/).find((line) => normalized(line).includes("relatorio gerencial")) || filename, 180),
  };
}

function matchCompanies(cases, companies) {
  const byName = new Map();
  companies.forEach((company) => {
    [company.legal_name, company.trade_name].filter(Boolean).forEach((name) => {
      const key = normalized(name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(company);
    });
  });
  let matched = 0;
  let review = 0;
  let conflicts = 0;
  const mapped = cases.map((item) => {
    const candidates = byName.get(normalized(item.companyName)) || [];
    if (candidates.length === 1) { matched += 1; return { ...item, companyId: candidates[0].id, reconciliation: "matched" }; }
    review += 1;
    if (candidates.length > 1) conflicts += 1;
    return { ...item, companyId: null, reconciliation: candidates.length > 1 ? "conflict" : "review" };
  });
  return { cases: mapped, matched, review, conflicts };
}

export async function previewComplianceImport(request, context, helpers) {
  let storagePath = "";
  let documentId = "";
  try {
    const { fields, files } = await parseForm(request);
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploaded) throw Object.assign(new Error("Selecione o Relatório Geral ou a Apresentação Executiva."), { status: 400 });
    const filename = cleanFilename(uploaded.originalFilename);
    const buffer = fs.readFileSync(uploaded.filepath);
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const prior = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_import_batches?select=id,status,extracted_summary,preview_payload,detected_period_start,detected_period_end&organization_id=eq.${context.organizationId}&file_hash=eq.${fileHash}&limit=1`);
    if (prior?.[0]?.status === "confirmed") throw Object.assign(new Error("Este arquivo já foi confirmado anteriormente e não será importado novamente."), { status: 409 });
    if (prior?.[0]?.status === "preview") return { batchId: prior[0].id, ...prior[0].extracted_summary, cases: prior[0].preview_payload?.cases || [], repeatedPreview: true };

    const extract = await extractComplianceFile(buffer, uploaded.originalFilename, uploaded.mimetype);
    const analysis = analyzeComplianceExtract(extract, uploaded.originalFilename);
    const companies = await helpers.supabaseFetch(`/rest/v1/sentinel_companies?select=id,legal_name,trade_name,cnpj&organization_id=eq.${context.organizationId}&deleted_at=is.null`);
    const reconciliation = matchCompanies(analysis.cases, companies || []);
    const summary = {
      label: analysis.label,
      sourceKind: analysis.sourceKind,
      period: analysis.period,
      metrics: analysis.metrics,
      warnings: analysis.warnings,
      reconciliation: {
        totalCases: reconciliation.cases.length,
        matched: reconciliation.matched,
        review: reconciliation.review,
        conflicts: reconciliation.conflicts,
        recordsToCreate: reconciliation.cases.length,
        recordsToUpdate: 0,
      },
    };

    storagePath = `${context.organizationId}/compliance/imports/${randomUUID()}-${filename}`;
    const { error: uploadError } = await helpers.storage.storage.from("sentinel-documents").upload(storagePath, buffer, { contentType: MIME_BY_EXTENSION[path.extname(filename).toLowerCase()], upsert: false, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const { data: document, error: documentError } = await helpers.storage.from("sentinel_documents").insert({
      organization_id: context.organizationId,
      category: "compliance_source",
      name: formValue(fields, "name", 200) || uploaded.originalFilename,
      source: "compliance_import_preview",
      storage_path: storagePath,
      mime_type: MIME_BY_EXTENSION[path.extname(filename).toLowerCase()],
      size_bytes: uploaded.size,
      created_by: context.user.id,
    }).select("*").single();
    if (documentError) throw documentError;
    documentId = document.id;

    const rows = await helpers.supabaseFetch("/rest/v1/sentinel_compliance_import_batches?select=*", {
      method: "POST",
      prefer: "return=representation",
      body: {
        organization_id: context.organizationId,
        filename: uploaded.originalFilename,
        mime_type: document.mime_type,
        source_kind: analysis.sourceKind === "other" ? "other" : analysis.sourceKind,
        file_hash: fileHash,
        status: "preview",
        detected_period_start: analysis.period.start,
        detected_period_end: analysis.period.end,
        extracted_summary: summary,
        preview_payload: { cases: reconciliation.cases },
        document_id: document.id,
        created_by: context.user.id,
      },
    });
    const batch = rows?.[0];
    await helpers.audit(request, context, "compliance_import_previewed", "compliance_import", batch?.id, null, { filename: uploaded.originalFilename, ...summary.reconciliation });
    return { batchId: batch.id, ...summary, cases: reconciliation.cases };
  } catch (error) {
    if (storagePath) await helpers.storage.storage.from("sentinel-documents").remove([storagePath]);
    if (documentId) await helpers.storage.from("sentinel_documents").delete().eq("id", documentId).eq("organization_id", context.organizationId);
    if (error?.code === 1009) throw Object.assign(new Error("O arquivo excede o limite de 4 MB."), { status: 413 });
    throw error;
  }
}

const DEFAULT_COMPLIANCE_CATEGORIES = [
  ["dctfweb", "DCTFWeb", 10], ["inss_gps", "INSS e GPS", 20], ["fgts", "FGTS", 30],
  ["simples_das", "Simples Nacional e DAS", 40], ["pis_cofins", "PIS e COFINS", 50],
  ["irpj_csll", "IRPJ e CSLL", 60], ["pgfn", "PGFN e dívida ativa", 70],
  ["installment", "Parcelamentos", 80], ["process", "Processos", 90], ["maed", "MAED", 100], ["other", "Outros", 999],
];

async function ensureComplianceCategories(context, supabaseFetch) {
  await supabaseFetch("/rest/v1/sentinel_compliance_categories?on_conflict=organization_id,code", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: DEFAULT_COMPLIANCE_CATEGORIES.map(([code, name, sort_order]) => ({
      organization_id: context.organizationId,
      code,
      name,
      sort_order,
      created_by: context.user.id,
    })),
  });
}

export async function complianceBootstrap(context, supabaseFetch) {
  const org = context.organizationId;
  await ensureComplianceCategories(context, supabaseFetch);
  const [categories, profiles, cases, outreach, snapshots, imports, events] = await Promise.all([
    supabaseFetch(`/rest/v1/sentinel_compliance_categories?select=*&organization_id=eq.${org}&active=eq.true&order=sort_order.asc`),
    supabaseFetch(`/rest/v1/sentinel_compliance_company_profiles?select=*&organization_id=eq.${org}&order=updated_at.desc`),
    supabaseFetch(`/rest/v1/sentinel_compliance_cases?select=*&organization_id=eq.${org}&deleted_at=is.null&order=created_at.desc&limit=1000`),
    supabaseFetch(`/rest/v1/sentinel_compliance_outreach?select=*&organization_id=eq.${org}&deleted_at=is.null&order=requested_at.desc&limit=1000`),
    supabaseFetch(`/rest/v1/sentinel_compliance_snapshots?select=*&organization_id=eq.${org}&order=period_end.desc`),
    supabaseFetch(`/rest/v1/sentinel_compliance_import_batches?select=id,filename,mime_type,source_kind,status,detected_period_start,detected_period_end,extracted_summary,document_id,created_at,confirmed_at&organization_id=eq.${org}&order=created_at.desc&limit=100`),
    supabaseFetch(`/rest/v1/sentinel_compliance_case_events?select=id,case_id,actor_id,event_type,comment,created_at&organization_id=eq.${org}&order=created_at.desc&limit=500`),
  ]);
  return { categories: categories || [], profiles: profiles || [], cases: cases || [], outreach: outreach || [], snapshots: snapshots || [], imports: imports || [], events: events || [] };
}

export function complianceCaseInput(input, context, existing = null) {
  const title = compact(input.title, 180);
  if (title.length < 3) throw Object.assign(new Error("Informe o título da ocorrência de Compliance."), { status: 400 });
  const status = CASE_STATUSES.has(input.status) ? input.status : existing?.status || "identified";
  const amount = input.amount_cents === "" || input.amount_cents === null || input.amount_cents === undefined ? null : Number(input.amount_cents);
  if (amount !== null && (!Number.isInteger(amount) || amount < 0)) throw Object.assign(new Error("Informe um valor monetário válido."), { status: 400 });
  return {
    organization_id: context.organizationId,
    company_id: helpersUuid(input.company_id || input.companyId),
    source_company_name: compact(input.source_company_name || input.sourceCompanyName, 180) || null,
    category_code: compact(input.category_code || input.categoryCode, 80) || "other",
    origin: ORIGINS.has(input.origin) ? input.origin : existing?.origin || "manual",
    obligation: compact(input.obligation, 240) || null,
    competence: compact(input.competence, 120) || null,
    title,
    description: compact(input.description, 5000) || null,
    status,
    priority: PRIORITIES.has(input.priority) ? input.priority : existing?.priority || "normal",
    priority_reason: compact(input.priority_reason || input.priorityReason, 1000) || null,
    assigned_to: helpersUuid(input.assigned_to || input.assignedTo) || existing?.assigned_to || null,
    assigned_name: compact(input.assigned_name || input.assignedName, 160) || null,
    department: compact(input.department, 120) || null,
    amount_cents: amount,
    due_at: safeDateTime(input.due_at || input.dueAt),
    internal_due_at: safeDateTime(input.internal_due_at || input.internalDueAt),
    gestta_task: compact(input.gestta_task || input.gesttaTask, 1000) || null,
    notes: compact(input.notes, 5000) || null,
    next_action: compact(input.next_action || input.nextAction, 2000) || null,
    completion_notes: compact(input.completion_notes || input.completionNotes, 5000) || null,
    resolved_at: ["resolved", "closed"].includes(status) ? existing?.resolved_at || new Date().toISOString() : null,
    created_by: existing?.created_by || context.user.id,
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
    version: Number(existing?.version || 0) + 1,
  };
}

function helpersUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")) ? String(value) : null;
}

function safeDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function complianceProfileInput(input, context, existing = null) {
  const companyId = helpersUuid(input.company_id || input.companyId || existing?.company_id);
  if (!companyId) throw Object.assign(new Error("Selecione uma empresa válida."), { status: 400 });
  const monitoringStatus = ["active", "paused", "inactive"].includes(input.monitoring_status) ? input.monitoring_status : existing?.monitoring_status || "active";
  return {
    organization_id: context.organizationId,
    company_id: companyId,
    monitoring_status: monitoringStatus,
    treatment_owner_id: helpersUuid(input.treatment_owner_id || input.treatmentOwnerId) || existing?.treatment_owner_id || null,
    treatment_owner_name: compact(input.treatment_owner_name || input.treatmentOwnerName, 160) || null,
    monitoring_owner_id: helpersUuid(input.monitoring_owner_id || input.monitoringOwnerId) || existing?.monitoring_owner_id || null,
    monitoring_owner_name: compact(input.monitoring_owner_name || input.monitoringOwnerName, 160) || null,
    client_contact_name: compact(input.client_contact_name || input.clientContactName, 160) || null,
    client_contact_email: compact(input.client_contact_email || input.clientContactEmail, 254) || null,
    client_contact_phone: compact(input.client_contact_phone || input.clientContactPhone, 40) || null,
    notes: compact(input.notes, 5000) || null,
    version: Number(existing?.version || 0) + 1,
    created_by: existing?.created_by || context.user.id,
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
  };
}

function notificationSeverity(item) {
  if (item.priority === "critical") return "critical";
  if (item.priority === "high") return "relevant";
  return "attention";
}

async function syncComplianceAlert(item, helpers) {
  const active = !["resolved", "closed"].includes(item.status);
  const dueSoon = item.internal_due_at && new Date(item.internal_due_at).getTime() <= Date.now() + 7 * 86400000;
  const needsAlert = active && (item.priority === "critical" || item.priority === "high" || !item.assigned_name || dueSoon);
  const existing = await helpers.supabaseFetch(`/rest/v1/sentinel_notifications?select=id&organization_id=eq.${item.organization_id}&entity_type=eq.compliance_case&entity_id=eq.${item.id}&resolved_at=is.null&limit=1`);
  if (!needsAlert) {
    if (existing?.[0]) await helpers.supabaseFetch(`/rest/v1/sentinel_notifications?id=eq.${existing[0].id}&organization_id=eq.${item.organization_id}`, { method: "PATCH", prefer: "return=minimal", body: { resolved_at: new Date().toISOString() } });
    return;
  }
  const title = !item.assigned_name ? "Ocorrência de Compliance sem responsável" : dueSoon ? "Prazo de Compliance próximo ou vencido" : "Ocorrência prioritária de Compliance";
  const body = {
    category: "compliance",
    title,
    message: `${item.title}${item.source_company_name ? ` · ${item.source_company_name}` : ""}`,
    severity: notificationSeverity(item),
    entity_type: "compliance_case",
    entity_id: item.id,
    read_at: null,
  };
  if (existing?.[0]) await helpers.supabaseFetch(`/rest/v1/sentinel_notifications?id=eq.${existing[0].id}&organization_id=eq.${item.organization_id}`, { method: "PATCH", prefer: "return=minimal", body });
  else await helpers.supabaseFetch("/rest/v1/sentinel_notifications", { method: "POST", prefer: "return=minimal", body: { ...body, organization_id: item.organization_id } });
}

export async function createComplianceResource(request, context, resource, input, helpers) {
  if (resource === "compliance_case") {
    helpers.requirePermission(context, "compliance.create");
    const payload = complianceCaseInput(input, context);
    const rows = await helpers.supabaseFetch("/rest/v1/sentinel_compliance_cases?select=*", { method: "POST", prefer: "return=representation", body: payload });
    const saved = rows?.[0];
    await helpers.supabaseFetch("/rest/v1/sentinel_compliance_case_events", { method: "POST", prefer: "return=minimal", body: { organization_id: context.organizationId, case_id: saved.id, actor_id: context.user.id, event_type: "created", after_data: saved } });
    await helpers.audit(request, context, "compliance_case_created", "compliance_case", saved.id, null, saved);
    await syncComplianceAlert(saved, helpers);
    return saved;
  }
  if (resource === "compliance_profile") {
    helpers.requirePermission(context, "compliance.edit");
    if ((input.treatment_owner_name !== undefined || input.monitoring_owner_name !== undefined) && !helpers.permissionsFor(context).includes("compliance.assign")) {
      throw Object.assign(new Error("Seu perfil não possui permissão para atribuir responsáveis."), { status: 403 });
    }
    const companyId = helpersUuid(input.company_id || input.companyId);
    if (!companyId) throw Object.assign(new Error("Selecione uma empresa válida."), { status: 400 });
    const company = await helpers.supabaseFetch(`/rest/v1/sentinel_companies?select=id&organization_id=eq.${context.organizationId}&id=eq.${companyId}&deleted_at=is.null&limit=1`);
    if (!company?.length) throw Object.assign(new Error("Empresa não encontrada no Sentinela."), { status: 404 });
    const profiles = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_company_profiles?select=*&organization_id=eq.${context.organizationId}&company_id=eq.${companyId}&limit=1`);
    const existing = profiles?.[0] || null;
    const payload = complianceProfileInput(input, context, existing);
    let saved;
    if (existing) {
      const expectedVersion = Number(input.version);
      const versionFilter = Number.isInteger(expectedVersion) ? `&version=eq.${expectedVersion}` : "";
      const rows = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_company_profiles?id=eq.${existing.id}&organization_id=eq.${context.organizationId}${versionFilter}&select=*`, { method: "PATCH", prefer: "return=representation", body: payload });
      saved = rows?.[0];
      if (!saved) throw Object.assign(new Error("Esta ficha foi alterada por outro usuário. Atualize a tela antes de tentar novamente."), { status: 409 });
    } else {
      const rows = await helpers.supabaseFetch("/rest/v1/sentinel_compliance_company_profiles?select=*", { method: "POST", prefer: "return=representation", body: payload });
      saved = rows?.[0];
    }
    await helpers.audit(request, context, "compliance_profile_saved", "compliance_profile", saved.id, existing, saved);
    return saved;
  }
  if (resource === "compliance_outreach") {
    helpers.requirePermission(context, "compliance.create");
    const caseId = helpersUuid(input.case_id || input.caseId);
    const contactedName = compact(input.contacted_name || input.contactedName, 160);
    const requestSummary = compact(input.request_summary || input.requestSummary, 3000);
    if (!caseId || !contactedName || !requestSummary) throw Object.assign(new Error("Informe a ocorrência, a pessoa acionada e a solicitação."), { status: 400 });
    const ownedCase = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_cases?select=id&organization_id=eq.${context.organizationId}&id=eq.${caseId}&deleted_at=is.null&limit=1`);
    if (!ownedCase?.length) throw Object.assign(new Error("Ocorrência de Compliance não encontrada."), { status: 404 });
    const payload = {
      organization_id: context.organizationId,
      case_id: caseId,
      audience: ["internal", "client", "external_agency", "other"].includes(input.audience) ? input.audience : "internal",
      contacted_name: contactedName,
      request_summary: requestSummary,
      requested_at: safeDateTime(input.requested_at || input.requestedAt) || new Date().toISOString(),
      response_due_at: safeDateTime(input.response_due_at || input.responseDueAt),
      response_summary: compact(input.response_summary || input.responseSummary, 3000) || null,
      responded_at: input.responded ? new Date().toISOString() : null,
      created_by: context.user.id,
    };
    const rows = await helpers.supabaseFetch("/rest/v1/sentinel_compliance_outreach?select=*", { method: "POST", prefer: "return=representation", body: payload });
    await helpers.audit(request, context, "compliance_outreach_created", "compliance_case", caseId, null, rows?.[0]);
    return rows?.[0];
  }
  if (resource === "compliance_import_confirm") {
    helpers.requirePermission(context, "compliance.create");
    const batchId = helpersUuid(input.batch_id || input.batchId);
    if (!batchId) throw Object.assign(new Error("Prévia de importação inválida."), { status: 400 });
    const result = await helpers.supabaseFetch("/rest/v1/rpc/sentinel_confirm_compliance_import", { method: "POST", body: { p_batch_id: batchId, p_organization_id: context.organizationId, p_actor_id: context.user.id } });
    await helpers.audit(request, context, "compliance_import_confirmed", "compliance_import", batchId, null, result);
    return result;
  }
  if (resource === "compliance_import_cancel") {
    helpers.requirePermission(context, "compliance.create");
    const batchId = helpersUuid(input.batch_id || input.batchId);
    if (!batchId) throw Object.assign(new Error("Prévia de importação inválida."), { status: 400 });
    const batches = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_import_batches?select=id,status&organization_id=eq.${context.organizationId}&id=eq.${batchId}&limit=1`);
    if (!batches?.length) throw Object.assign(new Error("Prévia de importação não encontrada."), { status: 404 });
    if (batches[0].status === "preview") {
      await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_import_batches?id=eq.${batchId}&organization_id=eq.${context.organizationId}&status=eq.preview`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { status: "cancelled", cancelled_at: new Date().toISOString() },
      });
      await helpers.audit(request, context, "compliance_import_cancelled", "compliance_import", batchId, batches[0], { status: "cancelled" });
    }
    return { ok: true };
  }
  if (resource === "compliance_export_audit") {
    helpers.requirePermission(context, "compliance.export");
    const format = compact(input.format, 20);
    const reportType = compact(input.report_type || input.reportType, 80);
    const recordCount = Math.max(0, Math.min(1000000, Number.parseInt(input.record_count || input.recordCount || 0, 10) || 0));
    await helpers.audit(request, context, "compliance_report_exported", "compliance_report", null, null, { format, reportType, recordCount });
    return { ok: true };
  }
  throw Object.assign(new Error("Recurso de Compliance inválido."), { status: 400 });
}

export async function updateComplianceCase(request, context, id, input, helpers) {
  helpers.requirePermission(context, "compliance.edit");
  const rows = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_cases?select=*&organization_id=eq.${context.organizationId}&id=eq.${id}&deleted_at=is.null&limit=1`);
  const existing = rows?.[0];
  if (!existing) throw Object.assign(new Error("Ocorrência de Compliance não encontrada."), { status: 404 });
  if ((input.assigned_name !== undefined || input.assignedName !== undefined || input.department !== undefined) && !helpers.permissionsFor(context).includes("compliance.assign")) {
    throw Object.assign(new Error("Seu perfil não possui permissão para atribuir responsáveis."), { status: 403 });
  }
  const payload = complianceCaseInput({ ...existing, ...input }, context, existing);
  const version = Number(input.version);
  const versionFilter = Number.isInteger(version) ? `&version=eq.${version}` : "";
  const updated = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_cases?id=eq.${id}&organization_id=eq.${context.organizationId}${versionFilter}&select=*`, { method: "PATCH", prefer: "return=representation", body: payload });
  const saved = updated?.[0];
  if (!saved) throw Object.assign(new Error("Este registro foi alterado por outro usuário. Atualize a tela antes de tentar novamente."), { status: 409 });
  await helpers.supabaseFetch("/rest/v1/sentinel_compliance_case_events", { method: "POST", prefer: "return=minimal", body: { organization_id: context.organizationId, case_id: id, actor_id: context.user.id, event_type: "updated", before_data: existing, after_data: saved, comment: compact(input.change_comment || input.changeComment, 1000) || null } });
  await helpers.audit(request, context, "compliance_case_updated", "compliance_case", id, existing, saved);
  await syncComplianceAlert(saved, helpers);
  return saved;
}

export async function deleteComplianceCase(request, context, id, helpers) {
  helpers.requirePermission(context, "compliance.delete");
  const rows = await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_cases?select=*&organization_id=eq.${context.organizationId}&id=eq.${id}&deleted_at=is.null&limit=1`);
  const existing = rows?.[0];
  if (!existing) throw Object.assign(new Error("Ocorrência de Compliance não encontrada."), { status: 404 });
  const deletedAt = new Date().toISOString();
  await helpers.supabaseFetch(`/rest/v1/sentinel_compliance_cases?id=eq.${id}&organization_id=eq.${context.organizationId}`, { method: "PATCH", prefer: "return=minimal", body: { deleted_at: deletedAt, updated_at: deletedAt, updated_by: context.user.id, version: Number(existing.version || 0) + 1 } });
  await helpers.supabaseFetch("/rest/v1/sentinel_compliance_case_events", { method: "POST", prefer: "return=minimal", body: { organization_id: context.organizationId, case_id: id, actor_id: context.user.id, event_type: "deleted", before_data: existing } });
  await helpers.audit(request, context, "compliance_case_deleted", "compliance_case", id, existing, null);
  await syncComplianceAlert({ ...existing, status: "closed" }, helpers);
  return { ok: true };
}
