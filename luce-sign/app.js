import { pointOnPage, selectionRect } from "./selection.mjs";

const SESSION_KEY = "luce-sign-session";
const $ = (id) => document.getElementById(id);
const state = { session: null, data: null, view: "overview", selected: null, pdf: null, pdfPage: 1, manualLinks: [], accessCode: null, selection: null, drag: null };
const field = (form, name) => form.elements.namedItem(name);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function notify(message) {
  const notice = $("notice");
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { notice.hidden = true; }, 5500);
}

function date(value) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";
}

async function request(resource, options = {}) {
  const query = new URLSearchParams({ resource, ...(options.query || {}) });
  const response = await fetch(`/api/sign?${query}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${state.session?.access_token || ""}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  if (options.blob && response.ok) return response.blob();
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    logout();
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  state.session = null;
  state.data = null;
  $("appView").hidden = true;
  $("loginView").hidden = false;
}

async function login(identifier, password) {
  const response = await fetch("/api/onboarding/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, profile: "luce-sign" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const messages = {
      email_not_confirmed: "Confirme seu e-mail antes de acessar.",
      module_forbidden: "Sua conta não possui acesso ao Luce Sign.",
      account_suspended: "Esta conta está suspensa.",
      too_many_attempts: "Muitas tentativas. Aguarde e tente novamente.",
    };
    throw new Error(messages[data.code] || "Não foi possível entrar. Confira suas credenciais.");
  }
  state.session = { access_token: data.access_token, user: data.user, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  await activate();
}

async function activate() {
  if (!state.session?.access_token || state.session.expires_at <= Date.now()) return logout();
  $("loginView").hidden = true;
  $("appView").hidden = false;
  $("accountName").textContent = state.session.user?.user_metadata?.display_name || state.session.user?.email || "Usuário";
  try { await load(); }
  catch (error) {
    if ($("appView").hidden) throw error;
    $("content").innerHTML = `<section class="panel status-error" role="alert"><h1>Não foi possível carregar o Luce Sign</h1><p>${escapeHtml(error.message)}</p><button class="quiet" data-retry-load type="button">Tentar novamente</button></section>`;
  }
}

async function load(organizationId) {
  const query = organizationId ? { organization_id: organizationId } : {};
  state.data = await request("bootstrap", { query });
  const select = $("organizationSelect");
  select.replaceChildren(...state.data.organizations.map((org) => new Option(org.name, org.id)));
  if (state.data.organizationId) select.value = state.data.organizationId;
  select.disabled = !state.data.organizations.length;
  render();
}

function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="kicker">LUCE SIGN</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${action}</div>`;
}

function statusLabel(status) {
  return ({ draft: "Rascunho", prepared: "Preparado", pending: "Pendente", invited: "Pendente", authenticated: "Autenticado", signed: "Assinado", sent: "Links gerados", viewed: "Visualizado", partially_signed: "Parcialmente assinado", completed: "Concluído", declined: "Recusado", expired: "Expirado", cancelled: "Cancelado", error: "Erro" })[status] || status;
}

function documentRows(documents) {
  if (!documents.length) return `<div class="empty">Nenhum documento neste período.</div>`;
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Categoria</th><th>Signatários</th><th>Status</th><th>Criado em</th><th></th></tr></thead><tbody>${documents.map((item) => {
    const count = state.data.signers.filter((signer) => signer.document_id === item.id).length;
    return `<tr><td><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.id)}</small></td><td>${escapeHtml(item.category)}</td><td>${count}</td><td><span class="badge ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td><td>${escapeHtml(date(item.created_at))}</td><td><button class="quiet" data-open="${escapeHtml(item.id)}" type="button">Abrir</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function overview() {
  const documents = state.data.documents;
  const pending = documents.filter((item) => ["prepared", "sent", "viewed", "partially_signed"].includes(item.status)).length;
  const completed = documents.filter((item) => item.status === "completed").length;
  return heading("Visão geral", "Acompanhe seus documentos e assinaturas.", `<button class="primary" data-view="new" type="button">Novo documento</button>`)
    + `<div class="metrics"><div class="metric"><span>Documentos</span><strong>${documents.length}</strong></div><div class="metric"><span>Aguardando assinatura</span><strong>${pending}</strong></div><div class="metric"><span>Concluídos</span><strong>${completed}</strong></div></div>`
    + `<section class="section"><h2>Atividade recente</h2><div class="panel">${documentRows(documents.slice(0, 8))}</div></section>`;
}

function documents() {
  return heading("Documentos", "Arquivos e solicitações da organização selecionada.", `<button class="primary" data-view="new" type="button">Novo documento</button>`)
    + `<div class="panel">${documentRows(state.data.documents)}</div>`;
}

function newDocument() {
  if (!state.data.organizationId) return heading("Nova assinatura", "Selecione uma organização para começar.") + `<div class="panel empty">Crie uma organização na área Organizações.</div>`;
  return heading("Novo documento", "Prepare o PDF e cadastre os signatários.")
    + `<section class="panel"><form id="documentForm" class="form-grid"><label>Nome do documento<input name="title" maxlength="200" required></label><label>Categoria<select name="category"><option>Contrato de prestação de serviços</option><option>Contrato de locação</option><option>Procuração</option><option>Termo de responsabilidade</option><option>Aditivo contratual</option><option>Distrato</option><option>Declaração</option><option>Documento trabalhista</option><option>Outros</option></select></label><label class="wide">Arquivo PDF<input name="file" type="file" accept="application/pdf,.pdf" required></label><p class="hint wide">PDF de até 2 MB. O arquivo original será preservado no armazenamento privado.</p><div class="wide"><button class="primary" type="submit">Salvar documento</button></div></form></section>`;
}

function settings() {
  const isAdmin = state.session.user?.app_metadata?.role === "admin";
  const rows = state.data.organizations.map((org) => `<tr><td><strong>${escapeHtml(org.name)}</strong></td><td>${escapeHtml(org.cnpj || "—")}</td></tr>`).join("");
  return heading("Organizações", "Empresas autorizadas no Luce Sign")
    + `<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>CNPJ</th></tr></thead><tbody>${rows || `<tr><td colspan="2" class="empty">Nenhuma organização vinculada.</td></tr>`}</tbody></table></div></div>`
    + (isAdmin ? `<section class="section"><h2>Nova organização</h2><div class="panel"><form id="organizationForm" class="form-grid"><label>Nome<input name="name" maxlength="160" required></label><label>CNPJ, opcional<input name="cnpj" inputmode="numeric" maxlength="18"></label><div class="wide"><button class="primary" type="submit">Criar organização</button></div></form></div></section>` : "");
}

function detail() {
  const document = state.data.documents.find((item) => item.id === state.selected);
  if (!document) { state.selected = null; return documents(); }
  const signers = state.data.signers.filter((item) => item.document_id === document.id)
    .map((item) => ({ ...item, status: item.link_expires_at && Date.parse(item.link_expires_at) <= Date.now()
      && !["signed", "declined"].includes(item.status) ? "expired" : item.status }))
    .sort((a, b) => a.signing_order - b.signing_order);
  const canEdit = ["admin", "manager", "operator"].includes(state.data.role) && document.status === "draft";
  const canManageLinks = ["admin", "manager", "operator"].includes(state.data.role) && ["prepared", "sent", "viewed", "partially_signed"].includes(document.status);
  const canFinalize = ["admin", "manager", "operator"].includes(state.data.role) && document.status === "partially_signed" && signers.length > 0 && signers.every((signer) => signer.status === "signed");
  const signerList = signers.map((signer) => {
    const position = state.data.fields?.find((item) => item.signer_id === signer.id);
    return `<div class="signer-item"><p><strong>${escapeHtml(signer.full_name)}</strong><small>${escapeHtml(signer.role)} · ${escapeHtml(statusLabel(signer.status))}</small></p>${position ? `<p class="hint">Assinatura na página ${position.page_number}</p>` : `<p class="hint">Posição pendente</p>`}</div>`;
  }).join("") + (canManageLinks ? `<div class="manual-links"><button class="primary" data-generate-links type="button">Gerar links de assinatura</button><p class="hint">Entregue o código de acesso por um canal separado do link. O simples acesso ao link não confirma a identidade.</p>${state.manualLinks.filter((link) => signers.some((signer) => signer.id === link.signer_id && signer.status !== "signed")).map((link) => `<div class="manual-link-item"><strong>${escapeHtml(link.name)}</strong><input value="${escapeHtml(link.url)}" readonly aria-label="Link de ${escapeHtml(link.name)}"><button class="quiet" data-copy-link="${escapeHtml(link.signer_id)}" type="button">Copiar link</button><button class="quiet" data-access-code="${escapeHtml(link.signer_id)}" type="button">Gerar código de acesso</button><button class="quiet" data-revoke-link="${escapeHtml(link.signer_id)}" type="button">Revogar link</button></div>`).join("")}${state.accessCode ? `<p class="access-code" role="status">Código de ${escapeHtml(state.accessCode.name)}: <strong>${escapeHtml(state.accessCode.code)}</strong> · válido por 10 minutos. Entregue separadamente; esta é a única exibição do código.</p>` : ""}</div>` : "");
  return heading(document.title, `${document.category} · ${statusLabel(document.status)}`, `<div class="form-actions"><button class="quiet" data-view="documents" type="button">Voltar</button>${["draft", "prepared", "sent", "viewed", "partially_signed"].includes(document.status) && ["admin", "manager", "operator"].includes(state.data.role) ? `<button class="quiet" data-cancel-doc type="button">Cancelar documento</button>` : ""}${["admin", "manager", "operator"].includes(state.data.role) ? `<button class="quiet" data-delete-doc type="button">Excluir documento</button>` : ""}</div>`)
    + `<div class="document-detail"><section class="panel"><h2>Documento original</h2>`
    + (document.original_sha256 ? `<div class="pdf-viewer"><div class="pdf-stage"><canvas id="pdfCanvas" aria-label="Prévia do PDF original"></canvas><div id="signatureOverlay" class="signature-overlay" aria-label="Posições de assinatura"></div></div></div><div class="pdf-toolbar"><button class="quiet" data-page="prev" type="button" aria-label="Página anterior">‹</button><span id="pageCount">Carregando PDF</span><button class="quiet" data-page="next" type="button" aria-label="Próxima página">›</button></div>${canEdit ? `<p class="hint">Marque no PDF a área da assinatura.</p><form id="selectionForm" class="selection-form" hidden><label>Nome do signatário<input name="full_name" maxlength="160" required></label>${signers.length ? `<label>Ou selecionar signatário existente<select name="signer_id"><option value="">Novo signatário</option>${signers.map((signer) => `<option value="${escapeHtml(signer.id)}">${escapeHtml(signer.full_name)}</option>`).join("")}</select></label>` : ""}<button class="primary" type="submit">Salvar posição</button></form>` : ""}<p class="hint">SHA-256: ${escapeHtml(document.original_sha256)}</p>` : `<p class="empty">PDF não enviado.</p>`)
    + (document.status === "completed" ? `<div class="pdf-toolbar"><button class="quiet" data-download="final" type="button">Baixar PDF final</button><button class="quiet" data-download="evidence" type="button">Baixar evidências</button></div>` : "")
    + `</section><aside class="panel"><h2>Signatários</h2>${signerList || `<p class="hint">Nenhum signatário cadastrado.</p>`}${canEdit && document.original_sha256 ? `<button class="primary" data-action="prepare" type="button" ${!signers.length || signers.some((signer) => !state.data.fields.some((field) => field.signer_id === signer.id)) ? "disabled" : ""}>Preparar documento</button>` : ""}${canFinalize ? `<button class="primary" data-action="finalize" type="button">Concluir PDF pendente</button>` : ""}</aside></div>`;
}

function render() {
  const nav = document.querySelectorAll("[data-view]");
  nav.forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const content = $("content");
  content.innerHTML = state.selected ? detail() : ({ overview, documents, new: newDocument, settings })[state.view]();
  const selectedDocument = state.data?.documents.find((item) => item.id === state.selected);
  if (selectedDocument?.status === "draft" && !selectedDocument.original_sha256 &&
    ["admin", "manager", "operator"].includes(state.data.role)) {
    const section = content.querySelector(".document-detail section.panel");
    if (section) {
      const upload = document.createElement("form");
      upload.id = "draftUploadForm";
      upload.className = "form-grid";
      upload.innerHTML = `<label class="wide">Arquivo PDF<input name="file" type="file" accept="application/pdf,.pdf" required></label><button class="primary wide" type="submit">Enviar PDF para este rascunho</button>`;
      section.append(upload);
    }
  }
  const overlay = content.querySelector("#signatureOverlay");
  if (overlay && content.querySelector("#selectionForm")) bindSignatureSelection(overlay);
  if (state.selected && state.data.documents.find((item) => item.id === state.selected)?.original_sha256) preview(state.selected);
}

async function preview(id) {
  try {
    const blob = await request("file", { query: { id }, blob: true });
    const pdfjs = await import("./vendor/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.mjs";
    if (state.pdf) await state.pdf.destroy();
    state.pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    state.pdfPage = 1;
    if (state.selected === id) await renderPdfPage();
  } catch (error) { notify(error.message); }
}

function drawSignaturePositions() {
  const overlay = $("signatureOverlay");
  if (!overlay || !state.selected) return;
  overlay.replaceChildren();
  for (const position of state.data.fields.filter((item) => item.document_id === state.selected && item.page_number === state.pdfPage)) {
    const signer = state.data.signers.find((item) => item.id === position.signer_id);
    const marker = document.createElement("div");
    marker.className = "signature-position";
    marker.textContent = signer?.full_name || "Assinatura";
    Object.assign(marker.style, { left: `${position.x * 100}%`, top: `${position.y * 100}%`,
      width: `${position.width * 100}%`, height: `${position.height * 100}%` });
    overlay.append(marker);
  }
  const area = state.drag?.area || (state.selection?.page_number === state.pdfPage ? state.selection : null);
  if (area) {
    const marker = document.createElement("div");
    marker.className = "signature-selection";
    Object.assign(marker.style, { left: `${area.x * 100}%`, top: `${area.y * 100}%`,
      width: `${area.width * 100}%`, height: `${area.height * 100}%` });
    overlay.append(marker);
  }
}

function bindSignatureSelection(overlay) {
  overlay.classList.add("is-editing");
  const point = (event) => pointOnPage(event.clientX, event.clientY, overlay.getBoundingClientRect());
  overlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !state.pdf) return;
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    state.drag = { start: point(event), area: null };
    state.selection = null;
    $("selectionForm").hidden = true;
    drawSignaturePositions();
  });
  overlay.addEventListener("pointermove", (event) => {
    if (!state.drag) return;
    state.drag.area = selectionRect(state.drag.start, point(event));
    drawSignaturePositions();
  });
  overlay.addEventListener("pointerup", (event) => {
    if (!state.drag) return;
    const selected = selectionRect(state.drag.start, point(event));
    state.drag = null;
    if (selected.width < 0.05 || selected.height < 0.025) {
      notify("Selecione uma área maior para a assinatura.");
      drawSignaturePositions();
      return;
    }
    state.selection = { ...selected, page_number: state.pdfPage, document_id: state.selected };
    drawSignaturePositions();
    $("selectionForm").hidden = false;
    $("selectionForm").elements.full_name.focus();
  });
  overlay.addEventListener("pointercancel", () => { state.drag = null; drawSignaturePositions(); });
}

async function renderPdfPage() {
  const canvas = $("pdfCanvas");
  if (!canvas || !state.pdf) return;
  const page = await state.pdf.getPage(state.pdfPage);
  const width = canvas.closest(".pdf-viewer").clientWidth - 20;
  const normal = page.getViewport({ scale: 1, rotation: 0 });
  const viewport = page.getViewport({ scale: Math.min(2, width / normal.width), rotation: 0 });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  $("pageCount").textContent = `Página ${state.pdfPage} de ${state.pdf.numPages}`;
  drawSignaturePositions();
}

function base64File(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Não foi possível ler o PDF."));
    reader.readAsDataURL(file);
  });
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  $("loginMessage").textContent = "";
  try { await login(field(form, "identifier").value.trim(), field(form, "password").value); }
  catch (error) { $("loginMessage").textContent = error.message; }
  finally { button.disabled = false; }
});

$("logoutButton").addEventListener("click", async () => {
  try { await request("logout", { method: "POST" }); }
  catch (error) { notify(error.message); }
  finally { logout(); }
});
$("organizationSelect").addEventListener("change", async (event) => {
  state.selected = null;
  try { await load(event.target.value); } catch (error) { notify(error.message); }
});
$("menuButton").addEventListener("click", () => {
  const open = $("appView").classList.toggle("menu-open");
  $("menuButton").setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-load]");
  if (retryButton) {
    retryButton.disabled = true;
    load().catch((error) => {
      const message = $("content").querySelector(".status-error p");
      if (message) message.textContent = error.message;
    }).finally(() => { if (retryButton.isConnected) retryButton.disabled = false; });
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    if (!state.data) { notify("Os dados ainda não foram carregados."); return; }
    state.view = viewButton.dataset.view;
    state.selected = null;
    state.selection = null;
    $("appView").classList.remove("menu-open");
    $("menuButton").setAttribute("aria-expanded", "false");
    render();
  }
  const openButton = event.target.closest("[data-open]");
  if (openButton) { state.selected = openButton.dataset.open; state.manualLinks = []; state.accessCode = null; state.selection = null; render(); }
  const manualButton = event.target.closest("[data-generate-links], [data-copy-link], [data-access-code], [data-revoke-link]");
  if (manualButton && state.selected) {
    manualButton.disabled = true;
    (async () => {
      if (manualButton.hasAttribute("data-generate-links")) {
        const result = await request("generate-links", { method: "POST", body: { document_id: state.selected } });
        state.manualLinks = result.links; state.accessCode = null;
        await load(state.data.organizationId);
        notify(`${result.links.length} link(s) disponível(is) para cópia.`);
      } else if (manualButton.dataset.copyLink) {
        const link = state.manualLinks.find((item) => item.signer_id === manualButton.dataset.copyLink);
        if (!link) throw new Error("Gere os links novamente.");
        try { await navigator.clipboard.writeText(link.url); }
        catch {
          const input = manualButton.closest(".manual-link-item")?.querySelector("input");
          input?.select();
          if (!input || !document.execCommand("copy")) throw new Error("Selecione o link e copie manualmente.");
        }
        notify("Link copiado.");
      } else if (manualButton.dataset.accessCode) {
        const result = await request("access-code", { method: "POST", body: {
          document_id: state.selected, signer_id: manualButton.dataset.accessCode } });
        const signer = state.data.signers.find((item) => item.id === manualButton.dataset.accessCode);
        state.accessCode = { name: signer?.full_name || "signatário", code: result.code };
        render();
      } else if (manualButton.dataset.revokeLink) {
        if (!confirm("Revogar o link e o código de acesso deste signatário?")) return;
        await request("revoke-link", { method: "POST", body: {
          document_id: state.selected, signer_id: manualButton.dataset.revokeLink } });
        state.manualLinks = state.manualLinks.filter((item) => item.signer_id !== manualButton.dataset.revokeLink);
        state.accessCode = null; await load(state.data.organizationId); notify("Link revogado.");
      }
    })().catch((error) => notify(error.message)).finally(() => { if (manualButton.isConnected) manualButton.disabled = false; });
  }
  const cancelButton = event.target.closest("[data-cancel-doc]");
  if (cancelButton && state.selected && confirm("Cancelar este documento e invalidar todos os links?")) {
    cancelButton.disabled = true;
    request("cancel", { method: "POST", body: { document_id: state.selected } })
      .then(async () => { state.manualLinks = []; state.accessCode = null; await load(state.data.organizationId); notify("Documento cancelado."); })
      .catch((error) => notify(error.message))
      .finally(() => { if (cancelButton.isConnected) cancelButton.disabled = false; });
  }
  const deleteButton = event.target.closest("[data-delete-doc]");
  if (deleteButton && state.selected && confirm("Excluir este documento da lista? Links ativos serão revogados. PDFs e evidências ficarão preservados para auditoria.")) {
    deleteButton.disabled = true;
    request("delete", { method: "POST", body: { document_id: state.selected } })
      .then(async () => {
        state.selected = null; state.selection = null; state.manualLinks = []; state.accessCode = null;
        state.view = "documents";
        await load(state.data.organizationId);
        notify("Documento excluído da lista.");
      })
      .catch((error) => notify(error.message))
      .finally(() => { if (deleteButton.isConnected) deleteButton.disabled = false; });
  }
  const pageButton = event.target.closest("[data-page]");
  if (pageButton && state.pdf) {
    state.pdfPage = Math.min(state.pdf.numPages, Math.max(1, state.pdfPage + (pageButton.dataset.page === "next" ? 1 : -1)));
    state.selection = null;
    const selectionForm = $("selectionForm");
    if (selectionForm) selectionForm.hidden = true;
    renderPdfPage().catch((error) => notify(error.message));
  }
  const action = event.target.closest("[data-action]");
  if (action && state.selected) {
    action.disabled = true;
    request(action.dataset.action, { method: "POST", body: { document_id: state.selected } })
      .then(async (result) => { await load(state.data.organizationId); notify(result.prepared ? "Documento preparado." : `Status: ${result.status || "atualizado"}.`); })
      .catch((error) => notify(error.message))
      .finally(() => { if (action.isConnected) action.disabled = false; });
  }
  const download = event.target.closest("[data-download]");
  if (download && state.selected) {
    request("file", { query: { id: state.selected, variant: download.dataset.download }, blob: true })
      .then((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${download.dataset.download}-${state.selected}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); })
      .catch((error) => notify(error.message));
  }
});

$("content").addEventListener("change", (event) => {
  if (event.target.name !== "signer_id" || event.target.form?.id !== "selectionForm") return;
  const name = field(event.target.form, "full_name");
  name.disabled = Boolean(event.target.value);
  name.required = !event.target.value;
  name.closest("label").hidden = Boolean(event.target.value);
});

$("content").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    if (form.id === "organizationForm") {
      const created = await request("organizations", { method: "POST", body: { name: field(form, "name").value, cnpj: field(form, "cnpj").value } });
      await load(created.organization.id);
      notify("Organização criada.");
    } else if (form.id === "documentForm") {
      const file = field(form, "file").files[0];
      if (!file || file.size > 2 * 1024 * 1024) throw new Error("Selecione um PDF de até 2 MB.");
      const created = await request("documents", { method: "POST", body: {
        organization_id: state.data.organizationId, title: field(form, "title").value, category: field(form, "category").value,
      } });
      await load(state.data.organizationId);
      state.selected = created.document.id;
      render();
      try {
        await request("upload", { method: "POST", body: { document_id: created.document.id, base64: await base64File(file) } });
      } catch (error) {
        throw new Error(`Rascunho criado. Reenvie o PDF neste documento. ${error.message}`);
      }
      await load(state.data.organizationId);
      notify("Documento salvo no armazenamento privado.");
    } else if (form.id === "draftUploadForm") {
      const file = field(form, "file").files[0];
      if (!file || file.size > 2 * 1024 * 1024) throw new Error("Selecione um PDF de até 2 MB.");
      await request("upload", { method: "POST", body: { document_id: state.selected, base64: await base64File(file) } });
      await load(state.data.organizationId);
      notify("PDF vinculado ao rascunho.");
    } else if (form.id === "selectionForm") {
      if (!state.selection || state.selection.document_id !== state.selected) throw new Error("Marque a área da assinatura no PDF.");
      const signerId = field(form, "signer_id")?.value || "";
      const body = { document_id: state.selected, ...state.selection };
      if (signerId) {
        await request("fields", { method: "POST", body: { ...body, signer_id: signerId } });
      } else {
        await request("place-signer", { method: "POST", body: { ...body, full_name: field(form, "full_name").value } });
      }
      state.selection = null;
      await load(state.data.organizationId);
      notify("Assinatura posicionada no documento.");
    }
  } catch (error) { notify(error.message); }
  finally { if (button.isConnected) button.disabled = false; }
});

try { state.session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
catch { sessionStorage.removeItem(SESSION_KEY); }
if (state.session) activate().catch((error) => { logout(); notify(error.message); });
