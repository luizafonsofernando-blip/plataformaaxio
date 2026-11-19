import { rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { calculateRegularOperation, RtcEngineError, validOperationDate } from "../../server-assets/rtc-official.mjs";
import { assertCompanyAccess, rtcApiError, rtcClient, RtcStoreError, validUuid } from "../../server-assets/rtc-store.mjs";
import { isDeepStrictEqual } from "node:util";

const ANALYSIS_COLUMNS = "id, organization_id, company_id, operation_date, engine, engine_version, rules_version, source_commit, status, input_data, output_data, correlation_id, created_at";

async function existingAnalysis(client, correlationId, organizationId, companyId, userId) {
  const { data, error } = await client.from("rtc_analyses").select(ANALYSIS_COLUMNS)
    .eq("correlation_id", correlationId).eq("organization_id", organizationId)
    .eq("company_id", companyId).eq("requested_by", userId).maybeSingle();
  if (error) throw new RtcStoreError("store_unavailable", 503);
  return data;
}

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "POST") return response.status(405).json({ code: "method_not_allowed" });
  if (rejectLargeRequest(request, response, 128_000)) return;
  if (await rejectRateLimited(request, response, { action: "rtc_calculate", limit: 10, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  if (process.env.RTC_CALC_ENABLED !== "1") return response.status(503).json({ code: "calculation_not_validated" });
  try {
    const body = request.body || {};
    const { organization_id: organizationId, company_id: companyId,
      operation_date: operationDate, correlation_id: correlationId, operation } = body;
    if (!validUuid(correlationId) || !validOperationDate(operationDate)
      || !operation || typeof operation !== "object" || Array.isArray(operation)
      || !String(operation.dhFatoGerador || "").startsWith(operationDate)
      || Buffer.byteLength(JSON.stringify(body), "utf8") > 128_000) {
      throw new RtcStoreError("invalid_operation");
    }
    const client = rtcClient();
    const member = await assertCompanyAccess(client, organizationId, companyId, user.id);
    if (member.role === "viewer") throw new RtcStoreError("calculation_forbidden", 403);
    const prior = await existingAnalysis(client, correlationId, organizationId, companyId, user.id);
    if (prior) {
      if (prior.operation_date !== operationDate || !isDeepStrictEqual(prior.input_data, operation)) {
        throw new RtcStoreError("calculation_conflict", 409);
      }
      return response.status(200).json({ analysis: prior, repeated: true });
    }
    const result = await calculateRegularOperation(operation);
    const states = result.output.objetos.map((item) => item.estadoItem);
    const status = states.every((state) => state === "CALCULADO") && !result.warning ? "completed"
      : states.some((state) => state === "INCONSISTENCIA_ENTRADA" || state === "FALHA_TECNICA") ? "failed" : "unsupported";
    const { data: id, error } = await client.rpc("rtc_register_analysis", {
      p_organization_id: organizationId, p_company_id: companyId, p_requested_by: user.id,
      p_operation_date: operationDate, p_engine: "regular", p_engine_version: result.engineVersion,
      p_rules_version: result.databaseVersion || "unknown", p_source_commit: result.sourceCommit,
      p_status: status, p_input_data: operation,
      p_output_data: { ...result.output, luce_source: result.source, luce_warning: result.warning },
      p_correlation_id: correlationId,
    });
    if (error) {
      if (error.code === "23505") {
        const duplicate = await existingAnalysis(client, correlationId, organizationId, companyId, user.id);
        if (duplicate && duplicate.operation_date === operationDate
          && isDeepStrictEqual(duplicate.input_data, operation)) {
          return response.status(200).json({ analysis: duplicate, repeated: true });
        }
        throw new RtcStoreError("calculation_conflict", 409);
      }
      throw new RtcStoreError("store_unavailable", 503);
    }
    return response.status(201).json({ analysis: {
      id, operation_date: operationDate, engine: "regular", engine_version: result.engineVersion,
      rules_version: result.databaseVersion || "unknown", status,
      input_data: operation, output_data: result.output, correlation_id: correlationId,
      warning: result.warning,
    } });
  } catch (error) {
    if (error instanceof RtcEngineError) return response.status(error.status).json({ code: error.code });
    return rtcApiError(response, error);
  }
}
