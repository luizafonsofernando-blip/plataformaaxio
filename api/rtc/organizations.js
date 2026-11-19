import { rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { rtcApiError, rtcClient, RtcStoreError } from "../../server-assets/rtc-store.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ code: "method_not_allowed" });
  if (rejectLargeRequest(request, response, 4096)) return;
  if (await rejectRateLimited(request, response, { action: "rtc_organizations", limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    const client = rtcClient();
    if (request.method === "POST") {
      if (!process.env.RTC_BOOTSTRAP_ADMIN_USER_ID || user.id !== process.env.RTC_BOOTSTRAP_ADMIN_USER_ID || user.app_metadata?.role !== "admin") {
        throw new RtcStoreError("bootstrap_forbidden", 403);
      }
      const name = String(request.body?.name || "").trim();
      if (name.length < 2 || name.length > 160) throw new RtcStoreError("invalid_name");
      const { data, error } = await client.from("rtc_organizations").insert({ name, created_by: user.id }).select("id, name, created_at").single();
      if (error) throw new RtcStoreError("store_unavailable", 503);
      return response.status(201).json({ organization: data });
    }
    const { data: memberships, error } = await client.from("rtc_memberships")
      .select("organization_id, role").eq("user_id", user.id).eq("status", "active");
    if (error) throw new RtcStoreError("store_unavailable", 503);
    const canBootstrap = Boolean(process.env.RTC_BOOTSTRAP_ADMIN_USER_ID && user.id === process.env.RTC_BOOTSTRAP_ADMIN_USER_ID && user.app_metadata?.role === "admin");
    if (!memberships.length) return response.status(200).json({ organizations: [], canBootstrap });
    const { data: organizations, error: orgError } = await client.from("rtc_organizations")
      .select("id, name, created_at").in("id", memberships.map((item) => item.organization_id)).order("name");
    if (orgError) throw new RtcStoreError("store_unavailable", 503);
    return response.status(200).json({ organizations: organizations.map((item) => ({ ...item, role: memberships.find((member) => member.organization_id === item.id)?.role })), canBootstrap });
  } catch (error) { return rtcApiError(response, error); }
}
