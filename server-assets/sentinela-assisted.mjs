import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import formidable from "formidable";
import { extractComplianceFile } from "./sentinela-compliance.mjs";

export const ASSISTED_UPLOAD_BYTES = 4 * 1024 * 1024;

const SOURCES = Object.freeze({
  "federal-cnd": { name: "CND Federal / CPEND", category: "certificate", extensions: [".pdf"] },
  "federal-situation": { name: "Situação Fiscal Federal", category: "declaration", extensions: [".pdf"] },
  "federal-mailbox": { name: "Alerta da Caixa Postal", category: "evidence", extensions: [".pdf", ".txt", ".eml"] },
});

function value(fields, name, max = 500) {
  const raw = Array.isArray(fields?.[name]) ? fields[name][0] : fields?.[name];
  return String(raw || "").trim().slice(0, max);
}

function parseForm(request) {
  const form = formidable({ maxFileSize: ASSISTED_UPLOAD_BYTES, multiples: false, allowEmptyFiles: false });
  return new Promise((resolve, reject) => form.parse(request, (error, fields, files) => error ? reject(error) : resolve({ fields, files })));
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function safeFilename(filename) {
  const parsed = path.parse(String(filename || "fonte-fiscal"));
  const name = parsed.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "fonte-fiscal";
  return `${name}${parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10)}`;
}

function isoDate(day, month, year) {
  const iso = `${year}-${month}-${day}`;
  return Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) ? null : iso;
}

function findDate(text, labels) {
  const plain = normalize(text);
  for (const label of labels) {
    const escaped = normalize(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = plain.match(new RegExp(`${escaped}[^0-9]{0,35}(\\d{2})[\\/.](\\d{2})[\\/.](\\d{4})`));
    if (match) return isoDate(match[1], match[2], match[3]);
  }
  return null;
}

function extractCnpjs(text) {
  const matches = String(text || "").match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || [];
  return [...new Set(matches.map((item) => item.replace(/\D/g, "")).filter((item) => item.length === 14))].slice(0, 20);
}

function statusFor(sourceCode, text) {
  const plain = normalize(text);
  if (sourceCode === "federal-mailbox") return "attention";
  if (sourceCode === "federal-cnd") {
    if (/certidao positiva com efeitos de negativa|positiva com efeito de negativa/.test(plain)) return "attention";
    if (/certidao negativa|certidao de regularidade fiscal/.test(plain) && !/nao foi possivel|positiva/.test(plain)) return "regular";
    if (/certidao positiva|pendencias? que impedem/.test(plain)) return "critical";
    return "unknown";
  }
  if (/nao (foram|foi|ha) (detectadas? )?pendencias|situacao fiscal regular/.test(plain)) return "regular";
  if (/omissao|pendencia|debito|divida ativa|exigibilidade/.test(plain)) return "relevant";
  return "unknown";
}

function statusOverride(raw, fallback) {
  return ["regular", "attention", "relevant", "critical", "unknown"].includes(raw) ? raw : fallback;
}

function sourceSummary(sourceCode, text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const fallback = sourceCode === "federal-mailbox"
    ? "Alerta de nova comunicação recebido. O conteúdo oficial deve ser consultado no Portal da Receita."
    : "Documento recebido e preservado como evidência oficial assistida.";
  return (clean || fallback).slice(0, 900);
}

export async function analyzeAssistedSource(buffer, filename, mimetype, sourceCode, overrides = {}) {
  const source = SOURCES[sourceCode];
  if (!source) throw Object.assign(new Error("Fonte assistida inválida."), { status: 400 });
  const extension = path.extname(filename || "").toLowerCase();
  if (!source.extensions.includes(extension)) throw Object.assign(new Error(`Formato inválido. Use ${source.extensions.join(" ou ")}.`), { status: 415 });
  let extracted;
  if ([".txt", ".eml"].includes(extension)) {
    const declared = String(mimetype || "").toLowerCase();
    if (declared && !["text/plain", "message/rfc822", "application/octet-stream"].includes(declared)) {
      throw Object.assign(new Error("O conteúdo do alerta não corresponde ao formato informado."), { status: 415 });
    }
    if (buffer.includes(0)) throw Object.assign(new Error("O arquivo de alerta contém dados binários inválidos."), { status: 422 });
    extracted = { text: new TextDecoder("utf-8", { fatal: false }).decode(buffer), tables: [] };
  } else {
    extracted = await extractComplianceFile(buffer, filename, mimetype);
  }
  return analyzeAssistedText(extracted.text || "", sourceCode, overrides);
}

export function analyzeAssistedText(text, sourceCode, overrides = {}) {
  const source = SOURCES[sourceCode];
  if (!source) throw Object.assign(new Error("Fonte assistida inválida."), { status: 400 });
  if (String(text || "").trim().length < 20) throw Object.assign(new Error("Não foi possível extrair conteúdo suficiente do arquivo."), { status: 422 });
  const inferred = statusFor(sourceCode, text);
  const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(overrides.issuedAt || "") ? overrides.issuedAt : findDate(text, ["emitida em", "emissao", "data da consulta", "consulta realizada em"]);
  const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(overrides.expiresAt || "") ? overrides.expiresAt : findDate(text, ["valida ate", "validade", "vencimento"]);
  return {
    sourceCode,
    sourceName: source.name,
    category: source.category,
    officialStatus: statusOverride(overrides.officialStatus, inferred),
    inferredStatus: inferred,
    issuedAt,
    expiresAt,
    cnpjs: extractCnpjs(text),
    summary: sourceSummary(sourceCode, text),
    requiresPortalAccess: sourceCode === "federal-mailbox",
    officialApi: false,
    accessMode: "assisted",
    portalGeneration: "portal-agnostic",
  };
}

function dueDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function shouldCreateAction(sourceCode, status) {
  return sourceCode === "federal-mailbox" || ["attention", "relevant", "critical"].includes(status);
}

async function companyFor(supabase, context, companyId) {
  if (!companyId) return null;
  const { data, error } = await supabase.from("sentinel_companies").select("id,cnpj,legal_name,fiscal_status,version").eq("organization_id", context.organizationId).eq("id", companyId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Empresa não encontrada nesta organização."), { status: 404 });
  return data;
}

async function insertOne(supabase, table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function processAssistedIntake(request, context, supabase, audit, { preview = false } = {}) {
  let storagePath = "";
  const inserted = [];
  try {
    const { fields, files } = await parseForm(request);
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploaded) throw Object.assign(new Error("Selecione um arquivo oficial."), { status: 400 });
    const sourceCode = value(fields, "source_code", 40);
    const companyId = value(fields, "company_id", 80) || null;
    if (!SOURCES[sourceCode]) throw Object.assign(new Error("Selecione uma fonte válida."), { status: 400 });
    if (sourceCode !== "federal-mailbox" && !companyId) throw Object.assign(new Error("Selecione a empresa relacionada ao documento."), { status: 400 });
    const company = await companyFor(supabase, context, companyId);
    const buffer = fs.readFileSync(uploaded.filepath);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const analysis = await analyzeAssistedSource(buffer, uploaded.originalFilename, uploaded.mimetype, sourceCode, {
      issuedAt: value(fields, "issued_at", 10),
      expiresAt: value(fields, "expires_at", 10),
      officialStatus: value(fields, "official_status", 20),
    });
    if (company && analysis.cnpjs.length && !analysis.cnpjs.includes(company.cnpj)) {
      throw Object.assign(new Error("O CNPJ identificado no documento não corresponde à empresa selecionada."), { status: 422 });
    }
    const { data: duplicate, error: duplicateError } = await supabase.from("sentinel_assisted_intakes").select("id,checked_at").eq("organization_id", context.organizationId).eq("source_code", sourceCode).eq("content_hash", hash).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw Object.assign(new Error("Este arquivo já foi processado anteriormente."), { status: 409, duplicate });
    if (preview) return { ...analysis, contentHash: hash, filename: uploaded.originalFilename, companyName: company?.legal_name || null };

    const filename = safeFilename(uploaded.originalFilename);
    storagePath = `${context.organizationId}/${companyId || "geral"}/assistido-${randomUUID()}-${filename}`;
    const { error: uploadError } = await supabase.storage.from("sentinel-documents").upload(storagePath, buffer, { contentType: uploaded.mimetype, upsert: false, cacheControl: "3600" });
    if (uploadError) throw uploadError;

    const document = await insertOne(supabase, "sentinel_documents", {
      organization_id: context.organizationId,
      company_id: companyId,
      category: analysis.category,
      name: uploaded.originalFilename,
      source: `${analysis.sourceName} · fluxo assistido`,
      storage_path: storagePath,
      mime_type: uploaded.mimetype,
      size_bytes: uploaded.size,
      issued_at: analysis.issuedAt,
      expires_at: analysis.expiresAt,
      created_by: context.user.id,
    });
    inserted.push(["sentinel_documents", document.id]);

    let snapshot = null;
    if (company) {
      snapshot = await insertOne(supabase, "sentinel_fiscal_snapshots", {
        organization_id: context.organizationId,
        company_id: company.id,
        source_code: sourceCode,
        source_name: analysis.sourceName,
        status: analysis.officialStatus === "unknown" ? "not_checked" : analysis.officialStatus,
        official_data: { ...analysis, summary: analysis.summary, content_hash: hash },
        source_reference: `sha256:${hash}`,
        checked_at: analysis.issuedAt ? `${analysis.issuedAt}T12:00:00Z` : new Date().toISOString(),
        valid_until: analysis.expiresAt ? `${analysis.expiresAt}T23:59:59Z` : null,
        created_by: context.user.id,
      });
      inserted.push(["sentinel_fiscal_snapshots", snapshot.id]);
    }

    let occurrence = null;
    let task = null;
    if (shouldCreateAction(sourceCode, analysis.officialStatus)) {
      occurrence = await insertOne(supabase, "sentinel_occurrences", {
        organization_id: context.organizationId,
        company_id: companyId,
        title: sourceCode === "federal-mailbox" ? "Nova comunicação na Caixa Postal" : `${analysis.sourceName}: revisão necessária`,
        description: analysis.summary,
        category: sourceCode === "federal-mailbox" ? "communication" : "fiscal",
        source: `${sourceCode}:assisted`,
        severity: analysis.officialStatus,
        status: "new",
        department: "Fiscal",
        due_at: dueDate(sourceCode === "federal-mailbox" ? 1 : analysis.officialStatus === "critical" ? 1 : 3),
        official_data: { source_code: sourceCode, document_id: document.id, content_hash: hash, requires_portal_access: analysis.requiresPortalAccess },
        created_by: context.user.id,
        updated_by: context.user.id,
      });
      inserted.push(["sentinel_occurrences", occurrence.id]);
      task = await insertOne(supabase, "sentinel_tasks", {
        organization_id: context.organizationId,
        company_id: companyId,
        occurrence_id: occurrence.id,
        title: sourceCode === "federal-mailbox" ? "Consultar comunicação no Portal da Receita" : `Revisar ${analysis.sourceName}`,
        priority: analysis.officialStatus === "critical" ? "critical" : "high",
        status: "open",
        assigned_name: company?.legal_name ? null : "Equipe Fiscal",
        due_at: occurrence.due_at,
        created_by: context.user.id,
        updated_by: context.user.id,
      });
      inserted.push(["sentinel_tasks", task.id]);
    }

    const notificationNeeded = shouldCreateAction(sourceCode, analysis.officialStatus)
      || (analysis.expiresAt && (Date.parse(`${analysis.expiresAt}T23:59:59Z`) - Date.now()) <= 30 * 86400000);
    if (notificationNeeded) {
      const notification = await insertOne(supabase, "sentinel_notifications", {
        organization_id: context.organizationId,
        category: sourceCode === "federal-mailbox" ? "message" : "certificate",
        title: sourceCode === "federal-mailbox" ? "Nova comunicação fiscal para consultar" : `${analysis.sourceName} requer atenção`,
        message: company ? `${company.legal_name}: ${analysis.summary.slice(0, 350)}` : analysis.summary.slice(0, 350),
        severity: analysis.officialStatus,
        entity_type: occurrence ? "occurrence" : "document",
        entity_id: occurrence?.id || document.id,
      });
      inserted.push(["sentinel_notifications", notification.id]);
    }

    const intake = await insertOne(supabase, "sentinel_assisted_intakes", {
      organization_id: context.organizationId,
      company_id: companyId,
      document_id: document.id,
      snapshot_id: snapshot?.id || null,
      occurrence_id: occurrence?.id || null,
      task_id: task?.id || null,
      source_code: sourceCode,
      intake_kind: sourceCode === "federal-mailbox" ? "email_alert" : "document_upload",
      processing_status: analysis.officialStatus === "unknown" ? "review" : "processed",
      official_status: analysis.officialStatus,
      source_reference: `sha256:${hash}`,
      content_hash: hash,
      extracted_data: analysis,
      checked_at: analysis.issuedAt ? `${analysis.issuedAt}T12:00:00Z` : new Date().toISOString(),
      valid_until: analysis.expiresAt ? `${analysis.expiresAt}T23:59:59Z` : null,
      created_by: context.user.id,
    });
    inserted.push(["sentinel_assisted_intakes", intake.id]);

    const job = await insertOne(supabase, "sentinel_connector_jobs", {
      organization_id: context.organizationId,
      company_id: companyId,
      connector_code: sourceCode,
      operation: "assisted_intake",
      status: "completed",
      priority: 5,
      idempotency_key: `assisted:${sourceCode}:${hash}`,
      payload: { document_id: document.id, mode: "assisted" },
      result_summary: { intake_id: intake.id, status: analysis.officialStatus },
      attempt_count: 1,
      max_attempts: 1,
      completed_at: new Date().toISOString(),
      created_by: context.user.id,
    });
    inserted.push(["sentinel_connector_jobs", job.id]);

    await supabase.from("sentinel_integrations").update({
      status: "assisted",
      environment: "production",
      last_checked_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      metadata: { access_mode: "assisted", provider_adapter: sourceCode, portal_generation: "portal-agnostic", migration_ready: true, requires_human_confirmation: true, official_api: false },
      updated_at: new Date().toISOString(),
    }).eq("organization_id", context.organizationId).eq("code", sourceCode);

    if (company) {
      const currentWeight = { not_checked: 0, unavailable: 0, stale: 1, regular: 1, attention: 2, relevant: 3, critical: 4 };
      const nextStatus = analysis.officialStatus === "unknown" ? company.fiscal_status : analysis.officialStatus;
      const fiscalStatus = currentWeight[nextStatus] >= currentWeight[company.fiscal_status] || ["not_checked", "unavailable", "stale"].includes(company.fiscal_status) ? nextStatus : company.fiscal_status;
      await supabase.from("sentinel_companies").update({ fiscal_status: fiscalStatus, last_checked_at: new Date().toISOString(), updated_by: context.user.id, updated_at: new Date().toISOString(), version: Number(company.version || 0) + 1 }).eq("organization_id", context.organizationId).eq("id", company.id);
    }

    await audit(request, context, "assisted_fiscal_intake_processed", "assisted_intake", intake.id, null, { source_code: sourceCode, company_id: companyId, document_id: document.id, status: analysis.officialStatus, content_hash: hash });
    return { intake, analysis, document, occurrence, task };
  } catch (error) {
    for (const [table, id] of inserted.reverse()) await supabase.from(table).delete().eq("id", id);
    if (storagePath) await supabase.storage.from("sentinel-documents").remove([storagePath]);
    if (error?.code === 1009) throw Object.assign(new Error("O arquivo excede o limite de 4 MB."), { status: 413 });
    throw error;
  }
}
