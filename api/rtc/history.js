import { rejectDisallowedOrigin, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { assertCompanyAccess, rtcApiError, rtcClient, RtcStoreError, validUuid } from "../../server-assets/rtc-store.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "GET") return response.status(405).json({ code: "method_not_allowed" });
  if (await rejectRateLimited(request, response, { action: "rtc_history", limit: 60, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    const organizationId = request.query?.organization_id;
    const companyId = request.query?.company_id;
    const analysisId = request.query?.analysis_id;
    const client = rtcClient();
    await assertCompanyAccess(client, organizationId, companyId, user.id);
    if (analysisId && !validUuid(analysisId)) throw new RtcStoreError("invalid_analysis");
    const columns = analysisId
      ? "id, operation_date, engine, engine_version, rules_version, source_commit, status, correlation_id, input_data, output_data, created_at"
      : "id, operation_date, engine, engine_version, rules_version, status, created_at";
    let query = client.from("rtc_analyses").select(columns)
      .eq("organization_id", organizationId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
    if (analysisId) query = query.eq("id", analysisId);
    const { data, error } = await query;
    if (error) throw new RtcStoreError("store_unavailable", 503);
    if (!analysisId) return response.status(200).json({ analyses: data });
    const { data: reports, error: reportsError } = await client.from("rtc_reports")
      .select("id, sha256, byte_length, created_at").eq("organization_id", organizationId)
      .eq("company_id", companyId).eq("analysis_id", analysisId).order("created_at", { ascending: false });
    if (reportsError) throw new RtcStoreError("store_unavailable", 503);
    return response.status(200).json({ analyses: data, reports });
  } catch (error) { return rtcApiError(response, error); }
}
