import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROUTES = new Map([
  ["/api/calculadora/dados-abertos/versao", "RTC_REGULAR_UPSTREAM"],
  ["/api/calculadora/dados-abertos/situacoes-tributarias/cbs-ibs", "RTC_REGULAR_UPSTREAM"],
  ["/api/versao", "RTC_SIMPLES_UPSTREAM"],
  ["/api/calculadora/simples-nacional/atividades", "RTC_SIMPLES_UPSTREAM"],
  ["/health/ready", "RTC_DANFSE_UPSTREAM"],
]);
const MAX_BYTES = 5_000_000;

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
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    if (!authorized(request.headers.authorization, config.RTC_GATEWAY_TOKEN)) { response.writeHead(401).end(); return; }
    let input;
    try { input = new URL(request.url, "http://gateway.internal"); }
    catch { response.writeHead(400).end(); return; }
    const upstreamVariable = ROUTES.get(input.pathname);
    if (!upstreamVariable) { response.writeHead(404).end(); return; }
    if (input.searchParams.size && (input.searchParams.size !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(input.searchParams.get("data") || ""))) {
      response.writeHead(400).end(); return;
    }
    const base = config[upstreamVariable];
    if (!base) { response.writeHead(503).end(); return; }
    try {
      const target = new URL(input.pathname + input.search, base);
      const result = await fetchImpl(target, { signal: AbortSignal.timeout(7_000), redirect: "error", headers: { accept: "application/json" } });
      if (!result.ok) { response.writeHead(502).end(); return; }
      if (Number(result.headers.get("content-length") || 0) > MAX_BYTES) { response.writeHead(502).end(); return; }
      const body = await result.arrayBuffer();
      if (body.byteLength > MAX_BYTES) { response.writeHead(502).end(); return; }
      response.writeHead(200, { "Content-Type": "application/json" }).end(Buffer.from(body));
    } catch { response.writeHead(503).end(); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 8080);
  createGateway().listen(port, "0.0.0.0");
}
