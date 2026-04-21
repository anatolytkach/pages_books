#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedAnnotationBundle } from "../../runtime/protected-annotation-bundle.js";
import { buildProtectedSyncFileFromBundle } from "../../runtime/protected-sync-conversion.js";
import { serializeProtectedSyncBundle } from "../../runtime/protected-sync-bundle.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const inputPath = getArg("--input");
const outputPath = getArg("--output");

if (!inputPath || !outputPath) {
  console.error("Usage: build-protected-sync-file.js --input <protected-bundle.json> --output <protected-sync-file.json>");
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), "utf8");
const bundle = normalizeProtectedAnnotationBundle(JSON.parse(raw));
const syncFile = buildProtectedSyncFileFromBundle(bundle, {
  metadata: {
    source: "cli-build-protected-sync-file"
  }
});
fs.writeFileSync(path.resolve(outputPath), serializeProtectedSyncBundle(syncFile));
console.log(JSON.stringify({
  ok: true,
  input: path.resolve(inputPath),
  output: path.resolve(outputPath),
  bookId: syncFile.bookId,
  annotations: syncFile.state.annotations.length,
  readingStateSaved: !!syncFile.state.readingState
}, null, 2));
