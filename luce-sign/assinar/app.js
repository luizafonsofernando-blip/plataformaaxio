const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get("token") || sessionStorage.getItem("luce-sign-link");
if (token) { sessionStorage.setItem("luce-sign-link", token); history.replaceState(null, "", location.pathname); }
let session = sessionStorage.getItem("luce-sign-sign-session"), pdf, pageNumber = 1;
function message(value) { $("message").textContent = value; }
async function api(resource, body, asBlob = false) {
  const response = await fetch(`/api/sign?resource=${resource}`, {
    method: body ? "POST" : "GET", headers: { ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  if (asBlob && response.ok) return response.blob();
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível continuar.");
  return result;
}
async function showPdf() {
  const blob = await api("document", null, true);
  const pdfjs = await import("../vendor/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "../vendor/pdf.worker.mjs";
  if (pdf) await pdf.destroy();
  pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  $("otpStep").hidden = true;
  $("signStep").hidden = false;
  pageNumber = 1;
  await renderPage();
}
async function renderPage() {
  if (!pdf) return;
  const page = await pdf.getPage(pageNumber);
  const canvas = $("pdfCanvas");
  const normal = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, (canvas.parentElement.clientWidth - 20) / normal.width) });
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  $("pageLabel").textContent = `Página ${pageNumber} de ${pdf.numPages}`;
  $("prevPage").disabled = pageNumber === 1;
  $("nextPage").disabled = pageNumber === pdf.numPages;
}
async function start() {
  if (!token) throw new Error("Link de assinatura ausente.");
  const data = await api("link", { token });
  $("title").textContent = data.document;
  $("identity").textContent = data.email_hint ? `${data.signer} · ${data.email_hint}` : data.signer;
  $("accountAuth").hidden = !data.email_hint;
  if (data.status === "signed") {
    $("doneStep").hidden = false;
    if (!session) $("otpStep").hidden = false;
  } else if (session) {
    try { await showPdf(); }
    catch { sessionStorage.removeItem("luce-sign-sign-session"); session = null; $("otpStep").hidden = false; }
  } else $("otpStep").hidden = false;
}
$("otpForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true;
  try { const result = await api("otp-verify", { token, code: event.target.elements.code.value });
    session = result.session; sessionStorage.setItem("luce-sign-sign-session", session);
    if (document.getElementById("doneStep").hidden) await showPdf(); else $("otpStep").hidden = true;
    message("Código de acesso confirmado."); }
  catch (error) { message(error.message); }
  finally { button.disabled = false; }
});
$("accountForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true;
  try {
    const result = await api("account-auth", { token, email: form.elements.email.value.trim(), password: form.elements.password.value });
    form.elements.password.value = "";
    session = result.session; sessionStorage.setItem("luce-sign-sign-session", session);
    if ($("doneStep").hidden) await showPdf(); else $("otpStep").hidden = true;
    message("Identidade confirmada pela conta do Portal Luce.");
  } catch (error) { form.elements.password.value = ""; message(error.message); }
  finally { button.disabled = false; }
});
$("signForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true;
  try { const result = await api("sign", { consent: event.target.elements.consent.checked,
    consent_version: "v1", signature_text: event.target.elements.name.value.trim() });
    $("signStep").hidden = true; $("doneStep").hidden = false; message(result.message); }
  catch (error) { message(error.message); button.disabled = false; }
});
$("declineButton").addEventListener("click", async () => {
  if (!confirm("Recusar a assinatura deste documento? Esta ação será registrada.")) return;
  const button = $("declineButton"); button.disabled = true;
  try { await api("decline", {}); $("signStep").hidden = true; message("Recusa registrada."); }
  catch (error) { message(error.message); button.disabled = false; }
});
$("downloadFinal").addEventListener("click", async () => {
  try { const blob = await api("final", null, true); const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "documento-assinado.pdf"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000); }
  catch (error) { message(error.message); }
});
for (const [id, delta] of [["prevPage", -1], ["nextPage", 1]]) {
  $(id).addEventListener("click", () => { pageNumber = Math.min(pdf.numPages, Math.max(1, pageNumber + delta)); renderPage().catch((error) => message(error.message)); });
}
start().catch((error) => { $("title").textContent = "Documento indisponível"; message(error.message); });
