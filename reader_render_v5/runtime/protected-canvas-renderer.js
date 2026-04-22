import { createGlyphShapeRegistry } from "./protected-glyph-shape-registry.js";
import { renderGlyphOps } from "./protected-shape-renderer.js";
import { assertNoForbiddenTextLikeFields } from "./protected-worker-protocol.js";

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
  ctx.fillRect(x, y, width, height);
}

function mediaLayerItemKey(item) {
  if (!item || !item.assetUrl) return "";
  const mediaId = String(item.mediaId || "").trim();
  const placement = String(item.placement || "").trim();
  const pageSlot = Number(item.pageSlot || 0);
  const columnIndex = Number(item.columnIndex || 0);
  return [mediaId, item.assetUrl, placement, pageSlot, columnIndex].join("|");
}

function applyMediaItemLayout(img, item, pageWindow) {
  img.style.left = `${Number(item.x || 0) - Number(pageWindow && pageWindow.left || 0)}px`;
  img.style.top = `${Number(item.y || 0) - Number(pageWindow && pageWindow.top || 0)}px`;
  img.style.width = `${Number(item.width || 0)}px`;
  img.style.height = `${Number(item.height || 0)}px`;
}

function updateMediaLayer(mediaLayer, mediaItems, layout, viewportHeight, pageWindow) {
  mediaLayer.style.width = `${layout.width}px`;
  mediaLayer.style.height = `${viewportHeight}px`;
  const desiredItems = Array.isArray(mediaItems)
    ? mediaItems.filter((item) => item && item.assetUrl)
    : [];
  const existingByKey = new Map();
  for (const child of Array.from(mediaLayer.children || [])) {
    const key = child && child.dataset ? String(child.dataset.mediaKey || "") : "";
    if (key) existingByKey.set(key, child);
  }
  const desiredKeys = new Set();
  for (const item of desiredItems) {
    const key = mediaLayerItemKey(item);
    if (!key) continue;
    desiredKeys.add(key);
    let img = existingByKey.get(key) || null;
    if (!img) {
      img = document.createElement("img");
      img.src = item.assetUrl;
      img.alt = "";
      img.decoding = "async";
      img.loading = "eager";
      img.style.position = "absolute";
      img.style.objectFit = "contain";
      img.style.objectPosition = "center center";
      img.style.pointerEvents = "none";
      img.dataset.mediaKey = key;
      img.dataset.mediaSrc = String(item.assetUrl || "");
      mediaLayer.append(img);
    }
    if (String(img.dataset.mediaSrc || "") !== String(item.assetUrl || "")) {
      img.src = item.assetUrl;
      img.dataset.mediaSrc = String(item.assetUrl || "");
    }
    applyMediaItemLayout(img, item, pageWindow);
  }
  for (const [key, child] of existingByKey.entries()) {
    if (!desiredKeys.has(key) && child && child.parentNode === mediaLayer) {
      child.remove();
    }
  }
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

export function renderChunkToCanvas({
  canvas,
  overlayCanvas,
  renderPacket,
  mediaLayer = null,
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
    mediaItems = [],
    searchHighlights = [],
    selectionHighlights = [],
    annotationHighlights = [],
    focusHighlights = [],
    noteMarkers = [],
    diagnostics = {}
  } = renderPacket;
  const viewportHeight = pageWindow ? pageWindow.height : layout.height;
  // Layout coordinates already include internal page padding. When rendering
  // a paged window we only need to shift by the page's absolute top offset.
  const translateX = pageWindow ? (0 - pageWindow.left) : 0;
  const translateY = pageWindow ? (0 - pageWindow.top) : 0;
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
  ctx.fillStyle = currentTheme === "dark"
    ? "rgba(0, 130, 116, 0.72)"
    : "rgba(165, 244, 236, 0.72)";
  for (const rect of annotationHighlights) {
    drawHighlightRect(ctx, rect);
  }
  for (const rect of searchHighlights || []) {
    drawHighlightRect(ctx, rect);
  }
  for (const span of selectionHighlights || []) {
    drawHighlightRect(ctx, span);
  }
  for (const rect of focusHighlights || []) {
    drawHighlightRect(ctx, rect);
  }

  if (renderMode !== "shape") {
    throw new Error("Protected render packets must stay shape-only in main thread.");
  }
  const activeShapeRegistry = createGlyphShapeRegistry({ shapeRecords }, new Map());
  renderGlyphOps(ctx, glyphOps, activeShapeRegistry, { defaultFillStyle: defaultInk });
  ctx.restore();

  if (mediaLayer) {
    updateMediaLayer(mediaLayer, mediaItems, layout, viewportHeight, pageWindow);
  }

  const overlay = clearCanvas(overlayCanvas, layout.width, viewportHeight);
  overlay.clearRect(0, 0, layout.width, viewportHeight);
  overlay.save();
  overlay.translate(translateX, translateY);
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
