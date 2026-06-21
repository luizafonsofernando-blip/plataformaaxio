const starSvgs = document.querySelectorAll(".stars");
const cursorGlow = document.querySelector(".cursor-glow");
const canvas = document.getElementById("axonCanvas");
const ctx = canvas.getContext("2d");

function seedStars(svg, count) {
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i += 1) {
    const star = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    star.setAttribute("class", "star");
    star.setAttribute("cx", `${Math.round(Math.random() * 10000) / 100}%`);
    star.setAttribute("cy", `${Math.round(Math.random() * 10000) / 100}%`);
    star.setAttribute("r", `${Math.round((Math.random() + 0.45) * 10) / 10}`);
    fragment.appendChild(star);
  }

  svg.appendChild(fragment);
}

starSvgs.forEach((svg, index) => seedStars(svg, index === 0 ? 170 : index === 1 ? 110 : 70));

window.addEventListener("pointermove", (event) => {
  cursorGlow.style.left = `${event.clientX}px`;
  cursorGlow.style.top = `${event.clientY}px`;
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.18 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

let width = 0;
let height = 0;
let dpr = 1;
let particles = [];
let frame = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  particles = Array.from({ length: 62 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 62,
    radius: 108 + Math.random() * 180,
    speed: 0.0014 + Math.random() * 0.0026,
    z: Math.random() * Math.PI * 2,
  }));
}

function traceAxionMonogram(offsetX = 0, offsetY = 0) {
  ctx.beginPath();
  ctx.moveTo(-174 + offsetX, 158 + offsetY);
  ctx.lineTo(-43 + offsetX, -164 + offsetY);
  ctx.quadraticCurveTo(-35 + offsetX, -181 + offsetY, -16 + offsetX, -181 + offsetY);
  ctx.lineTo(24 + offsetX, -181 + offsetY);
  ctx.quadraticCurveTo(42 + offsetX, -181 + offsetY, 50 + offsetX, -163 + offsetY);
  ctx.lineTo(177 + offsetX, 158 + offsetY);
  ctx.lineTo(92 + offsetX, 158 + offsetY);
  ctx.lineTo(57 + offsetX, 72 + offsetY);
  ctx.lineTo(-79 + offsetX, 72 + offsetY);
  ctx.lineTo(-113 + offsetX, 158 + offsetY);
  ctx.closePath();

  ctx.moveTo(-46 + offsetX, 12 + offsetY);
  ctx.lineTo(30 + offsetX, 12 + offsetY);
  ctx.lineTo(-8 + offsetX, -86 + offsetY);
  ctx.closePath();
}

function drawAxionMark(time) {
  const centerX = width * 0.61;
  const centerY = height * 0.47;
  const scale = Math.min(width, height) / 800;
  const breathe = 1 + Math.sin(time * 0.0012) * 0.012;
  const floatY = Math.sin(time * 0.00075) * 6;

  ctx.save();
  ctx.translate(centerX, centerY + floatY);
  ctx.rotate(Math.sin(time * 0.00035) * 0.018);
  ctx.scale(scale * breathe, scale * breathe);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  traceAxionMonogram(16, 20);
  const depthGradient = ctx.createLinearGradient(-120, -150, 170, 180);
  depthGradient.addColorStop(0, "rgba(7, 29, 73, 0.96)");
  depthGradient.addColorStop(1, "rgba(1, 8, 24, 0.88)");
  ctx.fillStyle = depthGradient;
  ctx.fill("evenodd");

  traceAxionMonogram();
  const bodyGradient = ctx.createLinearGradient(-150, -170, 150, 160);
  bodyGradient.addColorStop(0, "#dcecff");
  bodyGradient.addColorStop(0.25, "#6db9ff");
  bodyGradient.addColorStop(0.58, "#167cea");
  bodyGradient.addColorStop(1, "#082c68");
  ctx.shadowColor = "rgba(30, 136, 255, 0.42)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = bodyGradient;
  ctx.fill("evenodd");
  ctx.shadowBlur = 0;

  ctx.save();
  traceAxionMonogram();
  ctx.clip("evenodd");
  const sheenPosition = ((time * 0.09) % 720) - 360;
  const sheen = ctx.createLinearGradient(sheenPosition - 80, 0, sheenPosition + 80, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.34)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-220, -210, 440, 410);
  ctx.restore();

  traceAxionMonogram();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(221, 239, 255, 0.42)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-122, 128);
  ctx.lineTo(-29, -113);
  ctx.moveTo(116, 128);
  ctx.lineTo(35, -112);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(226, 242, 255, 0.3)";
  ctx.stroke();

  ctx.save();
  ctx.rotate(time * 0.00022);
  ctx.beginPath();
  ctx.ellipse(0, 4, 218, 72, -0.24, 0.18, Math.PI * 1.55);
  ctx.lineWidth = 2;
  const orbitGradient = ctx.createLinearGradient(-210, 0, 210, 0);
  orbitGradient.addColorStop(0, "rgba(89, 178, 255, 0)");
  orbitGradient.addColorStop(0.52, "rgba(212, 239, 255, 0.82)");
  orbitGradient.addColorStop(1, "rgba(89, 178, 255, 0.04)");
  ctx.strokeStyle = orbitGradient;
  ctx.stroke();

  const nodeAngle = time * 0.0008;
  const nodeX = Math.cos(nodeAngle) * 218;
  const nodeY = Math.sin(nodeAngle) * 72 + 4;
  ctx.beginPath();
  ctx.arc(nodeX, nodeY, 5, 0, Math.PI * 2);
  ctx.shadowColor = "#8fceff";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#eaf7ff";
  ctx.fill();
  ctx.restore();

  const corePulse = 1 + Math.sin(time * 0.0024) * 0.12;
  ctx.save();
  ctx.translate(-8, 32);
  ctx.scale(corePulse, corePulse);
  ctx.rotate(Math.PI / 4);
  const coreGradient = ctx.createLinearGradient(-13, -13, 13, 13);
  coreGradient.addColorStop(0, "#ffffff");
  coreGradient.addColorStop(1, "#2499ff");
  ctx.shadowColor = "#52adff";
  ctx.shadowBlur = 22;
  ctx.fillStyle = coreGradient;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();

  ctx.restore();
}

function drawOrbitalParticles(time) {
  const centerX = width * 0.61;
  const centerY = height * 0.47;

  particles.forEach((particle, index) => {
    particle.angle += particle.speed;
    const depth = Math.sin(particle.angle + particle.z);
    const x = centerX + Math.cos(particle.angle) * particle.radius;
    const y = centerY + Math.sin(particle.angle) * particle.radius * 0.34 + depth * 54;
    const size = 1 + (depth + 1) * 1.25;
    const alpha = 0.16 + (depth + 1) * 0.2;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = index % 4 === 0 ? `rgba(230,236,243,${alpha})` : `rgba(30,136,255,${alpha})`;
    ctx.fill();
  });
}

function drawOrbitRings(time) {
  const centerX = width * 0.61;
  const centerY = height * 0.47;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(time * 0.00012);
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 242 + i * 64, 82 + i * 24, 0.2 + i * 0.64, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(230, 236, 243, ${0.11 - i * 0.035})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function animate(time = 0) {
  frame += 1;
  ctx.clearRect(0, 0, width, height);
  drawOrbitRings(time);
  drawOrbitalParticles(time);
  drawAxionMark(time);
  requestAnimationFrame(animate);
}

resizeCanvas();
animate();
window.addEventListener("resize", resizeCanvas);

const SUPABASE_URL = "https://prznhgwiibcazuwlwvnt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gQNx5ZW2OTr5J7jNgTQoOg_1n4ffmG4";
const SUPABASE_SESSION_KEY = "onboardContabilSupabaseSession";
const ADMIN_LOGIN_ALIAS = "fernanddo46";

const accessDialog = document.getElementById("accessDialog");
const openLoginButton = document.getElementById("openLogin");
const closeAccessButton = document.getElementById("closeAccess");
const backToModulesButton = document.getElementById("backToModules");
const accessTitle = document.getElementById("accessTitle");
const moduleCatalog = document.getElementById("moduleCatalog");
const moduleAccess = document.getElementById("moduleAccess");
const openOnboardingModuleButton = document.getElementById("openOnboardingModule");
const loginForm = document.getElementById("loginForm");
const loginSubmit = document.getElementById("loginSubmit");
const loginMessage = document.getElementById("loginMessage");
const sessionPanel = document.getElementById("sessionPanel");
const sessionName = document.getElementById("sessionName");
const adminPanel = document.getElementById("adminPanel");
const signupForm = document.getElementById("signupForm");
const signupSubmit = document.getElementById("signupSubmit");
const signupMessage = document.getElementById("signupMessage");
const logoutButton = document.getElementById("logoutButton");

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function saveSession(session) {
  const expiresAt = Date.now() + Math.max(0, Number(session.expires_in || 0) * 1000);
  sessionStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify({ ...session, expires_at_ms: expiresAt }));
}

function clearSession() {
  sessionStorage.removeItem(SUPABASE_SESSION_KEY);
}

async function authRequest(path, { method = "GET", body, accessToken } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.msg || data.message || "Falha de autenticacao.");
      error.code = data.error_code || data.code || data.error;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function authEmail(identifier) {
  const normalized = String(identifier || "").trim().toLowerCase();
  if (normalized === ADMIN_LOGIN_ALIAS) return `${ADMIN_LOGIN_ALIAS}@axionsolutions.com.br`;
  return normalized;
}

function isAdmin(user) {
  return user?.app_metadata?.role === "admin";
}

function displayName(user) {
  return user?.user_metadata?.display_name || user?.user_metadata?.name || user?.email || "Usuario autenticado";
}

function setMessage(element, message = "", success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
}

function setButtonBusy(button, busy, idleText, busyText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function showAuthenticated(user) {
  loginForm.hidden = true;
  sessionPanel.hidden = false;
  adminPanel.hidden = !isAdmin(user);
  sessionName.textContent = displayName(user);
  openLoginButton.textContent = "Modulos";
}

function showLoggedOut() {
  loginForm.hidden = false;
  sessionPanel.hidden = true;
  adminPanel.hidden = true;
  openLoginButton.textContent = "Modulos";
  loginForm.reset();
  signupForm.reset();
  setMessage(loginMessage);
  setMessage(signupMessage);
}

function showModuleCatalog() {
  moduleCatalog.hidden = false;
  moduleAccess.hidden = true;
  backToModulesButton.hidden = true;
  accessTitle.textContent = "Modulos";
}

function showOnboardingAccess() {
  moduleCatalog.hidden = true;
  moduleAccess.hidden = false;
  backToModulesButton.hidden = false;
  accessTitle.textContent = "Onboarding Contabil";
  if (!loginForm.hidden) setTimeout(() => document.getElementById("loginIdentifier").focus(), 40);
}

async function refreshSession(session) {
  const refreshed = await authRequest("token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: session.refresh_token },
  });
  saveSession(refreshed);
  return refreshed;
}

async function restoreSession() {
  let session = readSession();
  if (!session?.access_token) return null;

  try {
    if (!session.expires_at_ms || session.expires_at_ms <= Date.now() + 60000) {
      session = await refreshSession(session);
    }
    const user = await authRequest("user", { accessToken: session.access_token });
    return { session, user };
  } catch (_error) {
    clearSession();
    return null;
  }
}

function friendlyAuthError(error) {
  if (error?.name === "AbortError") return "O servidor demorou para responder. Tente novamente.";
  if (error?.code === "invalid_credentials") return "Usuario, e-mail ou senha invalidos.";
  if (error?.code === "email_not_confirmed") return "Confirme o e-mail antes de entrar.";
  return "Nao foi possivel concluir o acesso. Verifique os dados e a conexao.";
}

openLoginButton.addEventListener("click", () => {
  accessDialog.showModal();
});

closeAccessButton.addEventListener("click", () => accessDialog.close());
accessDialog.addEventListener("click", (event) => {
  if (event.target === accessDialog) accessDialog.close();
});

if (loginForm) loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage);
  setButtonBusy(loginSubmit, true, "Entrar", "Entrando...");

  try {
    const session = await authRequest("token?grant_type=password", {
      method: "POST",
      body: {
        email: authEmail(document.getElementById("loginIdentifier").value),
        password: document.getElementById("loginPassword").value,
      },
    });
    saveSession(session);
    document.getElementById("loginPassword").value = "";
    showAuthenticated(session.user);
  } catch (error) {
    document.getElementById("loginPassword").value = "";
    setMessage(loginMessage, friendlyAuthError(error));
  } finally {
    setButtonBusy(loginSubmit, false, "Entrar", "Entrando...");
  }
});

if (signupForm) signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const session = readSession();
  if (!session?.access_token) {
    showLoggedOut();
    setMessage(loginMessage, "Sua sessao expirou. Entre novamente.");
    return;
  }

  setMessage(signupMessage);
  setButtonBusy(signupSubmit, true, "Cadastrar usuario", "Cadastrando...");

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: document.getElementById("signupName").value.trim(),
        username: document.getElementById("signupUsername").value.trim(),
        email: document.getElementById("signupEmail").value.trim().toLowerCase(),
        password: document.getElementById("signupPassword").value,
        profile: document.getElementById("signupProfile").value,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Cadastro nao concluido.");
    signupForm.reset();
    setMessage(signupMessage, "Usuario cadastrado com sucesso.", true);
  } catch (error) {
    setMessage(signupMessage, error.message || "Nao foi possivel cadastrar o usuario.");
  } finally {
    setButtonBusy(signupSubmit, false, "Cadastrar usuario", "Cadastrando...");
  }
});

if (logoutButton) logoutButton.addEventListener("click", async () => {
  const session = readSession();
  if (session?.access_token) {
    try {
      await authRequest("logout", { method: "POST", accessToken: session.access_token });
    } catch (_error) {
      // O logout local deve funcionar mesmo quando a rede estiver indisponivel.
    }
  }
  clearSession();
  showLoggedOut();
});

if (loginForm) restoreSession().then((restored) => {
  if (restored) showAuthenticated(restored.user);
  else showLoggedOut();
});
