import { sendMail } from "./mail.js";

const DEFAULT_SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const MAX_BODY_BYTES = 400_000;

function json(response, status, body) {
  response.status(status).setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.json(body);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  return /^https:\/\/plataformaaxio(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pdfEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text, maxChars = 92) {
  const lines = [];
  for (const paragraph of String(text || "").split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line.length + word.length + 1) <= maxChars) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    lines.push("");
  }
  return lines;
}

function pdfObject(id, content) {
  return `${id} 0 obj\n${content}\nendobj\n`;
}

function buildTextPdf({ title, text }) {
  const safeTitle = String(title || "Briefing Onboarding Contabil").slice(0, 120);
  const lines = wrapText(`${safeTitle}\n\n${text || "Documento sem conteudo."}`);
  const pages = [];
  const lineHeight = 14;
  const firstY = 780;
  const bottomY = 52;
  for (let i = 0; i < lines.length; i += Math.floor((firstY - bottomY) / lineHeight)) {
    pages.push(lines.slice(i, i + Math.floor((firstY - bottomY) / lineHeight)));
  }

  const objects = [
    pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    "",
    pdfObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  const pageObjectIds = [];
  let nextId = 4;

  pages.forEach((pageLines, pageIndex) => {
    const contentId = nextId;
    const pageId = nextId + 1;
    nextId += 2;
    pageObjectIds.push(pageId);
    const commands = ["BT", "/F1 10 Tf", "50 780 Td"];
    pageLines.forEach((line, index) => {
      if (index > 0) commands.push(`0 -${lineHeight} Td`);
      commands.push(`(${pdfEscape(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    objects.push(pdfObject(contentId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
    objects.push(pdfObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`));
  });

  objects[1] = pdfObject(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`);
  const header = "%PDF-1.4\n";
  let body = "";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(header + body));
    body += object;
  });
  const xrefOffset = Buffer.byteLength(header + body);
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
  ].join("\n");
  const trailer = `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(header + body + xref + trailer);
}

function filenameFromTitle(title) {
  const base = String(title || "briefing-onboarding")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "briefing-onboarding";
  return `${base}.pdf`;
}

async function supabaseUser(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Metodo nao permitido." });
  if (!isAllowedOrigin(String(request.headers.origin || ""))) {
    return json(response, 403, { error: "Origem nao autorizada." });
  }
  if (Number(request.headers["content-length"] || "0") > MAX_BODY_BYTES) {
    return json(response, 413, { error: "Documento muito grande para envio por e-mail." });
  }

  const accessToken = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json(response, 401, { error: "Sessao obrigatoria." });

  const user = await supabaseUser(accessToken);
  if (!user?.email) return json(response, 401, { error: "Sessao invalida." });
  if (["pending", "activation_pending"].includes(user.app_metadata?.status)) {
    return json(response, 403, { error: "Conta ainda nao liberada." });
  }

  const title = String(request.body?.title || "Briefing Onboarding Contabil").slice(0, 140);
  const html = String(request.body?.html || "");
  const serial = String(request.body?.serial || "").slice(0, 80);
  const text = stripHtml(html).slice(0, 120_000);
  const pdf = buildTextPdf({ title, text });

  await sendMail({
    to: user.email,
    subject: `Copia do briefing salvo - ${title}`,
    html: `<p>Segue em anexo a copia em PDF do briefing salvo no Onboarding Contabil.</p>${serial ? `<p>Serie: ${escapeHtml(serial)}</p>` : ""}`,
    attachments: [{
      filename: filenameFromTitle(title),
      content: pdf.toString("base64"),
    }],
  });

  return json(response, 200, { message: "Copia enviada por e-mail." });
}
