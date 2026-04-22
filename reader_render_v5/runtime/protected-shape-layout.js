export function buildGlyphRenderOps({ layout, chunkModel, shapeRegistry, renderMode, styleMap = null }) {
  const ops = [];

  for (const line of layout.lines) {
    for (const fragment of line.fragments) {
      const run = chunkModel.runBySegmentKey.get(fragment.runKey);
      if (!run) continue;
      let cursorX = fragment.x;
      const glyphTokens = (run.glyphTokens || []).slice(fragment.glyphStartIndex, fragment.glyphEndIndex);
      for (let index = 0; index < glyphTokens.length; index += 1) {
        const glyphToken = glyphTokens[index];
        const glyph = chunkModel.glyphMap.get(glyphToken);
        if (!glyph) continue;
        const advance = fragment.charPositions[index + 1] - fragment.charPositions[index];
        const shapeRecord = shapeRegistry.getByGlyph(glyph);
        const styleTokenRecord = styleMap && typeof styleMap.get === "function"
          ? (styleMap.get(glyph.styleToken) || null)
          : null;
        ops.push({
          glyphId: glyph.glyphId,
          glyphToken,
          styleToken: fragment.styleToken || glyph.styleToken,
          fontFamilyCandidate: glyph.fontFamilyCandidate,
          scriptBucket: glyph.scriptBucket,
          x: cursorX,
          y: line.y,
          baselineY: Number(fragment.baselineY || (line.y + fragment.font.size)),
          fontSize: fragment.font.size,
          advance,
          width: advance,
          height: line.height,
          lineIndex: line.lineIndex,
          blockId: fragment.blockId,
          segmentId: fragment.segmentId,
          startOffset: fragment.startOffset + index,
          endOffset: fragment.startOffset + index + 1,
          shapeRef: glyph.shapeRef,
          shapeStatus: glyph.shapeStatus,
          shapeSource: shapeRecord ? shapeRecord.source : "missing",
          fillStyle: fragment.fillStyle || (styleTokenRecord && styleTokenRecord.textColor) || "",
          renderMode
        });
        cursorX += advance;
      }
      if (fragment.syntheticTrailingHyphen && Number(fragment.syntheticHyphenWidthPx || 0) > 0) {
        ops.push({
          glyphId: `${fragment.segmentId}:soft-hyphen`,
          glyphToken: "",
          styleToken: fragment.styleToken,
          fontFamilyCandidate: fragment.font && fragment.font.family ? fragment.font.family : "",
          scriptBucket: "Common",
          x: cursorX,
          y: line.y,
          baselineY: Number(fragment.baselineY || (line.y + fragment.font.size)),
          fontSize: fragment.font.size,
          advance: Number(fragment.syntheticHyphenWidthPx || 0),
          width: Number(fragment.syntheticHyphenWidthPx || 0),
          height: line.height,
          lineIndex: line.lineIndex,
          blockId: fragment.blockId,
          segmentId: fragment.segmentId,
          startOffset: fragment.endOffset,
          endOffset: fragment.endOffset,
          shapeRef: "",
          shapeStatus: "synthetic-hyphen",
          shapeSource: "runtime-generated",
          fillStyle: fragment.fillStyle || "",
          renderMode,
          syntheticGlyphKind: "hyphen",
          fontCss: fragment.font && fragment.font.css ? fragment.font.css : ""
        });
      }
    }
  }

  return ops;
}
