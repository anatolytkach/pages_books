import { createAnnotationStore } from "./protected-annotation-store.js";
import { createProtectedAnnotationBundle, normalizeProtectedAnnotationBundle } from "./protected-annotation-bundle.js";
import { createProtectedPersistenceManager } from "./protected-persistence-manager.js";
import {
  exportProtectedAnnotationsToProductionNotes,
  exportProtectedBundleToProductionSnapshot,
  importProductionNotesToProtectedBundle
} from "./protected-production-notes.js";
import {
  buildProductionBookShareState,
  parseProductionShareState
} from "./protected-share-state.js";
import { importProductionPayloadToProtected } from "./protected-production-import.js";
import { exportProtectedAnnotationsToProduction } from "./protected-production-export.js";
import {
  assessSyncFileImport,
  buildProtectedSyncFileFromBundle,
  buildProductionSnapshotPatchFromProtectedState,
  convertProductionSnapshotFragmentToImportPayload,
  convertProtectedSyncFileToProtectedBundle
} from "./protected-sync-conversion.js";
import {
  assessProtectedSyncTransportImport,
  buildProtectedSyncTransport
} from "./protected-sync-transport.js";

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createProtectedAnnotationRepository({
  bookId,
  book = null,
  userScope = "default",
  persistence = null
}) {
  const store = createAnnotationStore({ bookId });
  const persistenceManager = createProtectedPersistenceManager({
    bookId,
    book,
    userScope,
    persistence
  });
  let readingState = null;

  function applyBundleToStore(bundle) {
    const parsed = normalizeProtectedAnnotationBundle(bundle);
    store.importAnnotations({
      kind: "protected-annotations-v1",
      bookId,
      annotations: parsed.annotations
    });
    readingState = parsed.readingState ? cloneJson(parsed.readingState) : null;
    return parsed;
  }

  async function snapshotRepositoryState(requestUserScope = userScope) {
    return createProtectedAnnotationBundle({
      bookId,
      userScope: requestUserScope,
      bookFingerprint: persistenceManager.bookFingerprint,
      artifactVersion: persistenceManager.bookFingerprint.artifactVersion,
      annotations: store.all(),
      readingState,
      metadata: {
        source: persistence ? "local-first-protected" : "in-memory-protected",
        persistenceDiagnostics: persistenceManager.getDiagnostics()
      }
    });
  }

  async function persistRepositoryState(requestUserScope = userScope) {
    const bundle = await snapshotRepositoryState(requestUserScope);
    await persistenceManager.saveBundle(bundle);
  }

  async function hydrateRepositoryState() {
    const result = await persistenceManager.loadPersistedBundle();
    if (!result.applied) return result;
    const currentAnnotations = store.all();
    if (currentAnnotations.length || readingState) {
      const parsed = normalizeProtectedAnnotationBundle(result.bundle);
      const mergedById = new Map();
      for (const annotation of parsed.annotations || []) {
        if (annotation && annotation.annotationId) mergedById.set(annotation.annotationId, annotation);
      }
      for (const annotation of currentAnnotations) {
        if (annotation && annotation.annotationId) mergedById.set(annotation.annotationId, annotation);
      }
      const mergedBundle = createProtectedAnnotationBundle({
        bookId,
        userScope,
        bookFingerprint: persistenceManager.bookFingerprint,
        artifactVersion: persistenceManager.bookFingerprint.artifactVersion,
        annotations: Array.from(mergedById.values()),
        readingState: readingState || parsed.readingState || null,
        metadata: {
          ...(parsed.metadata || {}),
          source: "local-first-protected",
          hydrationMergedWithInMemory: true
        }
      });
      applyBundleToStore(mergedBundle);
      return {
        ...result,
        bundle: mergedBundle,
        mergedWithInMemory: true
      };
    }
    applyBundleToStore(result.bundle);
    return result;
  }

  const hydrationPromise = hydrateRepositoryState();

  return {
    bookId,
    userScope,
    store,
    persistenceManager,
    async ensureHydrated() {
      await hydrationPromise;
    },
    getPersistenceDiagnostics() {
      return persistenceManager.getDiagnostics();
    },
    async loadAnnotations(requestBookId = bookId, requestUserScope = userScope) {
      await this.ensureHydrated();
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return snapshotRepositoryState(requestUserScope);
    },
    async saveAnnotation(annotation) {
      await this.ensureHydrated();
      if (store.get(annotation.annotationId)) return annotation;
      const imported = store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: [...store.all(), annotation]
      }).find((item) => item.annotationId === annotation.annotationId);
      await persistRepositoryState();
      return imported;
    },
    async updateAnnotation(annotationId, patch = {}) {
      await this.ensureHydrated();
      const current = store.get(annotationId);
      if (!current) throw new Error(`Unknown annotation ${annotationId}.`);
      if (current.type === "note" && Object.prototype.hasOwnProperty.call(patch, "noteText")) {
        const note = store.updateNote(annotationId, patch.noteText);
        await persistRepositoryState();
        return note;
      }
      const next = { ...current, ...cloneJson(patch), updatedAt: new Date().toISOString() };
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: store.all().map((item) => (item.annotationId === annotationId ? next : item))
      });
      await persistRepositoryState();
      return store.get(annotationId);
    },
    async deleteAnnotation(annotationId) {
      await this.ensureHydrated();
      const deleted = store.delete(annotationId);
      await persistRepositoryState();
      return deleted;
    },
    async loadReadingState(requestBookId = bookId) {
      await this.ensureHydrated();
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      return readingState ? cloneJson(readingState) : null;
    },
    async saveReadingState(requestBookId = bookId, state) {
      await this.ensureHydrated();
      if (String(requestBookId) !== String(bookId)) throw new Error(`Unknown book ${requestBookId}.`);
      readingState = state ? cloneJson(state) : null;
      await persistRepositoryState();
      return readingState;
    },
    async exportBundle(requestBookId = bookId, requestUserScope = userScope) {
      return this.loadAnnotations(requestBookId, requestUserScope);
    },
    async replaceAnnotations(annotations = [], options = {}) {
      await this.ensureHydrated();
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: Array.isArray(annotations) ? annotations : []
      });
      if (!options.keepReadingState) readingState = null;
      await persistRepositoryState();
      return store.all();
    },
    async importBundle(bundle, options = {}) {
      await this.ensureHydrated();
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
      await persistRepositoryState();
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
      await this.ensureHydrated();
      return exportProtectedAnnotationsToProductionNotes({
        annotations: store.all(),
        resolveShareAnchor: options.resolveShareAnchor,
        resolveQuote: options.resolveQuote
      });
    },
    async exportProductionSnapshot(options = {}) {
      await this.ensureHydrated();
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
      await this.ensureHydrated();
      const { bundle, unresolved } = await importProductionNotesToProtectedBundle({
        bookId,
        notes,
        resolveRangeFromProductionNote: options.resolveRangeFromProductionNote
      });
      await this.importBundle(bundle, { keepReadingState: true });
      return { annotations: store.all(), unresolved };
    },
    async importProductionPayload(payload, options = {}) {
      await this.ensureHydrated();
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
            bookFingerprint: persistenceManager.bookFingerprint,
            artifactVersion: persistenceManager.bookFingerprint.artifactVersion,
            annotations: [...store.all(), ...(result.bundle.annotations || [])],
            readingState: nextReadingState || readingState,
            metadata: result.bundle.metadata || {}
          })
        : createProtectedAnnotationBundle({
            bookId,
            userScope,
            bookFingerprint: persistenceManager.bookFingerprint,
            artifactVersion: persistenceManager.bookFingerprint.artifactVersion,
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
      await this.ensureHydrated();
      return exportProtectedAnnotationsToProduction({
        annotations: store.all(),
        bookId,
        readingState
      });
    },
    async exportSyncFile(requestBookId = bookId, requestUserScope = userScope) {
      const bundle = await this.loadAnnotations(requestBookId, requestUserScope);
      return buildProtectedSyncFileFromBundle(bundle, {
        metadata: {
          transport: "file-sync",
          annotationCount: store.all().length,
          readingStateSaved: !!readingState
        },
        syncCapabilities: {
          production: {
            snapshotPatchAvailable: true,
            notesExportAvailable: true,
            sharePayloadAvailable: true
          }
        }
      });
    },
    async exportSyncTransport(requestBookId = bookId, requestUserScope = userScope, options = {}) {
      const syncFile = await this.exportSyncFile(requestBookId, requestUserScope);
      return buildProtectedSyncTransport({
        syncFile,
        fileName: options.fileName,
        handoffMetadata: {
          source: "integrated-protected-reader",
          userScope: requestUserScope
        }
      });
    },
    async assessSyncTransport(syncFile, handoffState = null) {
      await this.ensureHydrated();
      return assessProtectedSyncTransportImport({
        syncFile,
        handoffState,
        bookFingerprint: persistenceManager.bookFingerprint
      });
    },
    async importSyncFile(syncFile, options = {}) {
      await this.ensureHydrated();
      const syncAssessment = assessSyncFileImport(syncFile, persistenceManager.bookFingerprint);
      if (!syncAssessment.allowed) {
        const error = new Error(syncAssessment.warning || "Protected sync file cannot be applied.");
        error.syncAssessment = syncAssessment;
        throw error;
      }
      const protectedBundle = convertProtectedSyncFileToProtectedBundle(syncFile);
      await this.importBundle(protectedBundle, options);
      return {
        annotations: store.all(),
        readingState,
        syncAssessment
      };
    },
    async exportProductionSnapshotPatch() {
      await this.ensureHydrated();
      const protectedBundle = await snapshotRepositoryState(userScope);
      const productionPayload = await this.exportProductionPayload();
      return buildProductionSnapshotPatchFromProtectedState({
        protectedBundle,
        productionPayload,
        metadata: {
          source: "integrated-protected-reader"
        }
      });
    },
    async importProductionSnapshotFragment(fragment, options = {}) {
      await this.ensureHydrated();
      const payload = convertProductionSnapshotFragmentToImportPayload(fragment);
      const result = await this.importProductionPayload(payload, options);
      return {
        ...result,
        importedKind: payload.kind
      };
    },
    async clearPersistence() {
      await this.ensureHydrated();
      await persistenceManager.clear();
      store.importAnnotations({
        kind: "protected-annotations-v1",
        bookId,
        annotations: []
      });
      readingState = null;
    },
    async persistNow() {
      await this.ensureHydrated();
      await persistRepositoryState();
    }
  };
}
