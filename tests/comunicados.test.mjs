import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../comunicados-orteconte/index.html", import.meta.url), "utf8");

test("toolbar mantém os comandos documentais essenciais", () => {
  const commands = [
    "bold", "italic", "underline", "strikeThrough", "subscript", "superscript",
    "justifyLeft", "justifyCenter", "justifyRight", "justifyFull",
    "insertUnorderedList", "insertOrderedList", "outdent", "indent",
    "unlink", "removeFormat", "undo", "redo",
  ];
  commands.forEach((command) => assert.match(source, new RegExp(`data-command=["']${command}["']`)));
  assert.match(source, /data-editor-action=["']link["']/);
});

test("sanitização preserva estrutura útil e restringe links", () => {
  assert.match(source, /allowedRichInline[^\n]+"A"/);
  ["H1", "H2", "H3", "UL", "OL", "LI"].forEach((tag) => assert.match(source, new RegExp(`allowedRichBlock[^\n]+"${tag}"`)));
  assert.match(source, /\^https\?:\\\/\\\//);
  assert.match(source, /noopener noreferrer/);
});

test("editor protege alterações ainda não exportadas", () => {
  assert.match(source, /beforeunload/);
  assert.match(source, /documentDirty/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "s"/);
});
