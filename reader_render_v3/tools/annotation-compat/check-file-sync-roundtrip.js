#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedAnnotationBundle, createProtectedBookFingerprint } from "../../runtime/protected-annotation-bundle.js";
import { loadProtectedBook } from "../../runtime/protected-book-model.js";
import {
  assessSyncFileImport,
  buildProtectedSyncFileFromBundle,
  buildProductionSnapshotPatchFromProtectedState,
  convertProductionSnapshotFragmentToImportPayload,
  convertProtectedSyncFileToProtectedBundle
} from "../../runtime/protected-sync-compat.js";
import { exportProtectedAnnotationsToProduction } from "../../runtime/protected-production-export.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const inputPath = getArg("--input");
const artifactRoot = getArg("--artifact");

if (!inputPath || !artifactRoot) {
  console.error("Usage: check-file-sync-roundtrip.js --input <protected-bundle.json> --artifact <protected-artifact-root>");
  process.exit(1);
}

const bundle = normalizeProtectedAnnotationBundle(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")));
const book = await loadProtectedBook(path.resolve(artifactRoot));
const bookFingerprint = createProtectedBookFingerprint(book);
const syncFile = buildProtectedSyncFileFromBundle(bundle, {
  metadata: {
    source: "cli-check-file-sync-roundtrip"
  }
});
const compatibility = assessSyncFileImport(syncFile, bookFingerprint);
const roundtripBundle = convertProtectedSyncFileToProtectedBundle(syncFile);
const productionPayload = await exportProtectedAnnotationsToProduction({
  annotations: bundle.annotations,
  bookId: bundle.bookId,
  readingState: bundle.readingState
});
const bridge = buildProductionSnapshotPatchFromProtectedState({
  protectedBundle: bundle,
  productionPayload
});
const importedSnapshotPayload = convertProductionSnapshotFragmentToImportPayload(bridge.snapshotPatch);

console.log(JSON.stringify({
  ok: compatibility.compatible,
  input: path.resolve(inputPath),
  artifact: path.resolve(artifactRoot),
  syncFileKind: syncFile.kind,
  syncSchemaVersion: syncFile.schemaVersion,
  compatibility,
  annotationCount: syncFile.state.annotations.length,
  readingStateSaved: !!syncFile.state.readingState,
  roundtripAnnotationCount: roundtripBundle.annotations.length,
  roundtripHasReadingState: !!roundtripBundle.readingState,
  productionSnapshotNoteCount: Array.isArray(bridge.snapshotPatch.notes?.[bundle.bookId]) ? bridge.snapshotPatch.notes[bundle.bookId].length : 0,
  importedSnapshotPayloadKind: importedSnapshotPayload.kind
}, null, 2));
