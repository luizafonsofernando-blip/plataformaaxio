const MAX_RESPONSE_BYTES = 5_000_000;
const EXPECTED_REGULAR_VERSION = "1.6.1";
const EXPECTED_SIMPLES_VERSION = "0.0.6";

export class RtcEngineError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function validOperationDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validEngineBase(base, config) {
  const local = config.RTC_LOCAL_ENGINE_HTTP === "1" && process.env.NODE_ENV !== "production"
    && base.protocol === "http:" && base.hostname === "127.0.0.1" && base.port === "58080";
  return (base.protocol === "https:" || local) && !base.username && !base.password
    && !base.search && !base.hash && base.pathname === "/";
}

async function getJson(url, token, signal) {
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      signal,
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    throw new RtcEngineError(error?.name === "TimeoutError" || error?.name === "AbortError" ? "engine_timeout" : "engine_unavailable", 503);
  }
  if (!response.ok) throw new RtcEngineError("engine_unavailable", 503);
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) {
    throw new RtcEngineError("engine_response_too_large", 502);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new RtcEngineError("engine_response_too_large", 502);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RtcEngineError("engine_invalid_response", 502); }
}

export async function fetchRegularClassifications(date, config = process.env) {
  if (!validOperationDate(date)) throw new RtcEngineError("invalid_date", 400);
  const endpoint = String(config.RTC_REGULAR_ENGINE_URL || "").trim();
  const token = String(config.RTC_REGULAR_ENGINE_TOKEN || "").trim();
  if (!endpoint || !token) throw new RtcEngineError("engine_not_configured", 503);
  let base;
  try { base = new URL(endpoint); }
  catch { throw new RtcEngineError("engine_not_configured", 503); }
  if (!validEngineBase(base, config)) {
    throw new RtcEngineError("engine_not_configured", 503);
  }
  const signal = AbortSignal.timeout(8_000);
  const prefix = new URL("/api/calculadora/dados-abertos/", base);
  const version = await getJson(new URL("versao", prefix), token, signal);
  if (version?.versaoApp !== EXPECTED_REGULAR_VERSION) {
    throw new RtcEngineError("engine_version_mismatch", 503);
  }
  const catalogUrl = new URL("situacoes-tributarias/cbs-ibs", prefix);
  catalogUrl.searchParams.set("data", date);
  const rows = await getJson(catalogUrl, token, signal);
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.codigo !== "string"
    || typeof row?.descricao !== "string"
    || !Array.isArray(row?.classificacoesTributarias)
    || row.classificacoesTributarias.some((entry) => typeof entry?.codigo !== "string" || typeof entry?.descricao !== "string"))) {
    throw new RtcEngineError("engine_invalid_response", 502);
  }
  return {
    source: "ReceitaFederal/calculadora-rtc-regime-regular",
    engineVersion: version.versaoApp,
    databaseVersion: String(version.versaoDb || ""),
    queriedAt: new Date().toISOString(),
    operationDate: date,
    rows,
  };
}

export async function fetchSimplesActivities(date, config = process.env) {
  if (!validOperationDate(date)) throw new RtcEngineError("invalid_date", 400);
  const endpoint = String(config.RTC_SIMPLES_ENGINE_URL || "").trim();
  const token = String(config.RTC_SIMPLES_ENGINE_TOKEN || "").trim();
  if (!endpoint || !token) throw new RtcEngineError("engine_not_configured", 503);
  let base;
  try { base = new URL(endpoint); }
  catch { throw new RtcEngineError("engine_not_configured", 503); }
  if (!validEngineBase(base, config)) {
    throw new RtcEngineError("engine_not_configured", 503);
  }
  const signal = AbortSignal.timeout(8_000);
  const prefix = new URL("/api/", base);
  const version = await getJson(new URL("versao", prefix), token, signal);
  if (version?.versaoApp !== EXPECTED_SIMPLES_VERSION) throw new RtcEngineError("engine_version_mismatch", 503);
  const catalogUrl = new URL("calculadora/simples-nacional/atividades", prefix);
  catalogUrl.searchParams.set("data", date);
  const rows = await getJson(catalogUrl, token, signal);
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.codigo !== "string" || typeof row?.descricao !== "string"
    || typeof row?.disponivel !== "boolean" || !Array.isArray(row?.tpDocsAdmissiveis))) {
    throw new RtcEngineError("engine_invalid_response", 502);
  }
  return {
    source: "ReceitaFederal/calculadora-rtc-simples-nacional",
    engineVersion: version.versaoApp,
    databaseVersion: String(version.versaoDb || ""),
    queriedAt: new Date().toISOString(),
    operationDate: date,
    rows,
  };
}
