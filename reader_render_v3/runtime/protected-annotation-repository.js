import { createAnnotationStore } from "./protected-annotation-store.js";
import {
  createProtectedAnnotationBundle,
  normalizeProtectedAnnotationBundle
} from "./protected-annotation-bundle.js";
import {
  exportProtectedAnnotationsToProductionNotes,
  exportProtectedBundleToProductionSnapshot,
  importProductionNotesToProtectedBundle
} from "./protected-annotation-compat.js";
import {
  buildProductionBookShareState,
  parseProductionShareState
} from "./protected-share-state.js";
import { importProductionPayloadToProtected } from "./protected-production-import.js";
import { exportProtectedAnnotationsToProduction } from "./protected-production-export.js";

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getDefaultLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch (error) {}
  return null;
}

function createLocalStoragePersistence({
  namespace = "reader_render_v3:annotations",
  bookId,
  userScope,
  storage = getDefaultLocalStorage()
} = {}) {
  if (!storage) return null;
  const key = `${namespace}:${bookId}:${userScope}`;

  return {
    load() {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    },
    save(payload) {
      try {
        storage.setItem(key, JSON.stringify(payload));
      } catch (error) {}
    },
    clear() {
      try {
        storage.removeItem(key);
      } catch (error) {}
    }
  };
}

export function createProtectedAnnotationRepository({
  bookId,
  userScope = "default",
  persistence = null
}) {
  const store = createAnnotationStore({ bookId });
  let readingState = null;
  const persistenceBackend =
    persistence && persistence.type === "localStorage"
      ? createLocalStoragePersistence({
          namespace: persistence.namespace,
          bookId,
          userScope,
          storage: persistence.storage
        })
      : null;

  function snapshotRepositoryState(requestUserScope = userScope) {
    return createProtectedAnnotationBundle({
      bookId,
      userScope: requestUserScope,
      annotations: store.all(),
      readingState,
      metadata: {
        source: persistenceBackend ? "local-storage-repository" : "in-memory-repository"
      }
    });
  }

  function persistRepositoryState(requestUserScope = userScope) {
    if (!persistenceBackend) return;
    persistenceBackend.save(snapshotRepositoryState(requestUserScope));
  }

  function hydrateRepositoryState() {
    if (!persistenceBackend) return;
    const stored = persistenceBackend.load();
    if (!stored) return;
    const parsed = normalizeProtectedAnnotationBundle(stored);
    if (String(parsed.bookId) !== String(bookId)) return;
    store.importAnnotations({
      kind: "protected-annotations-v1",
      bookId,
      annotations: parsed.annotations
    });
    readingState = parsed.readingState ? cloneJson(parsed.readingState) : null;
  }

  hydrateRepositoryState();

  return {
    bookId,
    userScope,
    store,
    async loadAnnotations(requestBookId = bookId, requestUserScope = userScope) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return snapshotRepositoryState(requestUserScope);
    },
    async saveAnnotation(annotation) {
      if (store.get(annotation.annotationId)) return annotation;
      const imported = store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: [...store.all(), annotation]
      }).find((item) => item.annotationId === annotation.annotationId);
      persistRepositoryState();
      return imported;
    },
    async updateAnnotation(annotationId, patch = {}) {
      const current = store.get(annotationId);
      if (!current) throw new Error(`Unknown annotation ${annotationId}.`);
      if (current.type === "note" && Object.prototype.hasOwnProperty.call(patch, "noteText")) {
        const note = store.updateNote(annotationId, patch.noteText);
        persistRepositoryState();
        return note;
      }
      const next = { ...current, ...cloneJson(patch), updatedAt: new Date().toISOString() };
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: store.all().map((item) => (item.annotationId === annotationId ? next : item))
      });
      persistRepositoryState();
      return store.get(annotationId);
    },
    async deleteAnnotation(annotationId) {
      const deleted = store.delete(annotationId);
      persistRepositoryState();
      return deleted;
    },
    async loadReadingState(requestBookId = bookId) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return readingState ? cloneJson(readingState) : null;
    },
    async saveReadingState(requestBookId = bookId, state) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      readingState = state ? cloneJson(state) : null;
      persistRepositoryState();
      return readingState;
    },
    async exportBundle(requestBookId = bookId, requestUserScope = userScope) {
      return this.loadAnnotations(requestBookId, requestUserScope);
    },
    async replaceAnnotations(annotations = [], options = {}) {
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: Array.isArray(annotations) ? annotations : []
      });
      if (!options.keepReadingState) readingState = null;
      persistRepositoryState();
      return store.all();
    },
    async importBundle(bundle, options = {}) {
      const parsed = normalizeProtectedAnnotationBundle(bundle);
      if (String(parsed.bookId) !== String(bookId)) {
        throw new Error(`Bundle belongs to ${parsed.bookId}, expected ${bookId}.`);
      }
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: parsed.annotations
      });
      if (!options.keepReadingState) readingState = parsed.readingState ? cloneJson(parsed.readingState) : null;
      persistRepositoryState();
      return store.all();
    },
    async buildShareState(requestBookId = bookId, requestUserScope = userScope, options = {}) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return buildProductionBookShareState({
        bookId: requestBookId,
        source: options.source || "",
        shareId: options.shareId || "",
        legacyNotesToken: options.legacyNotesToken || "",
        compressedNotesToken: options.compressedNotesToken || "",
        locationHash: options.locationHash || ""
      });
    },
    async loadShareState(payload) {
      return parseProductionShareState(payload);
    },
    async exportProductionNotes(options = {}) {
      return exportProtectedAnnotationsToProductionNotes({
        annotations: store.all(),
        resolveShareAnchor: options.resolveShareAnchor,
        resolveQuote: options.resolveQuote
      });
    },
    async exportProductionSnapshot(options = {}) {
      return exportProtectedBundleToProductionSnapshot({
        bookId,
        annotations: store.all(),
        readingState,
        resolveShareAnchor: options.resolveShareAnchor,
        resolveQuote: options.resolveQuote,
        bookMeta: options.bookMeta || {}
      });
    },
    async importProductionNotes(notes, options = {}) {
      const { bundle, unresolved } = await importProductionNotesToProtectedBundle({
        bookId,
        notes,
        resolveRangeFromProductionNote: options.resolveRangeFromProductionNote
      });
      await this.importBundle(bundle, { keepReadingState: true });
      return { annotations: store.all(), unresolved };
    },
    async importProductionPayload(payload, options = {}) {
      const result = await importProductionPayloadToProtected({
        book: options.book,
        payload
      });
      const nextReadingState =
        result.bundle.readingState != null
          ? result.bundle.readingState
          : options.preserveReadingStateIfMissing
            ? readingState
            : null;
      const bundleToImport = options.merge
        ? createProtectedAnnotationBundle({
            bookId,
            userScope,
            annotations: [...store.all(), ...(result.bundle.annotations || [])],
            readingState: nextReadingState || readingState,
            metadata: result.bundle.metadata || {}
          })
        : createProtectedAnnotationBundle({
            bookId,
            userScope,
            annotations: result.bundle.annotations || [],
            readingState: nextReadingState,
            metadata: result.bundle.metadata || {}
          });
      await this.importBundle(bundleToImport, {
        keepReadingState: false
      });
      return {
        annotations: store.all(),
        report: result.report,
        readingState
      };
    },
    async exportProductionPayload() {
      return exportProtectedAnnotationsToProduction({
        annotations: store.all(),
        bookId,
        readingState
      });
    },
    async clearPersistence() {
      if (!persistenceBackend) return;
      persistenceBackend.clear();
    },
    async persistNow() {
      persistRepositoryState();
    }
  };
}
