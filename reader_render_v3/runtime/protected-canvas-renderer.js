import { createGlyphShapeRegistry } from "./protected-glyph-shape-registry.js";
import { buildGlyphRenderOps } from "./protected-shape-layout.js";
import { renderGlyphOps } from "./protected-shape-renderer.js";

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

export function renderChunkToCanvas({
  canvas,
  overlayCanvas,
  layout,
  chunkModel,
  renderMode = "text",
  shapeRegistry = null,
  debugGeometry = false,
  highlightSpans
}) {
  const ctx = clearCanvas(canvas, layout.width, layout.height);
  ctx.fillStyle = "#fffdfa";
  ctx.fillRect(0, 0, layout.width, layout.height);
  const activeShapeRegistry = shapeRegistry || createGlyphShapeRegistry(chunkModel.shapeBundle, chunkModel.glyphMap);

  let diagnostics = {
    renderMode,
    glyphOps: 0,
    shapeRecords: activeShapeRegistry.records.size,
    shapeCoveragePercent: activeShapeRegistry.coveragePercent,
    extractedShapeCount: activeShapeRegistry.extractedGlyphs,
    syntheticShapeCount: activeShapeRegistry.syntheticGlyphs,
    placeholderShapeCount: activeShapeRegistry.placeholderGlyphs,
    extractedCoveragePercent: activeShapeRegistry.extractedCoveragePercent,
    shapeSource: activeShapeRegistry.sourceCounts.extracted ? "extracted" :
      activeShapeRegistry.sourceCounts.synthetic ? "synthetic" :
      activeShapeRegistry.sourceCounts.placeholder ? "placeholder" : "none",
    shapeSources: activeShapeRegistry.sourceCounts,
    metricsBackend: layout.metricsBackend,
    metricsMode: layout.metricsMode,
    shapeMetricsCoveragePercent: layout.shapeMetricsCoveragePercent,
    metricsFallbackCount: layout.metricsFallbackCount,
    hitTestingBackend: layout.hitTestingBackend,
    selectionPrecisionMode: layout.selectionPrecisionMode,
    selectionCompatible: true,
    hasShapeBundle: !!chunkModel.shapeBundle
  };

  if (renderMode === "shape") {
    const glyphOps = buildGlyphRenderOps({
      layout,
      chunkModel,
      shapeRegistry: activeShapeRegistry,
      renderMode
    });
    renderGlyphOps(ctx, glyphOps, activeShapeRegistry);
    diagnostics = {
      ...diagnostics,
      glyphOps: glyphOps.length
    };
  } else {
    for (const line of layout.lines) {
      for (const fragment of line.fragments) {
        ctx.font = fragment.font.css;
        ctx.fillStyle = "#18212f";
        ctx.fillText(fragment.text || "", fragment.x, fragment.y + fragment.font.size);
      }
    }
    diagnostics.glyphOps = layout.lines.reduce((sum, line) => sum + line.fragments.reduce((count, fragment) => count + fragment.glyphCount, 0), 0);
  }

  const overlay = clearCanvas(overlayCanvas, layout.width, layout.height);
  overlay.clearRect(0, 0, layout.width, layout.height);
  overlay.fillStyle = "rgba(120, 128, 140, 0.18)";

  for (const span of highlightSpans || []) {
    overlay.fillRect(span.x, span.y + 2, span.width, Math.max(12, span.height - 4));
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
  }

  return diagnostics;
}
