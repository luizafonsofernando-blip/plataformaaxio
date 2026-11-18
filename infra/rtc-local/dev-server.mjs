import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import status from "../../api/rtc/status.js";
import classifications from "../../api/rtc/classifications.js";
import simplesActivities from "../../api/rtc/simples-activities.js";
import organizations from "../../api/rtc/organizations.js";
import companies from "../../api/rtc/companies.js";
import history from "../../api/rtc/history.js";
import audit from "../../api/rtc/audit.js";
import report from "../../api/rtc/report.js";
import localLogin from "../../api/rtc/local-login.js";
import drafts from "../../api/rtc/drafts.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const routes = new Map([
  ["/api/rtc/status", status], ["/api/rtc/classifications", classifications],
  ["/api/rtc/simples-activities", simplesActivities], ["/api/rtc/organizations", organizations],
  ["/api/rtc/companies", companies], ["/api/rtc/history", history],
  ["/api/rtc/audit", audit], ["/api/rtc/report", report],
  ["/api/rtc/local-login", localLogin],
  ["/api/rtc/drafts", drafts],
]);
const staticFiles = new Map([
  ["/reforma-tributaria/", ["index.html", "text/html; charset=utf-8"]],
  ["/reforma-tributaria/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/reforma-tributaria/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/reforma-tributaria/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

export function createRtcDevServer() {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    let url;
    try { url = new URL(request.url, "http://127.0.0.1:3000"); }
    catch { response.writeHead(400).end(); return; }
    if (url.pathname === "/") { response.writeHead(302, { Location: "/reforma-tributaria/" }).end(); return; }
    if (staticFiles.has(url.pathname) && request.method === "GET") {
      const [name, mime] = staticFiles.get(url.pathname);
      try {
        const body = await readFile(resolve(root, "reforma-tributaria", name));
        response.writeHead(200, { "Content-Type": mime }).end(body);
      } catch { response.writeHead(404).end(); }
      return;
    }
    const handler = routes.get(url.pathname);
    if (!handler) { response.writeHead(404).end(); return; }
    let length = 0;
    const chunks = [];
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 32768) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    try { request.body = length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
    catch { response.writeHead(400).end(); return; }
    request.query = Object.fromEntries(url.searchParams);
    response.status = (code) => { response.statusCode = code; return response; };
    response.json = (body) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(body));
      return response;
    };
    try { await handler(request, response); }
    catch (error) { console.error("RTC local API error", error); if (!response.headersSent) response.status(500).json({ code: "internal_error" }); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.env.RTC_LOCAL_MODE !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55321") {
    throw new Error("O servidor RTC local exige Supabase em 127.0.0.1:55321.");
  }
  createRtcDevServer().listen(3000, "127.0.0.1", () => console.log("RTC local: http://127.0.0.1:3000/reforma-tributaria/"));
}
