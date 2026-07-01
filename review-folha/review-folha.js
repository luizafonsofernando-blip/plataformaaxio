const form = document.getElementById("reviewForm");
const submitButton = document.getElementById("submitReview");
const clearButton = document.getElementById("clearReview");
const statusMessage = document.getElementById("formStatus");
const resultPanel = document.getElementById("resultPanel");
const kpiGrid = document.getElementById("kpiGrid");
const onlyPdf = document.getElementById("onlyPdf");
const onlySheet = document.getElementById("onlySheet");
const differenceRows = document.getElementById("differenceRows");
const exportCsv = document.getElementById("exportCsv");
const exportPdf = document.getElementById("exportPdf");
const pdfFile = document.getElementById("pdfFile");
const sheetFile = document.getElementById("sheetFile");
const pdfFileName = document.getElementById("pdfFileName");
const sheetFileName = document.getElementById("sheetFileName");

let currentResult = null;

pdfFile.addEventListener("change", () => {
  pdfFileName.textContent = pdfFile.files?.[0]?.name || "Nenhum arquivo selecionado";
});

sheetFile.addEventListener("change", () => {
  sheetFileName.textContent = sheetFile.files?.[0]?.name || "Nenhum arquivo selecionado";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true, "Processando arquivos...");

  try {
    const response = await fetch("/api/review-folha/compare", {
      method: "POST",
      body: new FormData(form),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel confrontar a folha.");
    currentResult = payload;
    renderResult(payload);
    setStatus("Confronto concluido.", true);
  } catch (error) {
    setStatus(error.message || "Nao foi possivel confrontar a folha.", false);
  } finally {
    setBusy(false);
  }
});

clearButton.addEventListener("click", () => {
  form.reset();
  pdfFileName.textContent = "Nenhum arquivo selecionado";
  sheetFileName.textContent = "Nenhum arquivo selecionado";
  currentResult = null;
  resultPanel.hidden = true;
  kpiGrid.innerHTML = "";
  onlyPdf.innerHTML = "";
  onlySheet.innerHTML = "";
  differenceRows.innerHTML = "";
  setStatus("");
});

exportCsv.addEventListener("click", () => {
  if (!currentResult) return;
  const rows = [
    ["Status", "Funcionario", "Matricula", "Rubrica", "Criterio", "PDF", "Planilha", "Diferenca"],
    ...currentResult.differences.map((item) => {
      const metric = metricValues(item);
      return [
        item.status,
        item.employee,
        item.employee_id,
        item.event,
        item.criterion,
        formatNumber(metric.pdf),
        formatNumber(metric.sheet),
        formatNumber(metric.diff),
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "review-folha-divergencias.csv";
  link.click();
  URL.revokeObjectURL(url);
});

exportPdf.addEventListener("click", () => {
  if (!currentResult) return;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    setStatus("Permita pop-ups para gerar o PDF do relatorio.", false);
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(buildPdfReport(currentResult));
  reportWindow.document.close();
  reportWindow.addEventListener("load", () => {
    reportWindow.focus();
    reportWindow.print();
  });
});

function renderResult(result) {
  resultPanel.hidden = false;
  const differences = result.differences || [];
  kpiGrid.innerHTML = [
    ["Funcionarios PDF", result.pdf_people],
    ["Funcionarios planilha", result.sheet_people],
    ["Lancamentos PDF", result.pdf_count],
    ["Lancamentos planilha", result.sheet_count],
    ["Divergencias", differences.length],
  ]
    .map(([label, value]) => `<article class="kpi-card"><strong>${value}</strong><span>${label}</span></article>`)
    .join("");

  onlyPdf.innerHTML = renderPeople(result.people_only_pdf);
  onlySheet.innerHTML = renderPeople(result.people_only_sheet);
  differenceRows.innerHTML = differences.length
    ? differences.map(renderDifferenceRow).join("")
    : `<tr><td colspan="7">Nenhuma divergencia encontrada para os criterios processados.</td></tr>`;
}

function renderPeople(people = []) {
  if (!people.length) return "<li>Nenhum</li>";
  return people.map((person) => `<li>${escapeHtml(person.id || "-")} - ${escapeHtml(person.name || "")}</li>`).join("");
}

function renderDifferenceRow(item) {
  const metric = metricValues(item);
  return `
    <tr>
      <td><span class="status-badge ${item.severity === "critico" ? "critico" : ""}">${escapeHtml(item.status)}</span></td>
      <td>${escapeHtml(item.employee_id || "-")}<br><strong>${escapeHtml(item.employee || "")}</strong></td>
      <td>${escapeHtml(item.event || "")}</td>
      <td>${item.criterion === "quantidade" ? "Quantidade" : "Valor"}</td>
      <td class="num">${formatNumber(metric.pdf)}</td>
      <td class="num">${formatNumber(metric.sheet)}</td>
      <td class="num"><strong>${formatNumber(metric.diff)}</strong></td>
    </tr>
  `;
}

function metricValues(item) {
  if (item.criterion === "quantidade") {
    return { pdf: item.pdf_ref, sheet: item.sheet_ref, diff: item.ref_diff };
  }
  return { pdf: item.pdf_amount, sheet: item.sheet_amount, diff: item.amount_diff };
}

function buildPdfReport(result) {
  const differences = result.differences || [];
  const generatedAt = new Date().toLocaleString("pt-BR");
  const fileLine = [result.files?.pdf, result.files?.sheet].filter(Boolean).join(" | ");
  const rows = differences.length
    ? differences.map(renderPdfDifferenceRow).join("")
    : `<tr><td colspan="7">Nenhuma divergencia encontrada para os criterios processados.</td></tr>`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Review Folha - Relatorio</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f4f7fb;
        color: #172033;
        font-family: Inter, Arial, sans-serif;
      }
      .report {
        max-width: 1120px;
        margin: 0 auto;
        padding: 34px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        padding: 28px;
        border-radius: 8px;
        background: linear-gradient(135deg, #071d49, #0f766e);
        color: #fff;
      }
      .brand-logo {
        display: block;
        width: 118px;
        height: auto;
        margin-bottom: 12px;
        padding: 6px 8px;
        border-radius: 6px;
        background: rgba(255,255,255,.94);
      }
      .hero p { margin: 0; color: rgba(255,255,255,.76); font-size: 12px; font-weight: 700; text-transform: uppercase; }
      h1 { margin: 8px 0 0; font-size: 34px; letter-spacing: 0; }
      .meta { align-self: end; text-align: right; font-size: 12px; color: rgba(255,255,255,.78); }
      .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 18px 0; }
      .kpi {
        min-height: 86px;
        padding: 14px;
        border: 1px solid #dbe5f0;
        border-radius: 8px;
        background: #fff;
      }
      .kpi strong { display: block; color: #0f766e; font-size: 26px; }
      .kpi span { color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .section {
        margin-top: 16px;
        padding: 18px;
        border: 1px solid #dbe5f0;
        border-radius: 8px;
        background: #fff;
      }
      h2 { margin: 0 0 12px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { padding: 9px 8px; border-bottom: 1px solid #e6edf5; text-align: left; vertical-align: top; }
      th { color: #0f4c81; font-size: 10px; text-transform: uppercase; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .badge { display: inline-block; padding: 4px 7px; border-radius: 999px; background: #e8f3ff; color: #0f4c81; font-weight: 800; }
      .badge.critico { background: #ffe8e8; color: #b42318; }
      .people { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      ul { margin: 0; padding-left: 18px; color: #475569; }
      footer { margin-top: 16px; color: #64748b; font-size: 11px; text-align: center; }
      @media print {
        body { background: #fff; }
        .report { padding: 0; }
        .section, .kpi, .hero { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="report">
      <section class="hero">
        <div>
          <img class="brand-logo" src="/review-folha/logo-axion.png" alt="Axion Solutions">
          <p>Axion Solutions</p>
          <h1>Review Folha</h1>
        </div>
        <div class="meta">
          <div>${escapeHtml(generatedAt)}</div>
          <div>${escapeHtml(fileLine || "Arquivos analisados")}</div>
        </div>
      </section>
      <section class="kpis">
        ${[
          ["Funcionarios PDF", result.pdf_people],
          ["Funcionarios planilha", result.sheet_people],
          ["Lancamentos PDF", result.pdf_count],
          ["Lancamentos planilha", result.sheet_count],
          ["Divergencias", differences.length],
        ]
          .map(([label, value]) => `<article class="kpi"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`)
          .join("")}
      </section>
      <section class="section people">
        <article>
          <h2>Somente no PDF</h2>
          <ul>${renderPeople(result.people_only_pdf)}</ul>
        </article>
        <article>
          <h2>Somente na planilha</h2>
          <ul>${renderPeople(result.people_only_sheet)}</ul>
        </article>
      </section>
      <section class="section">
        <h2>Divergencias</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Funcionario</th>
              <th>Rubrica</th>
              <th>Criterio</th>
              <th class="num">PDF</th>
              <th class="num">Planilha</th>
              <th class="num">Diferenca</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <footer>Relatorio gerado automaticamente pelo modulo Review Folha.</footer>
    </main>
  </body>
</html>`;
}

function renderPdfDifferenceRow(item) {
  const metric = metricValues(item);
  return `
    <tr>
      <td><span class="badge ${item.severity === "critico" ? "critico" : ""}">${escapeHtml(item.status)}</span></td>
      <td>${escapeHtml(item.employee_id || "-")}<br><strong>${escapeHtml(item.employee || "")}</strong></td>
      <td>${escapeHtml(item.event || "")}</td>
      <td>${item.criterion === "quantidade" ? "Quantidade" : "Valor"}</td>
      <td class="num">${formatNumber(metric.pdf)}</td>
      <td class="num">${formatNumber(metric.sheet)}</td>
      <td class="num"><strong>${formatNumber(metric.diff)}</strong></td>
    </tr>
  `;
}

function setBusy(busy, message = "") {
  submitButton.disabled = busy;
  submitButton.textContent = busy ? "Processando..." : "Confrontar folha";
  if (message) setStatus(message);
}

function setStatus(message, success = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("success", success);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
