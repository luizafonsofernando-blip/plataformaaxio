import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROUTES = new Map([
  ["/api/calculadora/dados-abertos/versao", "RTC_REGULAR_UPSTREAM"],
  ["/api/calculadora/dados-abertos/situacoes-tributarias/cbs-ibs", "RTC_REGULAR_UPSTREAM"],
  ["/api/calculadora/dados-abertos/ncm", "RTC_REGULAR_UPSTREAM"],
  ["/api/calculadora/dados-abertos/nbs", "RTC_REGULAR_UPSTREAM"],
  ["/api/versao", "RTC_SIMPLES_UPSTREAM"],
  ["/api/calculadora/simples-nacional/atividades", "RTC_SIMPLES_UPSTREAM"],
  ["/health/ready", "RTC_DANFSE_UPSTREAM"],
]);
const MAX_BYTES = 5_000_000;
const MAX_INPUT_BYTES = 128_000;
const REGULAR_CALCULATION_PATH = "/api/calculadora/observabilidade/regime-geral";

export function authorized(header, secret) {
  if (!secret || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createGateway(config = process.env, fetchImpl = fetch) {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method === "GET" && request.url === "/health/regular") {
      try {
        const base = config.RTC_REGULAR_UPSTREAM;
        if (!base) throw new Error("missing upstream");
        const result = await fetchImpl(new URL("/api/calculadora/dados-abertos/versao", base), {
          signal: AbortSignal.timeout(5_000), redirect: "error", headers: { accept: "application/json" },
        });
        const version = result.ok ? await result.json() : null;
        if (version?.versaoApp !== "1.6.1") throw new Error("version unavailable");
        response.writeHead(200, { "Content-Type": "application/json" }).end('{"ready":true}');
      } catch { response.writeHead(503, { "Content-Type": "application/json" }).end('{"ready":false}'); }
      return;
    }
    if (!["GET", "POST"].includes(request.method)) { response.writeHead(405).end(); return; }
    if (!authorized(request.headers.authorization, config.RTC_GATEWAY_TOKEN)) { response.writeHead(401).end(); return; }
    let input;
    try { input = new URL(request.url, "http://gateway.internal"); }
    catch { response.writeHead(400).end(); return; }
    const calculation = input.pathname === REGULAR_CALCULATION_PATH;
    if (calculation !== (request.method === "POST")) { response.writeHead(405).end(); return; }
    const upstreamVariable = calculation ? "RTC_REGULAR_UPSTREAM" : ROUTES.get(input.pathname);
    if (!upstreamVariable) { response.writeHead(404).end(); return; }
    const codeType = input.pathname.endsWith("/ncm") ? "ncm" : input.pathname.endsWith("/nbs") ? "nbs" : null;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.searchParams.get("data") || "");
    const validCode = codeType && new RegExp(`^\\d{${codeType === "ncm" ? 8 : 9}}$`).test(input.searchParams.get(codeType) || "");
    if (calculation ? input.searchParams.size !== 0
      : codeType ? input.searchParams.size !== 2 || !validDate || !validCode
      : input.searchParams.size && (input.searchParams.size !== 1 || !validDate)) {
      response.writeHead(400).end(); return;
    }
    const base = config[upstreamVariable];
    if (!base) { response.writeHead(503).end(); return; }
    try {
      let body;
      if (calculation) {
        if (!String(request.headers["content-type"] || "").startsWith("application/json")) {
          response.writeHead(415).end(); return;
        }
        const chunks = [];
        let length = 0;
        for await (const chunk of request) {
          length += chunk.length;
          if (length > MAX_INPUT_BYTES) { response.writeHead(413).end(); return; }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
        let parsed;
        try { parsed = JSON.parse(body.toString("utf8")); }
        catch { response.writeHead(400).end(); return; }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
          || !Array.isArray(parsed.itens) || parsed.itens.length < 1 || parsed.itens.length > 50) {
          response.writeHead(400).end(); return;
        }
      }
      const target = new URL(input.pathname + input.search, base);
      const result = await fetchImpl(target, { method: request.method, body,
        signal: AbortSignal.timeout(15_000), redirect: "error",
        headers: { accept: "application/json", ...(calculation ? { "content-type": "application/json" } : {}) } });
      if (!result.ok) { response.writeHead(502).end(); return; }
      if (Number(result.headers.get("content-length") || 0) > MAX_BYTES) { response.writeHead(502).end(); return; }
      const resultBody = await result.arrayBuffer();
      if (resultBody.byteLength > MAX_BYTES) { response.writeHead(502).end(); return; }
      response.writeHead(200, { "Content-Type": "application/json",
        ...(calculation && result.headers.get("x-warning-dados-simulados")
          ? { "x-warning-dados-simulados": result.headers.get("x-warning-dados-simulados") } : {}) }).end(Buffer.from(resultBody));
    } catch { response.writeHead(503).end(); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 8080);
  createGateway().listen(port, "0.0.0.0");
}
