#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedSyncBundle } from "../../runtime/protected-sync-bundle.js";
import { buildProtectedHandoffState, serializeProtectedHandoffState } from "../../runtime/protected-handoff-state.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const inputPath = getArg("--input");
const outputPath = getArg("--output");

if (!inputPath || !outputPath) {
  console.error("Usage: build-handoff-state.js --input <protected-sync-file.json> --output <handoff-state.json>");
  process.exit(1);
}

const syncFile = normalizeProtectedSyncBundle(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")));
const handoffState = buildProtectedHandoffState({
  syncFile,
  fileName: path.basename(inputPath)
});
fs.writeFileSync(path.resolve(outputPath), serializeProtectedHandoffState(handoffState));
console.log(JSON.stringify({
  ok: true,
  input: path.resolve(inputPath),
  output: path.resolve(outputPath),
  kind: handoffState.kind,
  bookId: handoffState.bookId,
  annotationCount: handoffState.annotationCount
}, null, 2));
