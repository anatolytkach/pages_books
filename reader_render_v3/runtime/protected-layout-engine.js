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
  const baseSize = styleTokenRecord.blockRole === "quote" ? 17 : styleTokenRecord.blockRole === "verse" ? 15 : 16;
  const explicitScale = Number(styleTokenRecord.fontSizeScale || 0) || 0;
  const semanticScale =
    explicitScale > 0 ? explicitScale :
    headingLevel === 1 ? 3 :
    headingLevel === 2 ? 1.5 :
    headingLevel === 3 ? 1.3 :
    headingLevel === 4 ? 1.2 :
    headingLevel >= 5 ? 1.1 :
    styleTokenRecord.blockRole === "verse" ? 0.9 :
    1;
  const size = Math.max(11, Math.round(baseSize * semanticScale * Math.max(0.75, Math.min(1.75, fontScale || 1))));
  const weight = styleTokenRecord.fontWeight === "bold" ? "700" : "400";
  const italic = styleTokenRecord.fontStyle === "italic" ? "italic " : "";
  const family = styleTokenRecord.fontFamilyCandidate || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  const lineHeightFactor = Math.max(0.8, Math.min(2.4, Number(styleTokenRecord.lineHeightFactor || 1.55) || 1.55));
  return {
    size,
    lineHeight: Math.round(size * lineHeightFactor),
    css: `${italic}${weight} ${size}px ${family}`,
    letterSpacingPx: Math.round(size * (Number(styleTokenRecord.letterSpacingEm || 0) || 0) * 1000) / 1000,
    trailingSpacingPx: Math.round(size * (Number(styleTokenRecord.trailingSpacingEm || 0) || 0) * 1000) / 1000,
    wordSpacingPx: Math.round(size * (Number(styleTokenRecord.wordSpacingEm || 0) || 0) * 1000) / 1000,
    fillStyle: styleTokenRecord.textColor || ""
  };
}

function buildTokenSlices(segment, wordBoundaryModel) {
  return buildTokenSlicesWithText(segment, wordBoundaryModel, "");
}

function isCoreWordChar(char) {
  return /[\p{L}\p{N}]/u.test(String(char || ""));
}

function isWordConnector(char, chars, index) {
  if (!char) return false;
  if (!["'", "’", "-", "‑"].includes(char)) return false;
  return index > 0 && index < chars.length - 1 && isCoreWordChar(chars[index - 1]) && isCoreWordChar(chars[index + 1]);
}

function tokenizeTextSpan(text, startOffset) {
  const rawText = String(text || "");
  if (!rawText) return [];
  const chars = Array.from(rawText);
  const tokens = [];
  let cursor = 0;
  while (cursor < chars.length) {
    const char = chars[cursor];
    const start = cursor;
    if (/\s/u.test(char)) {
      cursor += 1;
      while (cursor < chars.length && /\s/u.test(chars[cursor])) cursor += 1;
      tokens.push({
        startOffset: startOffset + start,
        endOffset: startOffset + cursor,
        kind: "gap"
      });
      continue;
    }
    if (isCoreWordChar(char)) {
      cursor += 1;
      while (
        cursor < chars.length &&
        (isCoreWordChar(chars[cursor]) || isWordConnector(chars[cursor], chars, cursor))
      ) {
        cursor += 1;
      }
      tokens.push({
        startOffset: startOffset + start,
        endOffset: startOffset + cursor,
        kind: "word"
      });
      continue;
    }
    cursor += 1;
    while (
      cursor < chars.length &&
      !/\s/u.test(chars[cursor]) &&
      !isCoreWordChar(chars[cursor]) &&
      !isWordConnector(chars[cursor], chars, cursor)
    ) {
      cursor += 1;
    }
    tokens.push({
      startOffset: startOffset + start,
      endOffset: startOffset + cursor,
      kind: "punctuation"
    });
  }
  return tokens;
}

function buildTokenSlicesWithText(segment, wordBoundaryModel, text = "") {
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
      const relativeStart = Math.max(0, cursor - segment.start);
      const relativeEnd = Math.max(relativeStart, word.startOffset - segment.start);
      const interstitialText = text ? Array.from(String(text || "")).slice(relativeStart, relativeEnd).join("") : "";
      const interstitialTokens = tokenizeTextSpan(interstitialText, cursor);
      if (interstitialTokens.length) {
        tokens.push(...interstitialTokens);
      } else {
        tokens.push({
          startOffset: cursor,
          endOffset: word.startOffset,
          kind: "gap"
        });
      }
    }
    tokens.push(word);
    cursor = word.endOffset;
  }
  if (cursor < segment.end) {
    const relativeStart = Math.max(0, cursor - segment.start);
    const trailingText = text ? Array.from(String(text || "")).slice(relativeStart).join("") : "";
    const trailingTokens = tokenizeTextSpan(trailingText, cursor);
    if (trailingTokens.length) {
      tokens.push(...trailingTokens);
    } else {
      tokens.push({
        startOffset: cursor,
        endOffset: segment.end,
        kind: "gap"
      });
    }
  }
  return tokens.length ? tokens : [{
    startOffset: segment.start,
    endOffset: segment.end,
    kind: "gap"
  }];
}

function buildTokenSlicesFromText(segment, text = "") {
  const tokens = tokenizeTextSpan(text, segment.start);
  return tokens.length ? tokens : [{
    startOffset: segment.start,
    endOffset: segment.end,
    kind: "gap"
  }];
}

function justifyLineToWidth(line, targetWidth) {
  if (!line || !Array.isArray(line.fragments) || line.fragments.length < 2) return;
  const currentWidth = Number(line.width || 0);
  const availableExtra = Math.round(Number(targetWidth || 0) - currentWidth);
  if (!Number.isFinite(availableExtra) || availableExtra <= 6) return;
  const gapFragments = line.fragments.filter((fragment) =>
    fragment &&
    fragment.tokenKind === "gap" &&
    Number(fragment.width || 0) > 0.5
  );
  const adjustableFragments = gapFragments.length
    ? gapFragments
    : line.fragments.filter((fragment, index) =>
        index > 0 &&
        fragment &&
        fragment.tokenKind !== "gap" &&
        fragment.tokenKind !== "punctuation"
      );
  if (!adjustableFragments.length) return;
  const extraPerGap = availableExtra / adjustableFragments.length;
  let offsetX = 0;
  for (const fragment of line.fragments) {
    fragment.x += offsetX;
    if (adjustableFragments.includes(fragment)) {
      if (gapFragments.length) {
        fragment.width += extraPerGap;
        if (Array.isArray(fragment.charPositions) && fragment.charPositions.length > 1) {
          const lastIndex = fragment.charPositions.length - 1;
          fragment.charPositions = fragment.charPositions.map((value, index) => {
            if (index === 0) return value;
            const ratio = index / lastIndex;
            return value + (extraPerGap * ratio);
          });
        }
      }
      offsetX += extraPerGap;
    }
  }
  line.width = currentWidth + availableExtra;
}

function shouldJustifyParagraphLine(line, blockLines, index) {
  if (!line || !Array.isArray(blockLines) || !blockLines.length) return false;
  const maxWidth = Number(line.maxWidth || 0);
  const width = Number(line.width || 0);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || !Number.isFinite(width) || width <= 0) return false;
  const visibleFragments = Array.isArray(line.fragments)
    ? line.fragments.filter((fragment) => fragment && Number(fragment.width || 0) > 0.5)
    : [];
  const wordLikeFragments = visibleFragments.filter((fragment) => fragment.tokenKind === "word");
  const gapLikeFragments = visibleFragments.filter((fragment) => fragment.tokenKind === "gap");
  if (wordLikeFragments.length <= 1 || gapLikeFragments.length === 0) return false;
  const isLastLine = index === blockLines.length - 1;
  if (isLastLine) return false;
  return true;
}

function alignLineWithinWidth(line, width, align = "left") {
  if (!line || !Array.isArray(line.fragments) || !line.fragments.length) return;
  if (align !== "center" && align !== "right") return;
  const currentWidth = Number(line.width || 0);
  const maxWidth = Number(width || currentWidth);
  if (!Number.isFinite(currentWidth) || !Number.isFinite(maxWidth) || currentWidth <= 0 || maxWidth <= currentWidth) return;
  const offsetX = align === "center"
    ? Math.round((maxWidth - currentWidth) / 2)
    : Math.round(maxWidth - currentWidth);
  if (offsetX <= 0) return;
  line.x += offsetX;
  for (const fragment of line.fragments) {
    fragment.x += offsetX;
  }
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
  padding = null,
  fontScale = 1,
  metricsBackend = null,
  renderMode = "text",
  metricsMode = renderMode === "shape" ? "shape" : "text",
  shapeRegistry = null
}) {
  const ctx = createScratchContext();
  const effectiveWidth = Math.max(1, Number(width || 0));
  const resolvedPaddingX =
    padding == null
      ? (
        effectiveWidth >= 1024
          ? 51
          : effectiveWidth >= 768
            ? 32
            : 16
      )
      : Number(padding || 0);
  const resolvedPaddingY =
    padding == null
      ? 20
      : Number(padding || 0);
  const contentWidth = Math.max(260, effectiveWidth - resolvedPaddingX * 2);
  const effectiveViewportHeight = Math.max(420, Number(viewportHeight || 720));
  const columnCount = effectiveWidth >= 1120 ? 2 : 1;
  const columnGap = columnCount > 1 ? (effectiveWidth >= 1024 ? 102 : 48) : 0;
  const columnWidth = columnCount > 1
    ? Math.max(220, Math.floor((contentWidth - columnGap) / 2))
    : contentWidth;
  const pageSlotHeight = effectiveViewportHeight;
  const columnInnerHeight = Math.max(260, pageSlotHeight - resolvedPaddingY * 2);
  const blocks = [];
  const lines = [];
  const orderedBlockIds = [];
  const segmentMap = segmentMapForChunk(chunkModel.chunk);
  const backend = metricsBackend || resolveMetricsBackend({ ctx, renderMode, metricsMode, shapeRegistry });
  const hasWordBoundaries =
    !!(
      chunkModel &&
      chunkModel.wordBoundaryModel &&
      Array.isArray(chunkModel.wordBoundaryModel.words) &&
      chunkModel.wordBoundaryModel.words.length
    );
  const reconstructionScope = createReconstructionScope({
    chunkModel,
    purpose: "layout-fallback",
    startOffset: 0,
    endOffset: chunkModel.chunk.selectionLayer ? chunkModel.chunk.selectionLayer.textLength : 0
  });
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
    if (block.blockType === "image" && block.image && block.image.assetPath) {
      const imageMeta = block.image || {};
      const naturalWidth = Math.max(1, Number(imageMeta.widthPx || 0) || 0);
      const naturalHeight = Math.max(1, Number(imageMeta.heightPx || 0) || 0);
      const hasNaturalSize = naturalWidth > 0 && naturalHeight > 0;
      const blockMarginTop = Math.max(0, Math.round((Number(block.blockPresentation && block.blockPresentation.marginTopEm || 0) || 0) * 18));
      const blockMarginBottom = Math.max(0, Math.round((Number(block.blockPresentation && block.blockPresentation.marginBottomEm || 0) || 0) * 18));
      if (columnCursorY > 0 && blockMarginTop > 0) {
        if ((columnCursorY + blockMarginTop) > columnInnerHeight) {
          advanceFlow(blockMarginTop);
        } else {
          columnCursorY += blockMarginTop;
        }
      }
      const maxWidth = Math.max(140, Math.round(columnWidth * 0.94));
      const fallbackWidth = Math.round(Math.min(maxWidth, Math.max(220, columnWidth * 0.7)));
      const imageWidth = hasNaturalSize ? Math.min(maxWidth, naturalWidth) : fallbackWidth;
      const imageHeight = hasNaturalSize
        ? Math.max(80, Math.round((naturalHeight / naturalWidth) * imageWidth))
        : Math.round(imageWidth * 0.66);
      if (columnCursorY > 0 && (columnCursorY + imageHeight) > columnInnerHeight) {
        advanceFlow(imageHeight);
      }
      const blockTop = pageSlot * pageSlotHeight + resolvedPaddingY + columnCursorY;
      const blockX = resolvedPaddingX + (columnIndex * (columnWidth + columnGap));
      const imageX = blockX + Math.max(0, Math.round((columnWidth - imageWidth) / 2));
      blocks.push({
        blockId: block.blockId,
        blockType: block.blockType,
        styleToken: "image",
        x: blockX,
        y: blockTop,
        width: columnWidth,
        height: imageHeight,
        lineCount: 0,
        textLength: 0,
        lineIndexes: [],
        sourceRef: block.sourceRef,
        image: {
          assetPath: imageMeta.assetPath,
          alt: imageMeta.alt || "",
          x: imageX,
          y: blockTop,
          width: imageWidth,
          height: imageHeight
        }
      });
      orderedBlockIds.push(block.blockId);
      const blockGap = blockMarginBottom || 16;
      if (columnCursorY > 0 && (columnCursorY + imageHeight + blockGap) > columnInnerHeight) {
        columnCursorY += imageHeight;
        advanceFlow(blockGap);
      } else {
        columnCursorY += imageHeight + blockGap;
      }
      continue;
    }
    const runs = chunkModel.runsByBlock.get(block.blockId) || [];
    const blockPresentation = block.blockPresentation || {};
    const blockMarginTop = Math.max(0, Math.round((Number(blockPresentation.marginTopEm || 0) || 0) * 18));
    const blockMarginBottom = Math.max(0, Math.round((Number(blockPresentation.marginBottomEm || 0) || 0) * 18));
    const firstLineIndentPx = Math.max(0, Math.round((Number(blockPresentation.textIndentEm || 0) || 0) * 17));
    const blockTextAlign = String(blockPresentation.textAlign || "justify").toLowerCase();
    const paragraphShouldJustify =
      block.blockType === "paragraph" &&
      blockTextAlign !== "center" &&
      blockTextAlign !== "right";
    if (blockPresentation.pageBreakBefore && (pageSlot > 0 || columnIndex > 0 || columnCursorY > 0)) {
      pageSlot += 1;
      columnIndex = 0;
      columnCursorY = 0;
    }
    if (columnCursorY > 0 && blockMarginTop > 0) {
      if ((columnCursorY + blockMarginTop) > columnInnerHeight) {
        advanceFlow(blockMarginTop);
      } else {
        columnCursorY += blockMarginTop;
      }
    }
    const blockTop = pageSlot * pageSlotHeight + resolvedPaddingY + columnCursorY;
    const blockFragments = [];
    let currentLine = null;
    let blockLineCount = 0;
    let dropCapWrap = null;

    function commitLine() {
      if (!currentLine || !currentLine.fragments.length) return;
      while (
        currentLine.fragments.length &&
        currentLine.fragments[currentLine.fragments.length - 1] &&
        currentLine.fragments[currentLine.fragments.length - 1].tokenKind === "gap"
      ) {
        currentLine.fragments.pop();
      }
      if (!currentLine.fragments.length) {
        currentLine = null;
        return;
      }
      const dropCapFragment = currentLine.fragments.find((fragment) => /dropcap/.test(String(fragment.styleToken || ""))) || null;
      if (dropCapFragment) {
        const textFragments = currentLine.fragments.filter((fragment) => fragment !== dropCapFragment);
        const wrappedLineHeight = textFragments.length
          ? Math.max(...textFragments.map((fragment) => Number(fragment.font && fragment.font.lineHeight || fragment.height || 0)).filter(Boolean))
          : Math.max(18, Math.round(Number(dropCapFragment.font && dropCapFragment.font.size || 56) * 0.38));
        currentLine.height = wrappedLineHeight;
        const dropCapFontSize = Number(dropCapFragment.font && dropCapFragment.font.size || 0);
        const dropCapNaturalWidth = Number(dropCapFragment.width || 0);
        dropCapWrap = {
          pageSlot,
          columnIndex,
          width: Math.max(
            Math.round(dropCapNaturalWidth + 4),
            Math.round(dropCapFontSize * 0.56)
          ),
          bottomY: currentLine.y + Math.max(
            Math.round(wrappedLineHeight * 2.08),
            Math.round(Number(dropCapFragment.font && dropCapFragment.font.lineHeight || dropCapFragment.height || 0) * 0.9)
          )
        };
      } else if (
        dropCapWrap &&
        dropCapWrap.pageSlot === pageSlot &&
        dropCapWrap.columnIndex === columnIndex &&
        (currentLine.y + currentLine.height) >= Number(dropCapWrap.bottomY || 0)
      ) {
        dropCapWrap = null;
      }
      currentLine.width = currentLine.fragments.reduce((sum, item) => sum + item.width, 0);
      currentLine.startOffset = Math.min(...currentLine.fragments.map((item) => item.startOffset));
      currentLine.endOffset = Math.max(...currentLine.fragments.map((item) => item.endOffset));
      currentLine.lineIndex = lines.length;
      currentLine.maxWidth = Number(currentLine.maxWidth || columnWidth);
      lines.push(currentLine);
      columnCursorY += currentLine.height;
      blockLineCount += 1;
      currentLine = null;
    }

    function ensureLine(lineHeight) {
      if (!currentLine && columnCursorY > 0 && (columnCursorY + lineHeight) > columnInnerHeight) {
        advanceFlow(lineHeight);
      }
      if (currentLine) return currentLine;
      const currentY = (pageSlot * pageSlotHeight) + resolvedPaddingY + columnCursorY;
      const wrapActive = !!(
        dropCapWrap &&
        dropCapWrap.pageSlot === pageSlot &&
        dropCapWrap.columnIndex === columnIndex &&
        currentY < Number(dropCapWrap.bottomY || 0)
      );
      const wrapInset = wrapActive ? Number(dropCapWrap.width || 0) : 0;
      currentLine = {
        blockId: block.blockId,
        x: resolvedPaddingX + (columnIndex * (columnWidth + columnGap)) + (blockLineCount === 0 ? firstLineIndentPx : 0) + wrapInset,
        y: currentY,
        height: lineHeight,
        width: 0,
        maxWidth: Math.max(120, columnWidth - (blockLineCount === 0 ? firstLineIndentPx : 0) - wrapInset),
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
      const spacingPx =
        token.kind === "gap"
          ? Number(font.wordSpacingPx || 0)
          : Number(font.letterSpacingPx || 0) + Number(font.trailingSpacingPx || 0);
      const adjustedWidthPx = widthPx + (spacingPx > 0 ? spacingPx : 0);
      const currentWidth = line.fragments.reduce((sum, item) => sum + item.width, 0);
      metricsStats.glyphCount += measure.glyphCount || glyphs.length;
      metricsStats.extractedCount += measure.extractedCount || 0;
      metricsStats.fallbackCount += measure.fallbackCount || 0;

      if (
        currentWidth > 0 &&
        adjustedWidthPx > 0 &&
        currentWidth + adjustedWidthPx > Number(line.maxWidth || columnWidth)
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
        x: line.x + currentWidth,
        y: line.y,
        width: adjustedWidthPx,
        height: font.lineHeight,
        baselineY: line.y + font.size,
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        charPositions: measure.charPositions,
        glyphBoxes: measure.glyphBoxes || [],
        glyphCount: glyphs.length,
        fillStyle: font.fillStyle || ""
      };
      line.fragments.push(fragment);
      blockFragments.push(fragment);
    }

    runs.forEach((run, runIndex) => {
      if (run.hardBreak) {
        commitLine();
        return;
      }
      const style = styles.get(run.styleToken) || {};
      const font = fontSpecForStyle(style, fontScale);
      const segment = segmentMap.get(`${block.blockId}:${runIndex}`) || null;
      const effectiveSegment = segment || {
        start: 0,
        end: run.glyphCount || (run.glyphTokens || []).length
      };
      const segmentText = reconstructionScope
        ? reconstructRangeText(chunkModel, effectiveSegment.start, effectiveSegment.end, reconstructionScope)
        : "";
      const tokens = buildTokenSlicesWithText(
        effectiveSegment,
        chunkModel.wordBoundaryModel,
        segmentText
      );
      const effectiveTokens = (!hasWordBoundaries && segmentText)
        ? buildTokenSlicesFromText(effectiveSegment, segmentText)
        : tokens;
      effectiveTokens.forEach((token) => {
        const localStart = token.startOffset - effectiveSegment.start;
        const localEnd = token.endOffset - effectiveSegment.start;
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
    if (blockTextAlign === "center" || blockTextAlign === "right") {
      for (const line of blockLines) {
        alignLineWithinWidth(line, Number(line.maxWidth || columnWidth), blockTextAlign);
      }
    } else if (paragraphShouldJustify && blockLines.length) {
      for (let index = 0; index < blockLines.length; index += 1) {
        const line = blockLines[index];
        if (!shouldJustifyParagraphLine(line, blockLines, index)) continue;
        justifyLineToWidth(line, Number(line.maxWidth || columnWidth));
      }
    }
    for (const line of blockLines) {
      const dropCapFragment = line.fragments.find((fragment) => /dropcap/.test(String(fragment.styleToken || ""))) || null;
      if (!dropCapFragment) continue;
      for (const fragment of line.fragments) {
        if (fragment === dropCapFragment) {
          fragment.baselineY = line.y + fragment.font.size;
          continue;
        }
        const shift = Math.max(0, Math.round((line.height - fragment.font.lineHeight) * 0.72));
        fragment.baselineY = line.y + fragment.font.size + shift;
      }
    }
    const blockHeight = blockLines.length
      ? (blockLines[blockLines.length - 1].y + blockLines[blockLines.length - 1].height) - blockTop
      : 0;
    const blockTextLength = block.textLength || 0;
    blocks.push({
      blockId: block.blockId,
      blockType: block.blockType,
      styleToken: runs[0] ? runs[0].styleToken : "paragraph",
      x: resolvedPaddingX + (columnIndex * (columnWidth + columnGap)),
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
    const blockGap = blockMarginBottom || (style.blockRole === "heading" ? 18 : style.blockRole === "verse" ? 14 : 12);
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
    padding: resolvedPaddingY,
    paddingX: resolvedPaddingX,
    paddingY: resolvedPaddingY,
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
