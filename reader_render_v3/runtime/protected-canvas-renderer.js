function clearCanvas(canvas, width, height) {
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

export function renderChunkToCanvas({ canvas, overlayCanvas, layout, highlightSpans }) {
  const ctx = clearCanvas(canvas, layout.width, layout.height);
  ctx.fillStyle = "#fffdfa";
  ctx.fillRect(0, 0, layout.width, layout.height);

  for (const line of layout.lines) {
    for (const fragment of line.fragments) {
      ctx.font = fragment.font.css;
      ctx.fillStyle = "#18212f";
      ctx.fillText(fragment.text || "", fragment.x, fragment.y + fragment.font.size);
    }
  }

  const overlay = clearCanvas(overlayCanvas, layout.width, layout.height);
  overlay.clearRect(0, 0, layout.width, layout.height);
  overlay.fillStyle = "rgba(120, 128, 140, 0.18)";

  for (const span of highlightSpans || []) {
    overlay.fillRect(span.x, span.y + 2, span.width, Math.max(12, span.height - 4));
  }
}
