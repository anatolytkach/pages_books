#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  createProtectedAnnotationBundle,
  serializeProtectedAnnotationBundle
} from "../../runtime/protected-annotation-bundle.js";
import { createProtectedBookFingerprintFromArtifactParts } from "../../runtime/protected-book-fingerprint.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const artifactRoot = getArg("--artifact");
const outputPath = getArg("--output");
const mode = String(getArg("--mode") || "valid").trim().toLowerCase();

if (!artifactRoot || !outputPath) {
  console.error("Usage: make-sync-fixture.js --artifact <protected-artifact-root> --output <protected-bundle.json> [--mode valid|mismatch|corrupt]");
  process.exit(1);
}

const root = path.resolve(artifactRoot);
if (mode === "corrupt") {
  fs.writeFileSync(path.resolve(outputPath), "{\"kind\":\"broken\"");
  console.log(JSON.stringify({
    ok: true,
    mode,
    output: path.resolve(outputPath)
  }, null, 2));
  process.exit(0);
}

const manifest = readJson(path.join(root, "manifest.json"));
const toc = readJson(path.join(root, manifest.tocPath));
const locations = readJson(path.join(root, manifest.locationsPath));
const fingerprint = createProtectedBookFingerprintFromArtifactParts({
  manifest,
  tocItems: toc.items || [],
  locations
});

const effectiveFingerprint = mode === "mismatch"
  ? {
      ...fingerprint,
      fingerprint: `${String(fingerprint.fingerprint || "00000000").slice(0, 7)}x`
    }
  : fingerprint;

const bookId = String(
  (manifest.source && manifest.source.bookId) ||
  (manifest.metadata && manifest.metadata.identifier) ||
  ""
);

const bundle = createProtectedAnnotationBundle({
  bookId,
  userScope: "default",
  bookFingerprint: effectiveFingerprint,
  artifactVersion: manifest.version || null,
  annotations: [
    {
      annotationId: "hl_fixture",
      type: "highlight",
      bookId,
      rangeDescriptor: {
        start: { chunkId: "chunk-000001", localOffset: 10, globalOffset: 10 },
        end: { chunkId: "chunk-000001", localOffset: 20, globalOffset: 20 }
      },
      color: "yellow",
      createdAt: "2026-04-04T12:00:00.000Z",
      updatedAt: "2026-04-04T12:00:00.000Z",
      metadata: {}
    },
    {
      annotationId: "note_fixture",
      type: "note",
      bookId,
      rangeDescriptor: {
        start: { chunkId: "chunk-000001", localOffset: 10, globalOffset: 10 },
        end: { chunkId: "chunk-000001", localOffset: 20, globalOffset: 20 }
      },
      noteText: "fixture note",
      color: "blue",
      createdAt: "2026-04-04T12:00:00.000Z",
      updatedAt: "2026-04-04T12:00:00.000Z",
      metadata: {}
    }
  ],
  readingState: {
    restoreToken: `${bookId}|chunk-000001|0|2|10`,
    globalPosition: {
      chunkId: "chunk-000001",
      globalOffset: 10,
      locationId: "loc-000001"
    },
    page: {
      pageIndex: 0,
      pageCount: 2
    },
    updatedAt: 1712232000000
  },
  metadata: {
    source: `fixture:${mode}`
  },
  updatedAt: "2026-04-04T12:00:00.000Z"
});

fs.writeFileSync(path.resolve(outputPath), serializeProtectedAnnotationBundle(bundle));
console.log(JSON.stringify({
  ok: true,
  mode,
  output: path.resolve(outputPath),
  bookId,
  fingerprint: effectiveFingerprint.fingerprint,
  expectedFingerprint: fingerprint.fingerprint
}, null, 2));
