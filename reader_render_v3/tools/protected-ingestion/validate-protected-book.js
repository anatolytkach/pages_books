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

function getArtifactContract(manifest) {
  return manifest && manifest.artifactContract && typeof manifest.artifactContract === "object"
    ? manifest.artifactContract
    : { kind: "legacy-single-family-v1", supportedFontModes: ["sans"], defaultFontMode: "sans" };
}

function collectGlyphVisualRefs(glyph, artifactContract) {
  if (!glyph || typeof glyph !== "object") return [];
  if (artifactContract.kind === "dual-family-static-v1") {
    const visualRefs = glyph.visualRefs && typeof glyph.visualRefs === "object" ? glyph.visualRefs : {};
    return Object.entries(visualRefs)
      .map(([fontMode, visual]) => ({
        fontMode,
        shapeRef: visual && typeof visual === "object" ? String(visual.shapeRef || "") : ""
      }))
      .filter((item) => item.shapeRef);
  }
  return glyph.shapeRef ? [{ fontMode: glyph.fontMode || artifactContract.defaultFontMode || "sans", shapeRef: glyph.shapeRef }] : [];
}

function collectShapeRecordsByMode(shapes, artifactContract) {
  if (artifactContract.kind === "dual-family-static-v1") {
    const fontModes = shapes && shapes.fontModes && typeof shapes.fontModes === "object" ? shapes.fontModes : {};
    return Object.fromEntries(
      Object.entries(fontModes).map(([fontMode, bundle]) => [
        fontMode,
        Array.isArray(bundle && bundle.shapeRecords) ? bundle.shapeRecords : []
      ])
    );
  }
  return {
    [artifactContract.defaultFontMode || "sans"]: Array.isArray(shapes && shapes.shapeRecords) ? shapes.shapeRecords : []
  };
}

function validateChunk(chunkInfo, glyphInfo, locations, manifest) {
  const chunk = chunkInfo.chunk;
  const glyphs = glyphInfo.glyphs;
  const shapes = glyphInfo.shapes;
  const substrate = glyphInfo.substrate || glyphInfo.glyphs.substrate;
  const artifactContract = getArtifactContract(manifest);
  const chunkLocation = locations.chunks.find((item) => item.chunkId === chunk.chunkId);
  const selectionLayer = chunk.selectionLayer || {};
  const textSegments = Array.isArray(selectionLayer.textSegments) ? selectionLayer.textSegments : [];
  const wordBoundaries = Array.isArray(selectionLayer.wordBoundaries) ? selectionLayer.wordBoundaries : [];
  const blockAnchors = Array.isArray(selectionLayer.blockAnchors) ? selectionLayer.blockAnchors : [];
  const noteAnchors = Array.isArray(selectionLayer.noteAnchors) ? selectionLayer.noteAnchors : [];

  if (!chunk.renderLayer || !Array.isArray(chunk.renderLayer.glyphRuns)) {
    throw new Error(`Chunk ${chunk.chunkId} is missing renderLayer.glyphRuns`);
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
  if (!Array.isArray(selectionLayer.wordBoundaries) || !selectionLayer.wordBoundaries.length) {
    throw new Error(`Chunk ${chunk.chunkId} is missing selectionLayer.wordBoundaries`);
  }
  if (!selectionLayer.chunkRange || typeof selectionLayer.chunkRange.start !== "number" || typeof selectionLayer.chunkRange.end !== "number") {
    throw new Error(`Chunk ${chunk.chunkId} is missing selectionLayer.chunkRange`);
  }
  if ("text" in chunk.renderLayer) {
    throw new Error(`Chunk ${chunk.chunkId} leaks renderLayer.text`);
  }
  if ("textRuns" in chunk.renderLayer) {
    throw new Error(`Chunk ${chunk.chunkId} still exposes renderLayer.textRuns`);
  }
  if (!glyphs.seed || !glyphs.glyphs || typeof glyphs.glyphs !== "object") {
    throw new Error(`Glyph file for ${chunk.chunkId} is missing seed or glyph table`);
  }
  const glyphValues = Object.values(glyphs.glyphs);
  if (glyphValues.some((item) => "char" in item)) {
    throw new Error(`Glyph file for ${chunk.chunkId} leaks char fields`);
  }
  if (glyphValues.some((item) => "codePoint" in item)) {
    throw new Error(`Glyph file for ${chunk.chunkId} leaks codePoint fields`);
  }
  if (glyphValues.some((item) => "reconRef" in item)) {
    throw new Error(`Glyph file for ${chunk.chunkId} leaks reconstruction linkage`);
  }
  if (glyphValues.some((item) => !item.styleToken || !item.glyphToken || !collectGlyphVisualRefs(item, artifactContract).length)) {
    throw new Error(`Glyph file for ${chunk.chunkId} has incomplete glyph records`);
  }
  if (!substrate || substrate.mode !== "sealed-window-substrate-v1" || !Array.isArray(substrate.lanes)) {
    throw new Error(`Glyph file for ${chunk.chunkId} is missing sealed reconstruction substrate`);
  }
  if (shapes) {
    const shapeRecordsByMode = collectShapeRecordsByMode(shapes, artifactContract);
    const supportedFontModes =
      artifactContract.kind === "dual-family-static-v1"
        ? (artifactContract.supportedFontModes || ["sans"])
        : [artifactContract.defaultFontMode || "sans"];
    if (supportedFontModes.some((fontMode) => !Array.isArray(shapeRecordsByMode[fontMode]) || !shapeRecordsByMode[fontMode].length)) {
      throw new Error(`Shapes file for ${chunk.chunkId} has no shapeRecords for one or more font modes`);
    }
    const shapeRefsByMode = Object.fromEntries(
      Object.entries(shapeRecordsByMode).map(([fontMode, records]) => [fontMode, new Set(records.map((item) => item.shapeRef))])
    );
    for (const records of Object.values(shapeRecordsByMode)) {
      for (const shape of records) {
        if (!shape.shapeRef || !shape.glyphId) {
          throw new Error(`Shapes file for ${chunk.chunkId} has incomplete shape linkage`);
        }
        if ("codePoint" in shape || "char" in shape || "text" in shape) {
          throw new Error(`Shapes file for ${chunk.chunkId} leaks direct text fields`);
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
    }
    for (const glyph of glyphValues) {
      const refs = collectGlyphVisualRefs(glyph, artifactContract);
      if (!refs.length) {
        throw new Error(`Glyph ${glyph.glyphId} in ${chunk.chunkId} is missing shapeRef`);
      }
      for (const ref of refs) {
        const refsForMode = shapeRefsByMode[ref.fontMode] || shapeRefsByMode[artifactContract.defaultFontMode || "sans"];
        if (!refsForMode || !refsForMode.has(ref.shapeRef)) {
          throw new Error(`Shape bundle for ${chunk.chunkId} is missing ${ref.shapeRef}`);
        }
      }
    }
  }
  for (const entry of substrate.lanes) {
    if (entry && ("codePoint" in entry || "char" in entry || "text" in entry || "glyphToken" in entry)) {
      throw new Error(`Reconstruction substrate for ${chunk.chunkId} leaks direct text fields`);
    }
  }
  for (const run of chunk.renderLayer.glyphRuns || []) {
    for (const glyphToken of run.glyphTokens || []) {
      if (!glyphs.glyphs[glyphToken]) {
        throw new Error(`Chunk ${chunk.chunkId} references missing glyph ${glyphToken}`);
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

  const textLength = Number(selectionLayer.textLength || 0);
  const chunkStart = Number(selectionLayer.chunkRange.start || 0);
  const chunkEnd = Number(selectionLayer.chunkRange.end || 0);
  if (chunkEnd - chunkStart !== textLength) {
    throw new Error(`Chunk ${chunk.chunkId} has inconsistent chunkRange/textLength`);
  }

  let lastSegmentEnd = 0;
  for (const segment of textSegments) {
    if (typeof segment.start !== "number" || typeof segment.end !== "number" || segment.end < segment.start) {
      throw new Error(`Chunk ${chunk.chunkId} has invalid text segment bounds`);
    }
    if (segment.start < lastSegmentEnd) {
      throw new Error(`Chunk ${chunk.chunkId} has overlapping textSegments`);
    }
    const segmentLength = Number(segment.textLength || 0);
    if (segment.end - segment.start !== segmentLength) {
      throw new Error(`Chunk ${chunk.chunkId} text segment ${segment.segmentId || "unknown"} has inconsistent textLength`);
    }
    lastSegmentEnd = segment.end;
  }
  if (textSegments.length && lastSegmentEnd > textLength) {
    throw new Error(`Chunk ${chunk.chunkId} textSegments exceed chunk textLength`);
  }

  let lastWordEnd = 0;
  for (const word of wordBoundaries) {
    if (typeof word.start !== "number" || typeof word.end !== "number" || word.end <= word.start) {
      throw new Error(`Chunk ${chunk.chunkId} has invalid word boundary`);
    }
    if (word.start < lastWordEnd) {
      throw new Error(`Chunk ${chunk.chunkId} has overlapping word boundaries`);
    }
    if (word.end > textLength) {
      throw new Error(`Chunk ${chunk.chunkId} word boundary exceeds textLength`);
    }
    lastWordEnd = word.end;
  }

  const textCoverage = textSegments.reduce((sum, segment) => sum + Math.max(0, Number(segment.end || 0) - Number(segment.start || 0)), 0);
  const wordCoverage = wordBoundaries.reduce((sum, word) => sum + Math.max(0, Number(word.end || 0) - Number(word.start || 0)), 0);
  if (textCoverage > 0 && wordCoverage <= 0) {
    throw new Error(`Chunk ${chunk.chunkId} has zero word-boundary coverage`);
  }
  if (textCoverage > 0) {
    const coverageRatio = wordCoverage / textCoverage;
    if (coverageRatio < 0.45) {
      throw new Error(`Chunk ${chunk.chunkId} has suspiciously low word-boundary coverage (${coverageRatio.toFixed(3)})`);
    }
  }

  for (const anchor of blockAnchors) {
    if (typeof anchor.start !== "number" || typeof anchor.end !== "number" || anchor.end < anchor.start) {
      throw new Error(`Chunk ${chunk.chunkId} has invalid block anchor`);
    }
    if (anchor.end > textLength) {
      throw new Error(`Chunk ${chunk.chunkId} block anchor exceeds textLength`);
    }
    if (!anchor.blockId) {
      throw new Error(`Chunk ${chunk.chunkId} block anchor missing blockId`);
    }
  }

  for (const anchor of noteAnchors) {
    if (typeof anchor.start !== "number" || typeof anchor.end !== "number" || anchor.end < anchor.start) {
      throw new Error(`Chunk ${chunk.chunkId} has invalid note anchor`);
    }
    if (anchor.end > textLength) {
      throw new Error(`Chunk ${chunk.chunkId} note anchor exceeds textLength`);
    }
  }
}

function validateTocCoverage(manifest, locations, toc) {
  const chunks = Array.isArray(locations && locations.chunks) ? locations.chunks : [];
  const covered = new Set();
  for (const chunk of chunks) {
    const tocAnchors = Array.isArray(chunk && chunk.tocAnchors) ? chunk.tocAnchors : [];
    for (const anchor of tocAnchors) {
      if (anchor && anchor.tocId) covered.add(String(anchor.tocId));
    }
  }
  const tocItems = Array.isArray(toc && toc.items) ? toc.items : [];
  const missing = tocItems.filter((item) => item && item.href && !covered.has(String(item.id || "")));
  if (missing.length) {
    const sample = missing.slice(0, 5).map((item) => `${item.id}:${item.label}`).join(", ");
    throw new Error(`locations.json is missing TOC anchor coverage for ${missing.length} items (${sample})`);
  }
}

function main() {
  const input = getArg("--input");
  if (!input) {
    console.error("Usage: protected:validate -- --input <artifact-path>");
    process.exit(1);
  }

  const root = resolveInput(input);
  if (fs.existsSync(path.join(root, "internal"))) {
    throw new Error("Artifact still exposes fetchable internal reconstruction directory.");
  }
  const { manifest } = loadProtectedManifest(root);
  const { locations } = loadProtectedLocations(root, manifest);
  const { styles } = loadProtectedStyles(root, manifest);
  const toc = JSON.parse(fs.readFileSync(path.join(root, manifest.tocPath || "toc.json"), "utf8"));
  const styleTokens = new Set(styles.styleTokens.map((item) => item.styleToken));

  if (!Array.isArray(styles.styleTokens) || !styles.styleTokens.length) {
    throw new Error("styles.json has no styleTokens");
  }
  if (!Array.isArray(locations.chunks) || !locations.chunks.length) {
    throw new Error("locations.json has no chunks");
  }
  validateTocCoverage(manifest, locations, toc);
  const seeds = new Set();

  for (const manifestChunk of manifest.chunks) {
    if ("reconstructionPath" in manifestChunk) {
      throw new Error(`Manifest still exposes reconstructionPath for ${manifestChunk.chunkId}`);
    }
    const chunkInfo = loadProtectedChunk(root, manifestChunk);
    validateChunk(chunkInfo, chunkInfo, locations, manifest);
    seeds.add(chunkInfo.glyphs.seed);
    for (const run of chunkInfo.chunk.renderLayer.glyphRuns || []) {
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
