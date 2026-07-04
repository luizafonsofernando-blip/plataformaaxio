import fs from "node:fs";
import formidable from "formidable";
import * as XLSX from "xlsx";

export const config = {
  api: {
    bodyParser: false,
  },
};

const DECIMAL_DIGITS = 4;
const DECIMAL_SCALE = 10 ** DECIMAL_DIGITS;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Metodo nao permitido." });
  }

  try {
    const { fields, files } = await parseForm(request);
    const pdfFile = firstFile(files.pdf);
    const sheetFile = firstFile(files.sheet);

    if (!pdfFile || !sheetFile) {
      return response.status(400).json({ error: "Envie o PDF da folha e a planilha de fatos geradores." });
    }

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const sheetBuffer = fs.readFileSync(sheetFile.filepath);
    const monthlyFloor = parseBrNumber(firstField(fields.monthlyFloor));
    const hourlyFloor = parseBrNumber(firstField(fields.hourlyFloor));
    const pdfData = await parsePdfReport(pdfBuffer);
    const sheetData = parseSheetReport(sheetBuffer, sheetFile.originalFilename || "planilha.xlsx");
    const pdfLaunches = sheetData.limitToSheetEvents
      ? pdfData.launches.filter((item) => sheetData.eventKeys.has(item.event))
      : pdfData.launches;
    const result = compareReports(pdfLaunches, sheetData.launches, pdfData.people, sheetData.people);
    result.differences.push(...buildSalaryFloorDifferences(pdfData.salaries, monthlyFloor, hourlyFloor));
    result.differences.sort((a, b) => `${a.employee} ${a.event}`.localeCompare(`${b.employee} ${b.event}`));

    return response.status(200).json({
      files: {
        pdf: pdfFile.originalFilename,
        sheet: sheetFile.originalFilename,
      },
      ...result,
    });
  } catch (error) {
    console.error("Review Folha compare failed", error);
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Nao foi possivel comparar os arquivos.",
    });
  }
}

function parseForm(request) {
  const form = formidable({
    maxFileSize: 35 * 1024 * 1024,
    multiples: false,
    filter(part) {
      return ["pdf", "sheet"].includes(part.name);
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

function firstField(field) {
  return Array.isArray(field) ? field[0] : field;
}

async function parsePdfReport(buffer) {
  ensurePdfEnvironment();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../pdf.worker.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const document = await loadingTask.promise;
  const launches = [];
  const people = new Map();
  const salaries = new Map();
  let currentId = "";
  let currentName = "";

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = groupPdfItemsByLine(content.items);

      for (const line of lines) {
        const text = line.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
        const employee =
          text.match(/EMPREGADO:\s*(\d+)\s*-\s*(.+?)(?:\s+Cargo:|\s+\d{4}\s*-|$)/i) ||
          text.match(/^(\d{1,6})\s+(.+?)\s+\d+\s+\d+\s+Admiss\S*o\b.*?Sal\S*rio base\s+([\d.,]+).*?Horas mensais:\s*([\d.,]+)/i);
        if (employee) {
          currentId = canonicalEmployeeId(employee[1]);
          currentName = employee[2].replace(/\s+/g, " ").trim();
          people.set(currentId, { id: currentId, name: currentName });
          if (employee[3]) {
            const value = parseBrNumber(employee[3]);
            if (value !== null) {
              salaries.set(currentId, {
                employee_id: currentId,
                employee: currentName,
                salary: value,
                salary_type: value < 200 ? "horista" : "mensalista",
                row_info: `Pagina ${pageNumber}`,
              });
            }
          }
          continue;
        }

        if (!currentId) continue;
        if (/^PROVENTOS\s+DESCONTOS/i.test(text)) {
          currentId = "";
          currentName = "";
          continue;
        }
        if (/^(Total\s|Base\s|Folha\s|F\S*rias\s|ORTECONTE\b)/i.test(text)) continue;

        const salary = text.match(/Sal\S*rio:\s*([\d.,]+)/i);
        if (salary) {
          const value = parseBrNumber(salary[1]);
          if (value !== null) {
            salaries.set(currentId, {
              employee_id: currentId,
              employee: currentName,
              salary: value,
              salary_type: value < 200 ? "horista" : "mensalista",
              row_info: `Pagina ${pageNumber}`,
            });
          }
        }

        if (text.startsWith("Total ")) continue;

        const starts = [];
        line.items.forEach((item, index) => {
          const next = line.items[index + 1]?.str || "";
          if (
            /^\d{1,5}\s*-/.test(item.str) ||
            (/^\d{1,5}$/.test(item.str) && (next === "-" || /[^\d\s.,:()/-]/.test(next)))
          ) {
            starts.push(index);
          }
        });

        if (!starts.length) {
          const parsed = parsePdfEntry(text);
          if (parsed) {
            const category = pdfCategory(line.items[0]?.x ?? 0);
            if (category !== "Base" && !isIgnoredPayrollEvent(parsed.code, parsed.description)) {
              launches.push({
                source: "PDF",
                employee_id: currentId,
                employee: currentName,
                code: parsed.code,
                description: parsed.description,
                event: eventKey(parsed.code, parsed.description),
                reference: parsed.reference,
                amount: parsed.amount,
                row_info: `Pagina ${pageNumber}`,
              });
            }
          }
          continue;
        }

        for (let index = 0; index < starts.length; index += 1) {
          const start = starts[index];
          const end = starts[index + 1] ?? line.items.length;
          const segment = line.items.slice(start, end).map((item) => item.str).join(" ");
          const parsed = parsePdfEntry(segment);
          if (!parsed) continue;
          const category = pdfCategory(line.items[start].x);
          if (category === "Base" || isIgnoredPayrollEvent(parsed.code, parsed.description)) continue;
          launches.push({
            source: "PDF",
            employee_id: currentId,
            employee: currentName,
            code: parsed.code,
            description: parsed.description,
            event: eventKey(parsed.code, parsed.description),
            reference: parsed.reference,
            amount: parsed.amount,
            row_info: `Pagina ${pageNumber}`,
          });
        }
      }

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  if (!people.size && !launches.length) {
    throw new Error("Nao foi possivel extrair lancamentos do PDF. Verifique se ele possui texto selecionavel.");
  }

  return { launches, people, salaries };
}

function groupPdfItemsByLine(items) {
  const normalized = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str.trim(),
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

  return lines.map((line) => ({ ...line, items: line.items.sort((a, b) => a.x - b.x) }));
}

function parsePdfEntry(segment) {
  const text = segment.replace(/\s+/g, " ").trim();
  let match = text.match(/^(\d{1,5})\s*-?\s*(.+?)\s+([\d.,():]+)(?:\s+([\d.,():]+))?$/);
  if (!match) {
    match = text.match(/^(\d{1,5})\s*-?\s*(.+)$/);
    if (!match) return null;
    return { code: match[1], description: match[2].trim(), reference: null, amount: null };
  }
  const [, code, description, first, second] = match;
  if (second === undefined) return { code, description: description.trim(), reference: null, amount: parseBrNumber(first) };
  const event = { kind: referenceKind(code, description) };
  return { code, description: description.trim(), reference: parseReferenceNumber(first, event), amount: parseBrNumber(second) };
}

function pdfCategory(x) {
  if (x < 230) return "Vencimento";
  if (x < 400) return "Desconto";
  return "Base";
}

function parseSheetReport(buffer, fileName) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const simpleReport = parseSimpleLaunchSheet(rows);
  if (simpleReport) return simpleReport;

  const eventRowIndex = rows.findIndex((row) => row.some((cell) => /\d{3}\.\d{3}\s*-/.test(String(cell))));

  if (eventRowIndex < 0) {
    throw new Error(`Nao encontrei a linha de rubricas na planilha ${fileName}.`);
  }

  const events = [];
  rows[eventRowIndex].forEach((cell, column) => {
    const text = String(cell).trim();
    if (/\d{3}\.\d{3}\s*-/.test(text)) {
      const [code, ...rest] = text.split("-");
      const description = rest.join("-").trim().replace(/\.$/, "");
      events.push({ column, code: code.trim(), description, kind: referenceKind(code, description) });
    }
  });

  const launches = [];
  const people = new Map();
  for (let index = eventRowIndex + 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row?.[0]) continue;
    const [employeeId, employee] = splitEmployee(String(row[0]));
    if (!employeeId && !employee) continue;
    const canonicalId = canonicalEmployeeId(employeeId);
    people.set(canonicalId || normalize(employee), { id: canonicalId, name: employee });

    for (const event of events) {
      if (isDiscountEvent(event.code, event.description)) continue;
      const amount = parseBrNumber(row[event.column]);
      const reference = parseReferenceNumber(row[event.column + 2], event);
      if (amount === null && reference === null) continue;
      launches.push({
        source: "Planilha",
        employee_id: canonicalId,
        employee,
        code: event.code,
        description: event.description,
        event: eventKey(event.code, event.description),
        reference,
        amount,
        row_info: `Linha ${index + 1}`,
      });
    }
  }

  return { launches, people, limitToSheetEvents: false, eventKeys: new Set(launches.map((item) => item.event)) };
}

function parseSimpleLaunchSheet(rows) {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalize(cell));
    return normalized.includes("CODIGO") && normalized.includes("NOME");
  });
  if (headerIndex < 0) return null;

  const headers = rows[headerIndex].map((cell) => normalize(cell));
  const codeColumn = headers.indexOf("CODIGO");
  const nameColumn = headers.indexOf("NOME");
  if (codeColumn < 0 || nameColumn < 0) return null;

  const eventColumns = rows[headerIndex]
    .map((cell, column) => ({ column, event: simpleSheetEvent(cell) }))
    .filter((item) => item.event);
  if (!eventColumns.length) return null;

  const launches = [];
  const people = new Map();

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rawId = String(row?.[codeColumn] ?? "").trim();
    const employee = String(row?.[nameColumn] ?? "").replace(/\s+/g, " ").trim();
    const employeeId = canonicalEmployeeId(rawId);
    if (!employeeId && !employee) continue;
    people.set(employeeId || normalize(employee), { id: employeeId, name: employee });

    for (const { column, event } of eventColumns) {
      const parsed = parseSimpleSheetValue(row[column], event);
      if (!parsed) continue;
      launches.push({
        source: "Planilha",
        employee_id: employeeId,
        employee,
        code: event.code,
        description: event.description,
        event: eventKey(event.code, event.description),
        reference: parsed.reference,
        amount: parsed.amount,
        row_info: `Linha ${index + 1}`,
      });
    }
  }

  return {
    launches,
    people,
    limitToSheetEvents: true,
    eventKeys: new Set(eventColumns.map(({ event }) => eventKey(event.code, event.description))),
  };
}

function simpleSheetEvent(value) {
  const header = normalize(value);
  if (!header || header.includes("QTD COLUNAS") || header.includes("LAYOUT") || header.includes("CODCONTINTERM")) return null;
  if (header.includes("HE 100")) return { code: "613", description: "Horas extras 100%", kind: "reference-hours" };
  if (header.includes("FALTAS") && header.includes("DIAS")) return { code: "703", description: "Faltas nao justificadas dias", kind: "absence-days" };
  if (header.includes("FALTAS") && header.includes("HORAS")) return { code: "723", description: "Faltas nao justificadas horas", kind: "reference-hours" };
  if (header === "VALE") return { code: "872", description: "Vale", kind: "amount" };
  return null;
}

function parseSimpleSheetValue(value, event) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^\/?\s*\/?\s*\/?$/.test(text) || /^0(?:[,.]0+)?$/.test(text)) return null;
  if (event.kind === "absence-days") return { reference: 1, amount: null };
  if (event.kind === "amount") {
    const amount = parseBrNumber(value);
    return amount === null ? null : { reference: null, amount };
  }
  const reference = parseReferenceNumber(value, event);
  return reference === null ? null : { reference, amount: null };
}

function compareReports(pdfLaunches, sheetLaunches, pdfPeople, sheetPeople) {
  const pdf = summarize(pdfLaunches);
  const sheet = summarize(sheetLaunches);
  const differences = [];
  const keys = new Set([...pdf.keys(), ...sheet.keys()]);

  for (const key of [...keys].sort()) {
    const pdfItem = pdf.get(key);
    const sheetItem = sheet.get(key);
    let status = "";
    let amountDiff = 0;
    let refDiff = 0;
    let criterion = "valor";

    if (!pdfItem) {
      criterion = compareByQuantity(sheetItem) ? "quantidade" : "valor";
      amountDiff = decimalDiff(0, sheetItem.has_amount ? sheetItem.amount : 0);
      refDiff = decimalDiff(0, sheetItem.has_reference ? sheetItem.reference : 0);
      status = "Rubrica somente na planilha";
    } else if (!sheetItem) {
      criterion = compareByQuantity(pdfItem) ? "quantidade" : "valor";
      amountDiff = decimalDiff(pdfItem.has_amount ? pdfItem.amount : 0, 0);
      refDiff = decimalDiff(pdfItem.has_reference ? pdfItem.reference : 0, 0);
      status = "Rubrica somente no PDF";
    } else {
      amountDiff = decimalDiff(pdfItem.has_amount ? pdfItem.amount : 0, sheetItem.has_amount ? sheetItem.amount : 0);
      refDiff = decimalDiff(pdfItem.has_reference ? pdfItem.reference : 0, sheetItem.has_reference ? sheetItem.reference : 0);
      criterion = compareByQuantity(pdfItem, sheetItem) ? "quantidade" : "valor";
      const relevantDiff = criterion === "quantidade" ? refDiff : amountDiff;
      if (toScaledInteger(relevantDiff) === 0) continue;
      status = criterion === "quantidade" ? "Quantidade divergente" : "Valor divergente";
    }

    differences.push({
      status,
      employee: (pdfItem || sheetItem).employee,
      employee_id: (pdfItem || sheetItem).employee_id,
      event: (pdfItem || sheetItem).event,
      pdf_code: pdfItem?.codes || "",
      sheet_code: sheetItem?.codes || "",
      pdf_desc: pdfItem?.descriptions || "",
      sheet_desc: sheetItem?.descriptions || "",
      pdf_ref: pdfItem?.has_reference ? pdfItem.reference : null,
      sheet_ref: sheetItem?.has_reference ? sheetItem.reference : null,
      pdf_amount: pdfItem?.has_amount ? pdfItem.amount : null,
      sheet_amount: sheetItem?.has_amount ? sheetItem.amount : null,
      amount_diff: amountDiff,
      ref_diff: refDiff,
      criterion,
      pdf_rows: pdfItem?.rows || "",
      sheet_rows: sheetItem?.rows || "",
      severity: "atencao",
    });
  }

  return {
    pdf_count: pdfLaunches.length,
    sheet_count: sheetLaunches.length,
    pdf_people: pdfPeople.size,
    sheet_people: sheetPeople.size,
    people_only_pdf: [...pdfPeople.entries()]
      .filter(([key]) => !sheetPeople.has(key))
      .map(([, value]) => value)
      .sort(sortPeople),
    people_only_sheet: [...sheetPeople.entries()]
      .filter(([key]) => !pdfPeople.has(key))
      .map(([, value]) => value)
      .sort(sortPeople),
    differences,
  };
}

function summarize(launches) {
  const grouped = new Map();
  for (const item of launches) {
    const key = `${item.employee_id || normalize(item.employee)}::${item.event}`;
    const record = grouped.get(key) || {
      employee_id: item.employee_id,
      employee: item.employee,
      event: item.event,
      codes: new Set(),
      descriptions: new Set(),
      amount: 0,
      amount_scaled: 0,
      reference: 0,
      reference_scaled: 0,
      has_amount: false,
      has_reference: false,
      rows: new Set(),
    };
    record.codes.add(item.code);
    record.descriptions.add(item.description);
    if (item.amount !== null) {
      record.amount_scaled += toScaledInteger(item.amount);
      record.has_amount = true;
    }
    if (item.reference !== null) {
      record.reference_scaled += toScaledInteger(item.reference);
      record.has_reference = true;
    }
    record.rows.add(item.row_info);
    grouped.set(key, record);
  }

  for (const record of grouped.values()) {
    record.amount = record.amount_scaled / DECIMAL_SCALE;
    record.reference = record.reference_scaled / DECIMAL_SCALE;
    delete record.amount_scaled;
    delete record.reference_scaled;
    record.codes = [...record.codes].sort().join(", ");
    record.descriptions = [...record.descriptions].sort().join(" / ");
    record.rows = [...record.rows].sort().join(", ");
  }

  return grouped;
}

function compareByQuantity(...items) {
  return items.some((item) => {
    if (!item) return false;
    const text = normalize(`${item.codes || ""} ${item.descriptions || ""} ${item.event || ""}`);
    const isQuantityEvent =
      (text.includes("HORA") && text.includes("EXTRA")) ||
      text.includes("ADICIONAL NOTURNO") ||
      text.includes("FALTA") ||
      text.includes("FALTAS");
    return item.has_reference && (isQuantityEvent || !item.has_amount);
  });
}

function buildSalaryFloorDifferences(salaries, monthlyFloor, hourlyFloor) {
  const differences = [];
  for (const salary of salaries.values()) {
    const floor = salary.salary_type === "horista" ? hourlyFloor : monthlyFloor;
    if (floor === null || toScaledInteger(salary.salary) >= toScaledInteger(floor)) continue;
    differences.push({
      status: "Piso salarial abaixo do informado",
      employee: salary.employee,
      employee_id: salary.employee_id,
      event: `SALARIO ${salary.salary_type.toUpperCase()}`,
      pdf_code: "",
      sheet_code: "",
      pdf_desc: `Salario ${salary.salary_type}`,
      sheet_desc: "Piso informado",
      pdf_ref: null,
      sheet_ref: null,
      pdf_amount: salary.salary,
      sheet_amount: floor,
      amount_diff: decimalDiff(salary.salary, floor),
      ref_diff: 0,
      criterion: "valor",
      pdf_rows: salary.row_info,
      sheet_rows: "",
      severity: "critico",
    });
  }
  return differences;
}

function splitEmployee(text) {
  const match = text.match(/\s*(\d+)\s*-\s*(.+?)\s*$/);
  if (!match) return ["", text.trim()];
  return [canonicalEmployeeId(match[1]), match[2].replace(/\s+/g, " ").trim()];
}

function canonicalEmployeeId(value) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits || "";
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eventKey(code, description) {
  let desc = normalize(description)
    .replaceAll("HORAS EXTRAS", "HORA EXTRA")
    .replaceAll("COMISSOES", "COMISSAO")
    .replaceAll("DESC FALTAS HRS", "FALTAS HORAS")
    .replaceAll("FALTAS NAO JUSTIFICADAS HORAS", "FALTAS HORAS")
    .replaceAll("FALTAS NAO JUSTIFICADAS DIAS", "FALTAS DIAS")
    .replace(/\bS\b|\bDE\b|\bDA\b|\bDO\b|\bDAS\b|\bDOS\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return desc || normalize(code);
}

function isDiscountEvent(code, description) {
  const words = normalize(`${code} ${description}`).split(" ");
  return ["DESCONTO", "DESC", "INSS", "IRRF", "ADTO", "ADIANTAMENTO"].some((term) =>
    words.includes(term),
  );
}

function isIgnoredPayrollEvent(code, description) {
  const words = normalize(`${code} ${description}`).split(" ");
  return ["INSS", "IRRF"].some((term) => words.includes(term));
}

function referenceKind(code, description) {
  const text = normalize(`${code} ${description}`);
  if (text.includes("FALTAS") && text.includes("HORAS")) return "reference-hours";
  if (text.includes("HORA") && text.includes("EXTRA")) return "reference-hours";
  if (text.includes("ADICIONAL NOTURNO")) return "reference-hours";
  return "reference";
}

function parseReferenceNumber(value, event) {
  if (event?.kind === "reference-hours") return parseHourReference(value);
  return parseBrNumber(value);
}

function parseHourReference(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    if (Number.isInteger(value) && Math.abs(value) >= 100) return signedNumber(parseCompactHourReference(value), value < 0);
    return value;
  }

  const text = String(value).trim();
  if (!text) return null;
  const negative = text.startsWith("-") || (text.startsWith("(") && text.endsWith(")"));
  const cleaned = text.replace(/[()]/g, "").replace(/^-/, "").trim();
  const separated = cleaned.match(/^(\d{1,3})[.,:](\d{2})$/);
  if (separated) {
    return signedNumber(Number(`${Number(separated[1])}.${separated[2]}`), negative);
  }
  const decimalReference = cleaned.match(/^(\d{1,3})[.,](\d{1,4})$/);
  if (decimalReference) {
    return signedNumber(Number(`${Number(decimalReference[1])}.${decimalReference[2]}`), negative);
  }
  if (/[.,]/.test(cleaned)) {
    const decimalValue = parseBrNumber(value);
    return decimalValue === null ? null : signedNumber(Math.abs(decimalValue), negative || decimalValue < 0);
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length <= 5) {
    const compact = parseCompactHourReference(Number(digits));
    return compact === null ? null : signedNumber(compact, negative);
  }

  return parseBrNumber(value);
}

function parseCompactHourReference(value) {
  const digits = String(Math.abs(value));
  if (digits.length < 3) return value;
  const minutes = Number(digits.slice(-2));
  const hours = Number(digits.slice(0, -2));
  if (!Number.isFinite(hours) || minutes >= 60) return value;
  return Number(`${hours}.${String(minutes).padStart(2, "0")}`);
}

function signedNumber(value, negative) {
  return negative ? -value : value;
}

function parseBrNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  let text = String(value).trim();
  if (!text) return null;
  const timeReference = text.match(/^(\d{1,3}):(\d{2})$/);
  if (timeReference) return Number(`${Number(timeReference[1])}.${timeReference[2]}`);
  const negative = text.startsWith("(") && text.endsWith(")");
  text = normalizeNumberText(text);
  if (!text || text === "-" || text === ".") return null;
  const number = Number(text);
  if (Number.isNaN(number)) return null;
  return negative ? -number : number;
}

function normalizeNumberText(value) {
  let text = String(value)
    .replace(/[()]/g, "")
    .replace(/[^0-9,.-]/g, "")
    .trim();
  if (!text) return "";
  const sign = text.startsWith("-") ? "-" : "";
  text = text.replace(/-/g, "");
  const commaIndex = text.lastIndexOf(",");
  const dotIndex = text.lastIndexOf(".");

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    return `${sign}${text.replaceAll(thousandSeparator, "").replace(decimalSeparator, ".")}`;
  }

  if (commaIndex >= 0) return `${sign}${text.replace(/\./g, "").replace(",", ".")}`;

  if (dotIndex >= 0) {
    const dotCount = (text.match(/\./g) || []).length;
    const decimalDigits = text.length - dotIndex - 1;
    if (dotCount === 1 && decimalDigits > 0 && decimalDigits <= 2) return `${sign}${text}`;
    return `${sign}${text.replace(/\./g, "")}`;
  }

  return `${sign}${text}`;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function decimalDiff(left, right) {
  return (toScaledInteger(left) - toScaledInteger(right)) / DECIMAL_SCALE;
}

function toScaledInteger(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  if (!text) return 0;
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [integerPart = "0", decimalPart = ""] = unsigned.split(".");
  const integer = Number(integerPart.replace(/\D/g, "") || 0);
  const decimals = `${decimalPart.replace(/\D/g, "")}${"0".repeat(DECIMAL_DIGITS)}`.slice(0, DECIMAL_DIGITS);
  const scaled = integer * DECIMAL_SCALE + Number(decimals || 0);
  return negative ? -scaled : scaled;
}

function sortPeople(a, b) {
  return a.name.localeCompare(b.name);
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
