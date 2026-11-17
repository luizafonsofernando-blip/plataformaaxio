import { rejectDisallowedOrigin, rejectRateLimited, setApiSecurityHeaders } from "../_security.js";

async function postalAddress(cep) {
  if (!/^\d{8}$/.test(cep)) return null;
  try {
    const result = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      redirect: "error", signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) return null;
    const { street, neighborhood, city, state, service } = await result.json();
    return { street, neighborhood, city, state, service };
  } catch {
    return null;
  }
}

async function checkEbefAccess(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !/^Bearer [\w.-]+$/.test(authorization)) return 401;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://prznhgwiibcazuwlwvnt.supabase.co";
  const apikey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
  const result = await fetch(new URL("/rest/v1/rpc/ebef_access_level", url), {
    method: "POST",
    headers: { apikey, authorization, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (result.status === 401 || result.status === 403) return result.status;
  if (!result.ok) throw new Error("Falha ao consultar acesso");
  return ["Administrador", "Operador", "Operador · carteira própria"].includes(await result.json()) ? 200 : 403;
}

function fromCnpjWs(data, cnpj) {
  const establishment = data?.estabelecimento || {};
  const primaryActivity = establishment.atividade_principal || {};
  const simple = data?.simples?.simples;
  const mei = data?.simples?.mei;
  return {
    razao_social: data?.razao_social || "",
    cnpj: establishment.cnpj || cnpj,
    identificador_matriz_filial: establishment.tipo === "Matriz" ? 1 : establishment.tipo === "Filial" ? 2 : null,
    qsa: Array.isArray(data?.socios) ? data.socios.map((partner) => ({
      nome_socio: partner?.nome || "",
      qualificacao_socio: partner?.qualificacao_socio?.descricao || "",
      identificador_de_socio: partner?.tipo === "Pessoa Física" ? 2 : partner?.tipo === "Pessoa Jurídica" ? 1 : 3,
      nome_representante_legal: partner?.nome_representante || "",
      qualificacao_representante_legal: partner?.qualificacao_representante || "",
    })).filter((partner) => partner.nome_socio) : null,
    nome_fantasia: establishment.nome_fantasia || "",
    descricao_situacao_cadastral: establishment.situacao_cadastral || "",
    data_situacao_cadastral: establishment.data_situacao_cadastral || "",
    descricao_motivo_situacao_cadastral: establishment.motivo_situacao_cadastral || "",
    data_inicio_atividade: establishment.data_inicio_atividade || "",
    natureza_juridica: data?.natureza_juridica?.descricao || "",
    porte: data?.porte?.descricao || "",
    capital_social: data?.capital_social || "",
    qualificacao_do_responsavel: data?.qualificacao_do_responsavel?.descricao || "",
    cnae_fiscal: primaryActivity.id || "",
    cnae_fiscal_descricao: primaryActivity.descricao || "",
    cnaes_secundarios: Array.isArray(establishment.atividades_secundarias)
      ? establishment.atividades_secundarias.map((activity) => ({ codigo: activity.id, descricao: activity.descricao }))
      : [],
    descricao_tipo_de_logradouro: establishment.tipo_logradouro || "",
    logradouro: establishment.logradouro || "",
    numero: establishment.numero || "",
    complemento: establishment.complemento || "",
    bairro: establishment.bairro || "",
    cep: establishment.cep || "",
    municipio: establishment.cidade?.nome || "",
    uf: establishment.estado?.sigla || "",
    email: establishment.email || "",
    ddd_telefone_1: [establishment.ddd1, establishment.telefone1].filter(Boolean).join(""),
    ddd_telefone_2: [establishment.ddd2, establishment.telefone2].filter(Boolean).join(""),
    opcao_pelo_simples: simple === "Sim",
    opcao_pelo_mei: mei === "Sim",
    situacao_especial: establishment.situacao_especial || "",
  };
}

async function queryCnpjWs(cnpj) {
  const result = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    redirect: "error",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(7000),
  });
  const text = await result.text();
  const payload = text ? JSON.parse(text) : {};
  return { result, payload };
}

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (await rejectRateLimited(request, response, { action: "cnpj_lookup", limit: 120, windowSeconds: 60 })) return;
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Método não permitido." });
  }

  const forEbef = request.query?.module === "ebef";
  const input = String(request.query?.cnpj || "");
  const cnpj = forEbef ? input.toUpperCase().replace(/[.\/\s-]/g, "") : input.replace(/\D/g, "");

  if (forEbef ? !/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) : cnpj.length !== 14) {
    return response.status(400).json({ error: "Informe um CNPJ com 14 caracteres válidos." });
  }

  try {
    if (forEbef) {
      const access = await checkEbefAccess(request);
      if (access !== 200) return response.status(access).json({ error: "Acesso ao E-BEF necessário para consultar o QSA." });
    }
    const upstream = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      redirect: "error",
      ...(forEbef ? { signal: AbortSignal.timeout(8000) } : {}),
      headers: {
        accept: "application/json",
        "user-agent": "RadarSindicalInteligente/1.0",
      },
    });
    const text = await upstream.text();
    let payload = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      if (forEbef) {
        try {
          const fallback = await queryCnpjWs(cnpj);
          if (fallback.result.ok && fallback.payload?.estabelecimento) {
            payload = fromCnpjWs(fallback.payload, cnpj);
          } else {
            const notFound = upstream.status === 404 && fallback.result.status === 404;
            const rateLimited = fallback.result.status === 429;
            return response.status(notFound ? 404 : rateLimited ? 503 : 502).json({
              error: notFound
                ? "CNPJ não encontrado nas fontes cadastrais disponíveis."
                : rateLimited
                  ? "A consulta está temporariamente limitada. Tente novamente em alguns instantes."
                  : "A consulta está indisponível no momento.",
            });
          }
        } catch {
          return response.status(502).json({ error: "As fontes de consulta estão indisponíveis no momento." });
        }
      } else {
        return response
          .status(upstream.status)
          .json({ error: payload.message || "CNPJ não encontrado." });
      }
    }

    if (forEbef) {
      const legalName = typeof payload.razao_social === "string" ? payload.razao_social.trim() : "";
      if (!legalName) return response.status(502).json({ error: "A consulta retornou um cadastro incompleto." });
      const establishment = { 1: "Matriz", 2: "Filial" }[payload.identificador_matriz_filial] || null;
      const qsa = Array.isArray(payload.qsa) ? payload.qsa.flatMap((entry) => {
        const name = typeof entry?.nome_socio === "string" ? entry.nome_socio.trim() : "";
        if (!name) return [];
        return [{
          name,
          qualification: typeof entry.qualificacao_socio === "string" ? entry.qualificacao_socio.trim() : "",
          type: { 1: "Pessoa jurídica", 2: "Pessoa física", 3: "Sócio no exterior" }[entry.identificador_de_socio] || "",
        }];
      }) : null;
      if (request.query?.details !== "1") return response.status(200).json({ legalName, establishment, qsa });
      const cep = String(payload.cep ?? "").replace(/\D/g, "");
      const postal = await postalAddress(cep);
      return response.status(200).json({
        legalName, establishment, qsa, cnpj,
        tradeName: payload.nome_fantasia,
        status: payload.descricao_situacao_cadastral,
        statusDate: payload.data_situacao_cadastral,
        statusReason: payload.descricao_motivo_situacao_cadastral,
        openingDate: payload.data_inicio_atividade,
        legalNature: payload.natureza_juridica || payload.codigo_natureza_juridica,
        size: payload.porte || payload.descricao_porte,
        capital: payload.capital_social,
        representativeQualification: payload.qualificacao_do_responsavel,
        representatives: Array.isArray(payload.qsa) ? payload.qsa.flatMap(entry =>
          entry?.nome_representante_legal ? [{
            partner: entry.nome_socio,
            name: entry.nome_representante_legal,
            qualification: entry.qualificacao_representante_legal
          }] : []) : [],
        primaryActivity: { code: payload.cnae_fiscal, description: payload.cnae_fiscal_descricao },
        secondaryActivities: Array.isArray(payload.cnaes_secundarias) ? payload.cnaes_secundarias
          .filter(entry => entry?.codigo)
          .map(entry => ({ code: entry.codigo, description: entry.descricao })) : [],
        address: {
          street: [payload.descricao_tipo_de_logradouro, payload.logradouro].filter(Boolean).join(" "),
          number: payload.numero, complement: payload.complemento, neighborhood: payload.bairro,
          city: payload.municipio || payload.nome_cidade_no_exterior, state: payload.uf, cep
        },
        postal, email: payload.email,
        phones: [payload.ddd_telefone_1, payload.ddd_telefone_2].filter(Boolean),
        simpleTax: payload.opcao_pelo_simples, mei: payload.opcao_pelo_mei,
        specialStatus: payload.situacao_especial,
      });
    }

    return response.status(200).json({
      legalName: payload.razao_social || "",
      city: payload.municipio || "",
      state: payload.uf || "",
      mainCnae: payload.cnae_fiscal ? String(payload.cnae_fiscal) : "",
      economicCategory: payload.cnae_fiscal_descricao || "",
    });
  } catch (error) {
    console.error("CNPJ lookup failed", error.name);
    return response.status(502).json({ error: "Não foi possível consultar o CNPJ agora." });
  }
}
