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

export function createProtectedAnnotationRepository({
  bookId,
  userScope = "default"
}) {
  const store = createAnnotationStore({ bookId });
  let readingState = null;

  return {
    bookId,
    userScope,
    store,
    async loadAnnotations(requestBookId = bookId, requestUserScope = userScope) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return createProtectedAnnotationBundle({
        bookId,
        userScope: requestUserScope,
        annotations: store.all(),
        readingState,
        metadata: {
          source: "in-memory-repository"
        }
      });
    },
    async saveAnnotation(annotation) {
      if (store.get(annotation.annotationId)) return annotation;
      return store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: [...store.all(), annotation]
      }).find((item) => item.annotationId === annotation.annotationId);
    },
    async updateAnnotation(annotationId, patch = {}) {
      const current = store.get(annotationId);
      if (!current) throw new Error(`Unknown annotation ${annotationId}.`);
      if (current.type === "note" && Object.prototype.hasOwnProperty.call(patch, "noteText")) {
        return store.updateNote(annotationId, patch.noteText);
      }
      const next = { ...current, ...cloneJson(patch), updatedAt: new Date().toISOString() };
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: store.all().map((item) => (item.annotationId === annotationId ? next : item))
      });
      return store.get(annotationId);
    },
    async deleteAnnotation(annotationId) {
      return store.delete(annotationId);
    },
    async loadReadingState(requestBookId = bookId) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return readingState ? cloneJson(readingState) : null;
    },
    async saveReadingState(requestBookId = bookId, state) {
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      readingState = state ? cloneJson(state) : null;
      return readingState;
    },
    async exportBundle(requestBookId = bookId, requestUserScope = userScope) {
      return this.loadAnnotations(requestBookId, requestUserScope);
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
      await this.importBundle(result.bundle, {
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
    }
  };
}
