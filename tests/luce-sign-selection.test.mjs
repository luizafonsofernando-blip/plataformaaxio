import test from "node:test";
import assert from "node:assert/strict";
import { pointOnPage, selectionRect } from "../luce-sign/selection.mjs";
import { fieldInput } from "../server-assets/luce-sign-flow.mjs";

test("recorte na prévia produz coordenadas válidas mesmo no sentido inverso", () => {
  const rect = { left: 100, top: 50, width: 500, height: 700 };
  const first = pointOnPage(500, 610, rect);
  const last = pointOnPage(250, 470, rect);
  assert.deepEqual(first, { x: 0.8, y: 0.8 });
  assert.deepEqual(last, { x: 0.3, y: 0.6 });
  assert.deepEqual(fieldInput({ page_number: 2, ...selectionRect(first, last) }, 3),
    { page_number: 2, x: 0.3, y: 0.6, width: 0.5, height: 0.2 });
  assert.deepEqual(pointOnPage(700, 0, rect), { x: 1, y: 0 });
});
