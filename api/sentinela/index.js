import {
  clientIpHash,
  rejectDisallowedOrigin,
  rejectLargeRequest,
  rejectRateLimited,
  requestAuditMetadata,
  requireActiveModuleUser,
  setApiSecurityHeaders,
} from "../_security.js";
import { createClient } from "@supabase/supabase-js";
import { SENTINELA_UPLOAD_BYTES, uploadSentinelaDocument } from "../../server-assets/sentinela-upload.mjs";
import { ASSISTED_UPLOAD_BYTES, processAssistedIntake } from "../../server-assets/sentinela-assisted.mjs";
import {
  COMPLIANCE_UPLOAD_BYTES,
  complianceBootstrap,
  createComplianceResource,
  deleteComplianceCase,
  previewComplianceImport,
  updateComplianceCase,
} from "../../server-assets/sentinela-compliance.mjs";

export const config = { api: { bodyParser: false } };

const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const MAX_BODY_BYTES = 1_500_000;
const DEFAULT_ORGANIZATION_SLUG = "luce-sistemas";
const RESOURCE_TABLES = Object.freeze({
  companies: "sentinel_companies",
  occurrences: "sentinel_occurrences",
  tasks: "sentinel_tasks",
  documents: "sentinel_documents",
  notifications: "sentinel_notifications",
  integrations: "sentinel_integrations",
  comments: "sentinel_comments",
  findings: "sentinel_findings",
});
const INTEGRATION_SEED = [
  ["federal-cnd", "CND Federal / CPEND", "assisted"],
  ["federal-situation", "Situação Fiscal Federal", "assisted"],
  ["federal-mailbox", "Caixa Postal", "assisted"],
  ["dctfweb", "DCTFWeb", "development"],
];

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function storageAdmin() {
  const { url, serviceKey } = supabaseConfig();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function json(response, status, body) {
  setApiSecurityHeaders(response);
  return response.status(status).json(body);
}

async function parseJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Requisição muito grande."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Corpo da requisição inválido."), { status: 400 }); }
}

async function supabaseFetch(path, { method = "GET", body, prefer } = {}) {
  const { url, serviceKey } = supabaseConfig();
  const result = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await result.text();
  const data = text ? JSON.parse(text) : null;
  if (!result.ok) {
    const error = new Error(data?.message || data?.details || data?.hint || "Falha no banco de dados.");
    error.status = result.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function text(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function nullable(value, max = 5000) {
  return text(value, max) || null;
}

function uuid(value) {
  const normalized = text(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function dateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function enumValue(value, allowed, fallback) {
  const normalized = text(value, 60);
  return allowed.includes(normalized) ? normalized : fallback;
}

function isAdmin(user) {
  return user?.app_metadata?.role === "admin";
}

const ROLE_PERMISSIONS = Object.freeze({
  viewer: ["companies.read", "workflow.read", "documents.read", "integrations.read", "compliance.view"],
  analyst: ["companies.read", "companies.write", "companies.import", "workflow.read", "workflow.write", "documents.read", "documents.write", "integrations.read", "integrations.operate", "compliance.view", "compliance.create", "compliance.edit", "compliance.assign"],
  supervisor: ["companies.read", "companies.write", "companies.delete", "companies.import", "workflow.read", "workflow.write", "workflow.delete", "documents.read", "documents.write", "documents.delete", "integrations.read", "integrations.operate", "compliance.view", "compliance.create", "compliance.edit", "compliance.delete", "compliance.assign", "compliance.report", "compliance.export"],
  admin: ["companies.read", "companies.write", "companies.delete", "companies.import", "workflow.read", "workflow.write", "workflow.delete", "documents.read", "documents.write", "documents.delete", "integrations.read", "integrations.operate", "settings.manage", "compliance.view", "compliance.create", "compliance.edit", "compliance.delete", "compliance.assign", "compliance.report", "compliance.export", "compliance.admin"],
});

function permissionsFor(context) {
  if (Array.isArray(context?.permissions) && context.permissions.length) return context.permissions;
  const role = enumValue(context?.membership?.role, Object.keys(ROLE_PERMISSIONS), "viewer");
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}

function requirePermission(context, permission) {
  if (!permissionsFor(context).includes(permission)) {
    throw Object.assign(new Error("Seu perfil não possui permissão para realizar esta operação."), { status: 403 });
  }
}

async function ensureOrganization(user) {
  const memberships = await supabaseFetch(`/rest/v1/sentinel_memberships?select=id,organization_id,role,status&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`);
  if (memberships?.[0]) return memberships[0];

  let organizations = await supabaseFetch(`/rest/v1/sentinel_organizations?select=id,name,slug&slug=eq.${DEFAULT_ORGANIZATION_SLUG}&limit=1`);
  if (!organizations?.[0]) {
    try {
      organizations = await supabaseFetch("/rest/v1/sentinel_organizations?select=id,name,slug", {
        method: "POST",
        prefer: "return=representation",
        body: { name: "Luce Sistemas", slug: DEFAULT_ORGANIZATION_SLUG },
      });
    } catch (error) {
      if (error.status !== 409) throw error;
      organizations = await supabaseFetch(`/rest/v1/sentinel_organizations?select=id,name,slug&slug=eq.${DEFAULT_ORGANIZATION_SLUG}&limit=1`);
    }
  }
  const organization = organizations?.[0];
  if (!organization) throw new Error("Não foi possível preparar a organização do Sentinela.");

  const created = await supabaseFetch("/rest/v1/sentinel_memberships?on_conflict=organization_id,user_id&select=id,organization_id,role,status", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      organization_id: organization.id,
      user_id: user.id,
      role: isAdmin(user) ? "admin" : "analyst",
      status: "active",
      updated_at: new Date().toISOString(),
    },
  });
  return created?.[0];
}

async function seedIntegrations(organizationId) {
  const existing = await supabaseFetch(`/rest/v1/sentinel_integrations?select=code&organization_id=eq.${organizationId}`);
  const codes = new Set((existing || []).map((item) => item.code));
  const missing = INTEGRATION_SEED.filter(([code]) => !codes.has(code)).map(([code, name, status]) => {
    const assisted = status === "assisted";
    return {
      organization_id: organizationId,
      code,
      name,
      status,
      environment: assisted ? "production" : "configuration",
      metadata: assisted
        ? { access_mode: "assisted", provider_adapter: code, portal_generation: "portal-agnostic", migration_ready: true, requires_human_confirmation: true, official_api: false }
        : { readiness: "pending_credentials" },
    };
  });
  if (missing.length) {
    await supabaseFetch("/rest/v1/sentinel_integrations?on_conflict=organization_id,code", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: missing,
    });
  }
}

async function contextFor(request, response) {
  const { serviceKey } = supabaseConfig();
  if (!serviceKey) {
    json(response, 503, { error: "Supabase não configurado para o Sentinela." });
    return null;
  }
  const user = await requireActiveModuleUser(request, response, "sentinela");
  if (!user) return null;
  const membership = await ensureOrganization(user);
  if (!membership) {
    json(response, 403, { error: "Usuário sem organização ativa no Sentinela." });
    return null;
  }
  await seedIntegrations(membership.organization_id);
  let permissions = [];
  try {
    const rows = await supabaseFetch(`/rest/v1/sentinel_role_permissions?select=permission_code&role=eq.${encodeURIComponent(membership.role)}`);
    permissions = (rows || []).map((row) => row.permission_code).filter(Boolean);
  } catch (error) {
    if (error.status !== 404 && error.status !== 400) throw error;
  }
  return { user, membership, organizationId: membership.organization_id, permissions };
}

async function audit(request, context, eventType, entityType, entityId, beforeData, afterData) {
  try {
    await supabaseFetch("/rest/v1/sentinel_audit_events", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        organization_id: context.organizationId,
        actor_id: context.user.id,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId || null,
        before_data: beforeData || null,
        after_data: afterData || null,
        metadata: requestAuditMetadata(request, { ip_hash: await clientIpHash(request) }),
      },
    });
  } catch (error) {
    console.warn("Sentinela audit failed", error);
  }
}

async function list(table, organizationId, select = "*") {
  return supabaseFetch(`/rest/v1/${table}?select=${select}&organization_id=eq.${organizationId}&order=created_at.desc`);
}

async function bootstrap(context) {
  const [organizations, companies, occurrences, tasks, documents, notifications, integrations, comments, snapshots, findings, connectorJobs, rules, featureFlags, auditEvents, assistedIntakes, compliance] = await Promise.all([
    supabaseFetch(`/rest/v1/sentinel_organizations?select=id,name,slug,status&id=eq.${context.organizationId}&limit=1`),
    list("sentinel_companies", context.organizationId),
    list("sentinel_occurrences", context.organizationId),
    list("sentinel_tasks", context.organizationId),
    list("sentinel_documents", context.organizationId),
    supabaseFetch(`/rest/v1/sentinel_notifications?select=*&organization_id=eq.${context.organizationId}&or=(user_id.is.null,user_id.eq.${context.user.id})&order=created_at.desc`),
    list("sentinel_integrations", context.organizationId),
    list("sentinel_comments", context.organizationId),
    list("sentinel_fiscal_snapshots", context.organizationId),
    list("sentinel_findings", context.organizationId),
    list("sentinel_connector_jobs", context.organizationId),
    list("sentinel_rule_definitions", context.organizationId),
    supabaseFetch(`/rest/v1/sentinel_feature_flags?select=*&organization_id=eq.${context.organizationId}&order=updated_at.desc`),
    supabaseFetch(`/rest/v1/sentinel_audit_events?select=id,event_type,entity_type,entity_id,created_at,after_data&organization_id=eq.${context.organizationId}&order=created_at.desc&limit=200`),
    list("sentinel_assisted_intakes", context.organizationId),
    complianceBootstrap(context, supabaseFetch),
  ]);
  return {
    organization: organizations?.[0] || null,
    membership: context.membership,
    user: {
      id: context.user.id,
      name: context.user.user_metadata?.display_name || context.user.user_metadata?.name || context.user.email,
      email: context.user.email,
    },
    companies: (companies || []).filter((row) => !row.deleted_at),
    occurrences: (occurrences || []).filter((row) => !row.deleted_at),
    tasks: (tasks || []).filter((row) => !row.deleted_at),
    documents: (documents || []).filter((row) => !row.deleted_at),
    notifications: notifications || [],
    integrations: integrations || [],
    comments: (comments || []).filter((row) => !row.deleted_at),
    snapshots: snapshots || [],
    findings: findings || [],
    connectorJobs: connectorJobs || [],
    rules: rules || [],
    featureFlags: featureFlags || [],
    auditEvents: auditEvents || [],
    assistedIntakes: assistedIntakes || [],
    compliance,
    permissions: permissionsFor(context),
    generatedAt: new Date().toISOString(),
  };
}

function companyInput(input, context, existing = null) {
  const cnpj = text(input.cnpj, 20).replace(/\D/g, "");
  const legalName = text(input.legal_name || input.legalName, 180);
  if (cnpj.length !== 14) throw Object.assign(new Error("Informe um CNPJ válido com 14 dígitos."), { status: 400 });
  if (legalName.length < 2) throw Object.assign(new Error("Informe a razão social."), { status: 400 });
  return {
    organization_id: context.organizationId,
    cnpj,
    legal_name: legalName,
    trade_name: nullable(input.trade_name || input.tradeName, 180),
    tax_regime: nullable(input.tax_regime || input.taxRegime, 100),
    main_cnae: nullable(input.main_cnae || input.mainCnae, 30),
    city: nullable(input.city, 120),
    state: /^[A-Z]{2}$/.test(text(input.state, 2).toUpperCase()) ? text(input.state, 2).toUpperCase() : null,
    internal_owner: nullable(input.internal_owner || input.internalOwner, 160),
    email: nullable(input.email, 254),
    phone: nullable(input.phone, 30),
    municipal_registration: nullable(input.municipal_registration || input.municipalRegistration, 80),
    state_registration: nullable(input.state_registration || input.stateRegistration, 80),
    monitoring_enabled: input.monitoring_enabled === false || input.monitoring_enabled === "false" ? false : true,
    onboarding_status: enumValue(input.onboarding_status || input.onboardingStatus, ["draft", "ready", "review", "inactive"], existing?.onboarding_status || "ready"),
    fiscal_status: enumValue(input.fiscal_status || input.fiscalStatus, ["regular", "attention", "relevant", "critical", "not_checked", "unavailable", "stale"], existing?.fiscal_status || "not_checked"),
    notes: nullable(input.notes, 5000),
    created_by: existing?.created_by || context.user.id,
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
    version: Number(existing?.version || 0) + 1,
  };
}

function occurrenceInput(input, context, existing = null) {
  const title = text(input.title, 180);
  if (title.length < 3) throw Object.assign(new Error("Informe o título da ocorrência."), { status: 400 });
  return {
    organization_id: context.organizationId,
    company_id: uuid(input.company_id || input.companyId) || null,
    title,
    description: nullable(input.description, 5000),
    category: text(input.category, 80) || "fiscal",
    source: text(input.source, 100) || "manual",
    severity: enumValue(input.severity, ["regular", "attention", "relevant", "critical", "unknown"], "attention"),
    status: enumValue(input.status, ["new", "analysis", "waiting_client", "waiting_agency", "execution", "resolved", "archived"], existing?.status || "new"),
    department: nullable(input.department, 120),
    assigned_name: nullable(input.assigned_name || input.assignedName, 160),
    due_at: dateTime(input.due_at || input.dueAt),
    resolved_at: input.status === "resolved" ? existing?.resolved_at || new Date().toISOString() : null,
    created_by: existing?.created_by || context.user.id,
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
    version: Number(existing?.version || 0) + 1,
  };
}

function taskInput(input, context, existing = null) {
  const title = text(input.title, 180);
  if (title.length < 3) throw Object.assign(new Error("Informe o título da tarefa."), { status: 400 });
  const status = enumValue(input.status, ["open", "in_progress", "waiting", "done", "cancelled"], existing?.status || "open");
  return {
    organization_id: context.organizationId,
    company_id: uuid(input.company_id || input.companyId) || null,
    occurrence_id: uuid(input.occurrence_id || input.occurrenceId) || null,
    title,
    priority: enumValue(input.priority, ["low", "normal", "high", "critical"], "normal"),
    status,
    assigned_name: nullable(input.assigned_name || input.assignedName, 160),
    due_at: dateTime(input.due_at || input.dueAt),
    completed_at: status === "done" ? existing?.completed_at || new Date().toISOString() : null,
    created_by: existing?.created_by || context.user.id,
    updated_by: context.user.id,
    updated_at: new Date().toISOString(),
    version: Number(existing?.version || 0) + 1,
  };
}

function commentInput(input, context) {
  const body = text(input.body, 5000);
  const occurrenceId = uuid(input.occurrence_id || input.occurrenceId) || null;
  const taskId = uuid(input.task_id || input.taskId) || null;
  if (!body) throw Object.assign(new Error("Escreva um comentário."), { status: 400 });
  if ((occurrenceId ? 1 : 0) + (taskId ? 1 : 0) !== 1) throw Object.assign(new Error("Vincule o comentário a uma ocorrência ou tarefa."), { status: 400 });
  return {
    organization_id: context.organizationId,
    occurrence_id: occurrenceId,
    task_id: taskId,
    body,
    created_by: context.user.id,
    created_by_name: context.user.user_metadata?.display_name || context.user.user_metadata?.name || context.user.email,
  };
}

function documentInput(input, context) {
  const name = text(input.name, 200);
  if (!name) throw Object.assign(new Error("Informe o nome do documento."), { status: 400 });
  return {
    organization_id: context.organizationId,
    company_id: uuid(input.company_id || input.companyId) || null,
    occurrence_id: uuid(input.occurrence_id || input.occurrenceId) || null,
    category: text(input.category, 80) || "evidence",
    name,
    source: text(input.source, 100) || "manual",
    issued_at: /^\d{4}-\d{2}-\d{2}$/.test(text(input.issued_at || input.issuedAt, 10)) ? text(input.issued_at || input.issuedAt, 10) : null,
    expires_at: /^\d{4}-\d{2}-\d{2}$/.test(text(input.expires_at || input.expiresAt, 10)) ? text(input.expires_at || input.expiresAt, 10) : null,
    created_by: context.user.id,
  };
}

async function rowById(table, id, organizationId) {
  const rows = await supabaseFetch(`/rest/v1/${table}?select=*&id=eq.${id}&organization_id=eq.${organizationId}&limit=1`);
  return rows?.[0] || null;
}

async function createResource(request, context, resource, input) {
  const table = RESOURCE_TABLES[resource];
  if (!table || !["companies", "occurrences", "tasks", "documents", "comments"].includes(resource)) {
    throw Object.assign(new Error("Recurso inválido."), { status: 400 });
  }
  requirePermission(context, resource === "companies" ? "companies.write" : resource === "documents" ? "documents.write" : "workflow.write");
  const builders = { companies: companyInput, occurrences: occurrenceInput, tasks: taskInput, documents: documentInput, comments: commentInput };
  const payload = builders[resource](input, context);
  const rows = await supabaseFetch(`/rest/v1/${table}?select=*`, {
    method: "POST",
    prefer: "return=representation",
    body: payload,
  });
  const saved = rows?.[0];
  await audit(request, context, `${resource}_created`, resource, saved?.id, null, saved);
  return saved;
}

async function updateResource(request, context, resource, id, input) {
  const table = RESOURCE_TABLES[resource];
  if (!table || !["companies", "occurrences", "tasks", "notifications"].includes(resource)) {
    throw Object.assign(new Error("Recurso inválido."), { status: 400 });
  }
  requirePermission(context, resource === "companies" ? "companies.write" : resource === "notifications" ? "workflow.write" : "workflow.write");
  const existing = await rowById(table, id, context.organizationId);
  if (!existing) throw Object.assign(new Error("Registro não encontrado."), { status: 404 });
  let payload;
  if (resource === "companies") payload = companyInput({ ...existing, ...input }, context, existing);
  if (resource === "occurrences") payload = occurrenceInput({ ...existing, ...input }, context, existing);
  if (resource === "tasks") payload = taskInput({ ...existing, ...input }, context, existing);
  if (resource === "notifications") {
    payload = {
      read_at: input.read === false ? null : new Date().toISOString(),
      resolved_at: input.resolved ? new Date().toISOString() : existing.resolved_at,
    };
  }
  const versionFilter = ["companies", "occurrences", "tasks"].includes(resource) && Number.isInteger(Number(input.version))
    ? `&version=eq.${Number(input.version)}` : "";
  const rows = await supabaseFetch(`/rest/v1/${table}?id=eq.${id}&organization_id=eq.${context.organizationId}${versionFilter}&select=*`, {
    method: "PATCH",
    prefer: "return=representation",
    body: payload,
  });
  const saved = rows?.[0];
  if (!saved) throw Object.assign(new Error("Este registro foi alterado por outro usuário. Atualize a tela antes de tentar novamente."), { status: 409 });
  await audit(request, context, `${resource}_updated`, resource, id, existing, saved);
  return saved;
}

async function deleteResource(request, context, resource, id) {
  const table = RESOURCE_TABLES[resource];
  if (!table || !["companies", "occurrences", "tasks", "documents"].includes(resource)) {
    throw Object.assign(new Error("Recurso inválido."), { status: 400 });
  }
  requirePermission(context, resource === "companies" ? "companies.delete" : resource === "documents" ? "documents.delete" : "workflow.delete");
  const existing = await rowById(table, id, context.organizationId);
  if (!existing) throw Object.assign(new Error("Registro não encontrado."), { status: 404 });
  const deletedAt = new Date().toISOString();
  await supabaseFetch(`/rest/v1/${table}?id=eq.${id}&organization_id=eq.${context.organizationId}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: resource === "documents" ? { deleted_at: deletedAt } : { deleted_at: deletedAt, updated_at: deletedAt },
  });
  await audit(request, context, `${resource}_deleted`, resource, id, existing, null);
  return { ok: true };
}

async function importCompanies(request, context, input) {
  requirePermission(context, "companies.import");
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, 500) : [];
  if (!rows.length) throw Object.assign(new Error("A planilha não possui registros para importar."), { status: 400 });
  const filename = text(input.filename, 220) || "importacao-clientes";
  const batches = await supabaseFetch("/rest/v1/sentinel_import_batches?select=*", {
    method: "POST",
    prefer: "return=representation",
    body: { organization_id: context.organizationId, filename, total_rows: rows.length, created_by: context.user.id },
  });
  const batch = batches?.[0];
  const results = [];
  let imported = 0;
  let rejected = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const source = rows[index] && typeof rows[index] === "object" ? rows[index] : {};
    try {
      const payload = { ...companyInput(source, context), deleted_at: null };
      const savedRows = await supabaseFetch("/rest/v1/sentinel_companies?on_conflict=organization_id,cnpj&select=*", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: payload,
      });
      const saved = savedRows?.[0];
      imported += 1;
      results.push({ organization_id: context.organizationId, batch_id: batch.id, row_number: index + 2, cnpj: payload.cnpj, legal_name: payload.legal_name, status: "imported", company_id: saved?.id || null });
    } catch (error) {
      rejected += 1;
      results.push({ organization_id: context.organizationId, batch_id: batch.id, row_number: index + 2, cnpj: text(source.cnpj, 20).replace(/\D/g, "") || null, legal_name: nullable(source.legal_name || source.razao_social, 180), status: "rejected", error_message: text(error.message, 500) });
    }
  }
  await supabaseFetch("/rest/v1/sentinel_import_rows", { method: "POST", prefer: "return=minimal", body: results });
  const completedAt = new Date().toISOString();
  await supabaseFetch(`/rest/v1/sentinel_import_batches?id=eq.${batch.id}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { status: rejected ? "completed_with_errors" : "completed", imported_rows: imported, rejected_rows: rejected, completed_at: completedAt },
  });
  await audit(request, context, "companies_imported", "import_batch", batch.id, null, { filename, total: rows.length, imported, rejected });
  return { batchId: batch.id, total: rows.length, imported, rejected, errors: results.filter((item) => item.status === "rejected").map((item) => ({ row: item.row_number, cnpj: item.cnpj, message: item.error_message })) };
}

async function documentDownload(context, input) {
  requirePermission(context, "documents.read");
  const id = uuid(input.id);
  if (!id) throw Object.assign(new Error("Documento inválido."), { status: 400 });
  const document = await rowById("sentinel_documents", id, context.organizationId);
  if (!document || document.deleted_at || !document.storage_path) throw Object.assign(new Error("Arquivo não encontrado."), { status: 404 });
  const { data, error } = await storageAdmin().storage.from("sentinel-documents").createSignedUrl(document.storage_path, 120, { download: document.name });
  if (error || !data?.signedUrl) throw Object.assign(new Error("Não foi possível preparar o download."), { status: 502 });
  return { url: data.signedUrl, expiresIn: 120 };
}

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  const isMultipart = String(request.headers["content-type"] || "").toLowerCase().startsWith("multipart/form-data");
  if (rejectLargeRequest(request, response, isMultipart ? Math.max(SENTINELA_UPLOAD_BYTES, COMPLIANCE_UPLOAD_BYTES, ASSISTED_UPLOAD_BYTES) + 300_000 : MAX_BODY_BYTES)) return;
  if (await rejectRateLimited(request, response, { action: "sentinela_api", limit: 240, windowSeconds: 60 })) return;

  try {
    const context = await contextFor(request, response);
    if (!context) return;

    if (isMultipart) {
      if (request.method !== "POST") return json(response, 405, { error: "Método não permitido." });
      if (String(request.headers["x-sentinela-operation"] || "") === "compliance-preview") {
        requirePermission(context, "compliance.create");
        const preview = await previewComplianceImport(request, context, { supabaseFetch, storage: storageAdmin(), audit });
        return json(response, 200, { data: preview });
      }
      if (["fiscal-preview", "fiscal-confirm"].includes(String(request.headers["x-sentinela-operation"] || ""))) {
        requirePermission(context, "integrations.operate");
        const data = await processAssistedIntake(request, context, storageAdmin(), audit, {
          preview: String(request.headers["x-sentinela-operation"] || "") === "fiscal-preview",
        });
        return json(response, data?.intake ? 201 : 200, { data });
      }
      requirePermission(context, "documents.write");
      const document = await uploadSentinelaDocument(request, context, storageAdmin(), audit);
      return json(response, 201, { data: document });
    }

    if (request.method === "GET") return json(response, 200, await bootstrap(context));

    request.body = await parseJsonBody(request);

    const resource = text(request.body?.resource, 40);
    const input = request.body?.data && typeof request.body.data === "object" ? request.body.data : {};
    if (request.method === "POST") {
      if (resource === "company_import") return json(response, 200, { data: await importCompanies(request, context, input) });
      if (resource === "document_download") return json(response, 200, { data: await documentDownload(context, input) });
      if (resource.startsWith("compliance_")) return json(response, 201, { data: await createComplianceResource(request, context, resource, input, { supabaseFetch, audit, requirePermission, permissionsFor }) });
      const saved = await createResource(request, context, resource, input);
      return json(response, 201, { data: saved });
    }
    if (request.method === "PATCH") {
      const id = uuid(request.body?.id);
      if (!id) return json(response, 400, { error: "Identificador inválido." });
      if (resource === "compliance_case") return json(response, 200, { data: await updateComplianceCase(request, context, id, input, { supabaseFetch, audit, requirePermission, permissionsFor }) });
      const saved = await updateResource(request, context, resource, id, input);
      return json(response, 200, { data: saved });
    }
    if (request.method === "DELETE") {
      const id = uuid(request.body?.id);
      if (!id) return json(response, 400, { error: "Identificador inválido." });
      if (resource === "compliance_case") return json(response, 200, await deleteComplianceCase(request, context, id, { supabaseFetch, audit, requirePermission }));
      return json(response, 200, await deleteResource(request, context, resource, id));
    }
    return json(response, 405, { error: "Método não permitido." });
  } catch (error) {
    console.error("Sentinela API failed", error);
    const status = Number(error.status || 500);
    const message = status >= 500 ? "Não foi possível processar a operação do Sentinela." : error.message;
    return json(response, status, { error: message });
  }
}

export { companyInput, occurrenceInput, taskInput, permissionsFor, requirePermission };
