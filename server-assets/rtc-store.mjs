import { createClient } from "@supabase/supabase-js";

export class RtcStoreError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function rtcClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RtcStoreError("store_not_configured", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function validUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) throw new RtcStoreError("invalid_cnpj");
  const check = (size) => {
    let weight = size - 7;
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
      sum += Number(digits[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (Number(digits[12]) !== check(12) || Number(digits[13]) !== check(13)) throw new RtcStoreError("invalid_cnpj");
  return digits;
}

export async function activeMembership(client, organizationId, userId) {
  if (!validUuid(organizationId)) throw new RtcStoreError("invalid_organization");
  const { data, error } = await client.from("rtc_memberships")
    .select("role").eq("organization_id", organizationId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw new RtcStoreError("store_unavailable", 503);
  if (!data) throw new RtcStoreError("organization_forbidden", 403);
  return data;
}

export async function assertCompanyAccess(client, organizationId, companyId, userId) {
  if (!validUuid(companyId)) throw new RtcStoreError("invalid_company");
  const member = await activeMembership(client, organizationId, userId);
  const { data: company, error: companyError } = await client.from("rtc_companies")
    .select("id").eq("id", companyId).eq("organization_id", organizationId).maybeSingle();
  if (companyError) throw new RtcStoreError("store_unavailable", 503);
  if (!company) throw new RtcStoreError("company_forbidden", 403);
  if (member.role === "admin") return member;
  const { data: access, error: accessError } = await client.from("rtc_company_access")
    .select("company_id").eq("company_id", companyId).eq("organization_id", organizationId)
    .eq("user_id", userId).maybeSingle();
  if (accessError) throw new RtcStoreError("store_unavailable", 503);
  if (!access) throw new RtcStoreError("company_forbidden", 403);
  return member;
}

export function rtcApiError(response, error) {
  if (!(error instanceof RtcStoreError)) console.error("RTC store operation failed", error);
  return response.status(error instanceof RtcStoreError ? error.status : 503)
    .json({ code: error instanceof RtcStoreError ? error.code : "store_unavailable" });
}
