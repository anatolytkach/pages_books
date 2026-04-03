#!/usr/bin/env node
"use strict";

const crypto = require("crypto");

function hash(input, length = 12) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, length);
}

function fontCandidateForCodePoint(codePoint) {
  if (codePoint >= 0x0400 && codePoint <= 0x052f) return "Noto Serif";
  if (codePoint <= 0x024f) return "Noto Serif";
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return "Noto Serif";
  if (codePoint >= 0x3400 && codePoint <= 0x9fff) return "Noto Serif CJK";
  return "Noto Serif";
}

function scriptBucketForCodePoint(codePoint) {
  if (codePoint >= 0x0041 && codePoint <= 0x024f) return "Latin";
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return "Greek";
  if (codePoint >= 0x0400 && codePoint <= 0x052f) return "Cyrillic";
  if (codePoint >= 0x3400 && codePoint <= 0x9fff) return "CJK";
  if (
    (codePoint >= 0x0020 && codePoint <= 0x0040) ||
    (codePoint >= 0x2000 && codePoint <= 0x206f)
  ) return "Common";
  return "Unknown";
}

function buildGlyphLayer({ bookId, chunkId, blocks, styleRegistry }) {
  const seed = hash(`${bookId}:${chunkId}`, 16);
  const glyphByKey = new Map();
  const runtimeGlyphs = [];
  const debugGlyphs = [];
  const renderRuns = [];

  function glyphIdFor(char, styleToken) {
    const codePoint = char.codePointAt(0);
    const key = `${char}::${styleToken}`;
    if (!glyphByKey.has(key)) {
      const glyphId = `g-${hash(`${seed}:${key}`, 12)}`;
      const scriptBucket = scriptBucketForCodePoint(codePoint);
      const runtimeGlyph = {
        glyphId,
        codePoint,
        styleToken,
        fontFamilyCandidate: fontCandidateForCodePoint(codePoint),
        scriptBucket,
        glyphClass: `${scriptBucket.toLowerCase()}-${styleToken}`,
        stableRenderClass: `${scriptBucket.toLowerCase()}-chunk-glyph`,
        shapeRef: null,
        shapeStatus: "placeholder"
      };
      const debugGlyph = {
        ...runtimeGlyph,
        char
      };
      glyphByKey.set(key, { runtimeGlyph, debugGlyph });
      runtimeGlyphs.push(runtimeGlyph);
      debugGlyphs.push(debugGlyph);
    }
    return glyphByKey.get(key).runtimeGlyph.glyphId;
  }

  blocks.forEach((block) => {
    block.runs.forEach((run, runIndex) => {
      const glyphIds = Array.from(run.text).map((char) => glyphIdFor(char, run.styleToken));
      renderRuns.push({
        runId: `${block.blockId}-run-${runIndex + 1}`,
        blockId: block.blockId,
        styleToken: run.styleToken,
        glyphIds,
        textLength: run.text.length,
        sourceRef: block.sourceRef,
        linkTarget: run.linkTarget || "",
        styleSignals: styleRegistry[run.styleToken] || null
      });
    });
  });

  return {
    seed,
    runtimeGlyphs,
    debugGlyphs,
    renderRuns
  };
}

module.exports = { buildGlyphLayer };
