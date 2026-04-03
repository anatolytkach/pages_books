export function codePointToChar(codePoint) {
  try {
    return String.fromCodePoint(codePoint);
  } catch (_) {
    return "";
  }
}

export function reconstructRunText(run, glyphMap) {
  return (run.glyphIds || [])
    .map((glyphId) => {
      const glyph = glyphMap.get(glyphId);
      return glyph ? codePointToChar(glyph.codePoint) : "";
    })
    .join("");
}

export function reconstructBlockText(chunkModel, blockId) {
  const runs = chunkModel.runsByBlock.get(blockId) || [];
  return runs.map((run) => reconstructRunText(run, chunkModel.glyphMap)).join("");
}

export function reconstructRangeText(chunkModel, startOffset, endOffset) {
  if (startOffset == null || endOffset == null || endOffset <= startOffset) return "";
  const segments = chunkModel.textSegments || [];
  let cursor = startOffset;
  let output = "";

  for (const segment of segments) {
    if (segment.end <= startOffset) continue;
    if (segment.start >= endOffset) break;

    if (segment.start > cursor) {
      output += "\n".repeat(Math.min(segment.start - cursor, 2));
      cursor = segment.start;
    }

    const run = chunkModel.runBySegmentKey.get(`${segment.blockId}:${segment.runIndex}`);
    if (!run) continue;
    const runText = reconstructRunText(run, chunkModel.glyphMap);
    const sliceStart = Math.max(startOffset, segment.start) - segment.start;
    const sliceEnd = Math.min(endOffset, segment.end) - segment.start;
    output += runText.slice(sliceStart, sliceEnd);
    cursor = Math.min(endOffset, segment.end);
  }

  return output;
}
