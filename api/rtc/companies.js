import { rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { activeMembership, normalizeCnpj, rtcApiError, rtcClient, RtcStoreError } from "../../server-assets/rtc-store.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ code: "method_not_allowed" });
  if (rejectLargeRequest(request, response, 8192)) return;
  if (await rejectRateLimited(request, response, { action: "rtc_companies", limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    const client = rtcClient();
    const organizationId = request.method === "GET" ? request.query?.organization_id : request.body?.organization_id;
    const member = await activeMembership(client, organizationId, user.id);
    if (request.method === "POST") {
      if (member.role !== "admin") throw new RtcStoreError("company_write_forbidden", 403);
      const cnpj = normalizeCnpj(request.body?.cnpj);
      const legalName = String(request.body?.legal_name || "").trim();
      const tradeName = String(request.body?.trade_name || "").trim();
      if (legalName.length < 2 || legalName.length > 180 || tradeName.length > 180) throw new RtcStoreError("invalid_name");
      const { data, error } = await client.from("rtc_companies").insert({
        organization_id: organizationId, cnpj, legal_name: legalName, trade_name: tradeName || null, created_by: user.id,
      }).select("id, cnpj, legal_name, trade_name, created_at").single();
      if (error?.code === "23505") throw new RtcStoreError("company_exists", 409);
      if (error) throw new RtcStoreError("store_unavailable", 503);
      return response.status(201).json({ company: data });
    }
    let allowedIds = null;
    if (member.role !== "admin") {
      const { data, error } = await client.from("rtc_company_access").select("company_id")
        .eq("organization_id", organizationId).eq("user_id", user.id);
      if (error) throw new RtcStoreError("store_unavailable", 503);
      allowedIds = data.map((item) => item.company_id);
      if (!allowedIds.length) return response.status(200).json({ companies: [] });
    }
    let query = client.from("rtc_companies").select("id, cnpj, legal_name, trade_name, created_at")
      .eq("organization_id", organizationId).order("legal_name").limit(200);
    if (allowedIds) query = query.in("id", allowedIds);
    const { data, error } = await query;
    if (error) throw new RtcStoreError("store_unavailable", 503);
    return response.status(200).json({ companies: data });
  } catch (error) { return rtcApiError(response, error); }
}
