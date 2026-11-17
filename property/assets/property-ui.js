(() => {
  "use strict";
  const nav = document.getElementById("nav");
  const view = document.getElementById("view");
  const header = document.querySelector("#app .top");
  if (!nav || !view || !header) return;
  const icons = {
    dashboard: "dashboard",
    properties: "properties",
    people: "people",
    contracts: "contracts",
    finance: "finance",
    reports: "reports",
    expenses: "expenses",
    profits: "profits",
    adjustments: "adjustments",
    users: "users",
  };
  const pageName = document.createElement("span");
  pageName.className = "property-page-name";
  header.querySelector("div").append(pageName);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "property-menu-toggle";
  toggle.setAttribute("aria-label", "Abrir navegação");
  toggle.setAttribute("aria-controls", "nav");
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Abrir navegação";
  const icon = document.createElement("img");
  icon.src = "assets/ui-icons/menu.svg";
  icon.alt = "";
  icon.width = icon.height = 20;
  toggle.append(icon);
  header.prepend(toggle);
  const close = () => {
    document.body.classList.remove("property-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir navegação");
    toggle.title = "Abrir navegação";
  };
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("property-nav-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Fechar navegação" : "Abrir navegação",
    );
    toggle.title = open ? "Fechar navegação" : "Abrir navegação";
    if (open) nav.querySelector("button.active,button")?.focus();
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("button")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("property-nav-open")
    ) {
      close();
      toggle.focus();
    }
  });
  window.matchMedia("(min-width:768px)").addEventListener("change", close);
  const decorateNav = () => {
    nav.querySelectorAll("button").forEach((button) => {
      const key = button.id.replace("nav-", "");
      if (icons[key] && !button.querySelector("img")) {
        const img = document.createElement("img");
        img.className = "property-nav-icon";
        img.src = `assets/ui-icons/${icons[key]}.svg`;
        img.alt = "";
        img.width = img.height = 18;
        button.prepend(img);
      }
      const active = button.classList.contains("active");
      if (active && button.getAttribute("aria-current") !== "page")
        button.setAttribute("aria-current", "page");
      if (!active && button.hasAttribute("aria-current"))
        button.removeAttribute("aria-current");
      if (active && pageName.textContent !== button.textContent)
        pageName.textContent = button.textContent;
    });
  };
  const decorateView = () => {
    view.querySelectorAll(".table").forEach((table) => {
      table.tabIndex = 0;
      table.setAttribute("role", "region");
      table.setAttribute("aria-label", "Tabela de dados");
      table.querySelectorAll("td").forEach((cell) => {
        if (/^R\$\s*[\d.,-]+$/.test(cell.textContent.trim()))
          cell.classList.add("property-numeric");
        if (
          cell.hasAttribute("colspan") &&
          cell.parentElement.children.length === 1 &&
          !cell.querySelector("button,input,table")
        )
          cell.classList.add("property-empty");
      });
    });
    view.querySelectorAll(".card.clickable").forEach((card) => {
      if (card.dataset.keyboardReady) return;
      card.dataset.keyboardReady = "true";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          card.click();
        }
      });
    });
    view.querySelectorAll("button").forEach((button) => {
      if (/^(Excluir|Remover|Rescindir)\b/.test(button.textContent.trim()))
        button.classList.add("property-destructive");
    });
  };
  new MutationObserver(decorateNav).observe(nav, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  new MutationObserver(decorateView).observe(view, {
    childList: true,
    subtree: true,
  });
  decorateNav();
  decorateView();
  document.body.classList.add("property-ui-ready");
})();
