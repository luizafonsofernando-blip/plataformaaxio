import { createClient } from "@supabase/supabase-js";
import { rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from "../_security.js";

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (request.method !== "POST") return response.status(405).json({ code: "method_not_allowed" });
  if (rejectLargeRequest(request, response, 4096)) return;
  const url = process.env.SUPABASE_URL;
  let local = false;
  try { local = new URL(url).origin === "http://127.0.0.1:55321"; }
  catch { /* Configuration is intentionally closed. */ }
  if (process.env.NODE_ENV === "production" || process.env.RTC_LOCAL_MODE !== "1" || !local) {
    return response.status(404).json({ code: "not_found" });
  }
  if (await rejectRateLimited(request, response, { action: "rtc_local_login", limit: 5, windowSeconds: 60 })) return;
  const email = String(request.body?.identifier || "").trim();
  const password = String(request.body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return response.status(400).json({ code: "invalid_credentials" });
  }
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!publishableKey) return response.status(503).json({ code: "auth_not_configured" });
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return response.status(401).json({ code: "invalid_credentials" });
  const authorizedRequest = { ...request, headers: { ...request.headers, authorization: `Bearer ${data.session.access_token}` } };
  const user = await requireActiveModuleUser(authorizedRequest, response, "reforma-tributaria");
  if (!user) return;
  return response.status(200).json({ access_token: data.session.access_token });
}
