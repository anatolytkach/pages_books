#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertNoLeakage(value, where) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLeakage(item, `${where}[${index}]`));
    return;
  }
  for (const [key, next] of Object.entries(value)) {
    if (key === "char" || key === "fullText" || key === "text") {
      throw new Error(`Runtime-safe chunk leakage field detected at ${where}.${key}`);
    }
    assertNoLeakage(next, `${where}.${key}`);
  }
}

function loadProtectedChunk(rootPath, manifestChunk) {
  const chunkPath = path.join(rootPath, manifestChunk.chunkPath);
  const glyphPath = path.join(rootPath, manifestChunk.glyphsPath);
  const chunk = readJson(chunkPath);
  const glyphs = readJson(glyphPath);

  assertNoLeakage(chunk.selectionLayer, "chunk.selectionLayer");
  assertNoLeakage(glyphs.glyphs, "glyphs.glyphs");

  return {
    chunkPath,
    glyphPath,
    chunk,
    glyphs
  };
}

module.exports = { loadProtectedChunk };
