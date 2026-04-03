import { reconstructRunText } from "./protected-text-reconstruction.js";

export function fontSpecForStyle(styleTokenRecord = {}) {
  const headingLevel = styleTokenRecord.headingLevel || 0;
  const size =
    headingLevel === 1 ? 34 :
    headingLevel === 2 ? 30 :
    headingLevel === 3 ? 26 :
    headingLevel === 4 ? 22 :
    headingLevel >= 5 ? 18 :
    styleTokenRecord.blockRole === "quote" ? 20 :
    styleTokenRecord.blockRole === "verse" ? 18 :
    17;
  const weight = styleTokenRecord.fontWeight === "bold" ? "700" : "400";
  const italic = styleTokenRecord.fontStyle === "italic" ? "italic " : "";
  const family = styleTokenRecord.fontFamilyCandidate || "Georgia, serif";
  return {
    size,
    lineHeight: Math.round(size * 1.55),
    css: `${italic}${weight} ${size}px ${family}`
  };
}

function tokenizeWithOffsets(text, startOffset) {
  const tokens = [];
  const matches = String(text || "").matchAll(/\S+|\s+/g);
  for (const match of matches) {
    tokens.push({
      text: match[0],
      startOffset: startOffset + match.index,
      endOffset: startOffset + match.index + match[0].length
    });
  }
  return tokens.length ? tokens : [{
    text: "",
    startOffset,
    endOffset: startOffset
  }];
}

function charPositions(ctx, text) {
  const points = [0];
  for (let index = 1; index <= text.length; index += 1) {
    points.push(ctx.measureText(text.slice(0, index)).width);
  }
  return points;
}

function segmentMapForChunk(chunk) {
  const map = new Map();
  for (const segment of (chunk.selectionLayer && chunk.selectionLayer.textSegments) || []) {
    map.set(`${segment.blockId}:${segment.runIndex}`, segment);
  }
  return map;
}

export function layoutChunk({ chunkModel, styles, width, padding = 44 }) {
  const scratch = document.createElement("canvas");
  const ctx = scratch.getContext("2d");
  const maxWidth = width - padding * 2;
  const blocks = [];
  const lines = [];
  const orderedBlockIds = [];
  const segmentMap = segmentMapForChunk(chunkModel.chunk);
  let cursorY = padding;

  for (const block of chunkModel.chunk.logicalBlockList) {
    const runs = chunkModel.runsByBlock.get(block.blockId) || [];
    const blockTop = cursorY;
    const blockFragments = [];
    let currentLine = null;

    function commitLine() {
      if (!currentLine || !currentLine.fragments.length) return;
      currentLine.width = currentLine.fragments.reduce((sum, item) => sum + item.width, 0);
      currentLine.startOffset = Math.min(...currentLine.fragments.map((item) => item.startOffset));
      currentLine.endOffset = Math.max(...currentLine.fragments.map((item) => item.endOffset));
      currentLine.lineIndex = lines.length;
      lines.push(currentLine);
      cursorY += currentLine.height;
      currentLine = null;
    }

    function ensureLine(lineHeight) {
      if (currentLine) return currentLine;
      currentLine = {
        blockId: block.blockId,
        x: padding,
        y: cursorY,
        height: lineHeight,
        width: 0,
        fragments: []
      };
      return currentLine;
    }

    function placeToken({ token, font, styleToken, segmentId, sourceRef }) {
      ctx.font = font.css;
      const widthPx = ctx.measureText(token.text).width;
      const line = ensureLine(font.lineHeight);
      line.height = Math.max(line.height, font.lineHeight);
      const currentWidth = line.fragments.reduce((sum, item) => sum + item.width, 0);

      if (
        currentWidth > 0 &&
        widthPx > 0 &&
        currentWidth + widthPx > maxWidth
      ) {
        commitLine();
        return placeToken({ token, font, styleToken, segmentId, sourceRef });
      }

      if (!currentLine.fragments.length && /^\s+$/.test(token.text)) {
        return;
      }

      const fragment = {
        blockId: block.blockId,
        segmentId,
        fragmentIndex: blockFragments.length,
        lineLocalIndex: line.fragments.length,
        styleToken,
        font,
        text: token.text,
        sourceRef,
        x: padding + currentWidth,
        y: line.y,
        width: widthPx,
        height: font.lineHeight,
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        charPositions: charPositions(ctx, token.text)
      };
      line.fragments.push(fragment);
      blockFragments.push(fragment);
    }

    runs.forEach((run, runIndex) => {
      const style = styles.get(run.styleToken) || {};
      const font = fontSpecForStyle(style);
      const segment = segmentMap.get(`${block.blockId}:${runIndex}`) || null;
      const runText = reconstructRunText(run, chunkModel.glyphMap);
      const tokens = tokenizeWithOffsets(runText, segment ? segment.start : 0);
      tokens.forEach((token) => {
        placeToken({
          token,
          font,
          styleToken: run.styleToken,
          segmentId: segment ? segment.segmentId : `${block.blockId}:run:${runIndex}`,
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
      x: padding,
      y: blockTop,
      width: maxWidth,
      height: Math.max(blockHeight, 24),
      lineCount: blockLines.length,
      textLength: blockTextLength,
      lineIndexes: blockLines.map((line) => line.lineIndex),
      sourceRef: block.sourceRef
    });
    orderedBlockIds.push(block.blockId);
    const style = styles.get(runs[0] ? runs[0].styleToken : "paragraph") || {};
    cursorY += style.blockRole === "heading" ? 18 : style.blockRole === "verse" ? 14 : 12;
  }

  const height = Math.max(cursorY + padding, 640);
  return { width, height, padding, blocks, lines, orderedBlockIds };
}
