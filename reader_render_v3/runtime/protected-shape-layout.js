export function buildGlyphRenderOps({ layout, chunkModel, shapeRegistry, renderMode }) {
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
        ops.push({
          glyphId: glyph.glyphId,
          glyphToken,
          styleToken: glyph.styleToken,
          fontFamilyCandidate: glyph.fontFamilyCandidate,
          scriptBucket: glyph.scriptBucket,
          x: cursorX,
          y: line.y,
          baselineY: line.y + fragment.font.size,
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
          renderMode
        });
        cursorX += advance;
      }
    }
  }

  return ops;
}
