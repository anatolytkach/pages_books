#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function writeProtectedBook(outputPath, built) {
  const root = path.resolve(outputPath);
  fs.rmSync(root, { recursive: true, force: true });
  ensureDir(root);
  ensureDir(path.join(root, "assets"));
  ensureDir(path.join(root, "chunks"));
  ensureDir(path.join(root, "glyphs"));
  ensureDir(path.join(root, "shapes"));

  writeJson(path.join(root, "manifest.json"), built.manifest);
  writeJson(path.join(root, "toc.json"), built.toc);
  writeJson(path.join(root, "locations.json"), built.locations);
  writeJson(path.join(root, "styles.json"), built.styles);

  for (const chunk of built.runtimeChunks) {
    writeJson(path.join(root, "chunks", `${chunk.chunkId}.json`), chunk);
  }

  for (const glyphChunk of built.runtimeGlyphChunks) {
    writeJson(path.join(root, "glyphs", `${glyphChunk.chunkId}.glyphs.json`), glyphChunk);
  }

  for (const shapeChunk of built.runtimeShapeChunks || []) {
    writeJson(path.join(root, "shapes", `${shapeChunk.chunkId}.shapes.json`), shapeChunk);
  }

  for (const asset of built.assetFiles || []) {
    if (!asset || !asset.sourcePath || !asset.artifactPath) continue;
    const targetPath = path.join(root, asset.artifactPath);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(asset.sourcePath, targetPath);
  }

  if (built.debugArtifactEnabled) {
    ensureDir(path.join(root, "debug", "chunks"));
    ensureDir(path.join(root, "debug", "glyphs"));

    for (const chunk of built.debugChunks || []) {
      writeJson(path.join(root, "debug", "chunks", `${chunk.chunkId}.debug.json`), chunk);
    }

    for (const glyphChunk of built.debugGlyphChunks || []) {
      writeJson(path.join(root, "debug", "glyphs", `${glyphChunk.chunkId}.glyphs.debug.json`), glyphChunk);
    }
  }
}

module.exports = { writeProtectedBook };
