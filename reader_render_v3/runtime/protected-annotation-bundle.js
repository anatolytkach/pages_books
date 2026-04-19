import { createProtectedBookFingerprint } from "./protected-book-fingerprint.js";

const LEGACY_PROTECTED_BUNDLE_KIND = "protected-annotations-v2";
const PROTECTED_BUNDLE_KIND = "protected-reader-state-v3";
const PRODUCTION_SNAPSHOT_VERSION = 1;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function assessProtectedBundleAssessment(bundle, bookFingerprint) {
  if (!bundle) {
    return {
      status: "missing",
      allowed: false,
      warning: "No persisted bundle was found."
    };
  }
  if (!bookFingerprint || !bookFingerprint.bookId) {
    return {
      status: "book-identity-missing",
      allowed: true,
      warning: "Book fingerprint is unavailable; using bookId-only matching."
    };
  }
  if (String(bundle.bookId) !== String(bookFingerprint.bookId)) {
    return {
      status: "book-mismatch",
      allowed: false,
      warning: `Persisted bundle belongs to ${bundle.bookId}, expected ${bookFingerprint.bookId}.`
    };
  }
  if (!bundle.bookFingerprint || !bundle.bookFingerprint.fingerprint) {
    return {
      status: "legacy-upgraded",
      allowed: true,
      warning: "Persisted bundle predates fingerprinting and was upgraded in place."
    };
  }
  if (String(bundle.bookFingerprint.fingerprint) !== String(bookFingerprint.fingerprint)) {
    return {
      status: "fingerprint-mismatch",
      allowed: false,
      warning: "Persisted bundle fingerprint does not match the current protected artifact."
    };
  }
  return {
    status: "exact",
    allowed: true,
    warning: ""
  };
}

export const assessProtectedBundleCompatibility = assessProtectedBundleAssessment;

export function normalizeProtectedAnnotationBundle(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unsupported protected annotation bundle.");
  }
  if (parsed.kind === LEGACY_PROTECTED_BUNDLE_KIND) {
    return {
      kind: PROTECTED_BUNDLE_KIND,
      schemaVersion: 3,
      bookId: String(parsed.bookId || ""),
      userScope: String(parsed.userScope || "default"),
      bookFingerprint: null,
      artifactVersion: null,
      updatedAt: new Date().toISOString(),
      annotations: Array.isArray(parsed.annotations) ? cloneJson(parsed.annotations) : [],
      readingState: parsed.readingState ? cloneJson(parsed.readingState) : null,
      metadata: {
        migrationSource: LEGACY_PROTECTED_BUNDLE_KIND,
        ...(parsed.metadata && typeof parsed.metadata === "object" ? cloneJson(parsed.metadata) : {})
      }
    };
  }
  if (parsed.kind !== PROTECTED_BUNDLE_KIND) {
    throw new Error("Unsupported protected annotation bundle.");
  }
  return {
    kind: PROTECTED_BUNDLE_KIND,
    schemaVersion: 3,
    bookId: String(parsed.bookId || ""),
    userScope: String(parsed.userScope || "default"),
    bookFingerprint:
      parsed.bookFingerprint && typeof parsed.bookFingerprint === "object"
        ? cloneJson(parsed.bookFingerprint)
        : null,
    artifactVersion: parsed.artifactVersion ?? null,
    updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt).toISOString() : new Date().toISOString(),
    annotations: Array.isArray(parsed.annotations) ? cloneJson(parsed.annotations) : [],
    readingState: parsed.readingState ? cloneJson(parsed.readingState) : null,
    metadata: parsed.metadata && typeof parsed.metadata === "object" ? cloneJson(parsed.metadata) : {}
  };
}

export function createProtectedAnnotationBundle({
  bookId,
  userScope = "default",
  bookFingerprint = null,
  artifactVersion = null,
  annotations = [],
  readingState = null,
  metadata = {},
  updatedAt = new Date().toISOString()
}) {
  return normalizeProtectedAnnotationBundle({
    kind: PROTECTED_BUNDLE_KIND,
    schemaVersion: 3,
    bookId,
    userScope,
    bookFingerprint,
    artifactVersion,
    updatedAt,
    annotations,
    readingState,
    metadata
  });
}

export function serializeProtectedAnnotationBundle(bundle) {
  return JSON.stringify(normalizeProtectedAnnotationBundle(bundle), null, 2);
}

export function createProductionSnapshotPatch({
  bookId,
  readingState = null,
  bookmarks = [],
  notes = [],
  bookMeta = {}
}) {
  const now = Date.now();
  const id = String(bookId || "");
  if (!id) throw new Error("bookId is required.");
  return {
    version: PRODUCTION_SNAPSHOT_VERSION,
    updatedAt: now,
    books: {
      [id]: {
        id,
        title: String(bookMeta.title || `Book ${id}`),
        author: String(bookMeta.author || ""),
        cover: String(bookMeta.cover || ""),
        openedAt: readingState?.updatedAt || now,
        updatedAt: now
      }
    },
    positions: readingState?.cfi
      ? {
          [id]: {
            cfi: String(readingState.cfi),
            updatedAt: readingState.updatedAt || now
          }
        }
      : {},
    bookmarks: {
      [id]: Array.isArray(bookmarks) ? cloneJson(bookmarks) : []
    },
    notes: {
      [id]: Array.isArray(notes) ? cloneJson(notes) : []
    },
    preferences: {
      tts: {}
    }
  };
}

export function normalizeProductionSnapshotBundle(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const bundle = parsed && typeof parsed === "object" ? parsed : {};
  return {
    version: bundle.version || PRODUCTION_SNAPSHOT_VERSION,
    updatedAt: bundle.updatedAt || 0,
    books: bundle.books && typeof bundle.books === "object" ? cloneJson(bundle.books) : {},
    positions: bundle.positions && typeof bundle.positions === "object" ? cloneJson(bundle.positions) : {},
    bookmarks: bundle.bookmarks && typeof bundle.bookmarks === "object" ? cloneJson(bundle.bookmarks) : {},
    notes: bundle.notes && typeof bundle.notes === "object" ? cloneJson(bundle.notes) : {},
    preferences: bundle.preferences && typeof bundle.preferences === "object" ? cloneJson(bundle.preferences) : {}
  };
}

export {
  LEGACY_PROTECTED_BUNDLE_KIND,
  PROTECTED_BUNDLE_KIND,
  PRODUCTION_SNAPSHOT_VERSION
};
