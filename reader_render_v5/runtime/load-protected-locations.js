#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadProtectedLocations(rootPath, manifest) {
  const locationsPath = path.join(rootPath, manifest.locationsPath || "locations.json");
  const locations = readJson(locationsPath);
  if (!Array.isArray(locations.chunks)) {
    throw new Error("Protected locations payload is missing chunks.");
  }
  return { locationsPath, locations };
}

module.exports = { loadProtectedLocations };
