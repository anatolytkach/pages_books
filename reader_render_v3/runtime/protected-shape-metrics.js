import { buildGlyphBoxes } from "./protected-shape-offset-map.js";

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

function fallbackLineMetrics(font, glyphCount) {
  const ascentPx = Math.round(font.size * 0.8);
  const descentPx = Math.max(4, Math.round(font.size * 0.28));
  const lineHeight = Math.max(font.lineHeight, ascentPx + descentPx);
  return {
    ascentPx,
    descentPx,
    lineHeight,
    glyphCount,
    extractedCount: 0,
    fallbackCount: glyphCount
  };
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
      let extractedCount = 0;
      let fallbackCount = 0;
      let maxAscentEm = 0.8;
      let maxDescentEm = 0.28;
      for (const glyph of glyphs) {
        const shapeRecord = shapeRegistry.getByGlyph(glyph);
        const advance = getShapeAdvancePx({ glyph, shapeRecord, font });
        advances.push(advance);
        width += advance;
        if (shapeRecord && shapeRecord.source === "extracted") extractedCount += 1;
        else fallbackCount += 1;
        if (shapeRecord && shapeRecord.bbox) {
          const top = typeof shapeRecord.bbox.y === "number" ? shapeRecord.bbox.y : 0;
          const bottom = typeof shapeRecord.bbox.height === "number"
            ? top + shapeRecord.bbox.height
            : top;
          maxAscentEm = Math.max(maxAscentEm, Math.max(0, bottom));
          maxDescentEm = Math.max(maxDescentEm, Math.max(0, -top));
        }
      }
      const charPositions = [0];
      let cursor = 0;
      for (const advance of advances) {
        cursor += advance;
        charPositions.push(cursor);
      }
      const ascentPx = maxAscentEm * font.size;
      const descentPx = maxDescentEm * font.size;
      const lineHeight = Math.max(font.lineHeight, Math.ceil(ascentPx + descentPx));
      return {
        width,
        charPositions,
        glyphBoxes: buildGlyphBoxes(charPositions, lineHeight, ascentPx),
        ascentPx,
        descentPx,
        lineHeight,
        glyphCount: glyphs.length,
        extractedCount,
        fallbackCount
      };
    }
  };
}

export function getTextMetricsBackend(ctx) {
  return {
    name: "text",
    measureRun({ text, font }) {
      const value = String(text || "");
      const width = ctx.measureText(value).width;
      const charPositions = [0];
      for (let index = 1; index <= value.length; index += 1) {
        charPositions.push(ctx.measureText(value.slice(0, index)).width);
      }
      const ascentPx = Math.round(font.size * 0.8);
      const descentPx = Math.max(4, Math.round(font.size * 0.28));
      const lineHeight = Math.max(font.lineHeight, ascentPx + descentPx);
      return {
        width,
        charPositions,
        glyphBoxes: buildGlyphBoxes(charPositions, lineHeight, ascentPx),
        ...fallbackLineMetrics(font, value.length)
      };
    }
  };
}
