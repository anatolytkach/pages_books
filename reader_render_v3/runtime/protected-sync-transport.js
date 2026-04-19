import {
  assessProtectedSyncFileAssessment,
  normalizeProtectedSyncBundle,
  serializeProtectedSyncBundle
} from "./protected-sync-bundle.js";
import {
  assessProtectedHandoffState,
  buildProtectedHandoffState,
  normalizeProtectedHandoffState,
  serializeProtectedHandoffState
} from "./protected-handoff-state.js";

export const PROTECTED_SYNC_TRANSPORT_KIND = "protected-sync-transport-v1";
export const PROTECTED_SYNC_TRANSPORT_VERSION = 1;

function encodeUtf8(value) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  return Buffer.from(value, "utf8");
}

function defaultFileName(bookId, exportedAt) {
  const stamp = String(exportedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  return `protected-sync-${bookId || "book"}-${stamp}.json`;
}

export function buildProtectedSyncTransport({
  syncFile,
  fileName = "",
  handoffMetadata = {}
} = {}) {
  const parsedSyncFile = normalizeProtectedSyncBundle(syncFile);
  const serializedSyncFile = serializeProtectedSyncBundle(parsedSyncFile);
  const effectiveFileName = fileName || defaultFileName(parsedSyncFile.bookId, parsedSyncFile.exportedAt);
  const fileSize = encodeUtf8(serializedSyncFile).byteLength;
  const handoffState = buildProtectedHandoffState({
    syncFile: parsedSyncFile,
    fileName: effectiveFileName,
    fileSize,
    metadata: handoffMetadata
  });
  return {
    kind: PROTECTED_SYNC_TRANSPORT_KIND,
    version: PROTECTED_SYNC_TRANSPORT_VERSION,
    fileName: effectiveFileName,
    mimeType: "application/json",
    fileSize,
    syncFile: parsedSyncFile,
    serializedSyncFile,
    handoffState,
    serializedHandoffState: serializeProtectedHandoffState(handoffState)
  };
}

export function assessProtectedSyncTransportImport({
  syncFile,
  handoffState = null,
  bookFingerprint = null
} = {}) {
  const syncAssessment = assessProtectedSyncFileAssessment(syncFile, bookFingerprint);
  if (!syncAssessment.allowed) return syncAssessment;
  if (!handoffState) return syncAssessment;
  const handoffAssessment = assessProtectedHandoffState(handoffState, bookFingerprint);
  if (!handoffAssessment.allowed) return handoffAssessment;
  return {
    status: syncAssessment.status === "exact" ? handoffAssessment.status : syncAssessment.status,
    allowed: true,
    warning: syncAssessment.warning || handoffAssessment.warning || ""
  };
}

export function normalizeProtectedSyncTransportHandoff(payload) {
  return normalizeProtectedHandoffState(payload);
}
