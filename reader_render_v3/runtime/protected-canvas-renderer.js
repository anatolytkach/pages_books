import { createGlyphShapeRegistry } from "./protected-glyph-shape-registry.js";
import { renderGlyphOps } from "./protected-shape-renderer.js";
import { assertNoForbiddenTextLikeFields } from "./protected-worker-protocol.js";

const imageCache = new Map();

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

function drawHighlightRect(ctx, rect) {
  const x = rect.x;
  const y = rect.y + 2;
  const width = rect.width;
  const height = Math.max(12, rect.height - 4);
  const radius = Math.min(6, Math.max(2, Math.floor(height / 3)));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, width, height);
}

function offsetToFragmentX(fragment, offset) {
  const localOffset = Math.max(0, Math.min(fragment.endOffset - fragment.startOffset, offset - fragment.startOffset));
  const positions = fragment.charPositions || [0, fragment.width || 0];
  const localX = positions[Math.max(0, Math.min(localOffset, positions.length - 1))] ?? positions[positions.length - 1] ?? 0;
  return fragment.x + localX;
}

function offsetToLineX(line, offset) {
  if (!line.fragments.length) return line.x || 0;
  const first = line.fragments[0];
  const last = line.fragments[line.fragments.length - 1];
  if (offset <= first.startOffset) return first.x;
  if (offset >= last.endOffset) return last.x + last.width;
  for (const fragment of line.fragments) {
    if (offset >= fragment.startOffset && offset <= fragment.endOffset) {
      return offsetToFragmentX(fragment, offset);
    }
  }
  return last.x + last.width;
}

function loadImageRecord(assetPath) {
  const key = String(assetPath || "").trim();
  if (!key) return null;
  if (imageCache.has(key)) return imageCache.get(key);
  const record = {
    status: "loading",
    image: null,
    promise: null
  };
  const image = new Image();
  image.decoding = "async";
  record.promise = new Promise((resolve) => {
    image.onload = () => {
      record.status = "loaded";
      record.image = image;
      resolve(record);
    };
    image.onerror = () => {
      record.status = "error";
      resolve(record);
    };
  });
  image.src = key;
  imageCache.set(key, record);
  return record;
}

function drawImagePlaceholder(ctx, imageOp) {
  ctx.save();
  ctx.fillStyle = "rgba(140, 140, 140, 0.12)";
  ctx.strokeStyle = "rgba(120, 120, 120, 0.35)";
  ctx.lineWidth = 1;
  ctx.fillRect(imageOp.x, imageOp.y, imageOp.width, imageOp.height);
  ctx.strokeRect(imageOp.x, imageOp.y, imageOp.width, imageOp.height);
  ctx.restore();
}

function renderImageOps(ctx, imageOps, translateY = 0) {
  for (const imageOp of imageOps || []) {
    const record = loadImageRecord(imageOp.assetPath);
    const drawY = Number(imageOp.y || 0) + translateY;
    if (!record || record.status !== "loaded" || !record.image) {
      drawImagePlaceholder(ctx, { ...imageOp, y: drawY });
      if (record && record.promise) {
        record.promise.then((next) => {
          if (!next || next.status !== "loaded" || !next.image) return;
          try {
            ctx.drawImage(next.image, imageOp.x, drawY, imageOp.width, imageOp.height);
          } catch {}
        });
      }
      continue;
    }
    ctx.drawImage(record.image, imageOp.x, drawY, imageOp.width, imageOp.height);
  }
}

export function renderChunkToCanvas({
  canvas,
  overlayCanvas,
  renderPacket,
  debugGeometry = false,
  offscreenCanvasStatus = "inactive"
}) {
  assertNoForbiddenTextLikeFields(renderPacket, "renderPacket");
  const {
    layout,
    pageWindow = null,
    renderMode = "shape",
    glyphOps = [],
    shapeRecords = [],
    imageOps = [],
    searchHighlights = [],
    selectionHighlights = [],
    annotationHighlights = [],
    focusHighlights = [],
    noteMarkers = [],
    diagnostics = {}
  } = renderPacket;
  const viewportHeight = pageWindow ? pageWindow.height : layout.height;
  const translateY = pageWindow ? ((layout.paddingY ?? layout.padding) - pageWindow.top) : 0;
  const currentTheme =
    typeof document !== "undefined" &&
    document &&
    document.documentElement &&
    document.documentElement.dataset &&
    document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light";
  const defaultInk = currentTheme === "dark" ? "#ffffff" : "#000000";
  const ctx = clearCanvas(canvas, layout.width, viewportHeight);
  ctx.fillStyle = currentTheme === "dark" ? "#101926" : "#fcfaf8";
  ctx.fillRect(0, 0, layout.width, viewportHeight);
  ctx.save();
  ctx.translate(0, translateY);

  if (renderMode !== "shape") {
    throw new Error("Protected render packets must stay shape-only in main thread.");
  }
  const activeShapeRegistry = createGlyphShapeRegistry({ shapeRecords }, new Map());
  renderGlyphOps(ctx, glyphOps, activeShapeRegistry, { defaultFillStyle: defaultInk });
  ctx.restore();
  renderImageOps(ctx, imageOps, translateY);

  const overlay = clearCanvas(overlayCanvas, layout.width, viewportHeight);
  overlay.clearRect(0, 0, layout.width, viewportHeight);
  overlay.save();
  overlay.translate(0, translateY);
  overlay.fillStyle = "rgba(243, 221, 111, 0.34)";
  for (const rect of annotationHighlights) {
    drawHighlightRect(overlay, rect);
  }

  overlay.fillStyle = "rgba(97, 194, 250, 0.36)";
  for (const rect of searchHighlights || []) {
    drawHighlightRect(overlay, rect);
  }

  overlay.fillStyle = "rgba(148, 154, 165, 0.24)";
  for (const span of selectionHighlights || []) {
    drawHighlightRect(overlay, span);
  }

  overlay.fillStyle = "rgba(59, 168, 255, 0.46)";
  for (const rect of focusHighlights || []) {
    drawHighlightRect(overlay, rect);
  }

  for (const marker of noteMarkers || []) {
    overlay.fillStyle = marker.color === "blue" ? "rgba(85, 126, 214, 0.9)" : "rgba(177, 129, 24, 0.9)";
    overlay.beginPath();
    overlay.arc(marker.x, marker.y, 4, 0, Math.PI * 2);
    overlay.fill();
  }

  if (debugGeometry) {
    overlay.strokeStyle = "rgba(68, 102, 140, 0.28)";
    overlay.lineWidth = 1;
    for (const line of layout.lines) {
      overlay.strokeRect(line.x, line.y, Math.max(2, line.width), Math.max(2, line.height));
      for (const fragment of line.fragments) {
        overlay.strokeStyle = "rgba(162, 120, 40, 0.22)";
        overlay.strokeRect(fragment.x, fragment.y, Math.max(2, fragment.width), Math.max(2, fragment.height));
        overlay.strokeStyle = "rgba(112, 112, 112, 0.18)";
        for (const glyphBox of fragment.glyphBoxes || []) {
          overlay.beginPath();
          overlay.moveTo(fragment.x + glyphBox.x, fragment.y + 2);
          overlay.lineTo(fragment.x + glyphBox.x, fragment.y + fragment.height - 2);
          overlay.stroke();
        }
      }
    }

    overlay.strokeStyle = "rgba(118, 78, 180, 0.18)";
    for (const word of (chunkModel.wordBoundaryModel && chunkModel.wordBoundaryModel.words) || []) {
      for (const line of layout.lines) {
        if (word.endOffset <= line.startOffset || word.startOffset >= line.endOffset) continue;
        const x = offsetToLineX(line, word.startOffset);
        overlay.beginPath();
        overlay.moveTo(x, line.y + 2);
        overlay.lineTo(x, line.y + line.height - 2);
        overlay.stroke();
      }
    }
  }
  overlay.restore();

  return {
    ...diagnostics,
    offscreenCanvas: offscreenCanvasStatus
  };
}
