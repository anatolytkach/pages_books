#!/usr/bin/env node
"use strict";

const crypto = require("crypto");

function hash(input, length = 12) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, length);
}

function fontCandidateForCodePoint(codePoint, fontMode = "sans") {
  if (fontMode === "serif") {
    if (codePoint >= 0x3400 && codePoint <= 0x9fff) return "Noto Serif CJK";
    return "Noto Serif";
  }
  if (codePoint >= 0x0400 && codePoint <= 0x052f) return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  if (codePoint <= 0x024f) return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  if (codePoint >= 0x3400 && codePoint <= 0x9fff) return "Noto Serif CJK";
  return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
}

function isCombiningMarkChar(char) {
  return /\p{M}/u.test(String(char || ""));
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
  const internalGlyphs = [];
  const renderRuns = [];

  function glyphIdFor(char, styleToken) {
    const scalar = char.codePointAt(0);
    const key = `${char}::${styleToken}`;
    if (!glyphByKey.has(key)) {
      const glyphId = `g-${hash(`${seed}:${key}`, 12)}`;
      const scriptBucket = isCombiningMarkChar(char) ? "Combining" : scriptBucketForCodePoint(scalar);
      const reconRef = `r-${hash(`${seed}:recon:${key}`, 12)}`;
      const runtimeGlyph = {
        glyphId,
        glyphToken: glyphId,
        styleToken,
        scriptBucket,
        glyphClass: `${scriptBucket.toLowerCase()}-${styleToken}`,
        stableRenderClass: `${scriptBucket.toLowerCase()}-chunk-glyph`,
        visualRefs: {
          sans: {
            fontMode: "sans",
            fontFamilyCandidate: fontCandidateForCodePoint(scalar, "sans"),
            shapeRef: `shape-sans-${glyphId}`,
            shapeStatus: "synthetic"
          },
          serif: {
            fontMode: "serif",
            fontFamilyCandidate: fontCandidateForCodePoint(scalar, "serif"),
            shapeRef: `shape-serif-${glyphId}`,
            shapeStatus: "synthetic"
          }
        }
      };
      const internalGlyph = {
        ...runtimeGlyph,
        reconRef,
        scalar
      };
      const debugGlyph = {
        ...runtimeGlyph,
        codePoint: scalar,
        char
      };
      glyphByKey.set(key, { runtimeGlyph, debugGlyph, internalGlyph });
      runtimeGlyphs.push(runtimeGlyph);
      debugGlyphs.push(debugGlyph);
      internalGlyphs.push(internalGlyph);
    }
    return glyphByKey.get(key).runtimeGlyph.glyphToken;
  }

  blocks.forEach((block) => {
    block.runs.forEach((run, runIndex) => {
      if (run.hardBreak) {
        renderRuns.push({
          runId: `${block.blockId}-run-${runIndex + 1}`,
          blockId: block.blockId,
          styleToken: run.styleToken,
          glyphTokens: [],
          glyphCount: 0,
          hardBreak: true,
          sourceRef: block.sourceRef,
          linkTarget: run.linkTarget || "",
          styleSignals: styleRegistry[run.styleToken] || null
        });
        return;
      }
      const glyphTokens = Array.from(run.text).map((char) => glyphIdFor(char, run.styleToken));
      renderRuns.push({
        runId: `${block.blockId}-run-${runIndex + 1}`,
        blockId: block.blockId,
        styleToken: run.styleToken,
        glyphTokens,
        glyphCount: glyphTokens.length,
        hardBreak: false,
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
    internalGlyphs,
    renderRuns
  };
}

module.exports = { buildGlyphLayer };
