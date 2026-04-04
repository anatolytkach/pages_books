import {
  normalizeProtectedSyncBundle,
  PROTECTED_SYNC_FILE_KIND
} from "./protected-sync-bundle.js";

export const PROTECTED_HANDOFF_STATE_KIND = "protected-sync-handoff-v1";
export const PROTECTED_HANDOFF_STATE_VERSION = 1;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableHash(input) {
  const value = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function summarizeReadingState(readingState) {
  if (!readingState || typeof readingState !== "object") return null;
  return {
    pageIndex:
      readingState.page && Number.isFinite(readingState.page.pageIndex)
        ? readingState.page.pageIndex
        : null,
    pageCount:
      readingState.page && Number.isFinite(readingState.page.pageCount)
        ? readingState.page.pageCount
        : null,
    chunkId:
      readingState.globalPosition && readingState.globalPosition.chunkId
        ? String(readingState.globalPosition.chunkId)
        : null,
    globalOffset:
      readingState.globalPosition && Number.isFinite(readingState.globalPosition.globalOffset)
        ? readingState.globalPosition.globalOffset
        : null,
    locationId:
      readingState.globalPosition && readingState.globalPosition.locationId
        ? String(readingState.globalPosition.locationId)
        : null,
    updatedAt: readingState.updatedAt || null
  };
}

export function normalizeProtectedHandoffState(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unsupported protected handoff state.");
  }
  if (parsed.kind !== PROTECTED_HANDOFF_STATE_KIND) {
    throw new Error("Unsupported protected handoff state.");
  }
  const version = Number(parsed.version || 0);
  if (version !== PROTECTED_HANDOFF_STATE_VERSION) {
    throw new Error(`Unsupported protected handoff state version: ${version}`);
  }
  return {
    kind: PROTECTED_HANDOFF_STATE_KIND,
    version: PROTECTED_HANDOFF_STATE_VERSION,
    syncFileKind: String(parsed.syncFileKind || PROTECTED_SYNC_FILE_KIND),
    syncSchemaVersion: Number(parsed.syncSchemaVersion || 1),
    bookId: String(parsed.bookId || ""),
    userScope: String(parsed.userScope || "default"),
    bookFingerprint:
      parsed.bookFingerprint && typeof parsed.bookFingerprint === "object"
        ? cloneJson(parsed.bookFingerprint)
        : null,
    artifactVersion: parsed.artifactVersion ?? null,
    exportedAt: parsed.exportedAt ? new Date(parsed.exportedAt).toISOString() : new Date().toISOString(),
    fileName: parsed.fileName ? String(parsed.fileName) : "",
    fileSize: Number(parsed.fileSize || 0),
    fileHash: parsed.fileHash ? String(parsed.fileHash) : "",
    readingStateSummary:
      parsed.readingStateSummary && typeof parsed.readingStateSummary === "object"
        ? cloneJson(parsed.readingStateSummary)
        : null,
    annotationCount: Number(parsed.annotationCount || 0),
    metadata: parsed.metadata && typeof parsed.metadata === "object" ? cloneJson(parsed.metadata) : {}
  };
}

export function buildProtectedHandoffState({
  syncFile,
  fileName = "",
  fileSize = 0,
  metadata = {}
} = {}) {
  const parsedSyncFile = normalizeProtectedSyncBundle(syncFile);
  const readingStateSummary = summarizeReadingState(parsedSyncFile.state.readingState);
  const effectiveFileName =
    fileName ||
    `protected-sync-${parsedSyncFile.bookId || "book"}-${String(parsedSyncFile.exportedAt || "")
      .replace(/[:.]/g, "-")
      .replace(/\s+/g, "_")}.json`;
  const effectiveFileSize = Number(fileSize || 0);
  return normalizeProtectedHandoffState({
    kind: PROTECTED_HANDOFF_STATE_KIND,
    version: PROTECTED_HANDOFF_STATE_VERSION,
    syncFileKind: parsedSyncFile.kind,
    syncSchemaVersion: parsedSyncFile.schemaVersion,
    bookId: parsedSyncFile.bookId,
    userScope: parsedSyncFile.userScope,
    bookFingerprint: parsedSyncFile.bookFingerprint,
    artifactVersion: parsedSyncFile.artifactVersion,
    exportedAt: parsedSyncFile.exportedAt,
    fileName: effectiveFileName,
    fileSize: effectiveFileSize,
    fileHash: stableHash(
      JSON.stringify({
        bookId: parsedSyncFile.bookId,
        fingerprint: parsedSyncFile.bookFingerprint && parsedSyncFile.bookFingerprint.fingerprint,
        exportedAt: parsedSyncFile.exportedAt,
        annotationCount: Array.isArray(parsedSyncFile.state.annotations) ? parsedSyncFile.state.annotations.length : 0,
        readingStateSummary
      })
    ),
    readingStateSummary,
    annotationCount: Array.isArray(parsedSyncFile.state.annotations) ? parsedSyncFile.state.annotations.length : 0,
    metadata: {
      transport: "file-handoff",
      syncBundleVersion: parsedSyncFile.bundleVersion,
      ...cloneJson(metadata)
    }
  });
}

export function serializeProtectedHandoffState(handoffState) {
  return JSON.stringify(normalizeProtectedHandoffState(handoffState), null, 2);
}

export function assessProtectedHandoffState(handoffState, bookFingerprint) {
  let parsed = null;
  try {
    parsed = normalizeProtectedHandoffState(handoffState);
  } catch (error) {
    return {
      status: "corrupt",
      compatible: false,
      warning: error && error.message ? error.message : "Protected handoff state is corrupt."
    };
  }
  if (!bookFingerprint || !bookFingerprint.bookId) {
    return {
      status: "book-identity-missing",
      compatible: true,
      warning: "Book fingerprint is unavailable; handoff state was checked by bookId only."
    };
  }
  if (String(parsed.bookId) !== String(bookFingerprint.bookId)) {
    return {
      status: "wrong-book",
      compatible: false,
      warning: `Handoff state belongs to ${parsed.bookId}, expected ${bookFingerprint.bookId}.`
    };
  }
  if (
    parsed.bookFingerprint &&
    parsed.bookFingerprint.fingerprint &&
    String(parsed.bookFingerprint.fingerprint) !== String(bookFingerprint.fingerprint)
  ) {
    return {
      status: "fingerprint-mismatch",
      compatible: false,
      warning: "Handoff state fingerprint does not match the current protected artifact."
    };
  }
  return {
    status: "exact",
    compatible: true,
    warning: ""
  };
}
