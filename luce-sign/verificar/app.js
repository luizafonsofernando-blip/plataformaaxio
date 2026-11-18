const code = new URLSearchParams(location.hash.slice(1)).get("codigo");
history.replaceState(null, "", location.pathname);
async function verify() {
  if (!code) throw new Error("Protocolo ausente.");
  const response = await fetch(`/api/sign?resource=verify`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo: code }), cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Protocolo não encontrado.");
  document.getElementById("status").textContent = "Documento eletrônico concluído";
  for (const key of ["id", "original", "final"]) document.getElementById(key).textContent = result[key === "original" ? "original_sha256" : key === "final" ? "final_sha256" : key];
  document.getElementById("completed").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "long" }).format(new Date(result.completed_at));
  document.getElementById("details").hidden = false;
}
verify().catch((error) => { document.getElementById("status").textContent = error.message; });
