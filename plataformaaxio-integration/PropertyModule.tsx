import { type FormEvent, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getPropertyAccessProfile, PropertyRole } from "./property-auth";

type AuthState = {
  email: string;
  role: PropertyRole;
};

export function PropertyModule() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PropertyRole>("user");
  const [error, setError] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!isSupabaseConfigured || !supabase) {
      setError("Configure VITE_SUPABASE_ANON_KEY para ativar o login real pelo Supabase.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      return;
    }

    setAuth({ email, role });
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setAuth(null);
  }

  if (!auth) {
    return (
      <section style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
        <form onSubmit={signIn} style={{ width: "min(440px, 100%)", display: "grid", gap: 12 }}>
          <img src="/property/axion-logo.png" alt="Axion Solutions" style={{ width: "min(280px, 100%)", margin: "0 auto 8px" }} />
          <h1 style={{ margin: 0, color: "#17345c" }}>Acesse o Property</h1>
          <label>
            Perfil
            <select value={role} onChange={(event) => setRole(event.target.value as PropertyRole)}>
              <option value="user">Usuário - Orteconte e São Cipriano</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <label>
            E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Senha
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          <button type="submit" style={{ minHeight: 42, border: 0, borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 700 }}>
            Acessar sistema
          </button>
          {error && <p style={{ color: "#991b1b", background: "#fee2e2", padding: 10, borderRadius: 8 }}>{error}</p>}
        </form>
      </section>
    );
  }

  const access = getPropertyAccessProfile(auth.role);
  const query = new URLSearchParams({
    role: access.role,
    entities: access.allowedEntityIds.join(","),
    modules: access.allowedModules.join(",")
  });

  return (
    <section style={{ minHeight: "80vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <strong>Property</strong>
          <span style={{ display: "block", color: "#64748b" }}>{auth.email} - {auth.role === "admin" ? "Administrador" : "Usuário"}</span>
        </div>
        <button onClick={signOut} style={{ minHeight: 38, border: 0, borderRadius: 8, background: "#eff6ff", color: "#17345c", padding: "0 14px" }}>
          Sair
        </button>
      </div>
      <iframe
        title="Axion Property"
        src={`/property/axion-property-demo.html?${query.toString()}`}
        style={{ width: "100%", minHeight: "82vh", border: "1px solid #dbe4ee", borderRadius: 8, background: "#fff" }}
      />
    </section>
  );
}
