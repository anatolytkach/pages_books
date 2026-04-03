function fallbackAdvanceEm(glyph) {
  const cp = glyph.codePoint;
  if (cp === 32) return 0.33;
  if (/[ilI.,'`:;!]/.test(String.fromCodePoint(cp))) return 0.28;
  if (/[MW@#%&]/.test(String.fromCodePoint(cp))) return 0.92;
  if (/[A-Z]/.test(String.fromCodePoint(cp))) return 0.68;
  if (/[0-9]/.test(String.fromCodePoint(cp))) return 0.56;
  if (glyph.scriptBucket === "CJK") return 1.0;
  return 0.56;
}

export function getShapeAdvancePx({ glyph, shapeRecord, font }) {
  const advanceEm = shapeRecord && typeof shapeRecord.advance === "number"
    ? shapeRecord.advance
    : shapeRecord && typeof shapeRecord.advanceEm === "number"
      ? shapeRecord.advanceEm
    : fallbackAdvanceEm(glyph);
  return advanceEm * font.size;
}

export function getShapeMetricsBackend(shapeRegistry) {
  return {
    name: "shape",
    measureRun({ glyphs, font }) {
      const advances = [];
      let width = 0;
      for (const glyph of glyphs) {
        const shapeRecord = shapeRegistry.getByGlyph(glyph);
        const advance = getShapeAdvancePx({ glyph, shapeRecord, font });
        advances.push(advance);
        width += advance;
      }
      const charPositions = [0];
      let cursor = 0;
      for (const advance of advances) {
        cursor += advance;
        charPositions.push(cursor);
      }
      return { width, charPositions };
    }
  };
}
