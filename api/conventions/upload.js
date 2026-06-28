import fs from "node:fs";
import formidable from "formidable";

export const config = {
  api: {
    bodyParser: false,
  },
};

const clauseTopics = [
  "vigencia",
  "piso salarial",
  "reajuste salarial",
  "vale alimentacao",
  "vale transporte",
  "plano de saude",
  "plano odontologico",
  "seguro de vida",
  "banco de horas",
  "hora extra",
  "adicional noturno",
  "contribuicoes sindicais",
];

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Metodo nao permitido." });
  }

  try {
    const { files } = await parseForm(request);
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!uploaded) {
      return response.status(400).json({ error: "PDF nao enviado." });
    }

    const buffer = fs.readFileSync(uploaded.filepath);
    const text = await extractPdfText(buffer);

    if (!text.trim()) {
      return response.status(422).json({
        error: "Nao foi possivel extrair texto deste PDF. Ele pode ser escaneado e exigir OCR.",
      });
    }

    const extraction = extractWithHeuristics(
      text.replace(/\s+/g, " ").trim(),
      uploaded.originalFilename || "convencao.pdf",
    );

    return response.status(200).json({
      agreementId: null,
      pdfPath: null,
      textCharacters: text.length,
      extraction,
    });
  } catch (error) {
    console.error("PDF upload failed", error);
    return response.status(500).json({
      error: "Nao foi possivel processar este PDF. Verifique se o arquivo esta integro e tente novamente.",
      detail: error instanceof Error ? error.message : "Erro desconhecido.",
    });
  }
}

function parseForm(request) {
  const form = formidable({
    maxFileSize: 25 * 1024 * 1024,
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
      pages.push(content.items.map((item) => item.str || "").join(" "));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages.join("\n");
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

      multiplySelf() {
        return this;
      }

      preMultiplySelf() {
        return this;
      }

      translateSelf() {
        return this;
      }

      scaleSelf() {
        return this;
      }

      rotateSelf() {
        return this;
      }

      invertSelf() {
        return this;
      }

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

function extractWithHeuristics(text, fileName) {
  const cnpjs = [...text.matchAll(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g)].map((item) => item[0]);
  const dates = [...text.matchAll(/\b(\d{2}\/\d{2}\/20\d{2})\b/g)].map((item) => toIsoDate(item[1]));
  const validity = extractValidity(text, dates);
  const state = match(text, /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  const mteRegistrationNumber =
    match(text, /(Registro\s+MTE|Numero\s+de\s+Registro)\D*([A-Z]{2}\d{4,6}\/\d{4})/i) ||
    match(text, /\b([A-Z]{2}\d{4,6}\/20\d{2})\b/);

  return {
    agreement: {
      title: fileName.replace(/\.pdf$/i, ""),
      category: extractCategory(text) || "A revisar",
      city: findNear(text, ["abrangencia", "municipio"]) || "A revisar",
      state: state || "UF",
      baseDate: extractBaseDate(text) || dates[0] || new Date().toISOString().slice(0, 10),
      startsAt: validity.startsAt,
      endsAt: validity.endsAt,
      employerUnion: findNear(text, ["sindicato patronal", "sindicato das empresas"]) || "A revisar",
      employerUnionCnpj: cnpjs[0] || "",
      laborUnion: findNear(text, ["sindicato laboral", "sindicato dos empregados"]) || "A revisar",
      laborUnionCnpj: cnpjs[1] || "",
      mteRegistrationNumber: mteRegistrationNumber || "",
      requestNumber: match(text, /\b(MR\d{5,8}\/20\d{2})\b/i),
      processNumber: match(text, /\b(\d{5}\.\d{6}\/20\d{2}-\d{2})\b/),
      registrationDate: dates[0],
      territorialCoverage: findNear(text, ["abrangencia territorial", "abrangencia"]) || "",
      executiveSummary:
        "Extracao automatica inicial. Revisar sindicatos, vigencia, pisos, beneficios e contribuicoes antes de vincular ou aplicar em rotinas trabalhistas.",
      source: "manual_upload",
      extractedAt: new Date().toISOString(),
      validatedAt: null,
      status: "em validacao",
    },
    clauses: clauseTopics.map((topic) => {
      const excerpt = findSnippet(text, topic);
      return {
        topic,
        title: titleForTopic(topic),
        summary: excerpt
          ? `Trecho identificado para ${topic}. Requer validacao humana antes de aplicacao.`
          : `Nao identificado no PDF importado. Revisar manualmente ${topic}.`,
        rawExcerpt: excerpt,
        confidence: excerpt ? 0.58 : 0,
        requiresReview: true,
      };
    }),
  };
}

function match(text, pattern) {
  const result = text.match(pattern);
  return result?.[2] || result?.[1] || "";
}

function findNear(text, labels) {
  const lower = text.toLowerCase();
  const label = labels.find((item) => lower.includes(item));
  if (!label) return "";
  const index = lower.indexOf(label);
  return text.slice(index + label.length, index + label.length + 140).split(/[.;\n]/)[0].trim();
}

function extractValidity(text, dates) {
  const fallback = sortedDateRange(dates);
  const patterns = [
    /vig[eê]ncia(?:\s+inicial|\s+final)?\D{0,80}(\d{2}\/\d{2}\/20\d{2})\D{0,80}(?:a|ate|até|-)\D{0,40}(\d{2}\/\d{2}\/20\d{2})/i,
    /per[ií]odo\s+de\s+vig[eê]ncia\D{0,80}(\d{2}\/\d{2}\/20\d{2})\D{0,80}(?:a|ate|até|-)\D{0,40}(\d{2}\/\d{2}\/20\d{2})/i,
    /de\s+(\d{2}\/\d{2}\/20\d{2})\s+(?:a|ate|até)\s+(\d{2}\/\d{2}\/20\d{2})/i,
  ];

  for (const pattern of patterns) {
    const result = text.match(pattern);
    if (result?.[1] && result?.[2]) {
      return sortedDateRange([toIsoDate(result[1]), toIsoDate(result[2])]);
    }
  }

  return fallback;
}

function sortedDateRange(dates) {
  const sorted = [...new Set(dates.filter(Boolean))]
    .sort((a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime());
  const today = new Date().toISOString().slice(0, 10);
  return {
    startsAt: sorted[0] || today,
    endsAt: sorted[sorted.length - 1] || sorted[0] || today,
  };
}

function extractBaseDate(text) {
  const result = text.match(/data[-\s]*base\D{0,40}(\d{2}\/\d{2}\/20\d{2})/i);
  return result?.[1] ? toIsoDate(result[1]) : "";
}

function extractCategory(text) {
  const patterns = [
    /categoria\(s\)\s+econ[oô]mica\(s\)\s*[–—-]\s*([^.;\n\r]+)/i,
    /categoria\(s\)\s+profissional\(is\)\s*[–—-]\s*([^.;\n\r]+)/i,
    /categorias?\s+econ[oô]micas?\s*[–—-]\s*([^.;\n\r]+)/i,
    /categorias?\s+profissionais?\s*[–—-]\s*([^.;\n\r]+)/i,
  ];

  for (const pattern of patterns) {
    const result = text.match(pattern);
    if (result?.[1]) return cleanExtractedText(result[1]);
  }

  return cleanExtractedText(findNear(text, ["categoria economica", "categoria profissional"]));
}

function cleanExtractedText(value = "") {
  return value
    .replace(/\s+/g, " ")
    .replace(/^(?:[-–—:]\s*)+/, "")
    .replace(/\s+(?:com\s+abrangencia|abranger[aá]|abrangera|em\s+todo).*$/i, "")
    .trim();
}

function findSnippet(text, topic) {
  const aliases = {
    "piso salarial": ["piso salarial", "salario normativo"],
    "reajuste salarial": ["reajuste salarial", "correcao salarial", "reajustes/correcoes salariais"],
    "vale alimentacao": ["vale alimentacao", "auxilio alimentacao", "ticket"],
    "vale transporte": ["vale transporte"],
    "plano de saude": ["plano de saude", "assistencia medica"],
    "plano odontologico": ["plano odontologico", "assistencia odontologica"],
    "seguro de vida": ["seguro de vida"],
    "banco de horas": ["banco de horas"],
    "hora extra": ["hora extra", "horas extras"],
    "adicional noturno": ["adicional noturno"],
    "contribuicoes sindicais": ["contribuicao sindical", "contribuicoes sindicais", "taxa negocial"],
    vigencia: ["vigencia", "vigencia inicial", "vigencia final", "periodo de vigencia"],
  };
  const lower = text.toLowerCase();
  const alias = aliases[topic]?.find((item) => lower.includes(item));
  if (!alias) return "";
  const index = lower.indexOf(alias);
  return text.slice(Math.max(0, index - 80), index + 420).trim();
}

function titleForTopic(topic) {
  return topic
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toIsoDate(value) {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}
