import { rejectDisallowedOrigin, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { activeMembership, rtcApiError, rtcClient, RtcStoreError } from "../../server-assets/rtc-store.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "GET") return response.status(405).json({ code: "method_not_allowed" });
  if (await rejectRateLimited(request, response, { action: "rtc_audit", limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    const organizationId = request.query?.organization_id;
    const client = rtcClient();
    const member = await activeMembership(client, organizationId, user.id);
    if (member.role !== "admin") throw new RtcStoreError("audit_forbidden", 403);
    const { data, error } = await client.from("rtc_audit_events")
      .select("id, actor_id, analysis_id, event_type, details, created_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new RtcStoreError("store_unavailable", 503);
    return response.status(200).json({ events: data });
  } catch (error) { return rtcApiError(response, error); }
}
