const modules = [
  {
    initials: "OC",
    name: "Onboarding Contábil",
    href: "app/",
    status: "Disponível",
    description: "Padroniza a entrada de novos clientes, organiza informações e reduz falhas na implantação.",
    benefits: ["Etapas estruturadas", "Documentos centralizados", "Mais segurança na entrada"]
  },
  {
    initials: "RF",
    name: "Review Folha",
    href: "review-folha/",
    status: "Disponível",
    description: "Apoia a revisão e conferência de folhas com padronização e identificação de inconsistências.",
    benefits: ["Conferência organizada", "Menos retrabalho", "Evidências mais claras"]
  },
  {
    initials: "PR",
    name: "Property",
    href: "property/",
    status: "Gestão patrimonial",
    description: "Centraliza imóveis, locações, contratos, recibos e controle de recebimentos.",
    benefits: ["Contratos e recibos", "Controle financeiro", "Visão por imóvel"]
  },
  {
    initials: "RS",
    name: "Radar Sindical",
    href: "radar-sindical/",
    status: "Em integração",
    description: "Organiza convenções coletivas, documentos, alertas e informações por categoria e localidade.",
    benefits: ["Busca centralizada", "Documentos rastreáveis", "Menor risco operacional"]
  },
  {
    initials: "CE",
    name: "CERNE — Inteligência Comercial",
    href: "cerne/",
    status: "Inteligência Comercial",
    description: "Consolida carteira, receita, crescimento, churn, LTV e indicadores estratégicos.",
    benefits: ["Carteira ativa", "Receita recorrente", "Apoio à retenção"]
  },
  {
    initials: "CO",
    name: "Comunicados Orteconte",
    href: "comunicados-orteconte/",
    status: "Disponível",
    description: "Padroniza comunicados por departamento e gera documentos no layout institucional definido.",
    benefits: ["Departamentos", "PDF padronizado", "Elementos gráficos"]
  }
];

const siteHeader = document.getElementById("siteHeader");
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");
const accessDialog = document.getElementById("accessDialog");
const moduleCatalog = document.getElementById("moduleCatalog");
const openLoginButton = document.getElementById("openLogin");
const closeAccessButton = document.getElementById("closeAccess");

function moduleCard(module, compact = false) {
  const benefits = module.benefits.map((benefit) => `<li>${benefit}</li>`).join("");
  return `
    <a class="${compact ? "module-item module-link" : "module-card module-link reveal"}" href="${module.href}" aria-label="Acessar ${module.name}">
      <span class="module-icon" aria-hidden="true">${module.initials}</span>
      <div class="module-name">
        <strong>${module.name}</strong>
        <small>${module.status}</small>
        ${compact ? "" : `<p>${module.description}</p><ul>${benefits}</ul>`}
      </div>
      <span class="${compact ? "module-arrow" : "module-cta"}">
        ${compact ? "→" : "Conhecer módulo →"}
      </span>
    </a>
  `;
}

document.getElementById("landingModules").innerHTML = modules.map((module) => moduleCard(module)).join("");
moduleCatalog.innerHTML = modules.map((module) => moduleCard(module, true)).join("");

function openModules() {
  accessDialog.showModal();
}

openLoginButton.addEventListener("click", openModules);
document.querySelectorAll("[data-open-modules]").forEach((button) => button.addEventListener("click", openModules));
closeAccessButton.addEventListener("click", () => accessDialog.close());
accessDialog.addEventListener("click", (event) => {
  if (event.target === accessDialog) accessDialog.close();
});

menuToggle.addEventListener("click", () => {
  const isOpen = siteHeader.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

mainNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    siteHeader.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

window.addEventListener("scroll", () => {
  siteHeader.classList.toggle("is-solid", window.scrollY > 24);
}, { passive: true });

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
  });
}, { threshold: 0.14 });

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
