#!/usr/bin/env node
"use strict";

const opentype = require("opentype.js");

const FONT_CACHE = new Map();

function loadFont(fontFile) {
  if (!fontFile) return null;
  if (!FONT_CACHE.has(fontFile)) {
    FONT_CACHE.set(fontFile, opentype.loadSync(fontFile));
  }
  return FONT_CACHE.get(fontFile);
}

function scalarToChar(scalar) {
  try {
    return String.fromCodePoint(scalar);
  } catch (_) {
    return "";
  }
}

function extractGlyphPath({ glyph, fontPolicy }) {
  if (!fontPolicy || !fontPolicy.fontFile) {
    return {
      source: "synthetic",
      extractionStatus: fontPolicy ? fontPolicy.extractionStatus : "missing-font",
      pathData: "",
      advance: 0,
      unitsPerEm: 0,
      bbox: null
    };
  }

  if (glyph.scalar === 32) {
    return {
      source: "synthetic",
      extractionStatus: "space-fallback",
      pathData: "",
      advance: 0,
      unitsPerEm: 0,
      bbox: null
    };
  }

  const font = loadFont(fontPolicy.fontFile);
  const char = scalarToChar(glyph.scalar);
  if (!char) {
    return {
      source: "synthetic",
      extractionStatus: "invalid-codepoint",
      pathData: "",
      advance: 0,
      unitsPerEm: 0,
      bbox: null
    };
  }

  const otGlyph = font.charToGlyph(char);
  const unitsPerEm = font.unitsPerEm || 1000;
  const advance = (otGlyph && typeof otGlyph.advanceWidth === "number" ? otGlyph.advanceWidth : unitsPerEm * 0.56) / unitsPerEm;
  const path = otGlyph.getPath(0, 0, unitsPerEm);
  const pathData = path.toPathData(2);

  if (!pathData) {
    return {
      source: "synthetic",
      extractionStatus: "empty-path",
      pathData: "",
      advance,
      unitsPerEm,
      bbox: null
    };
  }

  const x1 = typeof otGlyph.xMin === "number" ? otGlyph.xMin / unitsPerEm : 0;
  const y1 = typeof otGlyph.yMin === "number" ? otGlyph.yMin / unitsPerEm : 0;
  const x2 = typeof otGlyph.xMax === "number" ? otGlyph.xMax / unitsPerEm : advance;
  const y2 = typeof otGlyph.yMax === "number" ? otGlyph.yMax / unitsPerEm : 0;

  return {
    source: "extracted",
    extractionStatus: "ok",
    pathData,
    advance,
    unitsPerEm,
    bbox: {
      x: x1,
      y: y1,
      width: Math.max(0, x2 - x1),
      height: Math.max(0, y2 - y1)
    }
  };
}

module.exports = { extractGlyphPath };
