import { rejectDisallowedOrigin, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { assertCompanyAccess, rtcApiError, rtcClient, RtcStoreError, validUuid } from "../../server-assets/rtc-store.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "GET") return response.status(405).json({ code: "method_not_allowed" });
  if (await rejectRateLimited(request, response, { action: "rtc_report", limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    const reportId = request.query?.id;
    if (!validUuid(reportId)) throw new RtcStoreError("invalid_report");
    const client = rtcClient();
    const { data: report, error } = await client.from("rtc_reports")
      .select("id, organization_id, company_id, analysis_id, object_name, sha256, byte_length")
      .eq("id", reportId).maybeSingle();
    if (error) throw new RtcStoreError("store_unavailable", 503);
    if (!report) throw new RtcStoreError("report_not_found", 404);
    await assertCompanyAccess(client, report.organization_id, report.company_id, user.id);
    const { data: signed, error: signError } = await client.storage.from("rtc-reports")
      .createSignedUrl(report.object_name, 60, { download: `${report.id}.pdf` });
    if (signError || !signed?.signedUrl) throw new RtcStoreError("report_unavailable", 503);
    return response.status(200).json({ url: signed.signedUrl, sha256: report.sha256, byteLength: report.byte_length, expiresIn: 60 });
  } catch (error) { return rtcApiError(response, error); }
}
