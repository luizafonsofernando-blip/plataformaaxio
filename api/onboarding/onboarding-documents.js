import { ACCOUNT_SUSPENDED_MESSAGE, clientIpHash, isSuspendedUser, rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requestAuditMetadata, setApiSecurityHeaders } from "../_security.js";

const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const MAX_BODY_BYTES = 1_000_000;

function json(response, status, body) {
  setApiSecurityHeaders(response);
  response.status(status);
  return response.json(body);
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    publicKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function cleanText(value, max = 5000) {
  return String(value || "").slice(0, max);
}

function cleanNullable(value, max = 5000) {
  const text = cleanText(value, max).trim();
  return text || null;
}

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function supabaseFetch(path, { method = "GET", key, bearer, body, prefer } = {}) {
  const { url } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error_description || data.error || "Falha no Supabase.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function callerFromRequest(request, publicKey) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return null;
  return supabaseFetch("/auth/v1/user", {
    key: publicKey,
    bearer: authorization.replace(/^Bearer\s+/i, ""),
  });
}

function isAdmin(user) {
  return user?.app_metadata?.role === "admin" && user?.app_metadata.status !== "pending";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !/^n[aã]o informado$/i.test(text)) return text;
  }
  return "";
}

function parseMoney(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function normalizeState(value) {
  const state = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

function normalizeTaxRegime(value) {
  const text = firstText(value);
  if (/simples/i.test(text)) return "Simples Nacional";
  if (/presumido/i.test(text)) return "Lucro Presumido";
  if (/real/i.test(text)) return "Lucro Real";
  if (/\bmei\b/i.test(text)) return "MEI";
  return text || null;
}

function dateOrToday(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function cleanUuid(value) {
  const id = cleanText(value, 80).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : "";
}

function numberValue(value) {
  const parsed = Number(String(value || "0").replace(/[^\d,.-]/g, "").replace(/\.(=\d{3}(?:\D|$))/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  const text = cleanText(value, 20).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dateTimeValue(value) {
  const text = cleanText(value, 40).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ownerFilterFor(caller, column = "owner_id") {
  return isAdmin(caller) ? "" : `&${column}=eq.${encodeURIComponent(caller.id)}`;
}

function searchParam(request, key, max = 120) {
  return cleanText(request.query?.[key], max).trim();
}

function assertRelationshipAccess(row, caller) {
  if (row.owner_id && row.owner_id !== caller.id && !isAdmin(caller)) {
    const error = new Error("Você não tem permissão para alterar este registro.");
    error.status = 403;
    throw error;
  }
}

async function auditRelationship({ serviceRoleKey, caller, ownerId, entity, entityId, eventType, beforeData, afterData, metadata = {} }) {
  return supabaseFetch("/rest/v1/cerne_crm_history", {
    method: "POST",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=minimal",
    body: {
      owner_id: ownerId || caller.id,
      actor_id: caller.id,
      entity,
      entity_id: entityId,
      event_type: eventType,
      before_data: beforeData || null,
      after_data: afterData || null,
      metadata,
    },
  }).catch(() => null);
}

async function selectById(table, id, serviceRoleKey) {
  if (!id) return null;
  const rows = await supabaseFetch(`/rest/v1/${table}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function relationshipContactInput(input, caller, existing) {
  const type = cleanText(input.type, 8) === "pf" ? "pf" : "pj";
  const document = onlyDigits(input.document);
  const name = cleanText(input.name || input.company || input.razao, 180).trim();
  return {
    owner_id: existing?.owner_id || caller.id,
    created_by: existing?.created_by || caller.id,
    updated_by: caller.id,
    type,
    name,
    trade_name: cleanNullable(input.trade_name || input.tradeName, 160),
    document: document || null,
    phone: onlyDigits(input.phone) || null,
    whatsapp: onlyDigits(input.whatsapp) || null,
    email: cleanNullable(input.email, 160),
    city: cleanNullable(input.city, 120),
    state: normalizeState(input.state),
    address: cleanNullable(input.address, 240),
    main_contact: cleanNullable(input.main_contact || input.mainContact, 160),
    role_title: cleanNullable(input.role_title || input.roleTitle, 120),
    origin: cleanNullable(input.origin, 120),
    services: Array.isArray(input.services) ? input.services.map((item) => cleanText(item, 100).trim()).filter(Boolean).slice(0, 20) : [],
    internal_owner: cleanNullable(input.internal_owner || input.internalOwner, 160),
    notes: cleanNullable(input.notes, 4000),
    status: ["prospect", "opportunity", "active", "inactive", "lost"].includes(input.status) ? input.status : "prospect",
    updated_at: new Date().toISOString(),
  };
}

function relationshipOpportunityInput(input, caller, existing) {
  return {
    owner_id: existing?.owner_id || caller.id,
    created_by: existing?.created_by || caller.id,
    updated_by: caller.id,
    contact_id: cleanUuid(input.contact_id || input.contactId),
    stage_id: cleanUuid(input.stage_id || input.stageId),
    title: cleanText(input.title, 180).trim(),
    service_interest: cleanNullable(input.service_interest || input.serviceInterest, 140),
    responsible: cleanNullable(input.responsible, 160),
    estimated_value: Math.max(numberValue(input.estimated_value || input.estimatedValue), 0),
    probability: Math.min(100, Math.max(0, Number.parseInt(input.probability || "20", 10) || 0)),
    expected_close: dateValue(input.expected_close || input.expectedClose),
    priority: ["baixa", "media", "alta", "urgente"].includes(input.priority) ? input.priority : "media",
    origin: cleanNullable(input.origin, 120),
    description: cleanNullable(input.description, 5000),
    need_reason: cleanNullable(input.need_reason || input.needReason, 2000),
    competitors: cleanNullable(input.competitors, 1000),
    next_step: cleanNullable(input.next_step || input.nextStep, 1000),
    next_return_at: dateTimeValue(input.next_return_at || input.nextReturnAt),
    status: ["open", "won", "lost"].includes(input.status) ? input.status : "open",
    final_value: input.final_value || input.finalValue ? Math.max(numberValue(input.final_value || input.finalValue), 0) : null,
    closed_at: dateValue(input.closed_at || input.closedAt),
    contracted_services: cleanNullable(input.contracted_services || input.contractedServices, 2000),
    closed_by: cleanNullable(input.closed_by || input.closedBy, 160),
    loss_reason: cleanNullable(input.loss_reason || input.lossReason, 160),
    loss_notes: cleanNullable(input.loss_notes || input.lossNotes, 2000),
    updated_at: new Date().toISOString(),
  };
}

function relationshipActivityInput(input, caller, existing) {
  return {
    owner_id: existing?.owner_id || caller.id,
    created_by: existing?.created_by || caller.id,
    contact_id: cleanUuid(input.contact_id || input.contactId) || null,
    opportunity_id: cleanUuid(input.opportunity_id || input.opportunityId) || null,
    type: cleanText(input.type, 80).trim() || "Anotacao interna",
    activity_at: dateTimeValue(input.activity_at || input.activityAt) || new Date().toISOString(),
    responsible: cleanNullable(input.responsible, 160),
    description: cleanText(input.description, 4000).trim(),
    result: cleanNullable(input.result, 1000),
    next_action: cleanNullable(input.next_action || input.nextAction, 1000),
    next_contact_at: dateTimeValue(input.next_contact_at || input.nextContactAt),
    attachments: Array.isArray(input.attachments) ? input.attachments.slice(0, 10) : [],
    inactive: Boolean(input.inactive),
  };
}

function relationshipTaskInput(input, caller, existing) {
  return {
    owner_id: existing?.owner_id || caller.id,
    created_by: existing?.created_by || caller.id,
    contact_id: cleanUuid(input.contact_id || input.contactId) || null,
    opportunity_id: cleanUuid(input.opportunity_id || input.opportunityId) || null,
    title: cleanText(input.title, 180).trim(),
    responsible: cleanNullable(input.responsible, 160),
    due_at: dateTimeValue(input.due_at || input.dueAt) || new Date().toISOString(),
    priority: ["baixa", "media", "alta", "urgente"].includes(input.priority) ? input.priority : "media",
    status: ["pendente", "em_andamento", "concluida", "vencida", "cancelada"].includes(input.status) ? input.status : "pendente",
    notes: cleanNullable(input.notes, 2000),
    updated_at: new Date().toISOString(),
  };
}

function relationshipProposalInput(input, caller, existing) {
  return {
    owner_id: existing?.owner_id || caller.id,
    created_by: existing?.created_by || caller.id,
    contact_id: cleanUuid(input.contact_id || input.contactId),
    opportunity_id: cleanUuid(input.opportunity_id || input.opportunityId),
    number: cleanText(input.number, 80).trim(),
    services: cleanNullable(input.services, 3000),
    setup_value: Math.max(numberValue(input.setup_value || input.setupValue), 0),
    recurring_value: Math.max(numberValue(input.recurring_value || input.recurringValue), 0),
    discount: Math.max(numberValue(input.discount), 0),
    valid_until: dateValue(input.valid_until || input.validUntil),
    payment_terms: cleanNullable(input.payment_terms || input.paymentTerms, 2000),
    notes: cleanNullable(input.notes, 2000),
    responsible: cleanNullable(input.responsible, 160),
    status: ["rascunho", "em_elaboracao", "enviada", "visualizada", "em_negociacao", "aprovada", "recusada", "vencida", "cancelada"].includes(input.status) ? input.status : "rascunho",
    updated_at: new Date().toISOString(),
  };
}

function relationshipContractInput(input, caller, existing) {
  return {
    owner_id: existing?.owner_id || caller.id,
    created_by: existing?.created_by || caller.id,
    contact_id: cleanUuid(input.contact_id || input.contactId),
    opportunity_id: cleanUuid(input.opportunity_id || input.opportunityId) || null,
    proposal_id: cleanUuid(input.proposal_id || input.proposalId) || null,
    service_contracted: cleanNullable(input.service_contracted || input.serviceContracted, 2000),
    initial_value: Math.max(numberValue(input.initial_value || input.initialValue), 0),
    monthly_value: Math.max(numberValue(input.monthly_value || input.monthlyValue), 0),
    sent_at: dateValue(input.sent_at || input.sentAt),
    signed_at: dateValue(input.signed_at || input.signedAt),
    term: cleanNullable(input.term, 500),
    responsible: cleanNullable(input.responsible, 160),
    document_link: cleanNullable(input.document_link || input.documentLink, 1000),
    notes: cleanNullable(input.notes, 2000),
    status: ["em_elaboracao", "enviado", "aguardando_assinatura", "assinado", "recusado", "cancelado"].includes(input.status) ? input.status : "em_elaboracao",
    updated_at: new Date().toISOString(),
  };
}

async function listRelationshipData(request, caller, serviceRoleKey) {
  const q = searchParam(request, "q", 160).toLowerCase();
  const ownerFilter = ownerFilterFor(caller);
  await supabaseFetch(`/rest/v1/cerne_crm_tasks?status=eq.pendente&due_at=lt.${encodeURIComponent(new Date().toISOString())}${ownerFilter}`, {
    method: "PATCH",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=minimal",
    body: { status: "vencida", updated_at: new Date().toISOString() },
  }).catch(() => null);
  await supabaseFetch(`/rest/v1/cerne_crm_proposals?status=in.(rascunho,em_elaboracao,enviada,visualizada,em_negociacao)&valid_until=lt.${dateOrToday()}${ownerFilter}`, {
    method: "PATCH",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=minimal",
    body: { status: "vencida", updated_at: new Date().toISOString() },
  }).catch(() => null);
  const [stages, contacts, opportunities, activities, tasks, proposals, contracts, origins, services, lossReasons, history] = await Promise.all([
    supabaseFetch("/rest/v1/cerne_crm_stages?select=*&order=position.asc", { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_contacts?select=*&order=updated_at.desc&limit=500${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_opportunities?select=*&order=updated_at.desc&limit=500${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_activities?select=*&order=activity_at.desc&limit=500${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_tasks?select=*&order=due_at.asc&limit=500${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_proposals?select=*&order=updated_at.desc&limit=300${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_contracts?select=*&order=updated_at.desc&limit=300${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch("/rest/v1/cerne_crm_origins?select=*&active=eq.true&order=name.asc", { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch("/rest/v1/cerne_crm_services?select=*&active=eq.true&order=name.asc", { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch("/rest/v1/cerne_crm_loss_reasons?select=*&active=eq.true&order=name.asc", { key: serviceRoleKey, bearer: serviceRoleKey }),
    supabaseFetch(`/rest/v1/cerne_crm_history?select=*&order=created_at.desc&limit=500${ownerFilter}`, { key: serviceRoleKey, bearer: serviceRoleKey }),
  ]);
  const data = { stages, contacts, opportunities, activities, tasks, proposals, contracts, origins, services, lossReasons, history, user: { id: caller.id, role: caller.app_metadata.role || "user" } };
  if (!q) return data;
  const hit = (row) => JSON.stringify(row || {}).toLowerCase().includes(q);
  return {
    ...data,
    contacts: contacts.filter(hit),
    opportunities: opportunities.filter(hit),
    activities: activities.filter(hit),
    tasks: tasks.filter(hit),
    proposals: proposals.filter(hit),
    contracts: contracts.filter(hit),
  };
}

async function saveRelationshipRecord(input, caller, serviceRoleKey) {
  const resource = cleanText(input.resource, 40);
  const id = cleanUuid(input.id);
  const tableByResource = {
    contact: "cerne_crm_contacts",
    opportunity: "cerne_crm_opportunities",
    activity: "cerne_crm_activities",
    task: "cerne_crm_tasks",
    proposal: "cerne_crm_proposals",
    contract: "cerne_crm_contracts",
  };
  const builderByResource = {
    contact: relationshipContactInput,
    opportunity: relationshipOpportunityInput,
    activity: relationshipActivityInput,
    task: relationshipTaskInput,
    proposal: relationshipProposalInput,
    contract: relationshipContractInput,
  };
  const table = tableByResource[resource];
  const build = builderByResource[resource];
  if (!table || !build) {
    const error = new Error("Recurso invalido.");
    error.status = 400;
    throw error;
  }
  const existing = id ? await selectById(table, id, serviceRoleKey) : null;
  assertRelationshipAccess(existing, caller);
  const row = build(input, caller, existing);
  if (resource === "contact" && row.name.length < 2) {
    const error = new Error("Informe o nome ou razao social.");
    error.status = 400;
    throw error;
  }
  if (resource === "opportunity") {
    if (!row.contact_id || !row.stage_id || row.title.length < 2) {
      const error = new Error("Informe contato, etapa e titulo da oportunidade.");
      error.status = 400;
      throw error;
    }
    if (row.status === "won" && (!row.final_value || !row.closed_at)) {
      const error = new Error("Para marcar como ganha, informe valor final e data do fechamento.");
      error.status = 400;
      throw error;
    }
    if (row.status === "lost" && !row.loss_reason) {
      const error = new Error("Para marcar como perdida, informe o motivo da perda.");
      error.status = 400;
      throw error;
    }
    if (existing.stage_id !== row.stage_id) row.stage_changed_at = new Date().toISOString();
  }
  if (resource === "activity" && !row.description) {
    const error = new Error("Descreva a atividade.");
    error.status = 400;
    throw error;
  }
  if (resource === "task" && !row.title) {
    const error = new Error("Informe a tarefa.");
    error.status = 400;
    throw error;
  }
  if ((resource === "proposal" || resource === "contract") && !row.contact_id) {
    const error = new Error("Selecione o contato ou cliente.");
    error.status = 400;
    throw error;
  }
  if (resource === "proposal" && (!row.opportunity_id || !row.number)) {
    const error = new Error("Informe oportunidade e numero da proposta.");
    error.status = 400;
    throw error;
  }
  const path = id ? `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}` : `/rest/v1/${table}`;
  const saved = await supabaseFetch(path, {
    method: id ? "PATCH" : "POST",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=representation",
    body: row,
  });
  const savedRow = Array.isArray(saved) ? saved[0] : null;
  await auditRelationship({
    serviceRoleKey,
    caller,
    ownerId: savedRow.owner_id || row.owner_id,
    entity: resource,
    entityId: savedRow.id || id,
    eventType: id ? "updated" : "created",
    beforeData: existing,
    afterData: savedRow,
  });
  if (resource === "activity" && row.opportunity_id) {
    await supabaseFetch(`/rest/v1/cerne_crm_opportunities?id=eq.${encodeURIComponent(row.opportunity_id)}`, {
      method: "PATCH",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      prefer: "return=minimal",
      body: { last_interaction_at: row.activity_at, updated_at: new Date().toISOString() },
    }).catch(() => null);
  }
  return savedRow;
}

async function moveRelationshipOpportunity(input, caller, serviceRoleKey) {
  const id = cleanUuid(input.id);
  const stageId = cleanUuid(input.stage_id || input.stageId);
  if (!id || !stageId) {
    const error = new Error("Movimentacao invalida.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById("cerne_crm_opportunities", id, serviceRoleKey);
  if (!existing) {
    const error = new Error("Oportunidade não encontrada.");
    error.status = 404;
    throw error;
  }
  assertRelationshipAccess(existing, caller);
  const saved = await supabaseFetch(`/rest/v1/cerne_crm_opportunities?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=representation",
    body: { stage_id: stageId, stage_changed_at: new Date().toISOString(), updated_by: caller.id, updated_at: new Date().toISOString() },
  });
  const savedRow = Array.isArray(saved) ? saved[0] : null;
  await auditRelationship({
    serviceRoleKey,
    caller,
    ownerId: existing.owner_id,
    entity: "opportunity",
    entityId: id,
    eventType: "stage_changed",
    beforeData: { stage_id: existing.stage_id },
    afterData: { stage_id: stageId },
  });
  return savedRow;
}

function fieldsFromQueue(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const formState = payload.form_state && typeof payload.form_state === "object" ? payload.form_state : {};
  return formState.fields && typeof formState.fields === "object" ? formState.fields : {};
}

function formStateFromQueue(row, sourceDoc = null) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  if (payload.form_state && typeof payload.form_state === "object") return payload.form_state;
  if (sourceDoc?.form_state && typeof sourceDoc.form_state === "object") return sourceDoc.form_state;
  return {};
}

function isOpeningBriefingQueue(row, sourceDoc = null) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const formState = formStateFromQueue(row, sourceDoc);
  const fields = formState.fields && typeof formState.fields === "object" ? formState.fields : {};
  const marker = firstText(
    fields.tipoBriefing,
    fields.tipoBriefingSecao,
    payload.procedimento,
    sourceDoc?.procedimento,
    sourceDoc?.title,
    payload.serial,
  ).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return marker.includes("BRIEFING ABERTURA");
}

function isOpeningBriefingQueueCompleted(row, sourceDoc = null) {
  const formState = formStateFromQueue(row, sourceDoc);
  return Boolean(formState?.meta?.openingBriefingCompleted);
}

function canExposeCerneQueueItem(row, sourceDoc = null) {
  if (!sourceDoc || sourceDoc.status !== "final" || sourceDoc.kind !== "briefing") return false;
  if (isOpeningBriefingQueue(row, sourceDoc) && !isOpeningBriefingQueueCompleted(row, sourceDoc)) return false;
  return true;
}

function clientFromQueue(row, fallback = {}) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const fields = fieldsFromQueue(row);
  const company = firstText(
    fallback.company,
    payload.empresa,
    fields.razao,
    fields.aberturaRazao,
    fields.fantasia,
    fields.aberturaFantasia,
    fields.nomeFantasia,
  );
  const cnpj = onlyDigits(firstText(fallback.cnpj, payload.documento, fields.cnpj, fields.aberturaCnpj));
  return {
    company,
    cnpj,
    city: firstText(fallback.city, fields.municipio, fields.cidade, fields.aberturaCidade) || null,
    state: normalizeState(firstText(fallback.state, fields.estado, fields.uf, fields.aberturaEstado)),
    tax_regime: normalizeTaxRegime(firstText(fallback.tax_regime, fields.tributacao, fields.regime, fields.aberturaRegime)),
    segment: firstText(fallback.segment, fields.segmento, fields.aberturaAtividadePrincipal, fields.atividadePrincipal) || null,
    unit: firstText(fallback.unit, fields.unidade, fields.tipoUnidade) || null,
    consultant: firstText(fallback.consultant, fields.consultor, fields.responsavel, fields.emitente) || null,
    channel: firstText(fallback.channel, "Onboarding"),
    monthly_fee: parseMoney(firstText(
      fallback.monthly_fee,
      fields.financeiroHonorario,
      fields.honorario,
      fields.aberturaValorHonorario,
      fields.honorarioProvisorio,
      fields.aberturaHonorarioProvisorio,
    )),
    employees: Number.parseInt(firstText(fallback.employees, fields.funcionarios, fields.quantidadeFuncionarios), 10) || 0,
    entry_date: dateOrToday(firstText(fallback.entry_date, fields.dataContratoDistrato, fields.inicio)),
  };
}

function exitFromQueue(row, client, existingClient = {}) {
  const fields = fieldsFromQueue(row);
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const lostMonthlyFee = parseMoney(firstText(
    existingClient.monthly_fee,
    client.monthly_fee,
    fields.financeiroHonorario,
    fields.honorario,
    fields.aberturaValorHonorario,
    fields.honorarioProvisorio,
    fields.aberturaHonorarioProvisorio,
  ));
  return {
    company: firstText(existingClient.company, client.company, payload.empresa),
    cnpj: onlyDigits(firstText(existingClient.cnpj, client.cnpj, payload.documento)),
    lost_monthly_fee: lostMonthlyFee,
    exit_date: dateOrToday(firstText(
      fields.dataSaida,
      fields.dataBaixa,
      fields.dataEncerramento,
      fields.dataDistrato,
      fields.dataContratoDistrato,
    )),
    exit_reason: firstText(
      fields.motivoSaida,
      fields.motivoBaixa,
      fields.motivoEncerramento,
      fields.observacoesSaida,
      fields.observacoes,
      fields.financeiroObservacoes,
      fields.ultimaCompetencia && `Ultima competencia: ${fields.ultimaCompetencia}`,
      row.event_type === "exit" ? "Sa?da registrada pelo Onboarding Cont?bil." : "",
    ) || null,
    payload: {
      source: "onboarding",
      event_type: row.event_type,
      procedimento: payload.procedimento || null,
      briefing_type: payload.briefing_type || null,
      extracted_client: client,
      form_state: payload.form_state || null,
    },
  };
}

async function finalDocumentMap(queueRows, serviceRoleKey) {
  const ids = queueRows.map((row) => row.source_document_id).filter(Boolean);
  if (!ids.length) return new Map();
  const query = ids.map((id) => encodeURIComponent(String(id))).join(",");
  const rows = await supabaseFetch(`/rest/v1/onboarding_documents?select=id,status,kind,title,procedimento,form_state&id=in.(${query})`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  return new Map((rows || []).map((row) => [row.id, row]));
}

async function listCerneClients(caller, serviceRoleKey) {
  const ownerFilter = isAdmin(caller) ? "" : `&owner_id=eq.${encodeURIComponent(caller.id)}`;
  return supabaseFetch(`/rest/v1/cerne_clients?select=*&order=created_at.desc${ownerFilter}`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
}

async function authUserNameMap(serviceRoleKey) {
  const map = new Map();
  for (let page = 1; page <= 20; page += 1) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=100`, {
      key: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    const users = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];
    users.forEach((user) => {
      const name = firstText(
        user?.user_metadata.display_name,
        user?.user_metadata.name,
        user?.user_metadata.username,
        user.app_metadata.username,
        user?.email,
      );
      if (user?.id && name) map.set(user?.id, name);
    });
    if (users.length < 100) break;
  }
  return map;
}

async function listCerneQueue(caller, serviceRoleKey) {
  const ownerFilter = isAdmin(caller) ? "" : `&owner_id=eq.${encodeURIComponent(caller.id)}`;
  const rows = await supabaseFetch(`/rest/v1/cerne_onboarding_queue?select=*&status=eq.pending&order=created_at.desc${ownerFilter}`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  const docs = await finalDocumentMap(rows || [], serviceRoleKey);
  const ownerNames = isAdmin(caller) ? await authUserNameMap(serviceRoleKey).catch(() => new Map()) : new Map([[caller.id, firstText(caller.user_metadata.display_name, caller.user_metadata.name, caller.user_metadata.username, caller.email)]]);
  return (rows || []).filter((row) => {
    const doc = docs.get(row.source_document_id);
    return canExposeCerneQueueItem(row, doc);
  }).map((row) => ({
    ...row,
    owner_name: ownerNames.get(row.owner_id) || null,
  }));
}

async function reviewCerneQueue(input, caller, serviceRoleKey, request) {
  const queueId = cleanText(input.cerneQueueId || input.queueId || input.p_queue_id, 80).trim();
  const decision = cleanText(input.cerneDecision || input.decision || input.p_decision, 20).trim();
  if (!/^[0-9a-f-]{36}$/i.test(queueId)) {
    const error = new Error("Pend?ncia invalida.");
    error.status = 400;
    throw error;
  }
  if (!["accepted", "rejected"].includes(decision)) {
    const error = new Error("Decisao invalida.");
    error.status = 400;
    throw error;
  }
  const rows = await supabaseFetch(`/rest/v1/cerne_onboarding_queue?select=*&id=eq.${encodeURIComponent(queueId)}&limit=1`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  const queue = Array.isArray(rows) ? rows[0] : null;
  if (!queue) {
    const error = new Error("Pendência não encontrada.");
    error.status = 404;
    throw error;
  }
  if (queue.owner_id !== caller.id && !isAdmin(caller)) {
    const error = new Error("Você não tem permissão para revisar esta pendência.");
    error.status = 403;
    throw error;
  }
  if (queue.status !== "pending") {
    const error = new Error("Pend?ncia ja revisada.");
    error.status = 409;
    throw error;
  }
  const docs = await supabaseFetch(`/rest/v1/onboarding_documents?select=id,status,kind,title,procedimento,form_state&id=eq.${encodeURIComponent(queue.source_document_id)}&limit=1`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  const sourceDoc = Array.isArray(docs) ? docs[0] : null;
  if (sourceDoc.status !== "final" || sourceDoc.kind !== "briefing") {
    const error = new Error("Somente briefings salvos como documento final podem ser integrados ao CERNE.");
    error.status = 400;
    throw error;
  }
  if (isOpeningBriefingQueue(queue, sourceDoc) && !isOpeningBriefingQueueCompleted(queue, sourceDoc)) {
    const error = new Error("O Briefing Abertura só pode ser integrado ao CERNE depois de concluído no Onboarding.");
    error.status = 400;
    throw error;
  }

  let clientId = null;
  if (decision === "accepted") {
    const client = clientFromQueue(queue, input.client || input.p_client || {});
    if (client.cnpj.length !== 14 || client.company.length < 2) {
      const error = new Error("Preencha CNPJ e razao social no Onboarding antes de aceitar no CERNE.");
      error.status = 400;
      throw error;
    }
    if (queue.event_type === "entry") {
      const saved = await supabaseFetch("/rest/v1/cerne_clients?on_conflict=cnpj", {
        method: "POST",
        key: serviceRoleKey,
        bearer: serviceRoleKey,
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          owner_id: queue.owner_id,
          created_by: caller.id,
          company: client.company,
          cnpj: client.cnpj,
          city: client.city,
          state: client.state,
          tax_regime: client.tax_regime,
          segment: client.segment,
          unit: client.unit,
          consultant: client.consultant,
          channel: client.channel,
          monthly_fee: client.monthly_fee,
          employees: client.employees,
          entry_date: client.entry_date,
          status: "active",
          source_document_id: queue.source_document_id,
          updated_at: new Date().toISOString(),
        },
      });
      clientId = saved?.[0].id || null;
    } else {
      const existingRows = await supabaseFetch(`/rest/v1/cerne_clients?select=*&cnpj=eq.${encodeURIComponent(client.cnpj)}&limit=1`, {
        key: serviceRoleKey,
        bearer: serviceRoleKey,
      });
      const existingClient = Array.isArray(existingRows) ? existingRows[0] : null;
      const exit = exitFromQueue(queue, client, existingClient || {});
      let savedExitClient;
      if (existingClient.id) {
        savedExitClient = await supabaseFetch(`/rest/v1/cerne_clients?id=eq.${encodeURIComponent(existingClient.id)}`, {
          method: "PATCH",
          key: serviceRoleKey,
          bearer: serviceRoleKey,
          prefer: "return=representation",
          body: {
            status: "inactive",
            exit_date: exit.exit_date,
            exit_reason: exit.exit_reason,
            lost_monthly_fee: exit.lost_monthly_fee,
            exit_source_document_id: queue.source_document_id,
            exit_payload: exit.payload,
            source_document_id: existingClient.source_document_id || queue.source_document_id,
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        savedExitClient = await supabaseFetch("/rest/v1/cerne_clients?on_conflict=cnpj", {
          method: "POST",
          key: serviceRoleKey,
          bearer: serviceRoleKey,
          prefer: "resolution=merge-duplicates,return=representation",
          body: {
            owner_id: queue.owner_id,
            created_by: caller.id,
            company: exit.company,
            cnpj: exit.cnpj,
            city: client.city,
            state: client.state,
            tax_regime: client.tax_regime,
            segment: client.segment,
            unit: client.unit,
            consultant: client.consultant,
            channel: client.channel,
            monthly_fee: client.monthly_fee,
            employees: client.employees,
            entry_date: client.entry_date,
            status: "inactive",
            exit_date: exit.exit_date,
            exit_reason: exit.exit_reason,
            lost_monthly_fee: exit.lost_monthly_fee,
            source_document_id: queue.source_document_id,
            exit_source_document_id: queue.source_document_id,
            exit_payload: exit.payload,
            updated_at: new Date().toISOString(),
          },
        });
      }
      clientId = savedExitClient?.[0].id || existingClient.id || null;
      if (!clientId) {
        const error = new Error("Não foi possível registrar a saída do cliente no CERNE.");
        error.status = 500;
        throw error;
      }
      await supabaseFetch("/rest/v1/cerne_client_exits?on_conflict=source_document_id", {
        method: "POST",
        key: serviceRoleKey,
        bearer: serviceRoleKey,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          client_id: clientId,
          owner_id: queue.owner_id,
          source_document_id: queue.source_document_id,
          company: exit.company,
          cnpj: exit.cnpj,
          lost_monthly_fee: exit.lost_monthly_fee,
          exit_reason: exit.exit_reason,
          exit_date: exit.exit_date,
          payload: exit.payload,
          reviewed_by: caller.id,
        },
      });
    }
  }

  await supabaseFetch(`/rest/v1/cerne_onboarding_queue?id=eq.${encodeURIComponent(queueId)}`, {
    method: "PATCH",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=minimal",
    body: {
      status: decision,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      accepted_client_id: clientId,
    },
  });
  await supabaseFetch("/rest/v1/security_audit_log", {
    method: "POST",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "return=minimal",
    body: {
      actor_id: caller.id,
      event_type: `cerne_onboarding_${decision}`,
      target_id: queueId,
      ip_hash: request ? await clientIpHash(request) : null,
      metadata: requestAuditMetadata(request || { headers: {} }, {
        event_type: queue.event_type,
        source_document_id: queue.source_document_id,
        client_id: clientId,
        decision,
      }),
    },
  }).catch(() => null);
  return { ok: true, clientId };
}

export default async function handler(request, response) {
  if (rejectDisallowedOrigin(request, response)) return;
  if (rejectLargeRequest(request, response, MAX_BODY_BYTES)) return;
  if (await rejectRateLimited(request, response, { action: "onboarding_documents", limit: 300, windowSeconds: 60 })) return;

  if (!["GET", "POST", "DELETE"].includes(request.method)) return json(response, 405, { error: "Método não permitido." });
  const { publicKey, serviceRoleKey } = supabaseConfig();
  if (!publicKey || !serviceRoleKey) return json(response, 503, { error: "Servico indisponivel." });

  let caller;
  try {
    caller = await callerFromRequest(request, publicKey);
  } catch (_error) {
    return json(response, 401, { error: "Sessão inválida." });
  }
  if (isSuspendedUser(caller)) return json(response, 403, { code: "account_suspended", error: ACCOUNT_SUSPENDED_MESSAGE });
  if (!caller || caller.app_metadata.status === "pending") return json(response, 403, { error: "Sessão inválida ou usuário não aprovado." });

  if (request.query?.cerne != null || request.query?.cerneRelationship != null || request.body?.cerneRelationshipAction || request.body?.cerneQueueId || request.body?.queueId || request.body?.p_queue_id) {
    return json(response, 410, { error: "O módulo CERNE foi encerrado." });
  }

  if (request.method === "GET") {
    if (request.query?.cerneRelationship === "1") {
      try {
        const data = await listRelationshipData(request, caller, serviceRoleKey);
        return json(response, 200, data);
      } catch (error) {
        return json(response, error.status && error.status < 500 ? error.status : 500, {
          error: error?.message || "Não foi possível carregar o relacionamento.",
        });
      }
    }
    if (request.query?.cerne === "clients") {
      const rows = await listCerneClients(caller, serviceRoleKey);
      return json(response, 200, rows || []);
    }
    if (request.query?.cerne === "queue") {
      const rows = await listCerneQueue(caller, serviceRoleKey);
      return json(response, 200, rows || []);
    }
    const ownerFilter = isAdmin(caller) ? "" : `&owner_id=eq.${encodeURIComponent(caller.id)}`;
    const documentId = cleanText(request.query?.id, 80).trim();
    if (documentId) {
      if (!/^[a-z0-9._:-]{8,80}$/i.test(documentId)) return json(response, 400, { error: "Documento invalido." });
      const detailRows = await supabaseFetch(
        `/rest/v1/onboarding_documents?select=*&id=eq.${encodeURIComponent(documentId)}${ownerFilter}&limit=1`,
        { key: serviceRoleKey, bearer: serviceRoleKey },
      );
      return json(response, 200, detailRows || []);
    }
    const rows = await supabaseFetch(
      `/rest/v1/onboarding_documents?select=id,owner_id,serial,emitente,kind,status,title,empresa,documento,procedimento,created_at,updated_at,form_state&order=updated_at.desc&limit=200${ownerFilter}`,
      { key: serviceRoleKey, bearer: serviceRoleKey },
    );
    return json(response, 200, rows || []);
  }

  if (request.method === "DELETE") {
    if (!isAdmin(caller)) return json(response, 403, { error: "Somente o administrador pode excluir documentos." });
    const id = cleanText(request.body?.id || request.query?.id, 80).trim();
    if (!/^[a-z0-9._:-]{8,80}$/i.test(id)) return json(response, 400, { error: "Documento invalido." });
    await supabaseFetch(`/rest/v1/onboarding_documents?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      key: serviceRoleKey,
      bearer: serviceRoleKey,
      prefer: "return=representation",
    });
    return json(response, 200, { message: "Documento excluido." });
  }

  const input = request.body || {};
  if (input.cerneRelationshipAction) {
    try {
      if (input.cerneRelationshipAction === "save") {
        const saved = await saveRelationshipRecord(input, caller, serviceRoleKey);
        return json(response, 200, saved || {});
      }
      if (input.cerneRelationshipAction === "moveOpportunity") {
        const saved = await moveRelationshipOpportunity(input, caller, serviceRoleKey);
        return json(response, 200, saved || {});
      }
      return json(response, 400, { error: "Acao invalida." });
    } catch (error) {
      return json(response, error.status && error.status < 500 ? error.status : 500, {
        error: error?.message || "Não foi possível salvar o relacionamento.",
        message: error?.message || "Não foi possível salvar o relacionamento.",
      });
    }
  }
  if (input.cerneQueueId || input.queueId || input.p_queue_id) {
    try {
      const result = await reviewCerneQueue(input, caller, serviceRoleKey, request);
      return json(response, 200, result);
    } catch (error) {
      return json(response, error.status && error.status < 500 ? error.status : 500, {
        error: error?.message || "Não foi possível sincronizar com o CERNE.",
        message: error?.message || "Não foi possível sincronizar com o CERNE.",
      });
    }
  }

  const id = cleanText(input.id, 80).trim();
  if (!/^[a-z0-9._:-]{8,80}$/i.test(id)) return json(response, 400, { error: "Documento invalido." });
  const existingRows = await supabaseFetch(`/rest/v1/onboarding_documents?select=id,owner_id,created_at&id=eq.${encodeURIComponent(id)}&limit=1`, {
    key: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing && existing.owner_id !== caller.id && !isAdmin(caller)) return json(response, 403, { error: "Documento não pertence ao usuário." });
  const now = new Date().toISOString();
  const row = {
    id,
    owner_id: existing?.owner_id || caller.id,
    serial: cleanText(input.serial, 80),
    emitente: cleanText(input.emitente, 120),
    kind: cleanText(input.kind, 40),
    status: cleanText(input.status, 40) === "rascunho" ? "rascunho" : "final",
    title: cleanText(input.title, 200),
    empresa: cleanNullable(input.empresa, 200),
    documento: cleanNullable(input.documento, 120),
    procedimento: cleanNullable(input.procedimento, 120),
    created_at: existing?.created_at || cleanText(input.created_at, 40) || now,
    updated_at: now,
    form_state: cleanObject(input.form_state),
    html: cleanText(input.html, 900000),
  };
  const saved = await supabaseFetch("/rest/v1/onboarding_documents?on_conflict=id", {
    method: "POST",
    key: serviceRoleKey,
    bearer: serviceRoleKey,
    prefer: "resolution=merge-duplicates,return=representation",
    body: row,
  });
  return json(response, 200, saved || []);
}
