#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedAnnotationBundle } from "../../runtime/protected-annotation-bundle.js";
import { buildProtectedSyncFileFromBundle } from "../../runtime/protected-sync-conversion.js";
import { buildProtectedSyncTransport } from "../../runtime/protected-sync-transport.js";
import {
  buildProtectedDriveAppProperties,
  buildProtectedDriveFileIdentity
} from "../../runtime/protected-drive-file.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const inputPath = getArg("--input");
const outputPath = getArg("--output");

if (!inputPath || !outputPath) {
  console.error("Usage: build-drive-sync-payload.js --input <protected-bundle.json> --output <drive-sync-payload.json>");
  process.exit(1);
}

const bundle = normalizeProtectedAnnotationBundle(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")));
const syncFile = buildProtectedSyncFileFromBundle(bundle, {
  metadata: {
    source: "cli-build-drive-sync-payload"
  },
  syncCapabilities: {
    production: {
      snapshotPatchAvailable: true,
      notesExportAvailable: true,
      sharePayloadAvailable: true
    }
  }
});
const syncTransport = buildProtectedSyncTransport({ syncFile });
const identity = buildProtectedDriveFileIdentity({
  bookId: syncFile.bookId,
  userScope: syncFile.userScope
});
const payload = {
  identity,
  appProperties: buildProtectedDriveAppProperties(syncFile),
  syncFile,
  handoffState: syncTransport.handoffState
};
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  ok: true,
  input: path.resolve(inputPath),
  output: path.resolve(outputPath),
  fileName: identity.fileName,
  annotationCount: Array.isArray(syncFile.state.annotations) ? syncFile.state.annotations.length : 0
}, null, 2));
