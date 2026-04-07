#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadBook } = require("./lib/load-book");
const { extractSpine } = require("./lib/extract-spine");
const { extractTextBlocks } = require("./lib/extract-text-blocks");
const { extractStyleSignals } = require("./lib/extract-style-signals");
const { chunkTextBlocks } = require("./lib/chunk-text-blocks");
const { extractFontAssets } = require("./lib/extract-font-assets");
const { buildSelectionLayer } = require("./lib/build-selection-layer");
const { buildGlyphLayer } = require("./lib/build-glyph-layer");
const { buildShapeLayer } = require("./lib/build-shape-layer");
const { buildReconstructionLayer } = require("./lib/build-reconstruction-layer");
const { buildProtectedManifest } = require("./lib/build-protected-manifest");
const { writeProtectedBook } = require("./lib/write-protected-book");

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

function parseNumber(flag, fallback) {
  const value = getArg(flag);
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, "..");
const FONT_PLAN_PATH = path.join(PROJECT_ROOT, "artifacts", "protected-fonts", "font-plan.json");

function resolveInput(input) {
  const direct = path.resolve(input);
  const workspaceRelative = path.resolve(WORKSPACE_ROOT, input);
  return require("fs").existsSync(direct) ? direct : workspaceRelative;
}

function resolveOutput(output) {
  if (path.isAbsolute(output)) return output;
  return path.resolve(PROJECT_ROOT, output);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  const input = getArg("--input");
  const output = getArg("--output");
  const debugArtifactEnabled = hasFlag("--debug-artifact");
  if (!input || !output) {
    console.error("Usage: protected:build -- --input <path-to-book> --output <path-to-artifact> [--maxCharacters N] [--maxBlocks N] [--debug-artifact]");
    process.exit(1);
  }

  const config = {
    maxCharacters: parseNumber("--maxCharacters", 64000),
    maxBlocks: parseNumber("--maxBlocks", 900)
  };

  const resolvedInput = resolveInput(input);
  const resolvedOutput = resolveOutput(output);
  const fontPlan = fs.existsSync(FONT_PLAN_PATH) ? readJson(FONT_PLAN_PATH) : null;
  const book = await loadBook(resolvedInput);
  try {
    const spine = extractSpine(book);
    const extracted = extractTextBlocks({ book, spine });
    const styles = extractStyleSignals(extracted.blocks, { fontPlan });
    const fontAssets = extractFontAssets(book);
    const chunks = chunkTextBlocks(extracted.blocks, config);

    const runtimeChunks = [];
    const runtimeGlyphChunks = [];
    const runtimeShapeChunks = [];
    const debugChunks = [];
    const debugGlyphChunks = [];

    let globalStart = 0;
    for (const chunk of chunks) {
      const selectionLayer = buildSelectionLayer(chunk, { globalStart });
      const glyphLayer = buildGlyphLayer({
        bookId: book.bookId,
        chunkId: chunk.chunkId,
        blocks: chunk.blocks,
        styleRegistry: styles.styleRegistry
      });

      runtimeChunks.push({
        chunkId: chunk.chunkId,
        sourceRefs: chunk.sourceRefs,
        logicalBlockList: chunk.blocks.map((block) => ({
          blockId: block.blockId,
          blockType: block.blockType,
          textLength: block.text.length,
          labelHint: String(block.text || "").slice(0, 180),
          sourceRef: block.sourceRef,
          linkTargets: block.linkTargets,
          inlineIds: block.inlineIds,
          blockPresentation: block.blockPresentation,
          styleSignals: block.styleSignals
        })),
        renderLayer: {
          chunkGlyphsRef: `../glyphs/${chunk.chunkId}.glyphs.json`,
          glyphRuns: glyphLayer.renderRuns
        },
        selectionLayer: selectionLayer.runtime
      });

      runtimeGlyphChunks.push({
        chunkId: chunk.chunkId,
        seed: glyphLayer.seed,
        glyphs: Object.fromEntries(glyphLayer.runtimeGlyphs.map((glyph) => [glyph.glyphId, glyph])),
        substrate: buildReconstructionLayer({
          chunkId: chunk.chunkId,
          seed: glyphLayer.seed,
          internalGlyphs: glyphLayer.internalGlyphs
        })
      });
      runtimeShapeChunks.push(buildShapeLayer({
        chunkId: chunk.chunkId,
        internalGlyphs: glyphLayer.internalGlyphs,
        styleRegistry: styles.styleRegistry,
        fontAssets
      }));

      if (debugArtifactEnabled) {
        debugChunks.push({
          chunkId: chunk.chunkId,
          sourceRefs: chunk.sourceRefs,
          selectionLayer: selectionLayer.debug,
          logicalBlocks: chunk.blocks.map((block) => ({
            blockId: block.blockId,
            blockType: block.blockType,
            text: block.text,
            labelHint: String(block.text || "").slice(0, 180),
            sourceRef: block.sourceRef,
            linkTargets: block.linkTargets,
            inlineIds: block.inlineIds,
            blockPresentation: block.blockPresentation
          }))
        });

        debugGlyphChunks.push({
          chunkId: chunk.chunkId,
          seed: glyphLayer.seed,
          glyphs: Object.fromEntries(glyphLayer.debugGlyphs.map((glyph) => [glyph.glyphId, glyph]))
        });
      }

      globalStart = selectionLayer.runtime.chunkRange.end;
    }

    const built = buildProtectedManifest({
      book,
      toc: extracted.toc,
      runtimeChunks,
      runtimeGlyphChunks,
      runtimeShapeChunks,
      debugChunks,
      debugGlyphChunks,
      styles,
      fontPlan,
      debugArtifactEnabled
    });

    writeProtectedBook(resolvedOutput, built);

    console.log(JSON.stringify({
      ok: true,
      input: resolvedInput,
      output: resolvedOutput,
      bookId: book.bookId,
      chunks: runtimeChunks.length,
      inputType: book.inputType,
      tocItems: (built.toc.items || []).length,
      debugArtifact: debugArtifactEnabled
    }, null, 2));
  } finally {
    if (typeof book.cleanup === "function") {
      try { book.cleanup(); } catch (_) {}
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
