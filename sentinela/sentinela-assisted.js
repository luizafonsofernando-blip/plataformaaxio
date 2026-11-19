(function () {
  "use strict";

  const sourceNames = {
    "federal-cnd": "CND Federal / CPEND",
    "federal-situation": "Situação Fiscal Federal",
    "federal-mailbox": "Caixa Postal",
  };
  const statusNames = { regular: "Regular", attention: "Atenção", relevant: "Pendência relevante", critical: "Crítico", unknown: "Revisão necessária" };
  let app = null;
  let lastPreview = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  function formatDate(value, withTime = false) {
    if (!value) return "Não informada";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return "Não informada";
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
  }

  function setLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);
    if (loading) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  function companies() {
    return app?.getState?.().companies || [];
  }

  function populateCompanies() {
    const select = $("#assistedCompany");
    if (!select) return;
    const selected = select.value;
    select.innerHTML = `<option value="">Sem empresa vinculada</option>${companies().map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.legal_name)} · ${escapeHtml(company.cnpj)}</option>`).join("")}`;
    select.value = selected;
  }

  function render(state) {
    populateCompanies();
    const target = $("#assistedIntakeList");
    if (!target) return;
    const rows = state.assistedIntakes || [];
    target.innerHTML = rows.length ? rows.slice(0, 12).map((item) => {
      const company = state.companies.find((entry) => entry.id === item.company_id);
      return `<div class="compact-item"><div><strong>${escapeHtml(sourceNames[item.source_code] || item.source_code)}</strong><small>${escapeHtml(company?.legal_name || "Sem empresa vinculada")} · ${escapeHtml(formatDate(item.checked_at, true))}${item.valid_until ? ` · válida até ${escapeHtml(formatDate(item.valid_until))}` : ""}</small></div><span class="badge ${escapeHtml(item.official_status || "unknown")}">${escapeHtml(statusNames[item.official_status] || "Revisar")}</span></div>`;
    }).join("") : `<div class="empty-state">Nenhuma fonte foi processada pelo fluxo assistido.</div>`;
  }

  function open(sourceCode) {
    const dialog = $("#assistedIntakeDialog");
    const form = $("#assistedIntakeForm");
    if (!dialog || !form || !sourceNames[sourceCode]) return;
    form.reset();
    form.elements.source_code.value = sourceCode;
    $("#assistedDialogTitle").textContent = sourceCode === "federal-mailbox" ? "Registrar alerta da Caixa Postal" : `Processar ${sourceNames[sourceCode]}`;
    $("#assistedFile").accept = sourceCode === "federal-mailbox" ? ".eml,.txt,.pdf,text/plain,message/rfc822,application/pdf" : ".pdf,application/pdf";
    $("#assistedFileHint").textContent = sourceCode === "federal-mailbox" ? "Alerta recebido em EML, TXT ou PDF, com até 4 MB." : "Documento PDF obtido no canal oficial, com até 4 MB.";
    $("#assistedCompany").required = sourceCode !== "federal-mailbox";
    $("#assistedCompanyHint").textContent = sourceCode === "federal-mailbox" ? "Opcional quando o alerta não identifica o contribuinte." : "Obrigatória e validada contra o CNPJ encontrado no documento.";
    $("#assistedPreview").classList.add("hidden");
    $("#assistedConfirmButton").classList.add("hidden");
    $(".form-message", form).textContent = "";
    $(".form-message", form).classList.remove("is-guidance");
    lastPreview = null;
    populateCompanies();
    dialog.showModal();
  }

  async function send(operation) {
    const form = $("#assistedIntakeForm");
    const activeSession = app?.session?.();
    if (!activeSession?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
    const body = new FormData(form);
    if (operation === "fiscal-preview") body.delete("official_status");
    const response = await fetch("/api/sentinela", {
      method: "POST",
      headers: { authorization: `Bearer ${activeSession.access_token}`, "x-sentinela-operation": operation },
      body,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível processar a fonte oficial.");
    return result.data;
  }

  function showPreview(preview) {
    lastPreview = preview;
    const form = $("#assistedIntakeForm");
    form.elements.official_status.value = preview.officialStatus || "unknown";
    form.elements.issued_at.value = preview.issuedAt || "";
    form.elements.expires_at.value = preview.expiresAt || "";
    const target = $("#assistedPreview");
    target.innerHTML = `<h3>Prévia para confirmação</h3><dl><div><dt>Fonte</dt><dd>${escapeHtml(preview.sourceName)}</dd></div><div><dt>Situação</dt><dd>${escapeHtml(statusNames[preview.officialStatus] || "Revisar")}</dd></div><div><dt>CNPJ identificado</dt><dd>${escapeHtml(preview.cnpjs?.join(", ") || "Não identificado")}</dd></div><div><dt>Validade</dt><dd>${escapeHtml(formatDate(preview.expiresAt))}</dd></div></dl><p>${escapeHtml(preview.summary)}</p>${preview.requiresPortalAccess ? `<p><strong>Atenção:</strong> o arquivo comprova apenas o alerta. Consulte o conteúdo sigiloso no Portal da Receita.</p>` : ""}`;
    target.classList.remove("hidden");
    $("#assistedConfirmButton").classList.remove("hidden");
  }

  async function preview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#assistedPreviewButton");
    const message = $(".form-message", form);
    setLoading(button, true);
    message.classList.add("is-guidance");
    message.textContent = "Analisando o documento...";
    try {
      const result = await send("fiscal-preview");
      showPreview(result);
      message.textContent = "Revise os dados identificados antes de confirmar.";
    } catch (error) {
      message.classList.remove("is-guidance");
      message.textContent = error.message;
    } finally {
      setLoading(button, false);
    }
  }

  async function confirm() {
    const form = $("#assistedIntakeForm");
    const button = $("#assistedConfirmButton");
    const message = $(".form-message", form);
    if (!lastPreview) return;
    setLoading(button, true);
    message.classList.add("is-guidance");
    message.textContent = "Registrando evidência, snapshot e ações...";
    try {
      await send("fiscal-confirm");
      form.closest("dialog").close();
      app.toast("Fonte processada e registrada com rastreabilidade.");
      await app.load();
    } catch (error) {
      message.classList.remove("is-guidance");
      message.textContent = error.message;
    } finally {
      setLoading(button, false);
    }
  }

  function init(options) {
    app = options;
    $$("[data-assisted-open]").forEach((button) => button.addEventListener("click", () => open(button.dataset.assistedOpen)));
    $("#assistedIntakeForm")?.addEventListener("submit", preview);
    $("#assistedConfirmButton")?.addEventListener("click", confirm);
  }

  window.SentinelaAssisted = { init, render };
})();
