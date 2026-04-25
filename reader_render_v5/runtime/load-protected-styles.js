#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadProtectedStyles(rootPath, manifest) {
  const stylesPath = path.join(rootPath, manifest.stylesPath || "styles.json");
  const styles = readJson(stylesPath);
  if (!Array.isArray(styles.styleTokens)) {
    throw new Error("Protected styles payload is missing styleTokens.");
  }
  return { stylesPath, styles };
}

module.exports = { loadProtectedStyles };
