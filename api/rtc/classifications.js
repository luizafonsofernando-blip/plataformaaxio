import { rejectDisallowedOrigin, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { fetchRegularClassifications, RtcEngineError } from "../../server-assets/rtc-official.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "GET") return response.status(405).json({ code: "method_not_allowed" });
  if (await rejectRateLimited(request, response, { action: "rtc_classifications", limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    const data = await fetchRegularClassifications(request.query?.data);
    return response.status(200).json(data);
  } catch (error) {
    if (!(error instanceof RtcEngineError)) console.error("RTC catalog request failed", error);
    const status = error instanceof RtcEngineError ? error.status : 503;
    const code = error instanceof RtcEngineError ? error.code : "engine_unavailable";
    return response.status(status).json({ code });
  }
}
