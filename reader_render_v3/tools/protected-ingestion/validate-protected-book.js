#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadProtectedManifest } = require("../../runtime/load-protected-manifest");
const { loadProtectedChunk } = require("../../runtime/load-protected-chunk");
const { loadProtectedLocations } = require("../../runtime/load-protected-locations");
const { loadProtectedStyles } = require("../../runtime/load-protected-styles");

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function resolveInput(input) {
  if (path.isAbsolute(input)) return input;
  return path.resolve(PROJECT_ROOT, input);
}

function validateChunk(chunkInfo, glyphInfo, locations) {
  const chunk = chunkInfo.chunk;
  const glyphs = glyphInfo.glyphs;
  const shapes = glyphInfo.shapes;
  const chunkLocation = locations.chunks.find((item) => item.chunkId === chunk.chunkId);

  if (!chunk.renderLayer || !Array.isArray(chunk.renderLayer.textRuns)) {
    throw new Error(`Chunk ${chunk.chunkId} is missing renderLayer.textRuns`);
  }
  if (!chunk.selectionLayer || !Array.isArray(chunk.selectionLayer.textSegments)) {
    throw new Error(`Chunk ${chunk.chunkId} is missing selectionLayer.textSegments`);
  }
  if (!Array.isArray(chunk.sourceRefs) || !chunk.sourceRefs.length) {
    throw new Error(`Chunk ${chunk.chunkId} is missing sourceRefs`);
  }
  if ("fullText" in chunk.selectionLayer) {
    throw new Error(`Chunk ${chunk.chunkId} leaks selectionLayer.fullText`);
  }
  if ("text" in chunk.renderLayer) {
    throw new Error(`Chunk ${chunk.chunkId} leaks renderLayer.text`);
  }
  if (!glyphs.seed || !glyphs.glyphs || typeof glyphs.glyphs !== "object") {
    throw new Error(`Glyph file for ${chunk.chunkId} is missing seed or glyph table`);
  }
  const glyphValues = Object.values(glyphs.glyphs);
  if (glyphValues.some((item) => "char" in item)) {
    throw new Error(`Glyph file for ${chunk.chunkId} leaks char fields`);
  }
  if (glyphValues.some((item) => !("codePoint" in item) || !item.styleToken)) {
    throw new Error(`Glyph file for ${chunk.chunkId} has incomplete glyph records`);
  }
  if (shapes) {
    if (!Array.isArray(shapes.shapeRecords)) {
      throw new Error(`Shapes file for ${chunk.chunkId} has no shapeRecords`);
    }
    const shapeRefs = new Set(shapes.shapeRecords.map((item) => item.shapeRef));
    for (const shape of shapes.shapeRecords) {
      if (!shape.shapeRef || !shape.glyphId) {
        throw new Error(`Shapes file for ${chunk.chunkId} has incomplete shape linkage`);
      }
      if (shape.source === "extracted") {
        if (!shape.pathData || typeof shape.pathData !== "string") {
          throw new Error(`Extracted shape ${shape.shapeRef} in ${chunk.chunkId} is missing pathData`);
        }
        if (!shape.extractionStatus || shape.extractionStatus !== "ok") {
          throw new Error(`Extracted shape ${shape.shapeRef} in ${chunk.chunkId} has invalid extractionStatus`);
        }
        if (typeof shape.advance !== "number" || shape.advance <= 0) {
          throw new Error(`Extracted shape ${shape.shapeRef} in ${chunk.chunkId} has invalid advance`);
        }
        if (!shape.bbox || typeof shape.bbox.width !== "number" || typeof shape.bbox.height !== "number") {
          throw new Error(`Extracted shape ${shape.shapeRef} in ${chunk.chunkId} has invalid bbox`);
        }
      }
    }
    for (const glyph of glyphValues) {
      if (!glyph.shapeRef) {
        throw new Error(`Glyph ${glyph.glyphId} in ${chunk.chunkId} is missing shapeRef`);
      }
      if (!shapeRefs.has(glyph.shapeRef)) {
        throw new Error(`Shape bundle for ${chunk.chunkId} is missing ${glyph.shapeRef}`);
      }
    }
  }
  for (const run of chunk.renderLayer.textRuns) {
    for (const glyphId of run.glyphIds || []) {
      if (!glyphs.glyphs[glyphId]) {
        throw new Error(`Chunk ${chunk.chunkId} references missing glyph ${glyphId}`);
      }
    }
    if (!run.styleToken) {
      throw new Error(`Chunk ${chunk.chunkId} has run without styleToken`);
    }
  }
  if (!chunkLocation) {
    throw new Error(`locations.json is missing chunk entry for ${chunk.chunkId}`);
  }
  if (!Array.isArray(chunkLocation.blockBoundaries) || !chunkLocation.blockBoundaries.length) {
    throw new Error(`locations.json chunk ${chunk.chunkId} has no blockBoundaries`);
  }
  if (typeof chunkLocation.startOffset !== "number" || typeof chunkLocation.endOffset !== "number") {
    throw new Error(`locations.json chunk ${chunk.chunkId} has invalid offsets`);
  }
}

function main() {
  const input = getArg("--input");
  if (!input) {
    console.error("Usage: protected:validate -- --input <artifact-path>");
    process.exit(1);
  }

  const root = resolveInput(input);
  const { manifest } = loadProtectedManifest(root);
  const { locations } = loadProtectedLocations(root, manifest);
  const { styles } = loadProtectedStyles(root, manifest);
  const styleTokens = new Set(styles.styleTokens.map((item) => item.styleToken));

  if (!Array.isArray(styles.styleTokens) || !styles.styleTokens.length) {
    throw new Error("styles.json has no styleTokens");
  }
  if (!Array.isArray(locations.chunks) || !locations.chunks.length) {
    throw new Error("locations.json has no chunks");
  }
  const seeds = new Set();

  for (const manifestChunk of manifest.chunks) {
    const chunkInfo = loadProtectedChunk(root, manifestChunk);
    validateChunk(chunkInfo, chunkInfo, locations);
    seeds.add(chunkInfo.glyphs.seed);
    for (const run of chunkInfo.chunk.renderLayer.textRuns) {
      if (!styleTokens.has(run.styleToken)) {
        throw new Error(`Unknown styleToken ${run.styleToken} in ${chunkInfo.chunk.chunkId}`);
      }
    }
  }
  if (manifest.chunks.length > 1 && seeds.size < 2) {
    throw new Error("Chunk-local glyph mapping is not varying across chunks.");
  }

  console.log(JSON.stringify({
    ok: true,
    root,
    chunks: manifest.chunks.length,
    debugRequired: false,
    styles: styles.styleTokens.length
  }, null, 2));
}

main();
