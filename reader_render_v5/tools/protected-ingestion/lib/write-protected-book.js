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

function normalizeArtifactPublicRoot(outputPath, suffix = "") {
  const workspaceRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const absoluteOutput = path.resolve(outputPath);
  const relativeFromWorkspace = path.relative(workspaceRoot, absoluteOutput).replace(/\\/g, "/");
  if (relativeFromWorkspace.startsWith("..")) return "";
  const trimmed = relativeFromWorkspace.replace(/^\/+/, "").replace(/\/+$/, "");
  const normalizedSuffix = String(suffix || "").trim().replace(/^\/+/, "");
  return normalizedSuffix ? `/${trimmed}/${normalizedSuffix}` : `/${trimmed}`;
}

function collectReferencedMediaHrefs(built) {
  const hrefs = new Set();
  const manifestCoverHref = String(
    built &&
    built.manifest &&
    built.manifest.cover &&
    built.manifest.cover.resolvedHref || ""
  ).trim();
  if (manifestCoverHref) hrefs.add(manifestCoverHref.replace(/^\/+/, ""));
  for (const chunk of built && Array.isArray(built.runtimeChunks) ? built.runtimeChunks : []) {
    for (const block of Array.isArray(chunk && chunk.logicalBlockList) ? chunk.logicalBlockList : []) {
      for (const item of Array.isArray(block && block.mediaItems) ? block.mediaItems : []) {
        const resolvedHref = String(item && item.resolvedHref || "").trim().replace(/^\/+/, "");
        if (resolvedHref) hrefs.add(resolvedHref);
      }
    }
  }
  return Array.from(hrefs);
}

function copyReferencedAssets(sourceRootDir, assetRoot, hrefs) {
  for (const href of hrefs) {
    const normalizedHref = String(href || "").trim().replace(/^\/+/, "");
    if (!normalizedHref) continue;
    const sourcePath = path.join(sourceRootDir, normalizedHref);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
    const targetPath = path.join(assetRoot, normalizedHref);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function writeProtectedBook(outputPath, built) {
  const root = path.resolve(outputPath);
  fs.rmSync(root, { recursive: true, force: true });
  ensureDir(root);
  ensureDir(path.join(root, "assets"));
  ensureDir(path.join(root, "chunks"));
  ensureDir(path.join(root, "glyphs"));
  ensureDir(path.join(root, "shapes"));

  const manifest = JSON.parse(JSON.stringify(built.manifest || {}));
  const sourceRootDir = String(built && built.sourceRootDir || "").trim();
  if (
    manifest &&
    manifest.source &&
    String(manifest.source.inputType || "").trim() === "epub" &&
    sourceRootDir &&
    fs.existsSync(sourceRootDir)
  ) {
    copyReferencedAssets(sourceRootDir, path.join(root, "assets"), collectReferencedMediaHrefs(built));
    const mirroredPublicRoot = normalizeArtifactPublicRoot(root, "assets");
    if (mirroredPublicRoot) manifest.source.publicRootPath = mirroredPublicRoot;
  }

  writeJson(path.join(root, "manifest.json"), manifest);
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
