const modules = [
  {
    initials: "EB",
    icon: "RF",
    name: "E-BEF",
    href: "/ebef/",
    status: "Controle de declarações",
    description: "Acompanha a situação das declarações E-BEF, os prazos e os responsáveis.",
    benefits: ["Carteira por exercício", "Alertas de prazo", "Histórico de alterações"]
  },
  {
    initials: "OC",
    name: "Onboarding Contábil",
    href: "app/",
    status: "Disponível",
    description:
      "Padroniza a entrada de novos clientes, organiza informações e reduz falhas na implantação.",
    benefits: [
      "Etapas estruturadas",
      "Documentos centralizados",
      "Mais segurança na entrada",
    ],
  },
  {
    initials: "RF",
    name: "Review Folha",
    href: "review-folha/",
    status: "Disponível",
    description:
      "Apoia a revisão e conferência de folhas com padronização e identificação de inconsistências.",
    benefits: [
      "Conferência organizada",
      "Menos retrabalho",
      "Evidências mais claras",
    ],
  },
  {
    initials: "PR",
    name: "Property",
    href: "property/",
    status: "Gestão patrimonial",
    description:
      "Centraliza imóveis, locações, contratos, recibos e controle de recebimentos.",
    benefits: [
      "Contratos e recibos",
      "Controle financeiro",
      "Visão por imóvel",
    ],
  },
  {
    initials: "CO",
    name: "Comunicados",
    href: "comunicados-orteconte/",
    status: "Disponível",
    description:
      "Padroniza comunicados por departamento e gera documentos no layout institucional definido.",
    benefits: ["Departamentos", "PDF padronizado", "Elementos gráficos"],
  },
  {
    initials: "CT",
    name: "Contratos",
    href: "contratos/",
    status: "Gestão contratual",
    description:
      "Prepara contratos contábeis padronizados com conferência assistida e geração em Word e PDF.",
    benefits: [
      "Modelos oficiais",
      "Word e PDF",
      "Preenchimento assistido",
    ],
  },
];

const siteHeader = document.getElementById("siteHeader");
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");
const accessDialog = document.getElementById("accessDialog");
const accessTitle = document.getElementById("accessTitle");
const moduleCatalog = document.getElementById("moduleCatalog");
const openLoginButton = document.getElementById("openLogin");
const closeAccessButton = document.getElementById("closeAccess");

function moduleCard(module, compact = false) {
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const card = element(
    "a",
    "",
    compact ? "module-item module-link" : "module-card module-link reveal",
  );
  card.href = module.href;
  card.setAttribute("aria-label", `Acessar ${module.name}`);
  const icon = element("span", "", "module-icon");
  icon.setAttribute("aria-hidden", "true");
  const image = element("img");
  image.src = `assets/landing-icons/${module.icon ?? module.initials}.svg`;
  image.alt = "";
  image.width = image.height = 24;
  image.loading = "lazy";
  icon.append(image);
  const name = element("div", "", "module-name");
  name.append(element("strong", module.name), element("small", module.status));
  if (!compact) {
    const list = element("ul");
    module.benefits.forEach((benefit) => list.append(element("li", benefit)));
    name.append(element("p", module.description), list);
  }
  card.append(
    icon,
    name,
    element(
      "span",
      compact ? "" : "Conhecer módulo",
      compact ? "module-arrow" : "module-cta",
    ),
  );
  return card;
}

document
  .getElementById("landingModules")
  .replaceChildren(...modules.map((module) => moduleCard(module)));
moduleCatalog.replaceChildren(
  ...modules.map((module) => moduleCard(module, true)),
);
if (accessTitle) accessTitle.textContent = "M\u00f3dulos";

function openModules() {
  closeMenu();
  accessDialog.showModal();
  document.body.classList.add("nav-locked");
  closeAccessButton.focus();
}

openLoginButton.addEventListener("click", openModules);
document
  .querySelectorAll("[data-open-modules]")
  .forEach((button) => button.addEventListener("click", openModules));
closeAccessButton.addEventListener("click", () => accessDialog.close());
accessDialog.addEventListener("close", () =>
  document.body.classList.remove("nav-locked"),
);
accessDialog.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = Array.from(accessDialog.querySelectorAll("button, a[href]"));
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
accessDialog.addEventListener("click", (event) => {
  const bounds = accessDialog.getBoundingClientRect();
  if (
    event.target === accessDialog &&
    (event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom)
  )
    accessDialog.close();
});
moduleCatalog.addEventListener("click", (event) => {
  if (event.target.closest("a")) accessDialog.close();
});

function closeMenu() {
  siteHeader.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menu");
  document.body.classList.toggle("nav-locked", accessDialog.open);
}

menuToggle.addEventListener("click", () => {
  const isOpen = siteHeader.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  document.body.classList.toggle("nav-locked", isOpen);
});

mainNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (siteHeader.classList.contains("menu-open")) {
    closeMenu();
    menuToggle.focus();
  }
});

window.matchMedia("(min-width: 960px)").addEventListener("change", closeMenu);
document.addEventListener("focusin", (event) => {
  if (
    siteHeader.classList.contains("menu-open") &&
    !siteHeader.contains(event.target)
  )
    closeMenu();
});

const navLinks = Array.from(mainNav.querySelectorAll("a"));
function updateNavigation() {
  siteHeader.classList.toggle("is-solid", window.scrollY > 24);
  let active = "#inicio";
  navLinks.forEach((link) => {
    if (document.querySelector(link.hash)?.getBoundingClientRect().top <= 150)
      active = link.hash;
  });
  navLinks.forEach((link) => {
    if (link.hash === active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}
let framePending = false;
window.addEventListener(
  "scroll",
  () => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      updateNavigation();
      framePending = false;
    });
  },
  { passive: true },
);
updateNavigation();

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );

  document
    .querySelectorAll(".reveal")
    .forEach((element) => observer.observe(element));
}
