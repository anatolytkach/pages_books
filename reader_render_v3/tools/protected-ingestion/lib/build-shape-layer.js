#!/usr/bin/env node
"use strict";

const { resolveFontPolicy } = require("./resolve-font-policy");
const { extractGlyphPath } = require("./extract-glyph-paths");

function glyphPrimitiveType(glyph, extraction) {
  if (glyph.scalar === 32) return "space";
  if (extraction.source === "extracted" && extraction.pathData) return "path";
  if (glyph.scriptBucket === "Common") return "common-box";
  return "ink-box";
}

function advanceEmForGlyph(glyph) {
  const cp = glyph.scalar;
  if (cp === 32) return 0.33;
  if (/[ilI.,'`:;!]/.test(String.fromCodePoint(cp))) return 0.28;
  if (/[MW@#%&]/.test(String.fromCodePoint(cp))) return 0.92;
  if (/[A-Z]/.test(String.fromCodePoint(cp))) return 0.68;
  if (/[0-9]/.test(String.fromCodePoint(cp))) return 0.56;
  if (glyph.scriptBucket === "CJK") return 1.0;
  return 0.56;
}

function bboxForGlyph(glyph, advanceEm) {
  if (glyph.scalar === 32) {
    return { x: 0, y: 0, width: advanceEm, height: 0 };
  }
  return {
    x: 0,
    y: -0.8,
    width: advanceEm,
    height: 1.0
  };
}

function buildShapeLayer({ chunkId, internalGlyphs, styleRegistry, fontAssets }) {
  const shapeRecords = internalGlyphs.map((glyph) => {
    const styleTokenRecord = styleRegistry[glyph.styleToken] || {};
    const fontPolicy = resolveFontPolicy({ glyph, styleTokenRecord, fontAssets });
    const extraction = extractGlyphPath({ glyph, fontPolicy });
    const advanceEm = extraction.advance || advanceEmForGlyph(glyph);
    return {
      shapeRef: glyph.shapeRef,
      glyphId: glyph.glyphId,
      glyphToken: glyph.glyphToken,
      styleToken: glyph.styleToken,
      scriptBucket: glyph.scriptBucket,
      source: extraction.source,
      extractionStatus: extraction.extractionStatus,
      fontSourceType: fontPolicy.fontSourceType,
      fontSourceName: fontPolicy.fontSourceName,
      fontSourceRef: fontPolicy.fontSourceRef,
      primitiveType: glyphPrimitiveType(glyph, extraction),
      advance: advanceEm,
      advanceEm,
      unitsPerEm: extraction.unitsPerEm || 0,
      bbox: extraction.bbox || bboxForGlyph(glyph, advanceEm),
      pathData: extraction.pathData || null
    };
  });

  return {
    chunkId,
    version: 1,
    summary: {
      total: shapeRecords.length,
      extracted: shapeRecords.filter((item) => item.source === "extracted").length,
      synthetic: shapeRecords.filter((item) => item.source === "synthetic").length,
      placeholder: shapeRecords.filter((item) => item.source === "placeholder").length
    },
    shapeRecords
  };
}

module.exports = { buildShapeLayer };
