import { rejectDisallowedOrigin, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";

const engines = [
  { id: "regular", name: "Regime Regular", variable: "RTC_REGULAR_ENGINE_URL", token: "RTC_REGULAR_ENGINE_TOKEN" },
  { id: "simples", name: "Simples Nacional", variable: "RTC_SIMPLES_ENGINE_URL", token: "RTC_SIMPLES_ENGINE_TOKEN" },
  { id: "danfse", name: "Gerador DANFSe", variable: "RTC_DANFSE_ENGINE_URL", token: "RTC_DANFSE_ENGINE_TOKEN" },
];

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "GET") {
    return response.status(405).json({ code: "method_not_allowed", error: "Método não permitido." });
  }
  if (await rejectRateLimited(request, response, { action: "rtc_status", limit: 120, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, "reforma-tributaria");
  if (!user) return;
  return response.status(200).json({
    phase: "development",
    calculationEnabled: process.env.RTC_CALC_ENABLED === "1"
      && Boolean(process.env.RTC_REGULAR_ENGINE_URL && process.env.RTC_REGULAR_ENGINE_TOKEN),
    engines: engines.map(({ id, name, variable, token }) => ({
      id,
      name,
      status: process.env[variable] && process.env[token] ? "pending_validation" : "not_configured",
    })),
  });
}
