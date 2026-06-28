export default async function handler(request, response) {
  const cnpj = String(request.query.cnpj || "").replace(/\D/g, "");

  if (cnpj.length !== 14) {
    return response.status(400).json({ error: "Informe um CNPJ com 14 digitos." });
  }

  try {
    const upstream = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: {
        accept: "application/json",
        "user-agent": "RadarSindicalInteligente/1.0",
      },
    });
    const text = await upstream.text();
    const payload = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      return response
        .status(upstream.status)
        .json({ error: payload.message || "CNPJ nao encontrado." });
    }

    return response.status(200).json({
      legalName: payload.razao_social || "",
      city: payload.municipio || "",
      state: payload.uf || "",
      mainCnae: payload.cnae_fiscal ? String(payload.cnae_fiscal) : "",
      economicCategory: payload.cnae_fiscal_descricao || "",
    });
  } catch (error) {
    console.error("CNPJ lookup failed", error);
    return response.status(502).json({ error: "Nao foi possivel consultar o CNPJ agora." });
  }
}
