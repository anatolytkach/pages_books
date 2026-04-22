import { createReconstructionScope, disposeReconstructionScope, reconstructRangeText } from "./protected-text-reconstruction.js";
import { getShapeMetricsBackend, getTextMetricsBackend } from "./protected-shape-metrics.js";
import { collectHyphenationPoints, normalizeHyphenationLanguage } from "./protected-hyphenation.js";

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

function emToPx(emValue, fontSizePx) {
  return Math.max(0, Math.round((Number(emValue || 0) || 0) * Math.max(0, Number(fontSizePx || 0))));
}

function resolveMetricPx(exactPx, emValue, fontSizePx, fallback = 0) {
  const exact = Number(exactPx || 0);
  if (Number.isFinite(exact) && exact > 0) return Math.round(exact);
  const emResolved = emToPx(emValue, fontSizePx);
  if (Number.isFinite(emResolved) && emResolved > 0) return emResolved;
  return Math.max(0, Math.round(Number(fallback || 0) || 0));
}

export function fontSpecForStyle(styleTokenRecord = {}, fontScale = 1) {
  const headingLevel = styleTokenRecord.headingLevel || 0;
  const baseSize = styleTokenRecord.blockRole === "quote" ? 17 : styleTokenRecord.blockRole === "verse" ? 15 : 16;
  const explicitScale = Number(styleTokenRecord.fontSizeScale || 0) || 0;
  const explicitSizePx = Number(styleTokenRecord.fontSizePx || 0) || 0;
  const superscript = !!styleTokenRecord.superscript;
  const semanticScale =
    explicitScale > 0 ? explicitScale :
    headingLevel === 1 ? 3 :
    headingLevel === 2 ? 1.5 :
    headingLevel === 3 ? 1.3 :
    headingLevel === 4 ? 1.2 :
    headingLevel >= 5 ? 1.1 :
    styleTokenRecord.blockRole === "verse" ? 0.9 :
    1;
  const scaledFontScale = Math.max(0.75, Math.min(1.75, fontScale || 1));
  const size = Math.max(
    11,
    Math.round((explicitSizePx > 0 ? explicitSizePx : (baseSize * semanticScale)) * (superscript ? 0.75 : 1) * scaledFontScale)
  );
  const weight = styleTokenRecord.fontWeight === "bold" ? "700" : "400";
  const italic = styleTokenRecord.fontStyle === "italic" ? "italic " : "";
  const family = styleTokenRecord.fontFamilyCandidate || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  const lineHeightFactor = Math.max(0.8, Math.min(2.4, Number(styleTokenRecord.lineHeightFactor || 1.55) || 1.55));
  const explicitLineHeightPx = Number(styleTokenRecord.lineHeightPx || 0) || 0;
  const baselineShiftPx = superscript ? Math.max(3, Math.round(size * 0.35)) : 0;
  return {
    size,
    family,
    lineHeight: explicitLineHeightPx > 0
      ? Math.max(1, Math.round(explicitLineHeightPx * scaledFontScale))
      : Math.round(size * (superscript ? Math.min(lineHeightFactor, 1.12) : lineHeightFactor)),
    css: `${italic}${weight} ${size}px ${family}`,
    fontStyle: styleTokenRecord.fontStyle === "italic" ? "italic" : "normal",
    superscript,
    baselineShiftPx,
    whiteSpace: String(styleTokenRecord.whiteSpace || "normal").trim().toLowerCase() || "normal",
    hyphens: String(styleTokenRecord.hyphens || "manual").trim().toLowerCase() || "manual",
    wordBreak: String(styleTokenRecord.wordBreak || "normal").trim().toLowerCase() || "normal",
    overflowWrap: String(styleTokenRecord.overflowWrap || "normal").trim().toLowerCase() || "normal",
    letterSpacingPx: Number(styleTokenRecord.letterSpacingPx || 0) || (
      Math.round(size * (Number(styleTokenRecord.letterSpacingEm || 0) || 0) * 1000) / 1000
    ),
    trailingSpacingPx: Math.round(size * (Number(styleTokenRecord.trailingSpacingEm || 0) || 0) * 1000) / 1000,
    wordSpacingPx: Number(styleTokenRecord.wordSpacingPx || 0) || (
      Math.round(size * (Number(styleTokenRecord.wordSpacingEm || 0) || 0) * 1000) / 1000
    ),
    fillStyle: styleTokenRecord.textColor || ""
  };
}

function hyphenWidthPxForFont(ctx, font) {
  ctx.font = font.css;
  const baseWidth = ctx.measureText("-").width;
  const spacingPx =
    Number(font.letterSpacingPx || 0) +
    Number(font.trailingSpacingPx || 0) +
    (font.fontStyle === "italic" ? Math.max(0.75, Math.round(font.size * 0.03 * 1000) / 1000) : 0);
  return baseWidth + Math.max(0, spacingPx);
}

function measureTokenLayout({ backend, ctx, tokenText, tokenKind, glyphs, font }) {
  ctx.font = font.css;
  const measure = backend.measureRun({
    text: tokenText,
    glyphs,
    font,
    ctx
  });
  let widthPx = measure.width;
  if (tokenKind === "gap" && /\s/u.test(tokenText)) {
    widthPx = Math.max(widthPx, ctx.measureText(tokenText).width);
  }
  const spacingPx =
    tokenKind === "gap"
      ? Number(font.wordSpacingPx || 0)
      : Number(font.letterSpacingPx || 0) +
        Number(font.trailingSpacingPx || 0) +
        (font.fontStyle === "italic" ? Math.max(0.75, Math.round(font.size * 0.03 * 1000) / 1000) : 0);
  const adjustedWidthPx = widthPx + (spacingPx > 0 ? spacingPx : 0);
  const charPositions =
    tokenKind === "gap" &&
    /\s/u.test(tokenText) &&
    (!Array.isArray(measure.charPositions) || measure.charPositions.length <= 1)
      ? [0, adjustedWidthPx]
      : measure.charPositions;
  return {
    measure,
    widthPx,
    spacingPx,
    adjustedWidthPx,
    charPositions
  };
}

function buildSoftBreakCandidates(tokenText, font, bookLanguage) {
  const chars = Array.from(String(tokenText || ""));
  if (chars.length < 2) return [];
  const hyphenationLanguage = normalizeHyphenationLanguage(bookLanguage);
  const candidates = new Map();
  if (font.hyphens === "auto") {
    for (const index of collectHyphenationPoints(tokenText, hyphenationLanguage)) {
      candidates.set(index, { splitIndex: index, insertHyphen: true });
    }
  }
  if (font.wordBreak === "break-all" || font.wordBreak === "break-word" || font.overflowWrap === "anywhere" || font.overflowWrap === "break-word") {
    const minIndex = font.hyphens === "auto" ? 2 : 1;
    const maxIndex = font.hyphens === "auto" ? chars.length - 2 : chars.length - 1;
    for (let index = minIndex; index <= maxIndex; index += 1) {
      if (!candidates.has(index)) {
        candidates.set(index, { splitIndex: index, insertHyphen: false });
      }
    }
  }
  return Array.from(candidates.values()).sort((a, b) => a.splitIndex - b.splitIndex);
}

function buildTokenSlices(segment, wordBoundaryModel) {
  return buildTokenSlicesWithText(segment, wordBoundaryModel, "");
}

const LEADING_NO_BREAK_PUNCTUATION = new Set(["“", "‘", "«", "‹", "\"", "(", "[", "{"]);
const TRAILING_NO_BREAK_PUNCTUATION = new Set([
  ".", ",", ";", ":", "!", "?", "…", "”", "’", "»", "›", "\"", "'", ")", "]", "}", "—", "–"
]);

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

function tokenTextForRange(text, segmentStart, token) {
  const source = Array.from(String(text || ""));
  const localStart = Math.max(0, Number(token.startOffset || 0) - Number(segmentStart || 0));
  const localEnd = Math.max(localStart, Number(token.endOffset || 0) - Number(segmentStart || 0));
  return source.slice(localStart, localEnd).join("");
}

function mergeNoBreakPunctuationTokens(tokens, segmentStart, text = "") {
  if (!Array.isArray(tokens) || tokens.length < 2) return Array.isArray(tokens) ? tokens.slice() : [];
  const merged = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const tokenText = tokenTextForRange(text, segmentStart, token);
    const previous = merged.length ? merged[merged.length - 1] : null;
    const next = index + 1 < tokens.length ? tokens[index + 1] : null;
    if (
      token.kind === "punctuation" &&
      tokenText &&
      previous &&
      previous.kind === "word" &&
      previous.endOffset === token.startOffset &&
      Array.from(tokenText).every((char) => TRAILING_NO_BREAK_PUNCTUATION.has(char))
    ) {
      previous.endOffset = token.endOffset;
      continue;
    }
    if (
      token.kind === "punctuation" &&
      tokenText &&
      next &&
      next.kind === "word" &&
      token.endOffset === next.startOffset &&
      Array.from(tokenText).every((char) => LEADING_NO_BREAK_PUNCTUATION.has(char))
    ) {
      merged.push({
        ...next,
        startOffset: token.startOffset
      });
      index += 1;
      continue;
    }
    merged.push({ ...token });
  }
  return merged;
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
    } else if (
      tokens.length &&
      tokens[tokens.length - 1] &&
      tokens[tokens.length - 1].kind === "word" &&
      tokens[tokens.length - 1].endOffset === word.startOffset
    ) {
      tokens.push({
        startOffset: cursor,
        endOffset: cursor,
        kind: "gap",
        syntheticText: " "
      });
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
  const merged = mergeNoBreakPunctuationTokens(tokens, segment.start, text);
  return merged.length ? merged : [{
    startOffset: segment.start,
    endOffset: segment.end,
    kind: "gap"
  }];
}

function buildTokenSlicesFromText(segment, text = "") {
  const tokens = tokenizeTextSpan(text, segment.start);
  const merged = mergeNoBreakPunctuationTokens(tokens, segment.start, text);
  return merged.length ? merged : [{
    startOffset: segment.start,
    endOffset: segment.end,
    kind: "gap"
  }];
}

function hasContiguousWordBoundaryGap(wordBoundaryModel, offset) {
  const words = (wordBoundaryModel && wordBoundaryModel.words) || [];
  if (!words.length) return false;
  let previous = null;
  let next = null;
  for (const word of words) {
    if (!word) continue;
    if (word.endOffset === offset) previous = word;
    if (word.startOffset === offset) {
      next = word;
      break;
    }
    if (word.startOffset > offset) break;
  }
  return !!(previous && next);
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
  if (line.terminatedByHardBreak) return false;
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

function mediaDimensionsForItem(item, columnWidth) {
  const maxWidth = Math.max(120, Math.round(columnWidth));
  const rawWidth = Math.max(0, Number(item && item.widthPx || 0));
  const rawHeight = Math.max(0, Number(item && item.heightPx || 0));
  if (rawWidth > 0 && rawHeight > 0) {
    const scale = Math.min(1, maxWidth / rawWidth);
    return {
      width: Math.max(16, Math.round(rawWidth * scale)),
      height: Math.max(16, Math.round(rawHeight * scale))
    };
  }
  if (item && item.inlineAvatar) {
    return { width: 18, height: 18 };
  }
  return {
    width: maxWidth,
    height: Math.max(180, Math.round(maxWidth * 0.62))
  };
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
  bookLanguage = "",
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
  const effectiveViewportHeight = Math.max(420, Number(viewportHeight || 720));
  const isPortraitViewport = effectiveViewportHeight > effectiveWidth;
  const isCompactLandscapeViewport = !isPortraitViewport && effectiveViewportHeight <= 900;
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
      ? ((isPortraitViewport || isCompactLandscapeViewport) ? 25 : 50)
      : Number(padding || 0);
  const contentWidth = Math.max(260, effectiveWidth - resolvedPaddingX * 2);
  const forceLandscapeSpread = effectiveWidth > effectiveViewportHeight && effectiveWidth >= 700;
  const columnCount = effectiveWidth >= 1120 || forceLandscapeSpread ? 2 : 1;
  const isCompactLandscapeSpread = columnCount > 1 && effectiveViewportHeight <= 820;
  const columnGap = columnCount > 1
    ? (isCompactLandscapeSpread ? resolvedPaddingX : Math.round(resolvedPaddingX * 1.5))
    : 0;
  const columnWidth = columnCount > 1
    ? Math.max(220, Math.floor((contentWidth - columnGap) / 2))
    : contentWidth;
  const pageSlotHeight = effectiveViewportHeight;
  const columnInnerHeight = Math.max(260, pageSlotHeight - resolvedPaddingY * 2);
  const blocks = [];
  const lines = [];
  const mediaItems = [];
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
  let pendingBlockMarginBottomPx = 0;
  let hasLaidOutBlock = false;

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
    const blockPresentation = block.blockPresentation || {};
    const blockMediaItems = Array.isArray(block.mediaItems) ? block.mediaItems : [];
    const inlineAvatar = blockMediaItems.find((item) => item && item.inlineAvatar) || null;
    const blockLevelMediaItems = inlineAvatar
      ? blockMediaItems.filter((item) => item && item !== inlineAvatar)
      : blockMediaItems;
    const primaryStyle = styles.get(runs[0] ? runs[0].styleToken : "paragraph") || {};
    const primaryFont = fontSpecForStyle(primaryStyle, fontScale);
    const blockMarginTop = resolveMetricPx(blockPresentation.marginTopPx, blockPresentation.marginTopEm, primaryFont.size);
    const blockMarginBottom = resolveMetricPx(blockPresentation.marginBottomPx, blockPresentation.marginBottomEm, primaryFont.size);
    const blockMarginLeft = resolveMetricPx(blockPresentation.marginLeftPx, blockPresentation.marginLeftEm, primaryFont.size);
    const blockMarginRight = resolveMetricPx(blockPresentation.marginRightPx, blockPresentation.marginRightEm, primaryFont.size);
    const blockPaddingTop = resolveMetricPx(blockPresentation.paddingTopPx, blockPresentation.paddingTopEm, primaryFont.size);
    const blockPaddingRight = resolveMetricPx(blockPresentation.paddingRightPx, blockPresentation.paddingRightEm, primaryFont.size);
    const blockPaddingBottom = resolveMetricPx(blockPresentation.paddingBottomPx, blockPresentation.paddingBottomEm, primaryFont.size);
    const blockPaddingLeft = resolveMetricPx(blockPresentation.paddingLeftPx, blockPresentation.paddingLeftEm, primaryFont.size);
    let firstLineIndentPx = resolveMetricPx(blockPresentation.textIndentPx, blockPresentation.textIndentEm, primaryFont.size);
    const blockTextAlign = String(blockPresentation.textAlign || "justify").toLowerCase();
    const paragraphShouldJustify =
      block.blockType === "paragraph" &&
      blockTextAlign !== "center" &&
      blockTextAlign !== "right";
    if (blockPresentation.pageBreakBefore && (pageSlot > 0 || columnIndex > 0 || columnCursorY > 0)) {
      pageSlot += 1;
      columnIndex = 0;
      columnCursorY = 0;
      pendingBlockMarginBottomPx = 0;
    }
    const collapsedBlockGap = hasLaidOutBlock
      ? Math.max(pendingBlockMarginBottomPx, blockMarginTop)
      : blockMarginTop;
    if (collapsedBlockGap > 0) {
      if (columnCursorY > 0 && (columnCursorY + collapsedBlockGap) > columnInnerHeight) {
        advanceFlow(collapsedBlockGap);
        pendingBlockMarginBottomPx = 0;
      } else {
        columnCursorY += collapsedBlockGap;
      }
    }
    if (blockPaddingTop > 0) {
      if (columnCursorY > 0 && (columnCursorY + blockPaddingTop) > columnInnerHeight) {
        advanceFlow(blockPaddingTop);
        pendingBlockMarginBottomPx = 0;
      } else {
        columnCursorY += blockPaddingTop;
      }
    }
    if (inlineAvatar) {
      const avatar = mediaDimensionsForItem(inlineAvatar, columnWidth);
      const reservedInlineIdentityHeight = Math.max(
        Number(primaryFont.lineHeight || 0),
        Number(avatar.height || 0) + 2
      );
      if (columnCursorY > 0 && (columnCursorY + reservedInlineIdentityHeight) > columnInnerHeight) {
        advanceFlow(reservedInlineIdentityHeight);
      }
    }
    for (const mediaItem of blockLevelMediaItems) {
      const dimensions = mediaDimensionsForItem(mediaItem, columnWidth);
      if (columnCursorY > 0 && (columnCursorY + dimensions.height) > columnInnerHeight) {
        advanceFlow(dimensions.height);
      }
      const mediaX = resolvedPaddingX + (columnIndex * (columnWidth + columnGap)) + Math.max(0, Math.round((columnWidth - dimensions.width) / 2));
      const contentLeftX = resolvedPaddingX + (columnIndex * (columnWidth + columnGap)) + blockMarginLeft + blockPaddingLeft;
      const contentWidth = Math.max(120, columnWidth - blockMarginLeft - blockMarginRight - blockPaddingLeft - blockPaddingRight);
      const mediaXAligned = contentLeftX + Math.max(0, Math.round((contentWidth - dimensions.width) / 2));
      const mediaY = (pageSlot * pageSlotHeight) + resolvedPaddingY + columnCursorY;
      mediaItems.push({
        mediaId: mediaItem.mediaId,
        blockId: block.blockId,
        x: mediaXAligned,
        y: mediaY,
        width: dimensions.width,
        height: dimensions.height,
        pageSlot,
        columnIndex,
        resolvedHref: mediaItem.resolvedHref || "",
        placement: mediaItem.placement || "block",
        inlineAvatar: !!mediaItem.inlineAvatar
      });
      columnCursorY += dimensions.height + 12;
    }
    if (inlineAvatar) {
      const avatar = mediaDimensionsForItem(inlineAvatar, columnWidth);
      firstLineIndentPx += avatar.width + 8;
      const contentLeftX = resolvedPaddingX + (columnIndex * (columnWidth + columnGap)) + blockMarginLeft + blockPaddingLeft;
      mediaItems.push({
        mediaId: inlineAvatar.mediaId,
        blockId: block.blockId,
        x: contentLeftX,
        y: (pageSlot * pageSlotHeight) + resolvedPaddingY + columnCursorY + 2,
        width: avatar.width,
        height: avatar.height,
        pageSlot,
        columnIndex,
        resolvedHref: inlineAvatar.resolvedHref || "",
        placement: "inline-avatar",
        inlineAvatar: true
      });
    }
    const blockTop = pageSlot * pageSlotHeight + resolvedPaddingY + columnCursorY;
    const blockFragments = [];
    let currentLine = null;
    let blockLineCount = 0;
    let dropCapWrap = null;

    function commitLine({ terminatedByHardBreak = false } = {}) {
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
      currentLine.terminatedByHardBreak = terminatedByHardBreak;
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
        x: resolvedPaddingX + (columnIndex * (columnWidth + columnGap)) + blockMarginLeft + blockPaddingLeft + (blockLineCount === 0 ? firstLineIndentPx : 0) + wrapInset,
        y: currentY,
        height: lineHeight,
        width: 0,
        maxWidth: Math.max(120, columnWidth - blockMarginLeft - blockMarginRight - blockPaddingLeft - blockPaddingRight - (blockLineCount === 0 ? firstLineIndentPx : 0) - wrapInset),
        pageSlot,
        columnIndex,
        fragments: []
      };
      return currentLine;
    }

    function splitTokenToFit({ token, tokenText, font, glyphs, availableWidth }) {
      if (token.kind !== "word" || !tokenText || font.whiteSpace === "nowrap" || availableWidth <= 8) return null;
      const candidates = buildSoftBreakCandidates(tokenText, font, bookLanguage);
      if (!candidates.length) return null;
      const chars = Array.from(tokenText);
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        const prefixChars = chars.slice(0, candidate.splitIndex);
        const suffixChars = chars.slice(candidate.splitIndex);
        if (prefixChars.length < 1 || suffixChars.length < 1) continue;
        const prefixText = prefixChars.join("");
        const suffixText = suffixChars.join("");
        const prefixGlyphs = Array.isArray(glyphs) ? glyphs.slice(0, prefixChars.length) : [];
        const suffixGlyphs = Array.isArray(glyphs) ? glyphs.slice(prefixChars.length) : [];
        const prefixLayout = measureTokenLayout({
          backend,
          ctx,
          tokenText: prefixText,
          tokenKind: token.kind,
          glyphs: prefixGlyphs,
          font
        });
        const syntheticHyphenWidthPx = candidate.insertHyphen ? hyphenWidthPxForFont(ctx, font) : 0;
        const totalWidthPx = prefixLayout.adjustedWidthPx + syntheticHyphenWidthPx;
        if (totalWidthPx > availableWidth) continue;
        return {
          prefixToken: {
            ...token,
            endOffset: Number(token.startOffset || 0) + prefixChars.length,
            syntheticText: prefixText
          },
          suffixToken: {
            ...token,
            startOffset: Number(token.startOffset || 0) + prefixChars.length,
            syntheticText: suffixText
          },
          prefixGlyphs,
          suffixGlyphs,
          prefixGlyphStartIndex: 0,
          prefixGlyphEndIndex: prefixGlyphs.length,
          suffixGlyphStartIndex: prefixGlyphs.length,
          suffixGlyphEndIndex: prefixGlyphs.length + suffixGlyphs.length,
          prefixLayout,
          syntheticHyphenWidthPx,
          syntheticTrailingHyphen: candidate.insertHyphen
        };
      }
      return null;
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
      glyphEndIndex,
      measurementOverride = null,
      syntheticTrailingHyphen = false,
      syntheticHyphenWidthPx = 0
    }) {
      const tokenText = token && typeof token.syntheticText === "string"
        ? token.syntheticText
        : reconstructRangeText(chunkModel, token.startOffset, token.endOffset, reconstructionScope);
      const measured = measurementOverride || measureTokenLayout({
        backend,
        ctx,
        tokenText,
        tokenKind: token.kind,
        glyphs,
        font
      });
      const measure = measured.measure;
      const line = ensureLine(font.lineHeight);
      line.height = Math.max(line.height, measure.lineHeight || font.lineHeight);
      line.ascentPx = Math.max(line.ascentPx || 0, measure.ascentPx || 0);
      line.descentPx = Math.max(line.descentPx || 0, measure.descentPx || 0);
      let adjustedWidthPx = measured.adjustedWidthPx;
      let charPositions = Array.isArray(measured.charPositions) ? measured.charPositions.slice() : [0, adjustedWidthPx];
      if (syntheticTrailingHyphen && syntheticHyphenWidthPx > 0) {
        adjustedWidthPx += syntheticHyphenWidthPx;
        const baseTail = charPositions.length ? charPositions[charPositions.length - 1] : measured.adjustedWidthPx;
        charPositions.push(baseTail + syntheticHyphenWidthPx);
      }
      const currentWidth = line.fragments.reduce((sum, item) => sum + item.width, 0);
      metricsStats.glyphCount += measure.glyphCount || glyphs.length;
      metricsStats.extractedCount += measure.extractedCount || 0;
      metricsStats.fallbackCount += measure.fallbackCount || 0;

      if (adjustedWidthPx > 0 && currentWidth + adjustedWidthPx > Number(line.maxWidth || columnWidth) && token.kind !== "punctuation" && font.whiteSpace !== "nowrap") {
        const split = splitTokenToFit({
          token,
          tokenText,
          font,
          glyphs,
          availableWidth: Number(line.maxWidth || columnWidth) - currentWidth
        });
        if (split) {
          placeToken({
            token: split.prefixToken,
            font,
            styleToken,
            segmentId,
            sourceRef,
            runKey,
            glyphs: split.prefixGlyphs,
            glyphStartIndex: glyphStartIndex + split.prefixGlyphStartIndex,
            glyphEndIndex: glyphStartIndex + split.prefixGlyphEndIndex,
            measurementOverride: split.prefixLayout,
            syntheticTrailingHyphen: split.syntheticTrailingHyphen,
            syntheticHyphenWidthPx: split.syntheticHyphenWidthPx
          });
          commitLine();
          return placeToken({
            token: split.suffixToken,
            font,
            styleToken,
            segmentId,
            sourceRef,
            runKey,
            glyphs: split.suffixGlyphs,
            glyphStartIndex: glyphStartIndex + split.suffixGlyphStartIndex,
            glyphEndIndex: glyphStartIndex + split.suffixGlyphEndIndex
          });
        }
        if (currentWidth > 0) {
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
            glyphEndIndex,
            measurementOverride,
            syntheticTrailingHyphen,
            syntheticHyphenWidthPx
          });
        }
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
        baselineY: line.y + font.size - Number(font.baselineShiftPx || 0),
        ascentPx: Number(measure.ascentPx || Math.round(font.size * 0.8)),
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        charPositions,
        glyphBoxes: measure.glyphBoxes || [],
        glyphCount: glyphs.length,
        fillStyle: font.fillStyle || "",
        syntheticTrailingHyphen,
        syntheticHyphenWidthPx
      };
      line.fragments.push(fragment);
      blockFragments.push(fragment);
    }

    let previousRunContext = null;
    runs.forEach((run, runIndex) => {
      if (run.hardBreak) {
        commitLine({ terminatedByHardBreak: true });
        previousRunContext = null;
        return;
      }
      const baseStyle = styles.get(run.styleToken) || {};
      const style = run.linkTarget && /#(fn|note|footnote|endnote|noteref|ftn)/i.test(String(run.linkTarget || ""))
        ? {
            ...baseStyle,
            superscript: true,
            footnoteRef: true,
            textColor: String(baseStyle.textColor || "").trim() || "#6f4a22"
          }
        : baseStyle;
      const font = fontSpecForStyle(style, fontScale);
      const segment = segmentMap.get(`${block.blockId}:${runIndex}`) || null;
      const effectiveSegment = segment || {
        start: 0,
        end: run.glyphCount || (run.glyphTokens || []).length
      };
      const segmentText = reconstructionScope
        ? reconstructRangeText(chunkModel, effectiveSegment.start, effectiveSegment.end, reconstructionScope)
        : "";
      if (
        previousRunContext &&
        Number(effectiveSegment.start || 0) > Number(previousRunContext.endOffset || 0)
      ) {
        const gapStart = Number(previousRunContext.endOffset || 0);
        const gapEnd = Number(effectiveSegment.start || 0);
        const interRunText = reconstructionScope
          ? reconstructRangeText(chunkModel, gapStart, gapEnd, reconstructionScope)
          : "";
        if (interRunText && /\s/u.test(interRunText)) {
          placeToken({
            token: {
              startOffset: gapStart,
              endOffset: gapEnd,
              kind: "gap"
            },
            font,
            styleToken: run.styleToken,
            segmentId: `${block.blockId}:gap:${runIndex}`,
            runKey: `${block.blockId}:${Math.max(0, runIndex - 1)}`,
            glyphs: [],
            glyphStartIndex: 0,
            glyphEndIndex: 0,
            sourceRef: run.sourceRef || block.sourceRef
          });
        }
      } else if (
        previousRunContext &&
        Number(effectiveSegment.start || 0) === Number(previousRunContext.endOffset || 0) &&
        hasContiguousWordBoundaryGap(chunkModel.wordBoundaryModel, Number(effectiveSegment.start || 0))
      ) {
        placeToken({
          token: {
            startOffset: effectiveSegment.start,
            endOffset: effectiveSegment.start,
            kind: "gap",
            syntheticText: " "
          },
          font,
          styleToken: run.styleToken,
          segmentId: `${block.blockId}:boundary-gap:${runIndex}`,
          runKey: `${block.blockId}:${Math.max(0, runIndex - 1)}`,
          glyphs: [],
          glyphStartIndex: 0,
          glyphEndIndex: 0,
          sourceRef: run.sourceRef || block.sourceRef
        });
      }
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
      previousRunContext = {
        endOffset: effectiveSegment.end
      };
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
          fragment.baselineY = line.y + Math.max(1, Number(fragment.ascentPx || Math.round(fragment.font.size * 0.8)));
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
      x: resolvedPaddingX + (columnIndex * (columnWidth + columnGap)) + blockMarginLeft,
      y: blockTop,
      width: Math.max(0, columnWidth - blockMarginLeft - blockMarginRight),
      height: Math.max(blockHeight + blockPaddingTop + blockPaddingBottom, 24),
      lineCount: blockLines.length,
      textLength: blockTextLength,
      lineIndexes: blockLines.map((line) => line.lineIndex),
      sourceRef: block.sourceRef
    });
    orderedBlockIds.push(block.blockId);
    if (blockPaddingBottom > 0) {
      if (columnCursorY > 0 && (columnCursorY + blockPaddingBottom) > columnInnerHeight) {
        advanceFlow(blockPaddingBottom);
      } else {
        columnCursorY += blockPaddingBottom;
      }
    }
    pendingBlockMarginBottomPx = blockMarginBottom;
    hasLaidOutBlock = true;
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
    mediaItems,
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
