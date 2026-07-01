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

let currentResult = null;

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
