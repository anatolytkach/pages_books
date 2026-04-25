import { normalizeProtectedSyncBundle } from "./protected-sync-bundle.js";
import { buildProtectedHandoffState } from "./protected-handoff-state.js";

export const PROTECTED_DRIVE_FILE_SCHEMA_VERSION = 1;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function coerceIsoDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch (error) {
    return "";
  }
}

export function buildProtectedDriveFileName({ bookId, userScope = "default" } = {}) {
  const safeBookId = String(bookId || "").trim() || "book";
  const safeUserScope = String(userScope || "default").trim() || "default";
  return `readerpub-protected-sync-v1-${safeBookId}-${safeUserScope}.json`;
}

export function buildProtectedDriveFileIdentity({ bookId, userScope = "default" } = {}) {
  return {
    kind: "protected-sync-file-v1",
    schemaVersion: PROTECTED_DRIVE_FILE_SCHEMA_VERSION,
    bookId: String(bookId || ""),
    userScope: String(userScope || "default"),
    fileName: buildProtectedDriveFileName({ bookId, userScope })
  };
}

export function buildProtectedDriveAppProperties(syncFile) {
  const parsed = normalizeProtectedSyncBundle(syncFile);
  return {
    readerpubKind: parsed.kind,
    readerpubSchemaVersion: String(parsed.schemaVersion || 1),
    readerpubBookId: String(parsed.bookId || ""),
    readerpubUserScope: String(parsed.userScope || "default"),
    readerpubFingerprint:
      parsed.bookFingerprint && parsed.bookFingerprint.fingerprint
        ? String(parsed.bookFingerprint.fingerprint)
        : "",
    readerpubArtifactVersion: parsed.artifactVersion == null ? "" : String(parsed.artifactVersion),
    readerpubExportedAt: coerceIsoDate(parsed.exportedAt)
  };
}

export function normalizeProtectedDriveRemoteFile(file = {}) {
  const appProperties =
    file && file.appProperties && typeof file.appProperties === "object"
      ? cloneJson(file.appProperties)
      : {};
  return {
    fileId: file && file.id ? String(file.id) : "",
    name: file && file.name ? String(file.name) : "",
    modifiedAt: coerceIsoDate(file && file.modifiedTime),
    size: Number(file && file.size ? file.size : 0),
    appProperties
  };
}

export function summarizeProtectedDriveRemoteFile(file = {}) {
  const normalized = normalizeProtectedDriveRemoteFile(file);
  return {
    present: !!normalized.fileId,
    fileId: normalized.fileId,
    fileName: normalized.name || "none",
    modifiedAt: normalized.modifiedAt || "",
    size: normalized.size,
    fingerprint: normalized.appProperties.readerpubFingerprint || ""
  };
}

export function buildProtectedDriveHandoffState(syncFile, remoteFile) {
  const normalizedRemote = normalizeProtectedDriveRemoteFile(remoteFile);
  return buildProtectedHandoffState({
    syncFile,
    fileName: normalizedRemote.name || buildProtectedDriveFileName(syncFile),
    fileSize: normalizedRemote.size || 0,
    metadata: {
      transport: "google-drive",
      remoteFileId: normalizedRemote.fileId || "",
      remoteModifiedAt: normalizedRemote.modifiedAt || ""
    }
  });
}

export function compareProtectedDriveFreshness({
  localUpdatedAt = null,
  remoteModifiedAt = null
} = {}) {
  const localTs = localUpdatedAt ? Date.parse(localUpdatedAt) : NaN;
  const remoteTs = remoteModifiedAt ? Date.parse(remoteModifiedAt) : NaN;
  if (!Number.isFinite(localTs) && !Number.isFinite(remoteTs)) return "unknown";
  if (!Number.isFinite(remoteTs)) return "local-only";
  if (!Number.isFinite(localTs)) return "remote-only";
  if (Math.abs(localTs - remoteTs) < 1000) return "same";
  return localTs > remoteTs ? "local-newer" : "remote-newer";
}
