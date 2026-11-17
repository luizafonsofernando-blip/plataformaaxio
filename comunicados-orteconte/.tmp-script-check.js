
    const segments = {
      pessoal: { name: "Departamento Pessoal", color: "#5b22c8", dark: "#381096", support: "#5b22c8", icon: "DP", headerStart: "#5b22c8", headerMid: "#381096", headerEnd: "#1d0b59" },
      fiscal: { name: "Departamento Fiscal", color: "#078b35", dark: "#056525", support: "#078b35", icon: "DF", headerStart: "#078b35", headerMid: "#056525", headerEnd: "#043f18" },
      contabil: { name: "Departamento Contábil", color: "#e51b23", dark: "#a70d14", support: "#e51b23", icon: "DC", headerStart: "#e51b23", headerMid: "#a70d14", headerEnd: "#681014" },
      processos: { name: "Departamento Financeiro", color: "#ff6a00", dark: "#c64900", support: "#ff6a00", icon: "FIN", headerStart: "#ff7a1a", headerMid: "#d55500", headerEnd: "#8a3300" },
      boletim: { name: "Boletim Semanal", color: "#68acd0", dark: "#3b83ad", support: "#68acd0", icon: "BS", headerStart: "#68acd0", headerMid: "#5aa1c8", headerEnd: "#347da7" },
      reforma: { name: "Reforma Tributária", color: "#27c600", dark: "#5b8ec9", support: "#27c600", icon: "%", headerStart: "#27c600", headerMid: "#5b8ec9", headerEnd: "#1f5e9c" },
      geral: { name: "Geral", color: "#4880c0", dark: "#3f76b5", support: "#4880c0", icon: "i", headerStart: "#4880c0", headerMid: "#4880c0", headerEnd: "#4880c0" }
    };

    const examples = {
      pessoal: {
        title: "Atualização de rotina do departamento pessoal",
        subtitle: "Folha de pagamento ⬢ Comunicado preventivo",
        summaryTitle: "Pontos que merecem atenção",
        summaryItems: "Conferência de admissões e desligamentos\nEnvio de variáveis da folha\nAtualização de benefícios\nPrazo para apontamentos internos"
      },
      fiscal: {
        title: "Prazo para adequação do CClasTrib",
        subtitle: "Reforma Tributária 2026 ⬢ Comunicado importante",
        summaryTitle: "Resumo do que é obrigatório nesta transição",
        summaryItems: "Alíquotas de teste do IBS e CBS\nParametrização do cClasTrib\nEvite rejeição de NF-e e NFC-e\nConfiguração direta no seu sistema ERP"
      },
      contabil: {
        title: "Encerramento contábil mensal",
        subtitle: "Documentos contábeis ⬢ Comunicado importante",
        summaryTitle: "Documentos necessários para fechamento",
        summaryItems: "Extratos bancários completos\nNotas fiscais de entrada e saída\nComprovantes de despesas\nRelatórios financeiros do período"
      },
      processos: {
        title: "Atualização de rotina financeira",
        subtitle: "Financeiro ⬢ Orientação operacional",
        summaryTitle: "Pontos de acompanhamento",
        summaryItems: "Conferência de pagamentos\nOrganização de vencimentos\nRegistro de comprovantes\nAcompanhamento de pendências"
      },
      boletim: {
        title: "Boletim semanal de atualizações",
        subtitle: "Semana informativa ⬢ Orientações gerais",
        summaryTitle: "Principais destaques da semana",
        summaryItems: "Atualizações legais relevantes\nPrazos em acompanhamento\nAvisos operacionais\nMateriais de apoio disponíveis"
      },
      reforma: {
        title: "Fique por dentro da Reforma Tributária",
        subtitle: "Reforma Tributária ⬢ Orientação especial",
        summaryTitle: "Principais pontos da mudança",
        summaryItems: "Novas regras de consumo\nImpactos em documentos fiscais\nAdequação de sistemas e cadastros\nAcompanhamento preventivo pela Orteconte"
      },
      geral: {
        title: "Atualização informativa",
        subtitle: "Comunicado geral ⬢ Divulgação institucional",
        summaryTitle: "Informações de apoio",
        summaryItems: "Orientação geral aos clientes\nAtualização sem impacto crítico\nRegistro para conhecimento\nCanais disponíveis para dúvidas"
      }
    };

    const fields = {
      title: document.querySelector("#title"),
      subtitle: document.querySelector("#subtitle"),
      generalType: document.querySelector("#generalType"),
      generalTypeField: document.querySelector("#generalTypeField"),
      summaryTitle: document.querySelector("#summaryTitle"),
      summaryItems: document.querySelector("#summaryItems"),
      message: document.querySelector("#message"),
      fontFamily: document.querySelector("#fontFamily"),
      fontSize: document.querySelector("#fontSize"),
      inlineGraphicType: document.querySelector("#inlineGraphicType"),
      inlineGraphicTitle: document.querySelector("#inlineGraphicTitle"),
      inlineGraphicRows: document.querySelector("#inlineGraphicRows"),
      inlineGraphicCols: document.querySelector("#inlineGraphicCols"),
      inlineTableConfig: document.querySelector("#inlineTableConfig"),
      inlineGraphicImageFile: document.querySelector("#inlineGraphicImageFile"),
      insertInlineGraphic: document.querySelector("#insertInlineGraphic"),
      openInsertMenu: document.querySelector("#openInsertMenu"),
      tableInsertMenu: document.querySelector("#tableInsertMenu"),
      tablePickerGrid: document.querySelector("#tablePickerGrid"),
      tablePickerLabel: document.querySelector("#tablePickerLabel"),
      removeLastGraphic: document.querySelector("#removeLastGraphic"),
      graphicItemsEditor: document.querySelector("#graphicItemsEditor"),
      addGraphicItem: document.querySelector("#addGraphicItem"),
      bodyImageFile: document.querySelector("#bodyImageFile"),
      bodyImageCaption: document.querySelector("#bodyImageCaption"),
      bodyImageAfterText: document.querySelector("#bodyImageAfterText"),
      clearBodyImage: document.querySelector("#clearBodyImage"),
      deadline: document.querySelector("#deadline"),
      deadlineNote: document.querySelector("#deadlineNote"),
      sender: document.querySelector("#sender"),
      showSummary: document.querySelector("#showSummary"),
      showDeadline: document.querySelector("#showDeadline"),
      summaryStyle: () => document.querySelector("input[name='summaryStyle']:checked").value,
      extraArt: () => document.querySelector("input[name='extraArt']:checked").value
    };

    const preview = {
      title: document.querySelector("#previewTitle"),
      subtitle: document.querySelector("#previewSubtitle"),
      summaryTitle: document.querySelector("#previewSummaryTitle"),
      summaryItems: document.querySelector("#previewSummaryItems"),
      graphicList: document.querySelector("#graphicList"),
      message: document.querySelector("#previewMessage"),
      sender: document.querySelector("#previewSender"),
      segmentName: document.querySelector("#segmentName"),
      summaryBox: document.querySelector("#summaryBox"),
      summaryEditor: document.querySelector("#summaryEditor"),
      reformaCover: document.querySelector("#reformaCover"),
      continuationPages: document.querySelector("#continuationPages"),
      deadlineCard: document.querySelector("#deadlineCard"),
      deadlineDate: document.querySelector("#deadlineDate"),
      deadlineNote: document.querySelector("#deadlineNotePreview"),
      internalHeaderSegment: document.querySelector("#internalHeaderSegment"),
      internalHeaderSubject: document.querySelector("#internalHeaderSubject")
    };

    const segmentGrid = document.querySelector("#segmentGrid");
    let graphicItems = [];
    let bodyImageData = "";
    let syncingPreviewEdit = false;

    function renderSegmentOptions() {
      const orderedSegments = Object.entries(segments).sort(([, first], [, second]) =>
        first.name.localeCompare(second.name, "pt-BR")
      );
      segmentGrid.innerHTML = orderedSegments.map(([key, segment], index) => `
        <label class="segment-option" style="--swatch:${segment.color}">
          <input type="radio" name="segment" value="${key}" ${index === 0  "checked" : ""}>
          <span class="segment-card">
            ${segment.name}
          </span>
        </label>
      `).join("");
    }

    function selectedSegmentKey() {
      return document.querySelector("input[name='segment']:checked").value;
    }

    function displayedSegmentName(segment) {
      if (selectedSegmentKey() === "geral") {
        return fields.generalType.value.trim() || "Geral";
      }
      return segment.name;
    }

    function applySegment(segment) {
      document.documentElement.dataset.segment = selectedSegmentKey();
      document.documentElement.style.setProperty("--accent", segment.color);
      document.documentElement.style.setProperty("--accent-dark", segment.dark);
      document.documentElement.style.setProperty("--support", segment.support || segment.color);
      document.documentElement.style.setProperty("--header-start", segment.headerStart || segment.color);
      document.documentElement.style.setProperty("--header-mid", segment.headerMid || segment.color);
      document.documentElement.style.setProperty("--header-end", segment.headerEnd || segment.dark);
      document.documentElement.style.setProperty("--institutional-text", segment.color);
      document.documentElement.style.setProperty("--footer-bg", segment.headerMid || segment.color);
      preview.segmentName.textContent = displayedSegmentName(segment);
      preview.internalHeaderSegment.textContent = displayedSegmentName(segment);
    }

    function textToParagraphs(value, markLead = true) {
      return value
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean)
        .map((block, index) => `<p class="${markLead && index === 0  "lead" : ""}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
        .join("");
    }

    function getMessageText() {
      return fields.message.innerText
        .replace(/\u00a0/g, " ")
        .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    function normalizeImportedText(value) {
      return value
        .replace(/\r\n/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, "$1")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    function normalizeMessageEditor() {
      return;
    }

    const allowedRichInline = new Set(["B", "STRONG", "U", "BR", "SPAN"]);
    const allowedRichBlock = new Set(["P", "DIV", "SECTION"]);
    const allowedRichTable = new Set(["TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "IMG"]);
    const allowedRichClasses = new Set([
      "inline-graphic-block",
      "graphic-box",
      "is-visible",
      "graphic-header",
      "graphic-content",
      "graphic-table",
      "graphic-caption",
      "graphic-image",
      "graphic-chart",
      "graphic-bar",
      "lead",
      "after-graphic-message",
      "message",
      "import-title",
      "import-subtitle",
      "import-heading",
      "import-source"
    ]);

    function cleanRichNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return document.createTextNode("");
      }

      const tag = node.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        const element = document.createElement("span");
        element.textContent = node.value || node.getAttribute("value") || node.textContent || " ";
        const classes = [...node.classList || []].filter(className => allowedRichClasses.has(className));
        if (classes.length) {
          element.className = classes.join(" ");
        }
        return element;
      }

      const element = document.createElement(
        allowedRichBlock.has(tag) || allowedRichTable.has(tag)
           tag.toLowerCase()
          : allowedRichInline.has(tag)
             tag.toLowerCase()
            : "span"
      );
      const computedStyle = node.getAttribute("style") || "";
      const textAlign = (node.style && node.style.textAlign) || node.getAttribute("align");
      const fontWeight = (node.style && node.style.fontWeight) || "";
      const textDecoration = (node.style && node.style.textDecoration) || "";

      if ((allowedRichBlock.has(tag) || tag === "SPAN") && ["left", "center", "right", "justify"].includes(textAlign)) {
        element.style.textAlign = textAlign;
      } else if (computedStyle.includes("text-align: center")) {
        element.style.textAlign = "center";
      } else if (computedStyle.includes("text-align: right")) {
        element.style.textAlign = "right";
      } else if (computedStyle.includes("text-align: justify")) {
        element.style.textAlign = "justify";
      }

      if (tag === "B" || tag === "STRONG" || /bold|[6-9]00/.test(String(fontWeight))) {
        element.style.fontWeight = "800";
      }

      if (tag === "U" || String(textDecoration).includes("underline") || computedStyle.includes("text-decoration-line: underline")) {
        element.style.textDecoration = "underline";
      }

      const classes = [...node.classList || []].filter(className => allowedRichClasses.has(className));
      if (classes.length) {
        element.className = classes.join(" ");
      }

      if (tag === "IMG") {
        element.setAttribute("src", node.getAttribute("src") || "");
        element.setAttribute("alt", node.getAttribute("alt") || "");
      }

      [...node.childNodes].forEach(child => element.appendChild(cleanRichNode(child)));

      if (tag === "BR") {
        return document.createElement("br");
      }

      return element;
    }

    function sanitizedMessageFragment() {
      const source = fields.message.cloneNode(true);
      const fragment = document.createElement("div");
      [...source.childNodes].forEach(child => fragment.appendChild(cleanRichNode(child)));
      return fragment;
    }

    function sanitizeRichMessage() {
      const fragment = sanitizedMessageFragment();
      if (!fragment.textContent.trim()) {
        return textToParagraphs("Digite o texto do comunicado.");
      }

      return fragment.innerHTML;
    }

    function hasRichMessageFormatting() {
      return !!fields.message.querySelector("b, strong, u, [style*='text-align'], [align], [style*='font-weight'], [style*='text-decoration']");
    }

    function paginateMessage(value) {
      const blocks = value
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean);
      const hasGraphic = hasGraphicContent();
      const visualItems = graphicItems.length + (bodyImageData  1 : 0);
      const visualPenalty = hasGraphic  Math.min(1400, 650 + (visualItems * 300)) : 0;
      const isReforma = selectedSegmentKey() === "reforma";
      const firstBaseLimit = fields.showSummary.checked
         (isReforma  1850 : 1550)
        : (isReforma  2350 : 2150);
      const firstLimit = Math.max(760, firstBaseLimit - visualPenalty);
      const nextLimit = Math.max(1150, (isReforma  2250 : 2050) - Math.max(0, visualPenalty - 500));
      const pages = [];
      let current = "";
      let limit = firstLimit;

      function splitOversizedBlock(block, maxLength) {
        if (block.length <= maxLength) return [block];

        const sentenceParts = block
          .split(/(<=[.!;:])\s+/)
          .map(part => part.trim())
          .filter(Boolean);
        const parts = sentenceParts.length > 1  sentenceParts : block.split(/\s+/);
        const chunks = [];
        let chunk = "";

        parts.forEach(part => {
          const next = chunk  `${chunk} ${part}` : part;
          if (next.length > maxLength && chunk) {
            chunks.push(chunk);
            chunk = part;
          } else if (part.length > maxLength) {
            for (let start = 0; start < part.length; start += maxLength) {
              chunks.push(part.slice(start, start + maxLength));
            }
            chunk = "";
          } else {
            chunk = next;
          }
        });

        if (chunk) chunks.push(chunk);
        return chunks;
      }

      blocks.forEach(block => {
        const usableLimit = current  limit : Math.min(limit, nextLimit);
        const chunks = splitOversizedBlock(block, usableLimit);

        chunks.forEach(chunk => {
          const next = current  `${current}\n\n${chunk}` : chunk;
          if (next.length > limit && current) {
            pages.push(current);
            current = chunk;
            limit = nextLimit;
          } else if (chunk.length > limit) {
            pages.push(chunk);
            current = "";
            limit = nextLimit;
          } else {
            current = next;
          }
        });

        if (pages.length && !current) {
          limit = nextLimit;
        }
      });

      if (current) pages.push(current);
      return pages.length  pages : ["Digite o texto do comunicado."];
    }

    function hasInlineGraphicBlocks() {
      return !!fields.message.querySelector(".inline-graphic-block");
    }

    function blockWeight(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim().length;
      if (node.nodeType !== Node.ELEMENT_NODE) return 0;
      if (node.classList.contains("inline-graphic-block")) {
        const rows = node.querySelectorAll("tr").length;
        return Math.max(520, 360 + (rows * 95));
      }
      const textLength = (node.innerText || node.textContent || "").trim().length;
      if (node.classList.contains("import-title")) return 160;
      if (node.classList.contains("import-subtitle")) return 110;
      if (node.classList.contains("import-heading")) return 95;
      if (node.classList.contains("import-source")) return Math.max(60, textLength * .55);
      return Math.max(60, textLength);
    }

    function mmToPx(value) {
      return value * 96 / 25.4;
    }

    function createPaginationMeasurer() {
      const measurer = document.createElement("div");
      measurer.className = "message";
      measurer.style.position = "absolute";
      measurer.style.left = "-10000px";
      measurer.style.top = "0";
      measurer.style.width = "174mm";
      measurer.style.visibility = "hidden";
      measurer.style.pointerEvents = "none";
      measurer.style.whiteSpace = "pre-wrap";
      document.body.appendChild(measurer);
      return measurer;
    }

    function fitsMeasuredPage(measurer, html, maxHeight) {
      measurer.innerHTML = html;
      return measurer.scrollHeight <= maxHeight;
    }

    function splitTextForPage(text, maxLength = 900) {
      const parts = text
        .replace(/\s+/g, " ")
        .trim()
        .split(/(<=[.!;:])\s+/)
        .filter(Boolean);
      const source = parts.length > 1  parts : text.split(/\s+/).filter(Boolean);
      const chunks = [];
      let chunk = "";

      source.forEach(part => {
        const next = chunk  `${chunk} ${part}` : part;
        if (next.length > maxLength && chunk) {
          chunks.push(chunk);
          chunk = part;
        } else {
          chunk = next;
        }
      });

      if (chunk) chunks.push(chunk);
      return chunks.length  chunks : [text];
    }

    function nodeInlineStyleAttribute(node) {
      const styles = [];
      const textAlign = node.style && node.style.textAlign;
      const fontWeight = node.style && node.style.fontWeight;
      const textDecoration = node.style && node.style.textDecoration;

      if (textAlign) styles.push(`text-align: ${textAlign}`);
      if (fontWeight) styles.push(`font-weight: ${fontWeight}`);
      if (textDecoration) styles.push(`text-decoration: ${textDecoration}`);

      return styles.length  ` style="${styles.join("; ")}"` : "";
    }

    function splitOversizedCleanNode(node, measurer, limit) {
      const html = node.outerHTML || escapeHtml(node.textContent || "");
      if (fitsMeasuredPage(measurer, html, limit) || node.classList.contains("inline-graphic-block")) {
        return [html];
      }

      const tag = node.tagName  node.tagName.toLowerCase() : "p";
      if (!["p", "div", "span", "section"].includes(tag)) {
        return [html];
      }

      const text = (node.innerText || node.textContent || "").trim();
      if (!text) return [html];

      const classAttr = node.className  ` class="${escapeHtml(node.className)}"` : "";
      const styleAttr = nodeInlineStyleAttribute(node);
      return splitTextForPage(text).map(chunk =>
        `<p${classAttr}${styleAttr}>${escapeHtml(chunk)}</p>`
      );
    }

    function paginationBlocks(measurer, limit) {
      const fragment = sanitizedMessageFragment();
      const blocks = [];

      function addNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) blocks.push(`<p>${escapeHtml(text)}</p>`);
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const isGraphic = node.classList.contains("inline-graphic-block");
        const isSimpleWrapper = node.tagName === "DIV"
          && !isGraphic
          && !node.className
          && node.children.length
          && !node.textContent.trim().replace([...node.children].map(child => child.textContent).join(""), "").trim();

        if (isSimpleWrapper) {
          [...node.childNodes].forEach(addNode);
          return;
        }

        splitOversizedCleanNode(node, measurer, limit).forEach(html => blocks.push(html));
      }

      [...fragment.childNodes].forEach(addNode);
      return blocks;
    }

    function paginateEditorHtml() {
      const firstLimit = mmToPx(fields.showSummary.checked  118 : 150);
      const nextLimit = mmToPx(205);
      const pages = [];
      let current = "";
      const measurer = createPaginationMeasurer();
      let limit = firstLimit;
      const blocks = paginationBlocks(measurer, nextLimit);

      blocks.forEach(html => {
        const next = current + html;

        if (current && !fitsMeasuredPage(measurer, next, limit)) {
          pages.push(current);
          current = html;
          limit = nextLimit;
        } else {
          current = next;
        }
      });

      measurer.remove();
      if (current) pages.push(current);
      return pages.length  pages : [textToParagraphs("Digite o texto do comunicado.")];
    }

    function inlineGraphicExportHtml(node) {
      const clone = node.cloneNode(true);
      clone.querySelectorAll("input, textarea").forEach(field => {
        const value = field.value || field.getAttribute("value") || field.textContent || "";
        const replacement = document.createElement("span");
        replacement.textContent = value || " ";
        replacement.className = field.className || "";
        field.replaceWith(replacement);
      });
      clone.querySelectorAll("[contenteditable]").forEach(element => element.removeAttribute("contenteditable"));
      clone.removeAttribute("contenteditable");
      return clone.outerHTML;
    }

    function nodeText(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const values = [...node.querySelectorAll("input, textarea")]
          .map(field => field.value || field.getAttribute("value") || "")
          .filter(Boolean);
        if (values.length) {
          return `${node.innerText || node.textContent || ""}\n${values.join("\n")}`.replace(/\u00a0/g, " ").trim();
        }
      }
      return (node.innerText || node.textContent || "").replace(/\u00a0/g, " ").trim();
    }

    function extractInlineDocumentFlow() {
      const introParts = [];
      const flows = [];
      let activeFlow = null;

      [...fields.message.childNodes].forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("inline-graphic-block")) {
          if (activeFlow) flows.push(activeFlow);
          activeFlow = {
            graphicHtml: inlineGraphicExportHtml(node),
            afterParts: []
          };
          return;
        }

        const text = nodeText(node);
        if (!text) return;

        if (activeFlow) {
          activeFlow.afterParts.push(text);
        } else {
          introParts.push(text);
        }
      });

      if (activeFlow) flows.push(activeFlow);

      return {
        introText: normalizeImportedText(introParts.join("\n\n")),
        flows: flows.map(flow => ({
          graphicHtml: flow.graphicHtml,
          afterText: normalizeImportedText(flow.afterParts.join("\n\n"))
        }))
      };
    }

    function inlineGraphicFlowPages(flows) {
      const pages = [];

      flows.forEach(flow => {
        const chunks = splitFlowText(flow.afterText, 780);
        pages.push(`${flow.graphicHtml}${chunks[0]  `<div class="message after-graphic-message">${textToParagraphs(chunks[0], false)}</div>` : ""}`);
        chunks.slice(1).forEach(chunk => {
          pages.push(`<div class="message">${textToParagraphs(chunk, false)}</div>`);
        });
      });

      return pages;
    }

    function pageArtHtml(style) {
      if (style === "calculator") {
        return `<div class="page-art art-calculator" aria-hidden="true">${"<span></span>".repeat(16)}</div>`;
      }
      if (style === "chart") {
        return `<div class="page-art art-chart" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;
      }
      if (style === "numbers") {
        return `<div class="page-art art-numbers" aria-hidden="true"></div>`;
      }
      return `<div class="page-art none" aria-hidden="true"></div>`;
    }

    function signatureHtml() {
      return `
        <div class="signature">
          Atenciosamente,
          <strong>${escapeHtml(fields.sender.value || "Orteconte Contabilidade")}</strong>
        </div>
      `;
    }

    function currentGraphicHtml() {
      return preview.graphicList.innerHTML || "";
    }

    function afterGraphicHtml() {
      return "";
    }

    function splitFlowText(value, limit = 850) {
      const text = (value || "").trim();
      if (!text) return [];
      const blocks = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
      const pages = [];
      let current = "";

      blocks.forEach(block => {
        const next = current  `${current}\n\n${block}` : block;
        if (next.length > limit && current) {
          pages.push(current);
          current = block;
        } else if (block.length > limit) {
          const words = block.split(/\s+/);
          let chunk = "";
          words.forEach(word => {
            const candidate = chunk  `${chunk} ${word}` : word;
            if (candidate.length > limit && chunk) {
              pages.push(chunk);
              chunk = word;
            } else {
              chunk = candidate;
            }
          });
          current = chunk;
        } else {
          current = next;
        }
      });

      if (current) pages.push(current);
      return pages;
    }

    function bodyImageBoxOnlyHtml() {
      if (!bodyImageData) return "";
      return `
        <section class="graphic-box is-visible">
          <div class="graphic-content"><div class="graphic-image"><img src="${escapeHtml(bodyImageData)}" alt="Imagem do comunicado"></div></div>
          <div class="graphic-caption ${fields.bodyImageCaption.value.trim()  "is-visible" : ""}">${escapeHtml(fields.bodyImageCaption.value.trim())}</div>
        </section>
      `;
    }

    function graphicBoxOnlyHtml(item) {
      return `
        <section class="graphic-box is-visible">
          <div class="graphic-header">${escapeHtml(item.title || "Elemento gráfico")}</div>
          <div class="graphic-content">${graphicContentHtml(item)}</div>
          <div class="graphic-caption ${item.caption  "is-visible" : ""}">${escapeHtml(item.caption || "")}</div>
        </section>
      `;
    }

    function visualFlowPages() {
      const pages = [];

      if (bodyImageData) {
        const chunks = splitFlowText(fields.bodyImageAfterText.value, 760);
        pages.push(`${bodyImageBoxOnlyHtml()}${chunks[0]  `<div class="message after-graphic-message">${textToParagraphs(chunks[0], false)}</div>` : ""}`);
        chunks.slice(1).forEach(chunk => {
          pages.push(`<div class="message">${textToParagraphs(chunk, false)}</div>`);
        });
      }

      graphicItems.forEach(item => {
        const chunks = splitFlowText(item.afterText, item.type === "table"  620 : 760);
        pages.push(`${graphicBoxOnlyHtml(item)}${chunks[0]  `<div class="message after-graphic-message">${textToParagraphs(chunks[0], false)}</div>` : ""}`);
        chunks.slice(1).forEach(chunk => {
          pages.push(`<div class="message">${textToParagraphs(chunk, false)}</div>`);
        });
      });

      return pages;
    }

    function renderContinuationPages(textPages, flowPages = []) {
      const segment = segments[selectedSegmentKey()];
      const artStyle = fields.extraArt();
      const segmentName = displayedSegmentName(segment);
      const continuationPages = [
        ...textPages.map(pageText => (
          typeof pageText === "string"
             { kind: "text", html: `<div class="message">${textToParagraphs(pageText, false)}</div>` }
            : pageText
        )),
        ...flowPages.map(html => ({ kind: "flow", html }))
      ];

      preview.continuationPages.innerHTML = continuationPages.map((page, index) => `
        <article class="sheet print-page continuation-sheet">
          <header class="sheet-header">
            <div class="sheet-brand">
              <img class="brand-mark" src="orteconte-header-symbol.png" alt="">
              <div class="internal-header-copy">
                <strong>${escapeHtml(segmentName)}</strong>
                <span></span>
              </div>
              <img class="brand-logo" src="orteconte-header-logo.png" alt="Orteconte Contabilidade">
            </div>
          </header>
          <div class="content">
            <div class="tag-row">
              <div class="tag">
                <span>${escapeHtml(segmentName)}</span>
              </div>
            </div>
            <section class="body-block">
              <div class="body-main">
                ${page.html}
                ${index === continuationPages.length - 1  signatureHtml() : ""}
              </div>
            </section>
          </div>
          ${pageArtHtml(artStyle)}
          <footer class="sheet-footer">
            <div class="footer-item"><img class="footer-icon" src="whatsapp-orteconte.png" alt=""> (33) 3339-1000</div>
            <div class="footer-item">orteconte@orteconte.com.br</div>
            <div class="footer-item">www.orteconte.com.br</div>
          </footer>
        </article>
      `).join("");
    }

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character]));
    }

    function formatDate(value) {
      if (!value) return "";
      const [year, month, day] = value.split("-");
      return `${day}/${month}/${year}`;
    }

    function renderSummaryItems() {
      const style = fields.summaryStyle();
      const iconSets = {
        indicators: ["%", "", "!", ""],
        ledger: ["R$", "NF", "", ""],
        calendar: ["01", "10", "20", "31"]
      };
      const icons = iconSets[style] || iconSets.indicators;
      const items = fields.summaryItems.value
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 4);

      preview.summaryItems.innerHTML = items.map((item, index) => `
        <div class="summary-item">
          <div class="summary-icon">${icons[index] || "⬢"}</div>
          <div>${escapeHtml(item)}</div>
        </div>
      `).join("");
    }

    function clampNumber(value, min, max, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.min(max, Math.max(min, Math.round(number)));
    }

    function createGraphicItem(type = "table") {
      return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        type,
        title: type === "table"  "Tabela" : type === "chart"  "Gráfico" : "Imagem",
        data: "",
        caption: "",
        afterText: "",
        rows: 3,
        cols: 2,
        table: [["Item", "Descrição"], ["1", "Informação principal"], ["2", "Informação complementar"]]
      };
    }

    function collectGraphicItemsFromDom() {
      graphicItems = [...fields.graphicItemsEditor.querySelectorAll(".graphic-item-editor")].map(editor => {
        const id = editor.dataset.id;
        const existing = graphicItems.find(item => item.id === id) || createGraphicItem();
        const type = editor.querySelector("[data-field='type']").value;
        const rows = clampNumber(editor.querySelector("[data-field='rows']").value, 1, 12, existing.rows || 3);
        const cols = clampNumber(editor.querySelector("[data-field='cols']").value, 1, 8, existing.cols || 2);
        const table = [...editor.querySelectorAll(".table-editor tr")].map(row =>
          [...row.querySelectorAll("input")].map(input => input.value.trim())
        );

        return {
          ...existing,
          type,
          title: editor.querySelector("[data-field='title']").value.trim(),
          data: editor.querySelector("[data-field='data']").value.trim() || existing.data || "",
          caption: editor.querySelector("[data-field='caption']").value.trim(),
          afterText: editor.querySelector("[data-field='afterText']").value.trim(),
          rows,
          cols,
          table: table.length  table : existing.table
        };
      });
    }

    function tableEditorHtml(item) {
      const rows = clampNumber(item.rows, 1, 12, 3);
      const cols = clampNumber(item.cols, 1, 8, 2);
      const source = item.table && item.table.length  item.table : [["Item", "Descrição"], ["1", "Informação principal"], ["2", "Informação complementar"]];
      const cell = (rowIndex, colIndex) => source[rowIndex].[colIndex] || "";

      return `
        <div class="table-builder is-visible">
          <div class="table-size-grid">
            <div class="field">
              <label>Linhas da tabela</label>
              <input class="input" data-field="rows" type="number" min="1" max="12" value="${rows}">
            </div>
            <div class="field">
              <label>Colunas da tabela</label>
              <input class="input" data-field="cols" type="number" min="1" max="8" value="${cols}">
            </div>
          </div>
          <div class="table-editor">
            <table>
              <thead>
                <tr>${Array.from({ length: cols }, (_, colIndex) => `<th><input type="text" value="${escapeHtml(cell(0, colIndex))}"></th>`).join("")}</tr>
              </thead>
              <tbody>
                ${Array.from({ length: Math.max(0, rows - 1) }, (_, bodyIndex) => `
                  <tr>${Array.from({ length: cols }, (_, colIndex) => `<td><input type="text" value="${escapeHtml(cell(bodyIndex + 1, colIndex))}"></td>`).join("")}</tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function graphicItemEditorHtml(item, index) {
      const isTable = item.type === "table";
      const isImage = item.type === "image";
      const isChart = item.type === "chart";

      return `
        <div class="graphic-item-editor" data-id="${item.id}">
          <div class="graphic-item-head">
            <strong>Elemento gráfico ${index + 1}</strong>
            <button class="small-action danger" type="button" data-action="remove-graphic">Remover</button>
          </div>
          <div class="two-fields">
            <div class="field">
              <label>Tipo</label>
              <select class="select" data-field="type">
                <option value="table" ${isTable  "selected" : ""}>Tabela</option>
                <option value="chart" ${isChart  "selected" : ""}>Gráfico</option>
                <option value="image" ${isImage  "selected" : ""}>Imagem</option>
              </select>
            </div>
            <div class="field">
              <label>Título</label>
              <input class="input" data-field="title" maxlength="55" value="${escapeHtml(item.title || "")}">
            </div>
          </div>
          ${isTable  tableEditorHtml(item) : `
            <div class="field">
              <label>${isChart  "Dados do gráfico" : "URL da imagem"}</label>
              <textarea class="textarea" data-field="data" style="min-height: 95px;" placeholder="${isChart  "Use Nome;Valor, uma linha por item." : "Cole a URL da imagem ou selecione um arquivo abaixo."}">${escapeHtml(item.data || "")}</textarea>
            </div>
            ${isImage  `<div class="field"><label>Arquivo de imagem</label><input class="input" type="file" accept="image/*" data-action="load-graphic-image"></div>` : ""}
          `}
          <div class="field">
            <label>Texto abaixo do elemento gráfico (opcional)</label>
            <textarea class="textarea" data-field="caption" style="min-height: 70px;">${escapeHtml(item.caption || "")}</textarea>
          </div>
          <div class="field">
            <label>Continuação do texto após este elemento (opcional)</label>
            <textarea class="textarea" data-field="afterText" style="min-height: 85px;" placeholder="Digite aqui o texto que deve continuar logo após este elemento.">${escapeHtml(item.afterText || "")}</textarea>
          </div>
        </div>
      `;
    }

    function renderGraphicItemsEditor() {
      fields.graphicItemsEditor.innerHTML = graphicItems.map(graphicItemEditorHtml).join("");
    }

    function graphicContentHtml(item) {
      if (item.type === "table") {
        const header = item.table.[0].some(Boolean)  item.table[0] : ["Item", "Descrição"];
        const body = (item.table || []).slice(1).filter(row => row.some(Boolean));
        return `
          <table class="graphic-table">
            <thead><tr>${header.map(cell => `<th>${escapeHtml(cell || " ")}</th>`).join("")}</tr></thead>
            <tbody>${body.map(row => `<tr>${header.map((_, index) => `<td>${escapeHtml(row[index] || " ")}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        `;
      }

      if (item.type === "chart") {
        const rows = (item.data || "Fiscal;70\nContábil;45\nPessoal;55")
          .split("\n")
          .map(row => row.split(";").map(cell => cell.trim()))
          .filter(row => row[0]);
        const values = rows.map(row => Math.max(1, Number(row[1]) || 1));
        const max = Math.max(...values, 1);
        return `
          <div class="graphic-chart">
            ${rows.map((row, index) => {
              const value = values[index];
              const height = Math.max(12, Math.round((value / max) * 100));
              return `<div class="graphic-bar"><span style="height:${height}%"></span><div>${escapeHtml(row[0])}</div></div>`;
            }).join("")}
          </div>
        `;
      }

      return item.data
         `<div class="graphic-image"><img src="${escapeHtml(item.data)}" alt="Imagem inserida"></div>`
        : `<div class="graphic-image">Selecione um arquivo ou cole a URL da imagem.</div>`;
    }

    function graphicBoxHtml(item) {
      return `
        <section class="graphic-box is-visible">
          <div class="graphic-header">${escapeHtml(item.title || "Elemento gráfico")}</div>
          <div class="graphic-content">${graphicContentHtml(item)}</div>
          <div class="graphic-caption ${item.caption  "is-visible" : ""}">${escapeHtml(item.caption || "")}</div>
        </section>
        ${item.afterText  `<div class="message after-graphic-message">${textToParagraphs(item.afterText, false)}</div>` : ""}
      `;
    }

    function bodyImageHtml() {
      if (!bodyImageData) return "";
      return `
        <section class="graphic-box is-visible">
          <div class="graphic-content"><div class="graphic-image"><img src="${escapeHtml(bodyImageData)}" alt="Imagem do comunicado"></div></div>
          <div class="graphic-caption ${fields.bodyImageCaption.value.trim()  "is-visible" : ""}">${escapeHtml(fields.bodyImageCaption.value.trim())}</div>
        </section>
        ${fields.bodyImageAfterText.value.trim()  `<div class="message after-graphic-message">${textToParagraphs(fields.bodyImageAfterText.value.trim(), false)}</div>` : ""}
      `;
    }

    function hasGraphicContent() {
      return !!bodyImageData || graphicItems.length > 0;
    }

    function renderGraphic() {
      collectGraphicItemsFromDom();
      const html = `${bodyImageHtml()}${graphicItems.map(graphicBoxHtml).join("")}`;
      preview.graphicList.innerHTML = html;
      preview.graphicList.classList.toggle("is-visible", !!html);
    }

    function syncPreviewTitle() {
      fields.title.value = preview.title.textContent.trim();
      preview.internalHeaderSubject.textContent = "";
    }

    function syncPreviewSubtitle() {
      fields.subtitle.value = preview.subtitle.textContent.trim();
      preview.subtitle.classList.toggle("is-placeholder", !fields.subtitle.value);
    }

    function syncPreviewMessage() {
      fields.message.innerHTML = preview.message.innerHTML.trim();
    }

    function refreshEditablePreviewState() {
      preview.title.setAttribute("contenteditable", "true");
      preview.subtitle.setAttribute("contenteditable", "true");
      preview.message.setAttribute("contenteditable", "true");
    }

    function render() {
      if (syncingPreviewEdit) return;
      const segment = segments[selectedSegmentKey()];
      const summaryStyle = fields.summaryStyle();
      applySegment(segment);
      fields.generalTypeField.style.display = selectedSegmentKey() === "geral"  "" : "none";
      preview.title.textContent = fields.title.value || "Título do comunicado";
      const subtitleText = fields.subtitle.value.trim();
      preview.subtitle.textContent = subtitleText || "Linha complementar";
      preview.subtitle.classList.toggle("is-placeholder", !subtitleText);
      preview.summaryTitle.textContent = fields.summaryTitle.value || "Resumo";
      preview.internalHeaderSubject.textContent = "";
      renderGraphic();
      normalizeMessageEditor();
      const messageText = getMessageText() || "Digite o texto do comunicado.";
      const inlineMode = hasInlineGraphicBlocks();
      let messagePages = [];
      let flowPages = visualFlowPages();

      if (inlineMode || hasRichMessageFormatting()) {
        const htmlPages = paginateEditorHtml();
        messagePages = htmlPages;
        preview.message.innerHTML = htmlPages[0] || sanitizeRichMessage();
        renderContinuationPages(htmlPages.slice(1).map(html => ({
          kind: "html",
          html: `<div class="message">${html}</div>`
        })), flowPages);
      } else {
        messagePages = paginateMessage(messageText);
        preview.message.innerHTML = messagePages.length === 1
           sanitizeRichMessage()
          : textToParagraphs(messagePages[0]);
        renderContinuationPages(messagePages.slice(1), flowPages);
      }
      preview.sender.textContent = fields.sender.value || "Orteconte Contabilidade";
      preview.graphicList.style.display = "none";
      document.querySelector("#afterGraphicPreview").innerHTML = "";
      document.querySelector("#previewSignature").style.display = messagePages.length === 1 && flowPages.length === 0  "" : "none";
      preview.summaryBox.style.display = fields.showSummary.checked  "" : "none";
      preview.summaryEditor.classList.toggle("is-visible", fields.showSummary.checked);
      fields.summaryTitle.disabled = !fields.showSummary.checked;
      fields.summaryItems.disabled = !fields.showSummary.checked;
      preview.summaryBox.classList.remove("style-indicators", "style-ledger", "style-calendar");
      preview.summaryBox.classList.add(`style-${summaryStyle}`);
      preview.reformaCover.classList.toggle("is-visible", selectedSegmentKey() === "reforma");
      preview.deadlineCard.style.display = fields.showDeadline.checked && fields.deadline.value  "" : "none";
      preview.deadlineDate.textContent = formatDate(fields.deadline.value);
      preview.deadlineNote.textContent = fields.deadlineNote.value || "Inclua aqui a orientação relacionada ao prazo.";
      renderSummaryItems();
      refreshEditablePreviewState();
    }

    function fillExample() {
      const key = selectedSegmentKey();
      const example = examples[key];
      fields.title.value = example.title;
      fields.subtitle.value = example.subtitle;
      fields.summaryTitle.value = example.summaryTitle;
      fields.summaryItems.value = example.summaryItems;
      render();
    }

    function generatePdf() {
      render();
      const printRoot = document.querySelector("#printRoot");
      const pages = [...document.querySelectorAll(".print-page")]
        .filter(page => getComputedStyle(page).display !== "none")
        .map(page => page.cloneNode(true));

      printRoot.replaceChildren(...pages);
      document.body.classList.add("printing-pdf");

      const cleanPrint = () => {
        document.body.classList.remove("printing-pdf");
        printRoot.replaceChildren();
        window.removeEventListener("afterprint", cleanPrint);
      };

      window.addEventListener("afterprint", cleanPrint);
      window.print();
    }

    function visiblePrintPages() {
      render();
      return [...document.querySelectorAll(".print-page")]
        .filter(page => getComputedStyle(page).display !== "none")
        .map(page => page.cloneNode(true));
    }

    function blobToDataUrl(blob) {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    }

    async function inlineImages(root) {
      const images = [...root.querySelectorAll("img")];
      await Promise.all(images.map(async image => {
        const src = image.getAttribute("src") || "";
        if (!src || src.startsWith("data:")) return;

        try {
          const url = new URL(src, window.location.href).href;
          const response = await fetch(url);
          if (!response.ok) return;
          const dataUrl = await blobToDataUrl(await response.blob());
          if (dataUrl) image.setAttribute("src", dataUrl);
        } catch (error) {
          image.setAttribute("src", src);
        }
      }));
    }

    function downloadBlob(blob, filename) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1200);
    }

    async function generateWord() {
      const pages = visiblePrintPages();
      const wrapper = document.createElement("div");
      wrapper.className = "word-export";
      wrapper.replaceChildren(...pages);
      await inlineImages(wrapper);

      const styles = [...document.querySelectorAll("style")]
        .map(style => style.textContent)
        .join("\n");
      const title = (fields.title.value || "comunicado-orteconte")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/(^-|-$)/g, "")
        .toLowerCase();
      const html = `
        <!DOCTYPE html>
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8">
            <title>${escapeHtml(fields.title.value || "Comunicado Orteconte")}</title>
            <!--[if gte mso 9]>
            <xml>
              <w:WordDocument>
                <w:View>Print</w:View>
                <w:Zoom>100</w:Zoom>
                <w:DoNotOptimizeForBrowser/>
              </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
              @page WordSection1 { size: 210mm 297mm; margin: 0; }
              div.WordSection1 { page: WordSection1; }
              ${styles}
              html, body { margin: 0; padding: 0; background: #fff; }
              .panel, .app, .print-root { display: none !important; }
              .word-export { display: block !important; }
              .word-export .print-page {
                display: block !important;
                width: 210mm !important;
                height: 297mm !important;
                min-height: 297mm !important;
                margin: 0 !important;
                box-shadow: none !important;
                page-break-after: always;
              }
              .word-export .print-page:last-child { page-break-after: auto; }
            </style>
          </head>
          <body>
            <div class="WordSection1">${wrapper.innerHTML}</div>
          </body>
        </html>
      `;

      const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
      downloadBlob(blob, `${title || "comunicado-orteconte"}.doc`);
    }

    function loadImageFile(file, callback) {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        callback(reader.result);
        render();
      };
      reader.readAsDataURL(file);
    }

    function addGraphicItem(type = "table") {
      collectGraphicItemsFromDom();
      graphicItems.push(createGraphicItem(type));
      renderGraphicItemsEditor();
      render();
    }

    function handleGraphicEditorChange(event) {
      const editor = event.target.closest(".graphic-item-editor");
      if (!editor) return;

      if (event.target.matches("[data-action='load-graphic-image']")) {
        const item = graphicItems.find(entry => entry.id === editor.dataset.id);
        loadImageFile(event.target.files && event.target.files[0], dataUrl => {
          const dataField = editor.querySelector("[data-field='data']");
          if (dataField) dataField.value = dataUrl;
          if (item) item.data = dataUrl;
        });
        return;
      }

      if (event.target.matches("[data-field='type'], [data-field='rows'], [data-field='cols']")) {
        collectGraphicItemsFromDom();
        renderGraphicItemsEditor();
        render();
      }
    }

    let savedMessageRange = null;

    function saveMessageSelection() {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (fields.message.contains(range.commonAncestorContainer)) {
        savedMessageRange = range.cloneRange();
      }
    }

    function restoreMessageSelection() {
      if (!savedMessageRange) return;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedMessageRange);
    }

    function applyTextFormat(command) {
      fields.message.focus();
      restoreMessageSelection();
      document.execCommand(command, false, null);
      saveMessageSelection();
      render();
    }

    function applyInlineStyleToSelection(styleMap) {
      fields.message.focus();
      restoreMessageSelection();
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!fields.message.contains(range.commonAncestorContainer)) return;
      const span = document.createElement("span");
      Object.assign(span.style, styleMap);
      if (range.collapsed) {
        span.appendChild(document.createTextNode("\u200b"));
        range.insertNode(span);
        range.setStart(span.firstChild, 1);
        range.collapse(true);
      } else {
        span.appendChild(range.extractContents());
        range.insertNode(span);
        range.selectNodeContents(span);
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);
      saveMessageSelection();
      render();
    }

    function insertHtmlAtSelection(html) {
      fields.message.focus();
      restoreMessageSelection();
      const selection = window.getSelection();
      const range = selection && selection.rangeCount
         selection.getRangeAt(0)
        : document.createRange();
      const container = document.createElement("div");
      container.innerHTML = html;
      const fragment = document.createDocumentFragment();
      let lastNode = null;

      [...container.childNodes].forEach(node => {
        lastNode = fragment.appendChild(node);
      });

      if (!selection || !selection.rangeCount) {
        range.selectNodeContents(fields.message);
        range.collapse(false);
      }

      range.deleteContents();
      range.insertNode(fragment);

      if (lastNode) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastNode);
        nextRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(nextRange);
        saveMessageSelection();
      }
    }

    function pastedHtmlToEditorHtml(html) {
      const container = document.createElement("div");
      container.innerHTML = html;
      container.querySelectorAll("script, style, meta, link, iframe, button, input, textarea, select").forEach(node => node.remove());
      container.querySelectorAll("a").forEach(link => {
        const span = document.createElement("span");
        span.textContent = link.textContent || "";
        link.replaceWith(span);
      });
      container.querySelectorAll("table").forEach(table => {
        table.className = "graphic-table";
        table.removeAttribute("style");
        table.querySelectorAll("*").forEach(child => {
          child.removeAttribute("style");
          child.removeAttribute("class");
          child.removeAttribute("width");
          child.removeAttribute("height");
        });
      });
      const cleaned = document.createElement("div");
      [...container.childNodes].forEach(child => cleaned.appendChild(cleanRichNode(child)));
      return cleaned.innerHTML;
    }

    function isMainTitleLine(line) {
      return line.length > 6 && line === line.toUpperCase() && /[A-Z]/.test(line) && !/^\d/.test(line);
    }

    function isNumberedHeading(line) {
      return /^\d+(\.\d+)*\.\s+\S/.test(line);
    }

    function paragraphHtml(text, className = "") {
      const classAttr = className  ` class="${className}"` : "";
      return `<p${classAttr}>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
    }

    function consumeAliquotTable(lines, startIndex) {
      const compact = [];
      let index = startIndex;

      while (index < lines.length) {
        const line = lines[index].trim();
        if (/^Fonte:/i.test(line)) break;
        if (line) compact.push(line);
        index += 1;
      }

      const headerIndex = compact.findIndex(line => /^Ano$/i.test(line));
      const ibsIndex = compact.findIndex(line => /^Alíquota do IBS$/i.test(line));
      const cbsIndex = compact.findIndex(line => /^Alíquota da CBS$/i.test(line));

      if (headerIndex === -1 || ibsIndex === -1 || cbsIndex === -1) return null;

      const rows = [];
      let cursor = Math.max(headerIndex, ibsIndex, cbsIndex) + 1;
      while (cursor < compact.length) {
        const year = compact[cursor] || "";
        const ibs = compact[cursor + 1] || "";
        const cbs = compact[cursor + 2] || "";
        if (!year || !ibs || !cbs) break;
        rows.push([year, ibs, cbs]);
        cursor += 3;
      }

      if (!rows.length) return null;

      const table = `
        <div class="inline-graphic-block graphic-box is-visible" data-inline-graphic="table" contenteditable="false">
          <div class="graphic-header"><span>Tabela de alíquotas</span></div>
          <div class="graphic-content">
            <table class="graphic-table">
              <thead><tr><th>Ano</th><th>Alíquota do IBS</th><th>Alíquota da CBS</th></tr></thead>
              <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
          </div>
        </div>
      `;

      return { html: table, nextIndex: index };
    }

    function plainTextToEditorHtml(value) {
      const lines = normalizeImportedText(value)
        .split("\n")
        .map(line => line.trim());
      const html = [];
      let paragraph = [];
      let titleCount = 0;

      function flushParagraph() {
        if (!paragraph.length) return;
        html.push(paragraphHtml(paragraph.join(" ")));
        paragraph = [];
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (!line) {
          flushParagraph();
          continue;
        }

        if (/^Ano$/i.test(line) && lines.slice(index, index + 8).some(item => /^Alíquota do IBS$/i.test(item.trim()))) {
          flushParagraph();
          const table = consumeAliquotTable(lines, index);
          if (table) {
            html.push(table.html);
            index = table.nextIndex - 1;
            continue;
          }
        }

        if (/^Fonte:/i.test(line)) {
          flushParagraph();
          html.push(paragraphHtml(line, "import-source"));
          continue;
        }

        if (titleCount < 2 && isMainTitleLine(line)) {
          flushParagraph();
          html.push(paragraphHtml(line, titleCount === 0  "import-title" : "import-subtitle"));
          titleCount += 1;
          continue;
        }

        if (isNumberedHeading(line)) {
          flushParagraph();
          html.push(paragraphHtml(line, "import-heading"));
          continue;
        }

        if (/^[IVXLCDM]+ -\s+/.test(line) || /^[a-z]\)\s*/i.test(line)) {
          flushParagraph();
          html.push(paragraphHtml(line));
          continue;
        }

        paragraph.push(line);
      }

      flushParagraph();
      return html.join("");
    }

    function handleMessagePaste(event) {
      const clipboard = event.clipboardData;
      const html = clipboard && clipboard.getData("text/html");
      const text = clipboard && clipboard.getData("text/plain");
      if (!html && !text) return;

      event.preventDefault();
      const imported = html && /<table[\s>]/i.test(html)
         pastedHtmlToEditorHtml(html)
        : plainTextToEditorHtml(text || "");
      insertHtmlAtSelection(imported);
      render();
    }

    function inlineTableHtml(rows, cols, title) {
      const safeRows = clampNumber(rows, 1, 12, 3);
      const safeCols = clampNumber(cols, 1, 8, 3);
      return `
        <div class="inline-graphic-block inline-table-block" data-inline-graphic="table" contenteditable="false">
          <table class="graphic-table">
            <thead>
              <tr>${Array.from({ length: safeCols }, (_, index) => `<th><input class="graphic-cell-input" type="text" value="Coluna ${index + 1}" aria-label="Cabecalho da coluna ${index + 1}"></th>`).join("")}</tr>
            </thead>
            <tbody>
              ${Array.from({ length: Math.max(0, safeRows - 1) }, (_, rowIndex) => `
                <tr>${Array.from({ length: safeCols }, (_, colIndex) => `<td><input class="graphic-cell-input" type="text" value="${rowIndex + 1}.${colIndex + 1}" aria-label="Celula ${rowIndex + 1}, ${colIndex + 1}"></td>`).join("")}</tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <p><br></p>
      `;
    }
    function inlineChartHtml(title) {
      return `
        <div class="inline-graphic-block graphic-box is-visible" data-inline-graphic="chart" contenteditable="false">
          <div class="graphic-header"><input class="graphic-header-input" type="text" value="${escapeHtml(title || "Gráfico")}" aria-label="Título do gráfico"></div>
          <div class="graphic-content">
            <div class="graphic-chart">
              <div class="graphic-bar"><span style="height:80%"></span><input class="graphic-chart-input" type="text" value="Indicador 1" aria-label="Indicador 1"></div>
              <div class="graphic-bar"><span style="height:55%"></span><input class="graphic-chart-input" type="text" value="Indicador 2" aria-label="Indicador 2"></div>
              <div class="graphic-bar"><span style="height:68%"></span><input class="graphic-chart-input" type="text" value="Indicador 3" aria-label="Indicador 3"></div>
            </div>
          </div>
          <div class="graphic-caption is-visible"><input class="graphic-caption-input" type="text" value="Legenda opcional" aria-label="Legenda do gráfico"></div>
        </div>
        <p><br></p>
      `;
    }

    function inlineImageHtml(title, src = "") {
      return `
        <div class="inline-graphic-block graphic-box is-visible" data-inline-graphic="image" contenteditable="false">
          <div class="graphic-header"><input class="graphic-header-input" type="text" value="${escapeHtml(title || "Imagem")}" aria-label="Título da imagem"></div>
          <div class="graphic-content">
            <div class="graphic-image">${src  `<img src="${escapeHtml(src)}" alt="Imagem inserida">` : "Selecione uma imagem para inserir."}</div>
          </div>
          <div class="graphic-caption is-visible"><input class="graphic-caption-input" type="text" value="Legenda opcional" aria-label="Legenda da imagem"></div>
        </div>
        <p><br></p>
      `;
    }

    function insertHtmlAtEnd(html) {
      fields.message.focus();
      const selection = window.getSelection();
      const container = document.createElement("div");
      container.innerHTML = html;
      const nodes = [...container.childNodes];
      let lastNode = null;

      nodes.forEach(node => {
        lastNode = fields.message.appendChild(node);
      });

      const trailingParagraph = lastNode;
      if (trailingParagraph) {
        const newRange = document.createRange();
        newRange.selectNodeContents(trailingParagraph);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      render();
    }

    function closeInsertMenu() {
      fields.tableInsertMenu.hidden = true;
      fields.openInsertMenu.setAttribute("aria-expanded", "false");
    }

    function setTablePickerSelection(rows = 0, cols = 0) {
      [...fields.tablePickerGrid.querySelectorAll(".table-picker-cell")].forEach(cell => {
        const cellRow = Number(cell.dataset.row);
        const cellCol = Number(cell.dataset.col);
        cell.classList.toggle("is-selected", cellRow <= rows && cellCol <= cols);
      });
      fields.tablePickerLabel.textContent = rows && cols  `Tabela ${cols}x${rows}` : "Tabela 0x0";
    }

    function buildTablePicker() {
      fields.tablePickerGrid.innerHTML = Array.from({ length: 8 }, (_, rowIndex) =>
        Array.from({ length: 10 }, (_, colIndex) => {
          const rows = rowIndex + 1;
          const cols = colIndex + 1;
          return `<button class="table-picker-cell" type="button" data-row="${rows}" data-col="${cols}" aria-label="Inserir tabela ${rows} por ${cols}"></button>`;
        }).join("")
      ).join("");
    }

    function openInsertMenu() {
      fields.inlineGraphicType.value = "table";
      fields.tableInsertMenu.hidden = !fields.tableInsertMenu.hidden;
      fields.openInsertMenu.setAttribute("aria-expanded", String(!fields.tableInsertMenu.hidden));
      setTablePickerSelection();
    }

    function insertTableFromPicker(rows, cols) {
      fields.inlineGraphicRows.value = rows;
      fields.inlineGraphicCols.value = cols;
      insertInlineGraphic();
      closeInsertMenu();
    }

    function insertInlineGraphic() {
      const type = fields.inlineGraphicType.value;
      const title = fields.inlineGraphicTitle.value.trim() || "Elemento gráfico";

      if (type === "image") {
        const file = fields.inlineGraphicImageFile.files && fields.inlineGraphicImageFile.files[0];
        if (file) {
          loadImageFile(file, dataUrl => insertHtmlAtEnd(inlineImageHtml(title, dataUrl)));
        } else {
          insertHtmlAtEnd(inlineImageHtml(title));
        }
        return;
      }

      if (type === "chart") {
        insertHtmlAtEnd(inlineChartHtml(title));
        return;
      }

      insertHtmlAtEnd(inlineTableHtml(fields.inlineGraphicRows.value, fields.inlineGraphicCols.value, title));
    }

    function removeLastInlineGraphic() {
      const graphics = fields.message.querySelectorAll(".inline-graphic-block");
      const lastGraphic = graphics[graphics.length - 1];
      if (!lastGraphic) return;

      const next = lastGraphic.nextSibling;
      lastGraphic.remove();
      if (next && next.nodeType === Node.ELEMENT_NODE && next.tagName === "P" && !next.textContent.trim()) {
        next.remove();
      }
      render();
    }

    function clearPage() {
      fields.title.value = "";
      fields.subtitle.value = "";
      fields.generalType.value = "";
      fields.summaryTitle.value = "";
      fields.summaryItems.value = "";
      fields.message.innerHTML = "";
      fields.inlineGraphicTitle.value = "";
      fields.inlineGraphicRows.value = "";
      fields.inlineGraphicCols.value = "";
      fields.inlineGraphicImageFile.value = "";
      fields.deadline.value = "";
      fields.deadlineNote.value = "";
      fields.sender.value = "";
      fields.showSummary.checked = false;
      fields.showDeadline.checked = false;
      bodyImageData = "";
      graphicItems = [];
      fields.bodyImageFile.value = "";
      fields.bodyImageCaption.value = "";
      fields.bodyImageAfterText.value = "";
      renderGraphicItemsEditor();
      refreshInlineGraphicControls();
      render();
    }

    function refreshInlineGraphicControls() {
      const isImage = fields.inlineGraphicType.value === "image";
      fields.inlineGraphicImageFile.style.display = isImage  "" : "none";
      fields.inlineTableConfig.style.display = "none";
      if (fields.inlineGraphicType.value !== "table") closeInsertMenu();
    }

    renderSegmentOptions();
    renderGraphicItemsEditor();
    buildTablePicker();
    document.querySelector("#editor").addEventListener("input", render);
    document.querySelector("#editor").addEventListener("change", render);
    preview.title.addEventListener("input", () => {
      syncingPreviewEdit = true;
      syncPreviewTitle();
      syncingPreviewEdit = false;
    });
    preview.title.addEventListener("blur", render);
    preview.subtitle.addEventListener("input", () => {
      syncingPreviewEdit = true;
      syncPreviewSubtitle();
      syncingPreviewEdit = false;
    });
    preview.subtitle.addEventListener("blur", render);
    preview.message.addEventListener("input", () => {
      syncingPreviewEdit = true;
      syncPreviewMessage();
      syncingPreviewEdit = false;
    });
    preview.message.addEventListener("blur", render);
    fields.message.addEventListener("paste", handleMessagePaste);
    fields.message.addEventListener("keyup", saveMessageSelection);
    fields.message.addEventListener("mouseup", saveMessageSelection);
    fields.message.addEventListener("focus", saveMessageSelection);
    fields.inlineGraphicType.addEventListener("change", refreshInlineGraphicControls);
    fields.openInsertMenu.addEventListener("click", openInsertMenu);
    fields.tablePickerGrid.addEventListener("mouseover", event => {
      const cell = event.target.closest(".table-picker-cell");
      if (!cell) return;
      setTablePickerSelection(Number(cell.dataset.row), Number(cell.dataset.col));
    });
    fields.tablePickerGrid.addEventListener("click", event => {
      const cell = event.target.closest(".table-picker-cell");
      if (!cell) return;
      insertTableFromPicker(Number(cell.dataset.row), Number(cell.dataset.col));
    });
    document.querySelector("#insertTableManual").addEventListener("click", () => {
      insertTableFromPicker(3, 3);
    });
    document.addEventListener("click", event => {
      if (fields.tableInsertMenu.hidden) return;
      if (event.target.closest("#tableInsertMenu") || event.target.closest("#openInsertMenu")) return;
      closeInsertMenu();
    });
    fields.insertInlineGraphic.addEventListener("click", insertInlineGraphic);
    fields.removeLastGraphic.addEventListener("click", removeLastInlineGraphic);
    fields.addGraphicItem.addEventListener("click", () => addGraphicItem());
    fields.graphicItemsEditor.addEventListener("click", event => {
      const removeButton = event.target.closest("[data-action='remove-graphic']");
      if (!removeButton) return;
      const editor = removeButton.closest(".graphic-item-editor");
      graphicItems = graphicItems.filter(item => item.id !== editor.dataset.id);
      renderGraphicItemsEditor();
      render();
    });
    fields.graphicItemsEditor.addEventListener("change", handleGraphicEditorChange);
    fields.bodyImageFile.addEventListener("change", () => {
      loadImageFile(fields.bodyImageFile.files && fields.bodyImageFile.files[0], dataUrl => {
        bodyImageData = dataUrl;
      });
    });
    fields.clearBodyImage.addEventListener("click", () => {
      bodyImageData = "";
      fields.bodyImageFile.value = "";
      fields.bodyImageCaption.value = "";
      fields.bodyImageAfterText.value = "";
      render();
    });
    document.querySelectorAll("[data-command]").forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => applyTextFormat(button.dataset.command));
    });
    fields.fontFamily.addEventListener("change", () => {
      if (fields.fontFamily.value) applyInlineStyleToSelection({ fontFamily: fields.fontFamily.value });
    });
    fields.fontSize.addEventListener("change", () => {
      if (fields.fontSize.value) applyInlineStyleToSelection({ fontSize: fields.fontSize.value });
    });
    document.querySelector("#sampleButton").addEventListener("click", fillExample);
    document.querySelector("#printButton").addEventListener("click", generatePdf);
    document.querySelector("#wordButton").addEventListener("click", generateWord);
    document.querySelector("#clearPageButton").addEventListener("click", clearPage);
    refreshInlineGraphicControls();
    render();
  