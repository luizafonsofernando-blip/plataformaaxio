import fs from "node:fs";
import formidable from "formidable";
import JSZip from "jszip";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Metodo nao permitido." });
  }

  try {
    const { files } = await parseForm(request);
    const uploaded = firstFile(files.file);

    if (!uploaded) {
      return response.status(400).json({ error: "Envie um arquivo PDF ou Word." });
    }

    const fileName = uploaded.originalFilename || "comunicado";
    const buffer = fs.readFileSync(uploaded.filepath);
    const extension = fileName.toLowerCase().split(".").pop();
    const text = extension === "pdf"
      ? await extractPdfText(buffer)
      : extension === "docx"
        ? await extractDocxText(buffer)
        : "";

    if (!text.trim()) {
      return response.status(422).json({
        error: extension === "doc"
          ? "Arquivos .doc antigos nao sao suportados. Salve como .docx ou PDF e tente novamente."
          : "Nao foi possivel extrair texto deste arquivo. Verifique se ele possui texto selecionavel.",
      });
    }

    const normalized = normalizeDocumentText(text);

    return response.status(200).json({
      fileName,
      title: inferTitle(normalized, fileName),
      text: normalized,
      characters: normalized.length,
    });
  } catch (error) {
    console.error("Comunicados import failed", error);
    return response.status(500).json({
      error: "Nao foi possivel importar este arquivo. Verifique se ele esta integro e tente novamente.",
      detail: error instanceof Error ? error.message : "Erro desconhecido.",
    });
  }
}

function parseForm(request) {
  const form = formidable({
    maxFileSize: 30 * 1024 * 1024,
    multiples: false,
    filter(part) {
      return part.name === "file";
    },
  });

  return new Promise((resolve, reject) => {
    form.parse(request, (error, fields, files) => {
      if (error) reject(error);
      else resolve({ fields, files });
    });
  });
}

function firstFile(file) {
  return Array.isArray(file) ? file[0] : file;
}

async function extractPdfText(buffer) {
  ensurePdfEnvironment();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../pdf.worker.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(groupPdfItemsByLine(content.items));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages.join("\n\n");
}

function groupPdfItemsByLine(items) {
  const normalized = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];

  for (const item of normalized) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return "";

  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => paragraphText(match[0]))
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return paragraphs.join("\n\n");
}

function paragraphText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
    .map((match) => {
      if (match[0].startsWith("<w:tab")) return " ";
      if (match[0].startsWith("<w:br")) return "\n";
      return decodeXml(match[1] || "");
    })
    .join("");
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeDocumentText(value) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function inferTitle(text, fileName) {
  const titleLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 6 && line.length <= 90);

  return titleLine || fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function ensurePdfEnvironment() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }

      multiplySelf() { return this; }
      preMultiplySelf() { return this; }
      translateSelf() { return this; }
      scaleSelf() { return this; }
      rotateSelf() { return this; }
      invertSelf() { return this; }
      transformPoint(point = {}) {
        return {
          x: point.x ?? 0,
          y: point.y ?? 0,
          z: point.z ?? 0,
          w: point.w ?? 1,
        };
      }
    };
  }

  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }

  if (typeof globalThis.Path2D === "undefined") {
    globalThis.Path2D = class Path2D {};
  }
}
