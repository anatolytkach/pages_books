import { createReconstructionScope, disposeReconstructionScope, reconstructRangeText } from "./protected-text-reconstruction.js";
import { getShapeMetricsBackend, getTextMetricsBackend } from "./protected-shape-metrics.js";

function createScratchContext() {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    return canvas.getContext("2d");
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  }
  throw new Error("No canvas context is available for protected layout.");
}

export function fontSpecForStyle(styleTokenRecord = {}, fontScale = 1) {
  const headingLevel = styleTokenRecord.headingLevel || 0;
  const baseSize =
    headingLevel === 1 ? 34 :
    headingLevel === 2 ? 30 :
    headingLevel === 3 ? 26 :
    headingLevel === 4 ? 22 :
    headingLevel >= 5 ? 18 :
    styleTokenRecord.blockRole === "quote" ? 20 :
    styleTokenRecord.blockRole === "verse" ? 18 :
    17;
  const size = Math.max(12, Math.round(baseSize * Math.max(0.75, Math.min(1.75, fontScale || 1))));
  const weight = styleTokenRecord.fontWeight === "bold" ? "700" : "400";
  const italic = styleTokenRecord.fontStyle === "italic" ? "italic " : "";
  const family = styleTokenRecord.fontFamilyCandidate || "Georgia, serif";
  return {
    size,
    lineHeight: Math.round(size * 1.55),
    css: `${italic}${weight} ${size}px ${family}`
  };
}

function buildTokenSlices(segment, wordBoundaryModel) {
  const tokens = [];
  const words = ((wordBoundaryModel && wordBoundaryModel.words) || [])
    .filter((item) => item.endOffset > segment.start && item.startOffset < segment.end)
    .map((item) => ({
      startOffset: Math.max(segment.start, item.startOffset),
      endOffset: Math.min(segment.end, item.endOffset),
      kind: "word"
    }));
  let cursor = segment.start;
  for (const word of words) {
    if (word.startOffset > cursor) {
      tokens.push({
        startOffset: cursor,
        endOffset: word.startOffset,
        kind: "gap"
      });
    }
    tokens.push(word);
    cursor = word.endOffset;
  }
  if (cursor < segment.end) {
    tokens.push({
      startOffset: cursor,
      endOffset: segment.end,
      kind: "gap"
    });
  }
  return tokens.length ? tokens : [{
    startOffset: segment.start,
    endOffset: segment.end,
    kind: "gap"
  }];
}

function resolveMetricsBackend({ ctx, renderMode, metricsMode, shapeRegistry }) {
  if (shapeRegistry && !(renderMode === "shape" && metricsMode === "text")) {
    return getShapeMetricsBackend(shapeRegistry);
  }
  return getTextMetricsBackend(ctx);
}

function segmentMapForChunk(chunk) {
  const map = new Map();
  for (const segment of (chunk.selectionLayer && chunk.selectionLayer.textSegments) || []) {
    map.set(`${segment.blockId}:${segment.runIndex}`, segment);
  }
  return map;
}

export function layoutChunk({
  chunkModel,
  styles,
  width,
  viewportHeight = 720,
  padding = 44,
  fontScale = 1,
  metricsBackend = null,
  renderMode = "text",
  metricsMode = renderMode === "shape" ? "shape" : "text",
  shapeRegistry = null
}) {
  const ctx = createScratchContext();
  const contentWidth = Math.max(260, width - padding * 2);
  const effectiveViewportHeight = Math.max(420, Number(viewportHeight || 720));
  const columnCount = width >= 1120 ? 2 : 1;
  const columnGap = columnCount > 1 ? 48 : 0;
  const columnWidth = columnCount > 1
    ? Math.max(220, Math.floor((contentWidth - columnGap) / 2))
    : contentWidth;
  const pageSlotHeight = effectiveViewportHeight;
  const columnInnerHeight = Math.max(260, pageSlotHeight - padding * 2);
  const blocks = [];
  const lines = [];
  const orderedBlockIds = [];
  const segmentMap = segmentMapForChunk(chunkModel.chunk);
  const backend = metricsBackend || resolveMetricsBackend({ ctx, renderMode, metricsMode, shapeRegistry });
  const reconstructionScope = backend.name === "text"
    ? createReconstructionScope({
        chunkModel,
        purpose: "layout-fallback",
        startOffset: 0,
        endOffset: chunkModel.chunk.selectionLayer ? chunkModel.chunk.selectionLayer.textLength : 0
      })
    : null;
  const metricsStats = {
    glyphCount: 0,
    extractedCount: 0,
    fallbackCount: 0
  };
  let pageSlot = 0;
  let columnIndex = 0;
  let columnCursorY = 0;

  function advanceFlow(requiredHeight = 0) {
    const nextColumn = columnIndex + 1;
    if (columnCount > 1 && nextColumn < columnCount) {
      columnIndex = nextColumn;
      columnCursorY = 0;
      return;
    }
    pageSlot += 1;
    columnIndex = 0;
    columnCursorY = 0;
    if (requiredHeight > columnInnerHeight) {
      columnCursorY = 0;
    }
  }

  for (const block of chunkModel.chunk.logicalBlockList) {
    const runs = chunkModel.runsByBlock.get(block.blockId) || [];
    const blockTop = pageSlot * pageSlotHeight + padding + columnCursorY;
    const blockFragments = [];
    let currentLine = null;

    function commitLine() {
      if (!currentLine || !currentLine.fragments.length) return;
      currentLine.width = currentLine.fragments.reduce((sum, item) => sum + item.width, 0);
      currentLine.startOffset = Math.min(...currentLine.fragments.map((item) => item.startOffset));
      currentLine.endOffset = Math.max(...currentLine.fragments.map((item) => item.endOffset));
      currentLine.lineIndex = lines.length;
      lines.push(currentLine);
      columnCursorY += currentLine.height;
      currentLine = null;
    }

    function ensureLine(lineHeight) {
      if (!currentLine && columnCursorY > 0 && (columnCursorY + lineHeight) > columnInnerHeight) {
        advanceFlow(lineHeight);
      }
      if (currentLine) return currentLine;
      currentLine = {
        blockId: block.blockId,
        x: padding + (columnIndex * (columnWidth + columnGap)),
        y: (pageSlot * pageSlotHeight) + padding + columnCursorY,
        height: lineHeight,
        width: 0,
        pageSlot,
        columnIndex,
        fragments: []
      };
      return currentLine;
    }

    function placeToken({
      token,
      font,
      styleToken,
      segmentId,
      sourceRef,
      runKey,
      glyphs,
      glyphStartIndex,
      glyphEndIndex
    }) {
      ctx.font = font.css;
      const tokenText = backend.name === "text"
        ? reconstructRangeText(chunkModel, token.startOffset, token.endOffset, reconstructionScope)
        : "";
      const measure = backend.measureRun({
        text: tokenText,
        glyphs,
        font,
        ctx
      });
      const widthPx = measure.width;
      const line = ensureLine(font.lineHeight);
      line.height = Math.max(line.height, measure.lineHeight || font.lineHeight);
      line.ascentPx = Math.max(line.ascentPx || 0, measure.ascentPx || 0);
      line.descentPx = Math.max(line.descentPx || 0, measure.descentPx || 0);
      const currentWidth = line.fragments.reduce((sum, item) => sum + item.width, 0);
      metricsStats.glyphCount += measure.glyphCount || glyphs.length;
      metricsStats.extractedCount += measure.extractedCount || 0;
      metricsStats.fallbackCount += measure.fallbackCount || 0;

      if (
        currentWidth > 0 &&
        widthPx > 0 &&
        currentWidth + widthPx > columnWidth
      ) {
        commitLine();
        return placeToken({
          token,
          font,
          styleToken,
          segmentId,
          sourceRef,
          runKey,
          glyphs,
          glyphStartIndex,
          glyphEndIndex
        });
      }

      if (!currentLine.fragments.length && token.kind === "gap" && /^\s*$/.test(tokenText)) {
        return;
      }

      const fragment = {
        blockId: block.blockId,
        segmentId,
        fragmentIndex: blockFragments.length,
        lineLocalIndex: line.fragments.length,
        runKey,
        glyphStartIndex,
        glyphEndIndex,
        styleToken,
        font,
        tokenKind: token.kind,
        sourceRef,
        x: padding + currentWidth,
        y: line.y,
        width: widthPx,
        height: font.lineHeight,
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        charPositions: measure.charPositions,
        glyphBoxes: measure.glyphBoxes || [],
        glyphCount: glyphs.length
      };
      line.fragments.push(fragment);
      blockFragments.push(fragment);
    }

    runs.forEach((run, runIndex) => {
      const style = styles.get(run.styleToken) || {};
      const font = fontSpecForStyle(style, fontScale);
      const segment = segmentMap.get(`${block.blockId}:${runIndex}`) || null;
      const tokens = buildTokenSlices(
        segment || {
          start: 0,
          end: run.glyphCount || (run.glyphTokens || []).length
        },
        chunkModel.wordBoundaryModel
      );
      tokens.forEach((token) => {
        const localStart = token.startOffset - (segment ? segment.start : 0);
        const localEnd = token.endOffset - (segment ? segment.start : 0);
        placeToken({
          token,
          font,
          styleToken: run.styleToken,
          segmentId: segment ? segment.segmentId : `${block.blockId}:run:${runIndex}`,
          runKey: `${block.blockId}:${runIndex}`,
          glyphs: (run.glyphTokens || [])
            .slice(localStart, localEnd)
            .map((glyphToken) => chunkModel.glyphMap.get(glyphToken))
            .filter(Boolean),
          glyphStartIndex: localStart,
          glyphEndIndex: localEnd,
          sourceRef: run.sourceRef || block.sourceRef
        });
      });
    });

    commitLine();
    const blockLines = lines.filter((line) => line.blockId === block.blockId);
    const blockHeight = blockLines.length
      ? (blockLines[blockLines.length - 1].y + blockLines[blockLines.length - 1].height) - blockTop
      : 0;
    const blockTextLength = block.textLength || 0;
    blocks.push({
      blockId: block.blockId,
      blockType: block.blockType,
      styleToken: runs[0] ? runs[0].styleToken : "paragraph",
      x: padding + (columnIndex * (columnWidth + columnGap)),
      y: blockTop,
      width: columnWidth,
      height: Math.max(blockHeight, 24),
      lineCount: blockLines.length,
      textLength: blockTextLength,
      lineIndexes: blockLines.map((line) => line.lineIndex),
      sourceRef: block.sourceRef
    });
    orderedBlockIds.push(block.blockId);
    const style = styles.get(runs[0] ? runs[0].styleToken : "paragraph") || {};
    const blockGap = style.blockRole === "heading" ? 18 : style.blockRole === "verse" ? 14 : 12;
    if (columnCursorY > 0 && (columnCursorY + blockGap) > columnInnerHeight) {
      advanceFlow(blockGap);
    } else {
      columnCursorY += blockGap;
    }
  }

  const reconstructionDiagnostics = reconstructionScope
    ? {
        mode: reconstructionScope.purpose,
        cacheEntries: reconstructionScope.cacheEntries || 0,
        decodedChars: reconstructionScope.decodedChars || 0
      }
    : {
        mode: "none",
        cacheEntries: 0,
        decodedChars: 0
      };
  disposeReconstructionScope(reconstructionScope);

  const totalPageSlots = Math.max(1, pageSlot + 1);
  const height = Math.max((totalPageSlots * pageSlotHeight), 640);
  return {
    width,
    height,
    padding,
    viewportHeight: effectiveViewportHeight,
    blocks,
    lines,
    orderedBlockIds,
    columnCount,
    columnWidth,
    columnGap,
    pageSlotHeight,
    pageSlotCount: totalPageSlots,
    metricsBackend: backend.name,
    renderMode,
    metricsMode,
    shapeMetricsCoveragePercent: metricsStats.glyphCount
      ? Math.round((metricsStats.extractedCount / metricsStats.glyphCount) * 100)
      : 0,
    metricsFallbackCount: metricsStats.fallbackCount,
    metricsGlyphCount: metricsStats.glyphCount,
    fontScale,
    reconstructionDiagnostics,
    hitTestingBackend: backend.name === "shape" ? "shape-geometry" : "text-geometry",
    selectionPrecisionMode: backend.name === "shape" ? "path-aware-approx" : "text-metrics-approx"
  };
}
