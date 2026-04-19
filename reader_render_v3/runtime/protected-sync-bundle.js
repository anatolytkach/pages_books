import { assessProtectedBundleAssessment } from "./protected-annotation-bundle.js";
import { buildProtectedFileState, normalizeProtectedFileState } from "./protected-file-state.js";

export const PROTECTED_SYNC_FILE_KIND = "protected-sync-file-v1";
export const PROTECTED_SYNC_FILE_SCHEMA_VERSION = 1;
export const PROTECTED_SYNC_FILE_BUNDLE_VERSION = 1;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizeProductionAnchorMetadata(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: value.id ? String(value.id) : "",
    cfi: value.cfi ? String(value.cfi) : "",
    href: value.href ? String(value.href) : null
  };
}

function sanitizeSyncCapabilities(value) {
  if (!value || typeof value !== "object") return {};
  const production = value.production && typeof value.production === "object" ? value.production : {};
  return {
    production: {
      snapshotPatchAvailable: !!production.snapshotPatchAvailable,
      notesExportAvailable: !!production.notesExportAvailable,
      sharePayloadAvailable: !!production.sharePayloadAvailable
    }
  };
}

function sanitizeAnnotationForSyncFile(annotation) {
  if (!annotation || typeof annotation !== "object") return null;
  const metadata = annotation.metadata && typeof annotation.metadata === "object"
    ? cloneJson(annotation.metadata)
    : {};
  delete metadata.quote;
  delete metadata.contextBefore;
  delete metadata.contextAfter;
  if (metadata.productionAnchor) {
    metadata.productionAnchor = sanitizeProductionAnchorMetadata(metadata.productionAnchor);
  }
  delete metadata.productionCompat;
  const sanitized = {
    ...cloneJson(annotation),
    metadata
  };
  delete sanitized.quote;
  delete sanitized.contextBefore;
  delete sanitized.contextAfter;
  return sanitized;
}

function sanitizeAnnotationsForSyncFile(annotations = []) {
  return annotations.map(sanitizeAnnotationForSyncFile).filter(Boolean);
}

export function normalizeProtectedSyncBundle(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unsupported protected sync file.");
  }
  if (parsed.kind !== PROTECTED_SYNC_FILE_KIND) {
    throw new Error("Unsupported protected sync file.");
  }
  const schemaVersion = Number(parsed.schemaVersion || 0);
  if (schemaVersion !== PROTECTED_SYNC_FILE_SCHEMA_VERSION) {
    throw new Error(`Unsupported protected sync file schema version: ${schemaVersion}`);
  }
  return {
    kind: PROTECTED_SYNC_FILE_KIND,
    schemaVersion: PROTECTED_SYNC_FILE_SCHEMA_VERSION,
    bundleVersion: Number(parsed.bundleVersion || PROTECTED_SYNC_FILE_BUNDLE_VERSION),
    bookId: String(parsed.bookId || ""),
    userScope: String(parsed.userScope || "default"),
    bookFingerprint:
      parsed.bookFingerprint && typeof parsed.bookFingerprint === "object"
        ? cloneJson(parsed.bookFingerprint)
        : null,
    artifactVersion: parsed.artifactVersion ?? null,
    exportedAt: parsed.exportedAt ? new Date(parsed.exportedAt).toISOString() : new Date().toISOString(),
    state: buildProtectedFileState(parsed.state || {}),
    metadata: parsed.metadata && typeof parsed.metadata === "object" ? cloneJson(parsed.metadata) : {},
    syncCapabilities: sanitizeSyncCapabilities(parsed.syncCapabilities)
  };
}

export function createProtectedSyncBundle({
  bookId,
  userScope = "default",
  bookFingerprint = null,
  artifactVersion = null,
  readingState = null,
  annotations = [],
  metadata = {},
  syncCapabilities = {},
  exportedAt = new Date().toISOString()
} = {}) {
  return normalizeProtectedSyncBundle({
    kind: PROTECTED_SYNC_FILE_KIND,
    schemaVersion: PROTECTED_SYNC_FILE_SCHEMA_VERSION,
    bundleVersion: PROTECTED_SYNC_FILE_BUNDLE_VERSION,
    bookId,
    userScope,
    bookFingerprint,
    artifactVersion,
    exportedAt,
    state: buildProtectedFileState({
      readingState,
      annotations: sanitizeAnnotationsForSyncFile(annotations)
    }),
    metadata,
    syncCapabilities
  });
}

export function serializeProtectedSyncBundle(bundle) {
  return JSON.stringify(normalizeProtectedSyncBundle(bundle), null, 2);
}

export function convertProtectedBundleToSyncBundle(bundle, options = {}) {
  const parsedState = options.protectedBundleNormalizer
    ? options.protectedBundleNormalizer(bundle)
    : bundle;
  return createProtectedSyncBundle({
    bookId: parsedState.bookId,
    userScope: parsedState.userScope || "default",
    bookFingerprint: parsedState.bookFingerprint || null,
    artifactVersion: parsedState.artifactVersion ?? null,
    readingState: parsedState.readingState || null,
    annotations: parsedState.annotations || [],
    metadata: {
      sourceBundleKind: parsedState.kind || "protected-reader-state-v3",
      sourceSchemaVersion: parsedState.schemaVersion || 3,
      annotationCount: Array.isArray(parsedState.annotations) ? parsedState.annotations.length : 0,
      readingStateSaved: !!parsedState.readingState,
      ...(parsedState.metadata && typeof parsedState.metadata === "object" ? cloneJson(parsedState.metadata) : {}),
      ...(options.metadata && typeof options.metadata === "object" ? cloneJson(options.metadata) : {})
    },
    syncCapabilities: sanitizeSyncCapabilities(options.syncCapabilities)
  });
}

export function convertSyncBundleToProtectedState(syncBundle) {
  const parsed = normalizeProtectedSyncBundle(syncBundle);
  const fileState = normalizeProtectedFileState(parsed.state);
  return {
    kind: "protected-reader-state-v3",
    schemaVersion: 3,
    bookId: parsed.bookId,
    userScope: parsed.userScope,
    bookFingerprint: parsed.bookFingerprint,
    artifactVersion: parsed.artifactVersion,
    updatedAt: parsed.exportedAt,
    annotations: fileState.annotations,
    readingState: fileState.readingState,
    metadata: {
      importedFrom: parsed.kind,
      bundleVersion: parsed.bundleVersion,
      ...(parsed.metadata || {})
    }
  };
}

export function assessProtectedSyncFileAssessment(syncBundle, bookFingerprint) {
  let parsed = null;
  try {
    parsed = normalizeProtectedSyncBundle(syncBundle);
  } catch (error) {
    const message = error && error.message ? error.message : "Protected sync file is corrupt.";
    if (/schema version/i.test(message)) {
      return {
        status: "schema-unsupported",
        allowed: false,
        warning: message
      };
    }
    return {
      status: "corrupt",
      allowed: false,
      warning: message
    };
  }
  const bundleAssessment = assessProtectedBundleAssessment(
    {
      bookId: parsed.bookId,
      bookFingerprint: parsed.bookFingerprint
    },
    bookFingerprint
  );
  return bundleAssessment;
}

export const assessProtectedSyncFileCompatibility = assessProtectedSyncFileAssessment;
