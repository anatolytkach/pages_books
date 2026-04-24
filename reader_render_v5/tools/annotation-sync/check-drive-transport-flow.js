#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { normalizeProtectedAnnotationBundle } from "../../runtime/protected-annotation-bundle.js";
import { createProtectedBookFingerprintFromArtifactParts } from "../../runtime/protected-book-fingerprint.js";
import { buildProtectedSyncFileFromBundle, convertProtectedSyncFileToProtectedBundle } from "../../runtime/protected-sync-conversion.js";
import { buildProtectedSyncTransport } from "../../runtime/protected-sync-transport.js";
import { createProtectedDriveTransport } from "../../runtime/protected-drive-transport.js";

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function createMockDriveFileApi() {
  let stored = null;
  return {
    async getAvailability() {
      return {
        configured: true,
        authorized: true
      };
    },
    async findFile(identity) {
      if (!stored || stored.identity.fileName !== identity.fileName) return null;
      return stored.remoteFile;
    },
    async createFile({ identity, serializedSyncFile, appProperties }) {
      stored = {
        identity,
        serializedSyncFile,
        remoteFile: {
          fileId: "mock-drive-file-1",
          name: identity.fileName,
          modifiedAt: new Date().toISOString(),
          size: Buffer.byteLength(serializedSyncFile, "utf8"),
          appProperties
        }
      };
      return stored.remoteFile;
    },
    async updateFile({ fileId, identity, serializedSyncFile, appProperties }) {
      stored = {
        identity,
        serializedSyncFile,
        remoteFile: {
          fileId: fileId || "mock-drive-file-1",
          name: identity.fileName,
          modifiedAt: new Date().toISOString(),
          size: Buffer.byteLength(serializedSyncFile, "utf8"),
          appProperties
        }
      };
      return stored.remoteFile;
    },
    async downloadFile(fileId) {
      if (!stored || stored.remoteFile.fileId !== fileId) {
        throw new Error("Mock Drive file is missing.");
      }
      return stored.serializedSyncFile;
    }
  };
}

const inputPath = getArg("--input");
const artifactRoot = getArg("--artifact");

if (!inputPath || !artifactRoot) {
  console.error("Usage: check-drive-transport-flow.js --input <protected-bundle.json> --artifact <protected-artifact-root>");
  process.exit(1);
}

const bundle = normalizeProtectedAnnotationBundle(readJson(inputPath));
const manifest = readJson(path.join(path.resolve(artifactRoot), "manifest.json"));
const toc = readJson(path.join(path.resolve(artifactRoot), manifest.tocPath));
const locations = readJson(path.join(path.resolve(artifactRoot), manifest.locationsPath));
const bookFingerprint = createProtectedBookFingerprintFromArtifactParts({
  manifest,
  tocItems: toc.items || [],
  locations
});
const syncFile = buildProtectedSyncFileFromBundle(bundle, {
  metadata: {
    source: "cli-check-drive-transport-flow"
  }
});
const syncTransport = buildProtectedSyncTransport({ syncFile });
const driveTransport = createProtectedDriveTransport({
  fileApi: createMockDriveFileApi()
});

const uploadResult = await driveTransport.uploadSyncFile({
  syncTransport,
  interactive: false,
  localUpdatedAt: bundle.updatedAt || null
});
const downloadResult = await driveTransport.downloadSyncFile({
  bookId: bundle.bookId,
  userScope: bundle.userScope || "default",
  bookFingerprint,
  localUpdatedAt: bundle.updatedAt || null,
  interactive: false
});
const roundtripBundle = convertProtectedSyncFileToProtectedBundle(downloadResult.syncFile);

console.log(JSON.stringify({
  ok: !!(downloadResult.syncAssessment && downloadResult.syncAssessment.allowed),
  input: path.resolve(inputPath),
  artifact: path.resolve(artifactRoot),
  uploadAction: uploadResult.action,
  remoteFileId: uploadResult.remoteFile.fileId,
  remoteFileName: uploadResult.remoteFile.name,
  downloadStatus: downloadResult.status,
  syncAssessment: downloadResult.syncAssessment,
  freshness: downloadResult.freshness,
  roundtripAnnotationCount: roundtripBundle.annotations.length,
  roundtripHasReadingState: !!roundtripBundle.readingState
}, null, 2));
