#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadProtectedManifest(rootPath) {
  const root = path.resolve(rootPath);
  const manifestPath = path.join(root, "manifest.json");
  const manifest = readJson(manifestPath);

  if (manifest.mode !== "protected-runtime-safe") {
    throw new Error(`Unsupported protected manifest mode: ${manifest.mode || "<missing>"}`);
  }
  if (!Array.isArray(manifest.chunks) || !manifest.chunks.length) {
    throw new Error("Protected manifest has no chunks.");
  }

  return {
    root,
    manifestPath,
    manifest
  };
}

module.exports = { loadProtectedManifest };
