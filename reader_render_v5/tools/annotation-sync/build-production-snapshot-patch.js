#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedAnnotationBundle } from "../../runtime/protected-annotation-bundle.js";
import { exportProtectedAnnotationsToProduction } from "../../runtime/protected-production-export.js";
import { buildProductionSnapshotPatchFromProtectedState } from "../../runtime/protected-sync-conversion.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const inputPath = getArg("--input");
const outputPath = getArg("--output");

if (!inputPath || !outputPath) {
  console.error("Usage: build-production-snapshot-patch.js --input <protected-bundle.json> --output <snapshot-patch.json>");
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), "utf8");
const bundle = normalizeProtectedAnnotationBundle(JSON.parse(raw));
const productionPayload = await exportProtectedAnnotationsToProduction({
  annotations: bundle.annotations,
  bookId: bundle.bookId,
  readingState: bundle.readingState
});
const bridge = buildProductionSnapshotPatchFromProtectedState({
  protectedBundle: bundle,
  productionPayload,
  metadata: {
    source: "cli-build-production-snapshot-patch"
  }
});
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(bridge.snapshotPatch, null, 2));
console.log(JSON.stringify({
  ok: true,
  input: path.resolve(inputPath),
  output: path.resolve(outputPath),
  bookId: bundle.bookId,
  productionNotes: productionPayload.productionNotes.length,
  unresolved: productionPayload.report.unresolved
}, null, 2));
