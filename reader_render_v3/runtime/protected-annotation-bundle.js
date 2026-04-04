const PROTECTED_BUNDLE_KIND = "protected-annotations-v2";
const PRODUCTION_SNAPSHOT_VERSION = 1;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function normalizeProtectedAnnotationBundle(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || parsed.kind !== PROTECTED_BUNDLE_KIND) {
    throw new Error("Unsupported protected annotation bundle.");
  }
  return {
    kind: PROTECTED_BUNDLE_KIND,
    version: 2,
    bookId: String(parsed.bookId || ""),
    userScope: String(parsed.userScope || "default"),
    annotations: Array.isArray(parsed.annotations) ? cloneJson(parsed.annotations) : [],
    readingState: parsed.readingState ? cloneJson(parsed.readingState) : null,
    metadata: parsed.metadata && typeof parsed.metadata === "object" ? cloneJson(parsed.metadata) : {}
  };
}

export function createProtectedAnnotationBundle({
  bookId,
  userScope = "default",
  annotations = [],
  readingState = null,
  metadata = {}
}) {
  return normalizeProtectedAnnotationBundle({
    kind: PROTECTED_BUNDLE_KIND,
    version: 2,
    bookId,
    userScope,
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
  PROTECTED_BUNDLE_KIND,
  PRODUCTION_SNAPSHOT_VERSION
};
