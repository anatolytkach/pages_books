import { normalizeProductionSnapshotBundle } from "./protected-annotation-bundle.js";
import {
  assessProtectedSyncFileCompatibility,
  convertProtectedBundleToSyncBundle,
  convertSyncBundleToProtectedState,
  createProtectedSyncBundle
} from "./protected-sync-bundle.js";

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function buildProtectedSyncFileFromBundle(bundle, options = {}) {
  return convertProtectedBundleToSyncBundle(bundle, options);
}

export function buildProductionSnapshotPatchFromProtectedState({
  protectedBundle,
  productionPayload,
  metadata = {}
}) {
  return {
    kind: "protected-production-snapshot-bridge-v1",
    bookId: String(protectedBundle.bookId || ""),
    exportedAt: new Date().toISOString(),
    protectedSyncBundle: createProtectedSyncBundle({
      bookId: protectedBundle.bookId,
      userScope: protectedBundle.userScope,
      bookFingerprint: protectedBundle.bookFingerprint,
      artifactVersion: protectedBundle.artifactVersion,
      readingState: protectedBundle.readingState,
      annotations: protectedBundle.annotations,
      metadata: {
        source: "protected-file-sync-bridge",
        ...(metadata || {})
      },
      compat: {
        productionSnapshotPatch: productionPayload && productionPayload.snapshotPatch ? cloneJson(productionPayload.snapshotPatch) : null,
        productionNotes: productionPayload && productionPayload.productionNotes ? cloneJson(productionPayload.productionNotes) : [],
        sharePayload: productionPayload && productionPayload.sharePayload ? cloneJson(productionPayload.sharePayload) : null
      }
    }),
    snapshotPatch: productionPayload && productionPayload.snapshotPatch ? cloneJson(productionPayload.snapshotPatch) : null
  };
}

export function convertProductionSnapshotFragmentToImportPayload(fragment) {
  const normalized = normalizeProductionSnapshotBundle(fragment);
  return {
    kind: "production-snapshot-fragment-v1",
    version: normalized.version,
    updatedAt: normalized.updatedAt,
    books: normalized.books,
    positions: normalized.positions,
    notes: normalized.notes,
    bookmarks: normalized.bookmarks,
    preferences: normalized.preferences
  };
}

export function assessSyncFileImport(syncBundle, bookFingerprint) {
  return assessProtectedSyncFileCompatibility(syncBundle, bookFingerprint);
}

export function convertProtectedSyncFileToProtectedBundle(syncBundle) {
  return convertSyncBundleToProtectedState(syncBundle);
}
