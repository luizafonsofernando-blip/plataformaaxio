export function pointOnPage(clientX, clientY, rect) {
  const clamp = (value) => Math.min(1, Math.max(0, value));
  return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
}

export function selectionRect(first, last) {
  const precise = (value) => Math.round(value * 1_000_000) / 1_000_000;
  const x = precise(Math.min(first.x, last.x)), y = precise(Math.min(first.y, last.y));
  return { x, y, width: precise(precise(Math.max(first.x, last.x)) - x),
    height: precise(precise(Math.max(first.y, last.y)) - y) };
}
