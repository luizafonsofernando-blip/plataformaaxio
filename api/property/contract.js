import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const templateByType = {
  comercial: "contrato-locacao-comercial.docx",
  residencial: "contrato-locacao-residencial.docx"
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ message: "Metodo nao permitido." });
  }

  try {
    const input = request.body || {};
    const type = input.type === "comercial" ? "comercial" : "residencial";
    const templatePath = path.join(process.cwd(), "api", "property", "templates", templateByType[type]);
    const buffer = await fs.readFile(templatePath);
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("Template DOCX invalido.");

    let xml = await documentFile.async("string");
    xml = fillTemplate(xml, input, type);
    zip.file("word/document.xml", xml);

    const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const filename = `contrato-${safeName(input.property?.code || input.tenant?.name || "locacao")}.docx`;
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).send(output);
  } catch (error) {
    console.error("Property contract generation failed", error);
    return response.status(500).json({ message: "Nao foi possivel gerar o contrato." });
  }
}

function fillTemplate(xml, input, type) {
  const landlord = input.landlord || {};
  const tenant = input.tenant || {};
  const property = input.property || {};
  const contract = input.contract || {};
  const landlordDoc = landlord.taxId || input.entity?.taxId || "";
  const tenantDoc = tenant.taxId || "";
  const propertyAddress = [property.address, property.city && property.state ? `${property.city}/${property.state}` : ""].filter(Boolean).join(", ");
  const start = brDate(contract.startsOn);
  const end = brDate(contract.endsOn);
  const amount = brl(contract.monthlyValue || property.suggestedRent || 0);
  const amountWords = `${amount} (${amount.replace("R$", "reais")})`;
  const term = `${contract.termMonths || 12} meses`;
  const dueDay = String(contract.dueDay || "__");
  const purpose = type === "comercial" ? "atividade comercial informada pelo LOCATARIO" : "moradia residencial";

  const common = [
    ["[ENDEREÇO COMPLETO DO IMÓVEL COMERCIAL: rua, número, complemento, bairro, município, UF, CEP]", propertyAddress],
    ["[ENDEREÇO COMPLETO DO IMÓVEL: rua, número, apartamento/casa, bloco, bairro, município, UF, CEP]", propertyAddress],
    ["[DESCREVER FINALIDADE COMERCIAL: escritório, loja, restaurante, clínica, etc.]", purpose],
    ["[DESCREVER área total, área privativa, número de salas, vagas de garagem, depósitos, etc.]", property.notes || property.type || "conforme cadastro do imovel"],
    ["[DESCREVER: tipo (apartamento/casa/sobrado), área total, área privativa, número de quartos, banheiros, salas, vagas de garagem, depósito, etc.]", property.notes || property.type || "conforme cadastro do imovel"],
    ["[NÚMERO]", property.registryNumber || ""],
    ["[CARTÓRIO DE REGISTRO DE IMÓVEIS / COMARCA]", contract.forum || `${property.city || ""}/${property.state || ""}`],
    ["[XX (EXTENSO)]", term],
    ["[30 (trinta)]", term],
    ["[0.000,00]", amount],
    ["[VALOR POR EXTENSO]", amountWords],
    ["[__]", dueDay],
    ["[boleto bancário / transferência bancária / PIX]", contract.paymentMethod || "PIX"],
    ["[IGPM-FGV / IPCA-IBGE / IPC-FIPE]", contract.reajustmentIndex || "IPCA"],
    ["[IGP-M/FGV / IPCA/IBGE / IPC/FIPE]", contract.reajustmentIndex || "IPCA"],
    ["[MUNICÍPIO – UF]", contract.forum || `${property.city || ""}/${property.state || ""}`],
    ["[ESCOLHER UMA]", contract.guaranteeType || "sem-garantia"],
    ["[MARCAR APENAS UMA]", contract.guaranteeType || "sem-garantia"],
    ["[NOME DO FIADOR]", ""],
    ["[000.000.000-00]", ""],
    ["[CASADO(A) / SOLTEIRO(A)]", ""],
    ["[RUA, Nº, COMPLEMENTO, BAIRRO, MUNICÍPIO – UF, CEP]", ""],
    ["[NOME, CPF — anuência obrigatória]", ""],
    ["[NOME COMPLETO, CPF — anuência no próprio bem de família]", ""]
  ];

  for (const [placeholder, value] of common) {
    xml = replaceAllText(xml, placeholder, value);
  }

  xml = replaceFirstText(xml, "[DD/MM/AAAA]", start);
  xml = replaceFirstText(xml, "[DD/MM/AAAA]", end);
  xml = replaceAllText(xml, "[DD/MM/AAAA]", start);

  if (type === "residencial") {
    xml = replaceFirstText(xml, "[RAZÃO SOCIAL]", landlord.name || input.entity?.displayName || "");
    xml = replaceFirstText(xml, "[CNPJ]", landlordDoc);
    xml = replaceFirstText(xml, "[endereço completo]", landlord.address || "");
    xml = replaceFirstText(xml, "[CEP]", property.zipCode || "");
    xml = replaceFirstText(xml, "[Cidade/UF]", `${property.city || ""}/${property.state || ""}`);
    xml = replaceFirstText(xml, "[NOME DO REPRESENTANTE]", landlord.name || "");
    xml = replaceFirstText(xml, "[nacionalidade]", "brasileiro(a)");
    xml = replaceFirstText(xml, "[estado civil]", "");
    xml = replaceFirstText(xml, "[profissão]", landlord.notes || "");
    xml = replaceFirstText(xml, "[RG]", "");
    xml = replaceFirstText(xml, "[CPF]", landlordDoc);
  } else {
    xml = replaceFirstText(xml, "[NOME COMPLETO]", landlord.name || input.entity?.displayName || "");
    xml = replaceFirstText(xml, "[estado civil]", "");
    xml = replaceFirstText(xml, "[profissão]", landlord.notes || "");
    xml = replaceFirstText(xml, "[RG]", "");
    xml = replaceFirstText(xml, "[CPF]", landlordDoc);
    xml = replaceFirstText(xml, "[endereço completo]", landlord.address || "");
    xml = replaceFirstText(xml, "[CEP]", property.zipCode || "");
    xml = replaceFirstText(xml, "[Cidade/UF]", `${property.city || ""}/${property.state || ""}`);
    xml = replaceFirstText(xml, "[e-mail]", landlord.email || "");
    xml = replaceFirstText(xml, "[telefone]", landlord.phone || "");
  }

  xml = replaceFirstText(xml, "[NOME COMPLETO]", tenant.name || "");
  xml = replaceFirstText(xml, "[estado civil]", "");
  xml = replaceFirstText(xml, "[profissão]", tenant.notes || "");
  xml = replaceFirstText(xml, "[RG]", "");
  xml = replaceFirstText(xml, "[CPF]", tenantDoc);
  xml = replaceFirstText(xml, "[endereço completo]", tenant.address || "");
  xml = replaceFirstText(xml, "[CEP]", property.zipCode || "");
  xml = replaceFirstText(xml, "[Cidade/UF]", `${property.city || ""}/${property.state || ""}`);
  xml = replaceFirstText(xml, "[e-mail]", tenant.email || "");
  xml = replaceFirstText(xml, "[telefone]", tenant.phone || "");

  return xml;
}

function replaceFirstText(xml, placeholder, value) {
  return xml.replace(escapeXml(placeholder), escapeXml(String(value ?? "")));
}

function replaceAllText(xml, placeholder, value) {
  return xml.split(escapeXml(placeholder)).join(escapeXml(String(value ?? "")));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function brDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function safeName(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").toLowerCase();
}
