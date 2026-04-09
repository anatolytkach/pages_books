import {
  assessProtectedBundleCompatibility,
  createProtectedAnnotationBundle,
  normalizeProtectedAnnotationBundle
} from "./protected-annotation-bundle.js";
import { createProtectedBookFingerprint } from "./protected-book-fingerprint.js";
import { createProtectedLocalStore } from "./protected-local-store.js";
import { extractAnnotationsFromBundle, normalizePersistedAnnotations } from "./protected-annotation-persistence.js";
import { extractReadingStateFromBundle, normalizePersistedReadingState } from "./protected-reading-state-store.js";

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createEmptyDiagnostics({
  storageBackend = "memory",
  schemaVersion = 3,
  bookFingerprint = null
} = {}) {
  return {
    storageBackend,
    schemaVersion,
    compatibilityStatus: "none",
    compatibilityWarning: "",
    readingStateSaved: false,
    annotationCount: 0,
    lastSavedAt: null,
    bookFingerprint: bookFingerprint && bookFingerprint.fingerprint ? bookFingerprint.fingerprint : "n/a"
  };
}

export function createProtectedPersistenceManager({
  bookId,
  book = null,
  userScope = "default",
  persistence = null
}) {
  const bookFingerprint = createProtectedBookFingerprint(book);
  const localStore =
    persistence && persistence.type === "localStorage"
      ? createProtectedLocalStore({
          namespace: persistence.namespace || "reader_render_v3:persistence",
          storage: persistence.storage
        })
      : null;
  const persistenceKey = `${bookId}:${userScope}:bundle`;
  let currentBundle = createProtectedAnnotationBundle({
    bookId,
    userScope,
    bookFingerprint,
    artifactVersion: bookFingerprint.artifactVersion,
    annotations: [],
    readingState: null,
    metadata: {
      source: localStore ? "local-first-protected" : "memory-only-protected"
    }
  });
  let diagnostics = createEmptyDiagnostics({
    storageBackend: localStore ? localStore.type : "memory",
    bookFingerprint
  });

  function rebuildBundle({ annotations = extractAnnotationsFromBundle(currentBundle), readingState = extractReadingStateFromBundle(currentBundle), metadata = currentBundle.metadata || {} } = {}) {
    currentBundle = createProtectedAnnotationBundle({
      bookId,
      userScope,
      bookFingerprint,
      artifactVersion: bookFingerprint.artifactVersion,
      annotations: normalizePersistedAnnotations(annotations),
      readingState: normalizePersistedReadingState(readingState),
      updatedAt: new Date().toISOString(),
      metadata: {
        ...cloneJson(metadata),
        source: localStore ? "local-first-protected" : "memory-only-protected"
      }
    });
    diagnostics = {
      ...diagnostics,
      schemaVersion: currentBundle.schemaVersion,
      annotationCount: currentBundle.annotations.length,
      readingStateSaved: !!currentBundle.readingState,
      lastSavedAt: currentBundle.updatedAt,
      bookFingerprint: currentBundle.bookFingerprint && currentBundle.bookFingerprint.fingerprint
        ? currentBundle.bookFingerprint.fingerprint
        : "n/a"
    };
    return currentBundle;
  }

  async function persistBundle() {
    if (!localStore || !localStore.available) return false;
    const ok = await localStore.setJson(persistenceKey, currentBundle);
    diagnostics = {
      ...diagnostics,
      storageBackend: localStore.type,
      lastSavedAt: currentBundle.updatedAt
    };
    return ok;
  }

  return {
    bookId,
    userScope,
    bookFingerprint,
    getDiagnostics() {
      return cloneJson(diagnostics);
    },
    getCurrentBundle() {
      return normalizeProtectedAnnotationBundle(currentBundle);
    },
    async loadPersistedBundle() {
      if (!localStore || !localStore.available) {
        diagnostics = {
          ...diagnostics,
          compatibilityStatus: "memory-only",
          compatibilityWarning: "Persistence backend is unavailable; using in-memory state only."
        };
        return {
          applied: false,
          bundle: this.getCurrentBundle(),
          diagnostics: this.getDiagnostics()
        };
      }
      let stored = null;
      try {
        stored = await localStore.getJson(persistenceKey);
      } catch (error) {
        diagnostics = {
          ...diagnostics,
          compatibilityStatus: "corrupt",
          compatibilityWarning: "Persisted protected state could not be read."
        };
        return {
          applied: false,
          bundle: this.getCurrentBundle(),
          diagnostics: this.getDiagnostics()
        };
      }
      if (!stored) {
        diagnostics = {
          ...diagnostics,
          compatibilityStatus: "none",
          compatibilityWarning: ""
        };
        return {
          applied: false,
          bundle: this.getCurrentBundle(),
          diagnostics: this.getDiagnostics()
        };
      }
      let parsed = null;
      try {
        parsed = normalizeProtectedAnnotationBundle(stored);
      } catch (error) {
        diagnostics = {
          ...diagnostics,
          compatibilityStatus: "corrupt",
          compatibilityWarning: error && error.message ? error.message : "Persisted protected bundle is corrupt."
        };
        return {
          applied: false,
          bundle: this.getCurrentBundle(),
          diagnostics: this.getDiagnostics()
        };
      }
      const compatibility = assessProtectedBundleCompatibility(parsed, bookFingerprint);
      diagnostics = {
        ...diagnostics,
        compatibilityStatus: compatibility.status,
        compatibilityWarning: compatibility.warning || "",
        annotationCount: Array.isArray(parsed.annotations) ? parsed.annotations.length : 0,
        readingStateSaved: !!parsed.readingState,
        lastSavedAt: parsed.updatedAt || null
      };
      if (!compatibility.compatible) {
        return {
          applied: false,
          bundle: this.getCurrentBundle(),
          diagnostics: this.getDiagnostics()
        };
      }
      currentBundle = createProtectedAnnotationBundle({
        bookId,
        userScope,
        bookFingerprint,
        artifactVersion: bookFingerprint.artifactVersion,
        annotations: parsed.annotations,
        readingState: parsed.readingState,
        metadata: {
          ...cloneJson(parsed.metadata || {}),
          compatibilityStatus: compatibility.status
        },
        updatedAt: parsed.updatedAt || new Date().toISOString()
      });
      if (compatibility.status === "legacy-upgraded") {
        await persistBundle();
      }
      return {
        applied: true,
        bundle: this.getCurrentBundle(),
        diagnostics: this.getDiagnostics()
      };
    },
    async saveAnnotations(annotations, metadata = currentBundle.metadata || {}) {
      rebuildBundle({
        annotations,
        readingState: extractReadingStateFromBundle(currentBundle),
        metadata
      });
      await persistBundle();
      return this.getCurrentBundle();
    },
    async saveReadingState(readingState, metadata = currentBundle.metadata || {}) {
      rebuildBundle({
        annotations: extractAnnotationsFromBundle(currentBundle),
        readingState,
        metadata
      });
      await persistBundle();
      return this.getCurrentBundle();
    },
    async saveBundle(bundle) {
      const parsed = normalizeProtectedAnnotationBundle(bundle);
      const compatibility = assessProtectedBundleCompatibility(parsed, bookFingerprint);
      diagnostics = {
        ...diagnostics,
        compatibilityStatus: compatibility.status,
        compatibilityWarning: compatibility.warning || ""
      };
      if (!compatibility.compatible) {
        throw new Error(compatibility.warning || "Protected bundle is incompatible with the current book.");
      }
      currentBundle = createProtectedAnnotationBundle({
        bookId,
        userScope,
        bookFingerprint,
        artifactVersion: bookFingerprint.artifactVersion,
        annotations: parsed.annotations,
        readingState: parsed.readingState,
        metadata: parsed.metadata || {},
        updatedAt: parsed.updatedAt || new Date().toISOString()
      });
      await persistBundle();
      return this.getCurrentBundle();
    },
    async clear() {
      currentBundle = createProtectedAnnotationBundle({
        bookId,
        userScope,
        bookFingerprint,
        artifactVersion: bookFingerprint.artifactVersion,
        annotations: [],
        readingState: null,
        metadata: {
          source: localStore ? "local-first-protected" : "memory-only-protected"
        }
      });
      diagnostics = {
        ...createEmptyDiagnostics({
          storageBackend: localStore ? localStore.type : "memory",
          bookFingerprint
        }),
        compatibilityStatus: "cleared"
      };
      if (localStore && localStore.available) {
        await localStore.remove(persistenceKey);
      }
      return this.getCurrentBundle();
    }
  };
}
