(function () {
  const previews = {
    "CARTEIRA ATIVA": {
      accent: "indigo",
      title: "Carteira ativa",
      items: [
        ["1.095 clientes", "Base ativa consolidada no período selecionado."],
        ["30 novos", "Entradas recentes com crescimento líquido positivo."],
        ["+2,8%", "Variação favorável em relação ao ciclo anterior."]
      ]
    },
    "RECEITA RECORRENTE": {
      accent: "emerald",
      title: "Receita recorrente",
      items: [
        ["R$ 687.400", "MRR consolidado com novas receitas no período."],
        ["R$ 31,2 mil", "Valor conquistado por entradas e reajustes."],
        ["+4,2%", "Evolução mensal acima do ritmo da carteira."]
      ]
    },
    "CHURN DE CLIENTES": {
      accent: "amber",
      title: "Churn de clientes",
      items: [
        ["1,7%", "Índice controlado para a carteira atual."],
        ["18 saídas", "Clientes perdidos no período monitorado."],
        ["-0,4 p.p.", "Redução frente ao período anterior."]
      ]
    },
    "LTV MÉDIO": {
      accent: "violet",
      title: "LTV médio",
      items: [
        ["R$ 28.940", "Valor estimado por cliente ativo."],
        ["46,1 meses", "Tempo médio de permanência na base."],
        ["+6,1%", "Melhora impulsionada por retenção e reajustes."]
      ]
    }
  };

  function renderPreview(metric) {
    const metrics = document.querySelector(".metrics");
    if (!metrics) return;
    document.querySelector(".cerne-insight-preview")?.remove();
    const panel = document.createElement("section");
    panel.className = "cerne-insight-preview";
    panel.dataset.accent = metric.accent;
    panel.innerHTML = `
      <header>
        <div>
          <small>PRÉVIA NA VISÃO GERAL</small>
          <h3>${metric.title}</h3>
        </div>
        <button type="button" aria-label="Fechar prévia">×</button>
      </header>
      <div class="cerne-insight-grid">
        ${metric.items.map(([value, detail]) => `<span><b>${value}</b><em>${detail}</em></span>`).join("")}
      </div>
    `;
    panel.querySelector("button").addEventListener("click", () => panel.remove());
    metrics.insertAdjacentElement("afterend", panel);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("button.metric.interactive");
    if (!button) return;
    const label = button.querySelector(".metric-top span")?.textContent?.trim();
    const metric = previews[label];
    if (!metric) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    renderPreview(metric);
  }, true);
})();
