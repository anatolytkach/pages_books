#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedAnnotationBundle } from "../../runtime/protected-annotation-bundle.js";
import { buildProtectedSyncTransport } from "../../runtime/protected-sync-transport.js";
import { buildProtectedSyncFileFromBundle } from "../../runtime/protected-sync-compat.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const inputPath = getArg("--input");
const outputPath = getArg("--output");
const handoffPath = getArg("--handoff");

if (!inputPath || !outputPath || !handoffPath) {
  console.error("Usage: export-sync-file.js --input <protected-bundle.json> --output <protected-sync-file.json> --handoff <handoff-state.json>");
  process.exit(1);
}

const bundle = normalizeProtectedAnnotationBundle(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")));
const transport = buildProtectedSyncTransport({
  syncFile: buildProtectedSyncFileFromBundle(bundle, {
    metadata: {
      source: "cli-export-sync-file"
    },
    compat: {
      production: {
        snapshotPatchAvailable: true,
        notesExportAvailable: true,
        sharePayloadAvailable: true
      }
    }
  })
});

fs.writeFileSync(path.resolve(outputPath), transport.serializedSyncFile);
fs.writeFileSync(path.resolve(handoffPath), transport.serializedHandoffState);

console.log(JSON.stringify({
  ok: true,
  input: path.resolve(inputPath),
  output: path.resolve(outputPath),
  handoff: path.resolve(handoffPath),
  fileName: transport.fileName,
  fileSize: transport.fileSize,
  annotationCount: transport.syncFile.state.annotations.length
}, null, 2));
