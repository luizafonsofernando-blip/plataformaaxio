import { rejectDisallowedOrigin, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";
import { fetchRegularCode, RtcEngineError } from "../../server-assets/rtc-official.mjs";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "GET") return response.status(405).json({ code: "method_not_allowed" });
  if (await rejectRateLimited(request, response, { action: "rtc_code", limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  try {
    return response.status(200).json(await fetchRegularCode(request.query?.tipo, request.query?.codigo, request.query?.data));
  } catch (error) {
    if (!(error instanceof RtcEngineError)) console.error("RTC code lookup failed", error);
    return response.status(error instanceof RtcEngineError ? error.status : 503)
      .json({ code: error instanceof RtcEngineError ? error.code : "engine_unavailable" });
  }
}
