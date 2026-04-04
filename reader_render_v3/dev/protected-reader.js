import { createProtectedAnnotationRepository } from "../runtime/protected-annotation-repository.js";
import { serializeRangeDescriptor } from "../runtime/protected-range-serialization.js";
import { renderChunkToCanvas } from "../runtime/protected-canvas-renderer.js";
import { createProtectedWorkerClient } from "../runtime/protected-worker-client.js";
import { loadProtectedBook } from "../runtime/protected-book-model.js";
import { parseRestoreToken } from "../runtime/protected-global-location.js";
import { resolveProductionPayloadFromRoute } from "../integration/protected-reader-routing.js";
import {
  buildProtectedSyncTransport,
  normalizeProtectedSyncTransportHandoff
} from "../runtime/protected-sync-transport.js";
import { downloadJsonFile, readTextFile } from "../runtime/protected-file-transfer.js";

const entryConfig = window.__PROTECTED_READER_ENTRY__ || null;
const DEFAULT_ARTIFACT =
  (entryConfig && entryConfig.artifactRoot) ||
  "../artifacts/protected-books/19686";

function shouldForceWorkerUnavailable() {
  if (entryConfig && entryConfig.forceWorkerUnavailable) return true;
  const params = new URLSearchParams(window.location.search);
  const value = String(params.get("worker") || params.get("protectedWorker") || "")
    .trim()
    .toLowerCase();
  return ["disabled", "fail", "broken"].includes(value);
}

const elements = {
  artifactForm: document.querySelector("#artifact-form"),
  artifactInput: document.querySelector("#artifact-input"),
  load19686: document.querySelector("#load-19686"),
  status: document.querySelector("#status"),
  bookMeta: document.querySelector("#book-meta"),
  tocList: document.querySelector("#toc-list"),
  tocCount: document.querySelector("#toc-count"),
  renderMode: document.querySelector("#render-mode"),
  metricsMode: document.querySelector("#metrics-mode"),
  debugGeometry: document.querySelector("#debug-geometry"),
  runtimeMeta: document.querySelector("#runtime-meta"),
  selectionMeta: document.querySelector("#selection-meta"),
  selectionKind: document.querySelector("#selection-kind"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  prevChunk: document.querySelector("#prev-chunk"),
  nextChunk: document.querySelector("#next-chunk"),
  copyRestoreToken: document.querySelector("#copy-restore-token"),
  copySelectionRange: document.querySelector("#copy-selection-range"),
  restoreTokenInput: document.querySelector("#restore-token-input"),
  restoreToken: document.querySelector("#restore-token"),
  createHighlight: document.querySelector("#create-highlight"),
  addNoteSelection: document.querySelector("#add-note-selection"),
  addNoteHighlight: document.querySelector("#add-note-highlight"),
  deleteAnnotation: document.querySelector("#delete-annotation"),
  exportAnnotations: document.querySelector("#export-annotations"),
  importAnnotations: document.querySelector("#import-annotations"),
  downloadSyncFile: document.querySelector("#download-sync-file"),
  loadSyncFile: document.querySelector("#load-sync-file"),
  copyHandoffState: document.querySelector("#copy-handoff-state"),
  clearLocalState: document.querySelector("#clear-local-state"),
  importProductionPayload: document.querySelector("#import-production-payload"),
  exportProductionNotes: document.querySelector("#export-production-notes"),
  exportSharePayload: document.querySelector("#export-share-payload"),
  exportSnapshotPatch: document.querySelector("#export-snapshot-patch"),
  noteInput: document.querySelector("#note-input"),
  annotationImport: document.querySelector("#annotation-import"),
  handoffState: document.querySelector("#handoff-state"),
  compatJson: document.querySelector("#compat-json"),
  syncFileInput: document.querySelector("#sync-file-input"),
  annotationCount: document.querySelector("#annotation-count"),
  annotationList: document.querySelector("#annotation-list"),
  clearSelection: document.querySelector("#clear-selection"),
  copySelection: document.querySelector("#copy-selection"),
  canvas: document.querySelector("#reader-canvas"),
  overlayCanvas: document.querySelector("#overlay-canvas"),
  readerFrame: document.querySelector(".reader-frame")
};

const state = {
  artifactRoot: DEFAULT_ARTIFACT,
  bookSummary: null,
  tocItems: [],
  currentSnapshot: null,
  currentRenderDiagnostics: null,
  workerClient: createProtectedWorkerClient({
    forceUnavailable: shouldForceWorkerUnavailable()
  }),
  compatBook: null,
  annotationRepository: null,
  annotationStore: null,
  selectedAnnotationId: null,
  lastCompatReport: null,
  entryConfig,
  integrationMode: !!(entryConfig && entryConfig.mode === "integration"),
  readingStateSource: entryConfig && entryConfig.readingStateSource ? entryConfig.readingStateSource : "protected-session",
  readingStateRestoreApplied: false,
  persistedReadingState: null,
  lastReadingStateSaveAt: null,
  compatShareImportStatus: entryConfig && entryConfig.compatShareImportStatus ? entryConfig.compatShareImportStatus : "none",
  compatShareWarnings: entryConfig && Array.isArray(entryConfig.compatShareWarnings) ? entryConfig.compatShareWarnings : [],
  sharePayloadParseStatus: entryConfig && entryConfig.compatShareImportStatus ? entryConfig.compatShareImportStatus : "none",
  artifactLoadStatus: "idle",
  persistenceDiagnostics: null,
  fileSyncCompatibilityStatus: "none",
  lastFileTransferResult: null,
  currentSyncTransport: null,
  currentHandoffState: null,
  renderMode: "shape",
  metricsMode: "shape",
  debugGeometry: false
};

function setStatus(message, tone = "idle") {
  elements.status.textContent = message;
  elements.status.dataset.state = tone;
}

function setDlRows(container, rows) {
  container.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value == null ? "" : String(value);
    container.append(dt, dd);
  }
}

function setTextareaValue(element, value) {
  if (element) element.value = value;
}

function getTextareaValue(element) {
  return element ? element.value.trim() : "";
}

function getArtifactRootFromLocation() {
  if (entryConfig && entryConfig.artifactRoot) return entryConfig.artifactRoot;
  const params = new URLSearchParams(window.location.search);
  const artifact = params.get("artifact");
  if (artifact) return artifact;
  const book = params.get("book");
  if (book) return `../artifacts/protected-books/${book}`;
  return DEFAULT_ARTIFACT;
}

function getRenderModeFromLocation() {
  return "shape";
}

function getMetricsModeFromLocation(renderMode) {
  if (entryConfig && entryConfig.metricsMode) {
    if (renderMode === "text") return "text";
    return entryConfig.metricsMode === "text" ? "text" : "shape";
  }
  const params = new URLSearchParams(window.location.search);
  const metricsMode = params.get("metricsMode");
  if (renderMode === "text") return "text";
  return metricsMode === "text" ? "text" : "shape";
}

function getDebugGeometryFromLocation() {
  if (entryConfig && typeof entryConfig.debugGeometry === "boolean") return entryConfig.debugGeometry;
  const params = new URLSearchParams(window.location.search);
  return params.get("debugGeometry") === "1";
}

function syncLocationParams() {
  const url = new URL(window.location.href);
  if (state.integrationMode && state.entryConfig && state.entryConfig.bookId) {
    url.searchParams.set("id", state.entryConfig.bookId);
    url.searchParams.delete("i");
    url.searchParams.set("reader", "protected");
    url.searchParams.delete("artifact");
  } else {
    url.searchParams.set("artifact", state.artifactRoot);
  }
  url.searchParams.set("renderMode", state.renderMode);
  url.searchParams.set("metricsMode", state.metricsMode);
  if (state.debugGeometry) url.searchParams.set("debugGeometry", "1");
  else url.searchParams.delete("debugGeometry");
  window.history.replaceState({}, "", url);
}

function syncArtifactInput() {
  elements.artifactInput.value = state.artifactRoot;
  state.renderMode = "shape";
  elements.renderMode.value = "shape";
  elements.metricsMode.value = state.metricsMode;
  elements.renderMode.disabled = true;
  const textModeOption = elements.renderMode.querySelector('option[value="text"]');
  if (textModeOption) textModeOption.disabled = true;
  elements.metricsMode.disabled = false;
  elements.debugGeometry.checked = state.debugGeometry;
}

function getViewportHeight() {
  return Math.max(420, (elements.readerFrame ? elements.readerFrame.clientHeight : 0) - 40 || 720);
}

function getCurrentAnnotations() {
  return state.annotationStore ? state.annotationStore.all() : [];
}

function getSelectedAnnotation() {
  return state.annotationStore && state.selectedAnnotationId
    ? state.annotationStore.get(state.selectedAnnotationId)
    : null;
}

function updateAnnotationControls() {
  const hasSelection = !!(state.currentSnapshot && state.currentSnapshot.rangeDescriptor);
  const selectedAnnotation = getSelectedAnnotation();
  elements.createHighlight.disabled = !hasSelection;
  elements.addNoteSelection.disabled = !hasSelection;
  elements.addNoteHighlight.disabled = !selectedAnnotation || selectedAnnotation.type !== "highlight";
  elements.deleteAnnotation.disabled = !selectedAnnotation;
  elements.exportAnnotations.disabled = !state.annotationStore || !state.annotationStore.all().length;
}

async function syncRepositoryAnnotations() {
  if (!state.annotationRepository || !state.annotationStore) return;
  await state.annotationRepository.replaceAnnotations(state.annotationStore.all(), {
    keepReadingState: true
  });
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
}

async function autoImportCompatPayload() {
  if (!state.integrationMode || !state.annotationRepository || !state.compatBook) return false;
  const route = state.entryConfig && state.entryConfig.integrationRoute;
  if (state.annotationStore && state.annotationStore.all().length) return false;
  if (!route) return false;

  let resolved = null;
  try {
    resolved = await resolveProductionPayloadFromRoute(route, { timeoutMs: 4000 });
  } catch (error) {
    resolved = {
      mode: "error",
      payload: null,
      warnings: [error && error.message ? error.message : "Share payload resolution failed."]
    };
  }

  state.compatShareImportStatus = resolved.mode || "none";
  state.sharePayloadParseStatus = resolved.mode || "none";
  state.compatShareWarnings = Array.isArray(resolved.warnings) ? resolved.warnings : [];

  if (!resolved.payload) {
    state.lastCompatReport = {
      total: 0,
      exact: 0,
      approximate: 0,
      unresolved: 0,
      createdHighlights: 0,
      createdNotes: 0,
      warnings: state.compatShareWarnings
    };
    elements.compatJson.value = JSON.stringify(state.lastCompatReport, null, 2);
    state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
    renderRuntimeMeta();
    return false;
  }

  const result = await state.annotationRepository.importProductionPayload(resolved.payload, {
    book: state.compatBook,
    merge: false,
    preserveReadingStateIfMissing: true
  });
  state.lastCompatReport = result.report;
  state.compatShareImportStatus = resolved.mode || "loaded";
  state.sharePayloadParseStatus = resolved.mode || "loaded";
  elements.compatJson.value = JSON.stringify(result.report, null, 2);
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  renderAnnotationList();
  renderRuntimeMeta();
  return true;
}

async function restoreReadingStateIfAvailable(bookId) {
  if (!state.annotationRepository || !state.compatBook) return null;
  const effectiveBookId = bookId || (state.bookSummary && state.bookSummary.bookId) || state.annotationRepository.bookId;
  const explicitRestoreToken = state.entryConfig && state.entryConfig.explicitRestoreToken
    ? String(state.entryConfig.explicitRestoreToken).trim()
    : "";
  if (explicitRestoreToken) {
    state.readingStateSource = "token";
    state.readingStateRestoreApplied = true;
    return {
      snapshot: await state.workerClient.restoreFromToken({
        token: explicitRestoreToken,
        viewportHeight: getViewportHeight(),
        annotations: getCurrentAnnotations()
      }),
      source: "token",
      readingState: null
    };
  }
  const readingState = await state.annotationRepository.loadReadingState(effectiveBookId);
  if (readingState && readingState.restoreToken) {
    state.readingStateSource = "protected-persisted";
    state.readingStateRestoreApplied = true;
    state.persistedReadingState = readingState;
    state.lastReadingStateSaveAt = readingState.updatedAt || null;
    return {
      snapshot: await state.workerClient.restoreFromToken({
        token: readingState.restoreToken,
        viewportHeight: getViewportHeight(),
        annotations: getCurrentAnnotations()
      }),
      source: "protected-persisted",
      readingState
    };
  }

  const fallbackCfi = state.entryConfig && state.entryConfig.fallbackCfi;
  if (fallbackCfi) {
    const result = await state.annotationRepository.importProductionPayload(
      {
        bookId: effectiveBookId,
        notes: {},
        positions: {
          [effectiveBookId]: {
            cfi: fallbackCfi,
            updatedAt: Date.now()
          }
        }
      },
      { book: state.compatBook, merge: true }
    );
    const compatReadingState = result.report && result.report.readingState && result.report.readingState.protectedReadingState;
    if (compatReadingState && compatReadingState.globalPosition) {
      state.readingStateSource = "production-fallback";
      state.readingStateRestoreApplied = true;
      state.persistedReadingState = compatReadingState;
      state.lastReadingStateSaveAt = compatReadingState.updatedAt || null;
      return {
        snapshot: await state.workerClient.goToChunk({
          chunkIndex: compatReadingState.globalPosition.chunkOrder,
          globalOffset: compatReadingState.globalPosition.globalOffset,
          viewportHeight: getViewportHeight(),
          annotations: getCurrentAnnotations()
        }),
        source: "production-fallback",
        readingState: compatReadingState
      };
    }
  }

  state.readingStateSource = "default-start";
  state.readingStateRestoreApplied = false;
  state.persistedReadingState = null;
  state.lastReadingStateSaveAt = null;
  return null;
}

function renderBookMeta() {
  if (!state.bookSummary) return setDlRows(elements.bookMeta, []);
  const metadata = state.bookSummary.metadata || {};
  setDlRows(elements.bookMeta, [
    ["Title", metadata.title || "(untitled)"],
    ["Creators", (metadata.creators || []).join(", ") || "unknown"],
    ["Languages", (metadata.languages || []).join(", ") || "unknown"],
    ["Reader mode", state.integrationMode ? "protected" : "dev-shell"],
    ["Artifact", state.artifactRoot],
    ["Mode", state.bookSummary.mode],
    ["Chunks", state.bookSummary.chunkCount]
  ]);
}

function renderToc() {
  const items = state.tocItems || [];
  const activeLabel = state.currentSnapshot ? state.currentSnapshot.chunkSummary.tocLabel : "";
  elements.tocCount.textContent = `${items.length} items`;
  elements.tocList.replaceChildren();
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-item";
    button.textContent = item.label || item.id;
    button.classList.toggle("is-active", button.textContent === activeLabel && !!activeLabel);
    button.addEventListener("click", async () => {
      try {
        const snapshot = await state.workerClient.goToToc({
          tocId: item.id,
          annotations: getCurrentAnnotations()
        });
        applySnapshot(snapshot);
        setStatus(`Opened TOC item ${item.label || item.id}.`, "ok");
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
    elements.tocList.append(button);
  });
}

function renderRuntimeMeta() {
  if (!state.currentSnapshot || !state.bookSummary) {
    if (state.workerClient.mode !== "worker") {
      setDlRows(elements.runtimeMeta, [
        ["Reader mode", state.integrationMode ? "protected" : "dev-shell"],
        ["Integration mode", state.integrationMode ? "active" : "inactive"],
        ["Worker mode", state.workerClient.mode],
        ["Worker protocol", "inactive"],
        ["Artifact load status", state.artifactLoadStatus],
        ["Protected mode", "unavailable"],
        ["Fail-closed", "yes"],
        ["Reason", state.workerClient.unavailableReason || "Protected mode is unavailable in this environment."],
        ["Debug artifact usage", "false"],
        ["DOM text leakage", "clean"]
      ]);
      return;
    }
    setDlRows(elements.runtimeMeta, []);
    return;
  }
  const runtimeMeta = state.currentSnapshot.runtimeMeta || {};
  const diagnostics = runtimeMeta.renderDiagnostics || {};
  const runtimeContract = runtimeMeta.runtimeContract || {};
  const persistenceDiagnostics = state.annotationRepository ? state.annotationRepository.getPersistenceDiagnostics() : (state.persistenceDiagnostics || null);
  const chunkSummary = runtimeMeta.chunkSummary || state.currentSnapshot.chunkSummary;
  const pageSummary = runtimeMeta.pageSummary || state.currentSnapshot.pageSummary;
  setDlRows(elements.runtimeMeta, [
    ["Book", runtimeMeta.bookTitle || "(untitled)"],
    ["Chunk", chunkSummary ? chunkSummary.chunkId : "n/a"],
    ["Order", chunkSummary ? `${chunkSummary.order} / ${chunkSummary.total}` : "n/a"],
    ["Page", pageSummary ? pageSummary.pageLabel : "n/a"],
    ["Location", chunkSummary ? chunkSummary.locationId : "n/a"],
    ["Global offset", pageSummary ? pageSummary.globalOffsetLabel : "n/a"],
    ["TOC", chunkSummary ? chunkSummary.tocLabel : "none"],
    ["Blocks", chunkSummary ? chunkSummary.blocks : 0],
    ["Segments", chunkSummary ? chunkSummary.segments : 0],
    ["Glyph token mode", runtimeContract.glyphMode || "opaque-chunk-local"],
    ["Unicode leakage", "clean"],
    ["Render payload", runtimeContract.renderPayload || "opaque-glyph-ops"],
    ["Reconstruction path", runtimeContract.reconstructionMode || "sealed-window-scoped"],
    ["Reconstruction scope", diagnostics.reconstructionScope || "none"],
    ["Full-chunk decode", diagnostics.fullChunkDecode || "forbidden"],
    ["Reconstruction cache", diagnostics.reconstructionCacheMode || "bounded-ephemeral"],
    ["Reconstruction cache size", diagnostics.reconstructionCacheSize ?? 0],
    ["Reconstruction exposure", diagnostics.reconstructionExposureStatus || "sealed"],
    ["Network recon surface", diagnostics.networkReconSurface || runtimeContract.reconstructionSurface || "hidden"],
    ["Worker mode", runtimeMeta.workerMode || state.workerClient.mode],
    ["Worker protocol", runtimeMeta.workerProtocol || "active"],
    ["Reconstruction host", runtimeMeta.reconstructionHost || "worker"],
    ["Layout host", runtimeMeta.layoutHost || "worker"],
    ["Copy host", runtimeMeta.copyHost || "worker"],
    ["Render preparation host", runtimeMeta.renderPreparationHost || "worker"],
    ["OffscreenCanvas", state.workerClient.offscreenCanvas],
    ["Debug artifact usage", "false"],
    ["DOM text leakage", "clean"],
    ["Render mode", state.renderMode],
    ["Metrics mode", state.metricsMode],
    ["Metrics backend", diagnostics.metricsBackend || "n/a"],
    ["Glyph ops", diagnostics.glyphOps ?? "n/a"],
    ["Shape bundle", diagnostics.hasShapeBundle ? "yes" : "no"],
    ["Shape records", diagnostics.shapeRecords ?? 0],
    ["Coverage", diagnostics.shapeCoveragePercent != null ? `${diagnostics.shapeCoveragePercent}%` : "n/a"],
    ["Extracted", diagnostics.extractedShapeCount ?? 0],
    ["Synthetic fallback", diagnostics.syntheticShapeCount ?? 0],
    ["Extracted coverage", diagnostics.extractedCoveragePercent != null ? `${diagnostics.extractedCoveragePercent}%` : "n/a"],
    ["Shape metrics coverage", diagnostics.shapeMetricsCoveragePercent != null ? `${diagnostics.shapeMetricsCoveragePercent}%` : "n/a"],
    ["Fallback-to-text metrics", diagnostics.metricsFallbackCount ?? 0],
    ["Hit-testing backend", diagnostics.hitTestingBackend || "n/a"],
    ["Selection precision", diagnostics.selectionPrecisionMode || "n/a"],
    ["Cross-chunk model", "enabled"],
    ["Restore token", state.currentSnapshot.restoreToken ? "available" : "n/a"],
    ["Annotations", state.annotationStore ? state.annotationStore.all().length : 0],
    ["Reader mode", state.integrationMode ? "protected" : "dev-shell"],
    ["Integration mode", state.integrationMode ? "active" : "inactive"],
    ["Reading state source", state.readingStateSource],
    ["Persisted page index", state.persistedReadingState && state.persistedReadingState.page ? state.persistedReadingState.page.pageIndex ?? "n/a" : "n/a"],
    ["Persisted chunk id", state.persistedReadingState && state.persistedReadingState.globalPosition ? state.persistedReadingState.globalPosition.chunkId || "n/a" : "n/a"],
    ["Persisted global offset", state.persistedReadingState && state.persistedReadingState.globalPosition ? state.persistedReadingState.globalPosition.globalOffset ?? "n/a" : "n/a"],
    ["Last save timestamp", state.lastReadingStateSaveAt ? new Date(state.lastReadingStateSaveAt).toISOString() : "n/a"],
    ["Restore applied", state.readingStateRestoreApplied ? "yes" : "no"],
    ["Storage backend", persistenceDiagnostics ? persistenceDiagnostics.storageBackend : "inactive"],
    ["Bundle schema version", persistenceDiagnostics ? persistenceDiagnostics.schemaVersion : "n/a"],
    ["Bundle compatibility", persistenceDiagnostics ? persistenceDiagnostics.compatibilityStatus : "n/a"],
    ["Bundle compatibility warning", persistenceDiagnostics && persistenceDiagnostics.compatibilityWarning ? persistenceDiagnostics.compatibilityWarning : "none"],
    ["Persisted bundle updated", persistenceDiagnostics && persistenceDiagnostics.lastSavedAt ? new Date(persistenceDiagnostics.lastSavedAt).toISOString() : "n/a"],
    ["Reading-state saved", persistenceDiagnostics ? (persistenceDiagnostics.readingStateSaved ? "yes" : "no") : "n/a"],
    ["Persisted annotation count", persistenceDiagnostics ? persistenceDiagnostics.annotationCount : "n/a"],
    ["Book fingerprint", persistenceDiagnostics ? persistenceDiagnostics.bookFingerprint : "n/a"],
    ["File sync compatibility", state.fileSyncCompatibilityStatus],
    ["Last file transfer", state.lastFileTransferResult || "none"],
    ["Handoff state", state.currentHandoffState ? state.currentHandoffState.kind : "none"],
    ["Handoff file", state.currentHandoffState && state.currentHandoffState.fileName ? state.currentHandoffState.fileName : "none"],
    ["Artifact load status", state.artifactLoadStatus],
    ["Compat share import", state.compatShareImportStatus],
    ["Share payload parse", state.sharePayloadParseStatus],
    ["Annotation repository", state.annotationRepository ? "active" : "inactive"],
    ["Compat mode", state.annotationRepository ? "repository-active" : "inactive"],
    ["Last import report", state.lastCompatReport ? `${state.lastCompatReport.exact} exact / ${state.lastCompatReport.approximate} approx / ${state.lastCompatReport.unresolved} unresolved` : "none"],
    ["Geometry overlay", state.debugGeometry ? "on" : "off"],
    ["Shape source", diagnostics.shapeSource || "none"]
  ]);
}

function renderSelectionMeta() {
  const selectionResult = state.currentSnapshot ? state.currentSnapshot.selectionResult : null;
  const rangeDescriptor = state.currentSnapshot ? state.currentSnapshot.rangeDescriptor : null;
  if (!selectionResult) {
    setDlRows(elements.selectionMeta, []);
    elements.selectionKind.textContent = "none";
    updateAnnotationControls();
    return;
  }
  elements.selectionKind.textContent = selectionResult.selectionType;
  setDlRows(elements.selectionMeta, [
    ["Type", selectionResult.selectionType],
    ["Selection mode", selectionResult.selectionMode || "n/a"],
    ["Highlight mode", selectionResult.highlightMode || "n/a"],
    ["Chars", selectionResult.selectedChars],
    ["Blocks", selectionResult.selectedBlocks],
    ["Lines", selectionResult.selectedLines],
    ["Chunk", selectionResult.chunkId || "n/a"],
    ["Location", selectionResult.locationId || "n/a"],
    ["Raw start", selectionResult.rawStartOffset ?? "n/a"],
    ["Raw end", selectionResult.rawEndOffset ?? "n/a"],
    ["Snapped start", selectionResult.startOffset ?? "n/a"],
    ["Snapped end", selectionResult.endOffset ?? "n/a"],
    ["Word boundary hits", selectionResult.wordBoundaryHits ?? 0],
    ["Range global", rangeDescriptor ? `${rangeDescriptor.start.globalOffset}..${rangeDescriptor.end.globalOffset}` : "n/a"],
    [
      "Serialized range",
      rangeDescriptor
        ? `${rangeDescriptor.start.chunkId}:${rangeDescriptor.start.localOffset} -> ${rangeDescriptor.end.chunkId}:${rangeDescriptor.end.localOffset}`
        : "n/a"
    ]
  ]);
  updateAnnotationControls();
}

function renderAnnotationList() {
  const annotations = state.annotationStore ? state.annotationStore.all() : [];
  elements.annotationCount.textContent = `${annotations.length} items`;
  elements.annotationList.replaceChildren();

  for (const annotation of annotations) {
    const article = document.createElement("article");
    article.className = "annotation-item";
    if (annotation.annotationId === state.selectedAnnotationId) article.classList.add("is-selected");

    const head = document.createElement("div");
    head.className = "annotation-item-head";
    const pill = document.createElement("span");
    pill.className = `annotation-pill${annotation.type === "note" ? " note" : ""}`;
    pill.textContent = annotation.type;
    const title = document.createElement("strong");
    title.textContent = annotation.annotationId;
    head.append(pill, title);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `${annotation.rangeDescriptor.start.chunkId}:${annotation.rangeDescriptor.start.localOffset} -> ${annotation.rangeDescriptor.end.chunkId}:${annotation.rangeDescriptor.end.localOffset} | global ${annotation.rangeDescriptor.start.globalOffset}..${annotation.rangeDescriptor.end.globalOffset}`;

    const noteMeta = document.createElement("div");
    noteMeta.className = "muted";
    if (annotation.type === "note") {
      noteMeta.textContent = annotation.noteText ? `Note length: ${annotation.noteText.length}` : "Empty note";
    } else {
      const linkedNotes = state.annotationStore.notesForHighlight(annotation.annotationId);
      noteMeta.textContent = linkedNotes.length ? `Linked notes: ${linkedNotes.length}` : "No notes";
    }

    const actions = document.createElement("div");
    actions.className = "annotation-item-actions";
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent = annotation.annotationId === state.selectedAnnotationId ? "Selected" : "Select";
    selectButton.addEventListener("click", () => {
      state.selectedAnnotationId = annotation.annotationId;
      if (annotation.type === "note") elements.noteInput.value = annotation.noteText || "";
      renderAnnotationList();
      refreshCanvas();
    });

    const goButton = document.createElement("button");
    goButton.type = "button";
    goButton.textContent = "Go to";
    goButton.addEventListener("click", async () => {
      try {
        const snapshot = await state.workerClient.goToAnnotation({
          rangeDescriptor: annotation.rangeDescriptor,
          annotations: getCurrentAnnotations()
        });
        state.selectedAnnotationId = annotation.annotationId;
        applySnapshot(snapshot);
        setStatus(`Opened annotation ${annotation.annotationId}.`, "ok");
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });

    actions.append(selectButton, goButton);
    article.append(head, meta, noteMeta, actions);
    elements.annotationList.append(article);
  }

  updateAnnotationControls();
}

function refreshCanvas() {
  if (!state.currentSnapshot || !state.currentSnapshot.renderPacket) return;
  state.currentRenderDiagnostics = renderChunkToCanvas({
    canvas: elements.canvas,
    overlayCanvas: elements.overlayCanvas,
    renderPacket: state.currentSnapshot.renderPacket,
    debugGeometry: state.debugGeometry,
    offscreenCanvasStatus: state.workerClient.offscreenCanvas === "available" ? "inactive" : "not-available"
  });
  renderRuntimeMeta();
}

function applySnapshot(snapshot) {
  state.currentSnapshot = snapshot;
  if (snapshot.bookSummary) state.bookSummary = snapshot.bookSummary;
  if (snapshot.tocItems) state.tocItems = snapshot.tocItems;
  persistReadingStateFromSnapshot(snapshot).catch((error) => {
    console.error(error);
  });
  renderBookMeta();
  renderToc();
  renderSelectionMeta();
  renderAnnotationList();
  refreshCanvas();
}

async function persistReadingStateFromSnapshot(snapshot) {
  if (!state.annotationRepository || !snapshot || !snapshot.restoreToken || !state.bookSummary) return;
  const parsed = parseRestoreToken(snapshot.restoreToken);
  const previous = await state.annotationRepository.loadReadingState(state.bookSummary.bookId);
  const nextState = await state.annotationRepository.saveReadingState(state.bookSummary.bookId, {
    restoreToken: snapshot.restoreToken,
    globalPosition: parsed.position || null,
    page: {
      pageIndex: parsed.pageIndex,
      pageCount: parsed.pageCount
    },
    compat: previous && previous.compat ? previous.compat : null,
    updatedAt: Date.now()
  });
  state.persistedReadingState = nextState;
  state.lastReadingStateSaveAt = nextState && nextState.updatedAt ? nextState.updatedAt : null;
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
}

async function loadArtifact(artifactRoot) {
  if (state.workerClient.mode !== "worker") {
    state.artifactLoadStatus = "secure-worker-unavailable";
    renderRuntimeMeta();
    throw new Error(state.workerClient.unavailableReason || "Protected mode is unavailable in this environment.");
  }
  state.artifactRoot = artifactRoot;
  state.artifactLoadStatus = "loading";
  syncArtifactInput();
  syncLocationParams();
  setStatus(`Loading runtime-safe artifact ${artifactRoot}...`);
  const snapshot = await state.workerClient.initBook({
    artifactRoot,
    renderMode: "shape",
    metricsMode: state.metricsMode,
    viewportHeight: getViewportHeight(),
    annotations: []
  });
  const bookId = (snapshot.bookSummary && snapshot.bookSummary.bookId) ||
    "protected-book";
  state.compatBook = await loadProtectedBook(artifactRoot);
  state.annotationRepository = createProtectedAnnotationRepository({
    bookId,
    book: state.compatBook,
    persistence: state.integrationMode ? state.entryConfig.repositoryPersistence || null : null
  });
  state.annotationStore = state.annotationRepository.store;
  await state.annotationRepository.ensureHydrated();
  state.selectedAnnotationId = null;
  state.lastCompatReport = null;
  state.persistedReadingState = null;
  state.lastReadingStateSaveAt = null;
  state.readingStateRestoreApplied = false;
  state.fileSyncCompatibilityStatus = "none";
  state.lastFileTransferResult = null;
  state.currentSyncTransport = null;
  state.currentHandoffState = null;
  state.sharePayloadParseStatus = state.entryConfig && state.entryConfig.compatShareImportStatus
    ? state.entryConfig.compatShareImportStatus
    : "none";
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  elements.noteInput.value = "";
  setTextareaValue(elements.annotationImport, "");
  setTextareaValue(elements.handoffState, "");
  setTextareaValue(elements.compatJson, "");
  if (snapshot.bookSummary) state.bookSummary = snapshot.bookSummary;
  if (snapshot.tocItems) state.tocItems = snapshot.tocItems;
  const restored = await restoreReadingStateIfAvailable(bookId);
  const finalSnapshot = restored && restored.snapshot ? {
    ...restored.snapshot,
    bookSummary: restored.snapshot.bookSummary || snapshot.bookSummary,
    tocItems: restored.snapshot.tocItems || snapshot.tocItems
  } : snapshot;
  if (!restored) {
    state.readingStateSource = "default-start";
  }
  applySnapshot(finalSnapshot);
  state.artifactLoadStatus = "loaded";
  await autoImportCompatPayload();
  if (state.annotationStore && state.annotationStore.all().length) {
    await requestAndApply("getRuntimeStatus");
  }
  const persistenceWarning = state.persistenceDiagnostics && state.persistenceDiagnostics.compatibilityWarning
    ? ` Warning: ${state.persistenceDiagnostics.compatibilityWarning}`
    : "";
  setStatus(
    `Opened ${finalSnapshot.chunkSummary.chunkId} (${finalSnapshot.chunkSummary.order}/${finalSnapshot.chunkSummary.total}) in ${state.renderMode}/${state.metricsMode} mode.${persistenceWarning}`,
    persistenceWarning ? "warning" : "ok"
  );
}

function getCanvasPoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  const page = state.currentSnapshot ? state.currentSnapshot.renderPacket.pageWindow : null;
  const layout = state.currentSnapshot ? state.currentSnapshot.renderPacket.layout : null;
  const yOffset = page ? page.top - (layout ? layout.padding : 0) : 0;
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top + yOffset
  };
}

async function requestAndApply(method, payload = {}) {
  const snapshot = await state.workerClient[method]({
    viewportHeight: getViewportHeight(),
    annotations: getCurrentAnnotations(),
    ...payload
  });
  applySnapshot(snapshot);
  return snapshot;
}

async function handleMouseDown(event) {
  if (!state.currentSnapshot) return;
  const point = getCanvasPoint(event);
  await requestAndApply("pointerDown", {
    x: point.x,
    y: point.y,
    shiftKey: event.shiftKey
  });
}

async function handleMouseMove(event) {
  if (!state.currentSnapshot) return;
  const point = getCanvasPoint(event);
  await requestAndApply("pointerMove", {
    x: point.x,
    y: point.y
  });
}

async function handleMouseUp(event) {
  if (!state.currentSnapshot) return;
  const point = getCanvasPoint(event);
  await requestAndApply("pointerUp", {
    x: point.x,
    y: point.y
  });
}

async function handleCopySelection() {
  if (!state.currentSnapshot) {
    setStatus("Nothing is loaded yet.", "error");
    return;
  }
  if (!state.currentSnapshot.selectionResult || state.currentSnapshot.selectionResult.isCollapsed) {
    setStatus("Create a non-empty selection before copying.", "error");
    return;
  }
  const result = await state.workerClient.copyCurrentSelection();
  await navigator.clipboard.writeText(result.clipboardText);
  setStatus(
    `Copied selection: ${result.selectedChars} chars across ${result.selectedBlocks} block(s) and ${result.selectedLines} line(s).`,
    "ok"
  );
}

async function handleCopyRestoreToken() {
  if (!state.currentSnapshot) {
    setStatus("Nothing is loaded yet.", "error");
    return;
  }
  const result = await state.workerClient.getRestoreToken();
  await navigator.clipboard.writeText(result.token);
  elements.restoreTokenInput.value = result.token;
  setStatus("Copied restore token.", "ok");
}

async function handleRestoreToken() {
  if (!state.currentSnapshot) {
    setStatus("Load a book before restoring.", "error");
    return;
  }
  const token = elements.restoreTokenInput.value.trim();
  const snapshot = await state.workerClient.restoreFromToken({
    token,
    viewportHeight: getViewportHeight(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  setStatus("Restored position from token.", "ok");
}

async function handleCopySelectionRange() {
  const rangeDescriptor = state.currentSnapshot && state.currentSnapshot.rangeDescriptor;
  if (!rangeDescriptor) {
    setStatus("Create a selection before copying its serialized range.", "error");
    return;
  }
  await navigator.clipboard.writeText(serializeRangeDescriptor(rangeDescriptor));
  setStatus("Copied serialized selection range.", "ok");
}

async function createHighlightFromSelection() {
  if (!state.annotationStore || !state.currentSnapshot || !state.currentSnapshot.rangeDescriptor) {
    throw new Error("Create a selection before creating a highlight.");
  }
  const annotation = await state.workerClient.createAnnotationFromCurrentSelection({
    type: "highlight"
  });
  state.annotationStore.importAnnotations({
    kind: "protected-annotations-v1",
    bookId: state.annotationStore.bookId,
    annotations: [...state.annotationStore.all(), annotation]
  });
  state.selectedAnnotationId = annotation.annotationId;
  await syncRepositoryAnnotations();
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Created highlight ${annotation.annotationId}.`, "ok");
  return annotation;
}

async function addNoteToSelection() {
  if (!state.currentSnapshot || !state.currentSnapshot.rangeDescriptor) {
    throw new Error("Create a selection before adding a note.");
  }
  const noteText = elements.noteInput.value.trim();
  if (!noteText) throw new Error("Enter note text before adding a note.");
  const note = await state.workerClient.createAnnotationFromCurrentSelection({
    type: "note",
    noteText
  });
  state.annotationStore.importAnnotations({
    kind: "protected-annotations-v1",
    bookId: state.annotationStore.bookId,
    annotations: [...state.annotationStore.all(), note]
  });
  state.selectedAnnotationId = note.annotationId;
  await syncRepositoryAnnotations();
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Added note ${note.annotationId}.`, "ok");
}

async function addNoteToHighlight() {
  const selectedAnnotation = getSelectedAnnotation();
  if (!selectedAnnotation || selectedAnnotation.type !== "highlight") {
    throw new Error("Select a highlight before adding a note.");
  }
  const noteText = elements.noteInput.value.trim();
  if (!noteText) throw new Error("Enter note text before adding a note.");
  const existing = state.annotationStore.notesForHighlight(selectedAnnotation.annotationId)[0] || null;
  if (existing) {
    state.annotationStore.updateNote(existing.annotationId, noteText);
    state.selectedAnnotationId = existing.annotationId;
    await syncRepositoryAnnotations();
    renderAnnotationList();
    await requestAndApply("getRuntimeStatus");
    setStatus(`Updated note ${existing.annotationId}.`, "ok");
    return;
  }
  const note = state.annotationStore.createNote({
    rangeDescriptor: selectedAnnotation.rangeDescriptor,
    noteText,
    highlightId: selectedAnnotation.annotationId,
    color: "blue"
  });
  state.selectedAnnotationId = note.annotationId;
  await syncRepositoryAnnotations();
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Added note ${note.annotationId}.`, "ok");
}

async function exportAnnotations() {
  if (!state.annotationRepository || !state.bookSummary) throw new Error("Nothing is loaded yet.");
  const transport = await state.annotationRepository.exportSyncTransport(state.bookSummary.bookId);
  state.currentSyncTransport = transport;
  state.currentHandoffState = transport.handoffState;
  setTextareaValue(elements.annotationImport, transport.serializedSyncFile);
  setTextareaValue(elements.handoffState, transport.serializedHandoffState);
  await navigator.clipboard.writeText(transport.serializedSyncFile);
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  state.fileSyncCompatibilityStatus = "exact";
  state.lastFileTransferResult = "protected-sync-export";
  renderRuntimeMeta();
  setStatus("Exported protected sync file.", "ok");
}

async function downloadSyncFile() {
  if (!state.annotationRepository || !state.bookSummary) throw new Error("Nothing is loaded yet.");
  const transport = state.currentSyncTransport || await state.annotationRepository.exportSyncTransport(state.bookSummary.bookId);
  state.currentSyncTransport = transport;
  state.currentHandoffState = transport.handoffState;
  setTextareaValue(elements.annotationImport, transport.serializedSyncFile);
  setTextareaValue(elements.handoffState, transport.serializedHandoffState);
  const result = downloadJsonFile({
    fileName: transport.fileName,
    payload: transport.serializedSyncFile,
    mimeType: transport.mimeType
  });
  state.lastFileTransferResult = `protected-sync-download:${result.fileName}`;
  state.fileSyncCompatibilityStatus = "exact";
  renderRuntimeMeta();
  setStatus(`Downloaded protected sync file ${result.fileName}.`, "ok");
}

async function copyHandoffState() {
  if (!state.annotationRepository || !state.bookSummary) throw new Error("Nothing is loaded yet.");
  const transport = state.currentSyncTransport || await state.annotationRepository.exportSyncTransport(state.bookSummary.bookId);
  state.currentSyncTransport = transport;
  state.currentHandoffState = transport.handoffState;
  setTextareaValue(elements.annotationImport, transport.serializedSyncFile);
  setTextareaValue(elements.handoffState, transport.serializedHandoffState);
  await navigator.clipboard.writeText(transport.serializedHandoffState);
  state.lastFileTransferResult = "protected-handoff-copy";
  renderRuntimeMeta();
  setStatus("Copied protected handoff state.", "ok");
}

async function importAnnotations() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const payload = getTextareaValue(elements.annotationImport);
  if (!payload) throw new Error("Paste protected sync file JSON before importing.");
  const handoffPayload = getTextareaValue(elements.handoffState);
  const handoffState = handoffPayload ? normalizeProtectedSyncTransportHandoff(handoffPayload) : null;
  const assessed = await state.annotationRepository.assessSyncTransport(payload, handoffState);
  state.fileSyncCompatibilityStatus = assessed.status;
  if (!assessed.compatible) {
    state.lastFileTransferResult = `protected-sync-import:${assessed.status}`;
    renderRuntimeMeta();
    throw new Error(assessed.warning || "Protected sync handoff is incompatible.");
  }
  let result = null;
  try {
    result = await state.annotationRepository.importSyncFile(payload);
  } catch (error) {
    if (error && error.compatibility) {
      state.fileSyncCompatibilityStatus = error.compatibility.status;
      state.lastFileTransferResult = `protected-sync-import:${error.compatibility.status}`;
      renderRuntimeMeta();
    }
    throw error;
  }
  state.readingStateSource = "protected-sync-file-import";
  state.selectedAnnotationId = null;
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  state.fileSyncCompatibilityStatus = result.compatibility.status;
  state.lastFileTransferResult = `protected-sync-import:${result.compatibility.status}`;
  state.currentHandoffState = handoffState;
  state.currentSyncTransport = handoffState
    ? buildProtectedSyncTransport({
        syncFile: payload,
        fileName: handoffState.fileName || "",
        handoffMetadata: handoffState.metadata || {}
      })
    : null;
  const importedReadingState = await state.annotationRepository.loadReadingState(state.bookSummary.bookId);
  if (importedReadingState && importedReadingState.restoreToken) {
    state.persistedReadingState = importedReadingState;
    state.lastReadingStateSaveAt = importedReadingState.updatedAt || null;
    state.readingStateRestoreApplied = true;
    const snapshot = await state.workerClient.restoreFromToken({
      token: importedReadingState.restoreToken,
      viewportHeight: getViewportHeight(),
      annotations: getCurrentAnnotations()
    });
    applySnapshot(snapshot);
  } else {
    await requestAndApply("getRuntimeStatus");
  }
  renderAnnotationList();
  renderRuntimeMeta();
  setStatus("Imported protected sync file.", "ok");
}

async function loadSyncFileFromPicker() {
  if (!elements.syncFileInput) throw new Error("File picker is unavailable.");
  elements.syncFileInput.value = "";
  elements.syncFileInput.click();
}

async function handleSyncFileChosen(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  const payload = await readTextFile(file);
  const transport = buildProtectedSyncTransport({
    syncFile: payload,
    fileName: file.name,
    handoffMetadata: {
      source: "file-picker"
    }
  });
  const compatibility = await state.annotationRepository.assessSyncTransport(payload, transport.handoffState);
  state.currentSyncTransport = transport;
  state.currentHandoffState = transport.handoffState;
  setTextareaValue(elements.annotationImport, transport.serializedSyncFile);
  setTextareaValue(elements.handoffState, transport.serializedHandoffState);
  state.fileSyncCompatibilityStatus = compatibility.status;
  state.lastFileTransferResult = `protected-sync-load:${compatibility.status}`;
  renderRuntimeMeta();
  setStatus(`Loaded protected sync file ${file.name}.`, compatibility.compatible ? "ok" : "warning");
}

async function importProductionPayload() {
  if (!state.annotationRepository || !state.compatBook) throw new Error("Nothing is loaded yet.");
  const payload = getTextareaValue(elements.compatJson);
  if (!payload) throw new Error("Paste production snapshot fragment JSON before importing.");
  const result = await state.annotationRepository.importProductionSnapshotFragment(payload, {
    book: state.compatBook,
    preserveReadingStateIfMissing: true
  });
  state.lastCompatReport = result.report;
  state.compatShareImportStatus = "manual-snapshot-import";
  state.selectedAnnotationId = null;
  setTextareaValue(elements.annotationImport, JSON.stringify(
    await state.annotationRepository.exportSyncFile(state.bookSummary.bookId),
    null,
    2
  ));
  setTextareaValue(elements.compatJson, JSON.stringify(result.report, null, 2));
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  state.fileSyncCompatibilityStatus = "production-snapshot-import";
  state.lastFileTransferResult = "production-snapshot-import";
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(
    `Imported production payload: ${result.report.exact} exact, ${result.report.approximate} approximate, ${result.report.unresolved} unresolved.`,
    "ok"
  );
}

async function exportProductionNotes() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const result = await state.annotationRepository.exportProductionPayload();
  setTextareaValue(elements.compatJson, JSON.stringify(result.productionNotes, null, 2));
  state.lastCompatReport = result.report;
  await navigator.clipboard.writeText(elements.compatJson ? elements.compatJson.value : "");
  renderRuntimeMeta();
  setStatus("Exported production-compatible notes array.", "ok");
}

async function exportSharePayload() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const result = await state.annotationRepository.exportProductionPayload();
  setTextareaValue(elements.compatJson, JSON.stringify(result.sharePayload, null, 2));
  state.lastCompatReport = result.report;
  await navigator.clipboard.writeText(elements.compatJson ? elements.compatJson.value : "");
  renderRuntimeMeta();
  setStatus("Exported production-compatible share payload.", "ok");
}

async function exportSnapshotPatch() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const result = await state.annotationRepository.exportProductionSnapshotPatch();
  setTextareaValue(elements.compatJson, JSON.stringify(result.snapshotPatch, null, 2));
  state.lastCompatReport = result.protectedSyncBundle && result.protectedSyncBundle.compat && result.protectedSyncBundle.compat.productionSnapshotPatch
    ? {
        total: result.protectedSyncBundle.metadata?.annotationCount || 0,
        exact: 0,
        approximate: 0,
        unresolved: 0
      }
    : state.lastCompatReport;
  state.lastFileTransferResult = "production-snapshot-export";
  await navigator.clipboard.writeText(elements.compatJson ? elements.compatJson.value : "");
  renderRuntimeMeta();
  setStatus("Exported production-compatible snapshot patch.", "ok");
}

async function deleteSelectedAnnotation() {
  const selectedAnnotation = getSelectedAnnotation();
  if (!selectedAnnotation) throw new Error("Select an annotation first.");
  state.annotationStore.delete(selectedAnnotation.annotationId);
  state.selectedAnnotationId = null;
  elements.noteInput.value = "";
  await syncRepositoryAnnotations();
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Deleted annotation ${selectedAnnotation.annotationId}.`, "ok");
}

async function clearLocalProtectedState() {
  if (!state.annotationRepository || !state.bookSummary) throw new Error("Nothing is loaded yet.");
  await state.annotationRepository.clearPersistence();
  state.selectedAnnotationId = null;
  state.persistedReadingState = null;
  state.lastReadingStateSaveAt = null;
  state.readingStateSource = "default-start";
  state.readingStateRestoreApplied = false;
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  state.fileSyncCompatibilityStatus = "none";
  state.lastFileTransferResult = "cleared";
  state.currentSyncTransport = null;
  state.currentHandoffState = null;
  setTextareaValue(elements.annotationImport, "");
  setTextareaValue(elements.handoffState, "");
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus("Cleared local protected state.", "ok");
}

async function boot() {
  state.artifactRoot = getArtifactRootFromLocation();
  state.renderMode = "shape";
  state.metricsMode = getMetricsModeFromLocation(state.renderMode);
  state.debugGeometry = getDebugGeometryFromLocation();
  syncArtifactInput();

  elements.artifactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await loadArtifact(elements.artifactInput.value.trim() || DEFAULT_ARTIFACT);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.load19686.addEventListener("click", async () => {
    try {
      await loadArtifact(DEFAULT_ARTIFACT);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.renderMode.addEventListener("change", async () => {
    state.renderMode = "shape";
    syncArtifactInput();
    syncLocationParams();
    if (!state.currentSnapshot) {
      setStatus(`Render mode set to ${state.renderMode}.`, "ok");
      return;
    }
    try {
      const snapshot = await state.workerClient.updateRenderConfig({
        renderMode: "shape",
        metricsMode: state.metricsMode,
        viewportHeight: getViewportHeight(),
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
      setStatus(`Render mode switched to ${state.renderMode}/${state.metricsMode}.`, "ok");
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.metricsMode.addEventListener("change", async () => {
    state.metricsMode = elements.metricsMode.value === "text" ? "text" : "shape";
    syncArtifactInput();
    syncLocationParams();
    if (!state.currentSnapshot) return;
    try {
      const snapshot = await state.workerClient.updateRenderConfig({
        renderMode: "shape",
        metricsMode: state.metricsMode,
        viewportHeight: getViewportHeight(),
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
      setStatus(`Metrics mode switched to ${state.metricsMode}.`, "ok");
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.debugGeometry.addEventListener("change", () => {
    state.debugGeometry = elements.debugGeometry.checked;
    syncLocationParams();
    refreshCanvas();
    setStatus(`Geometry overlay ${state.debugGeometry ? "enabled" : "disabled"}.`, "ok");
  });

  elements.prevPage.addEventListener("click", async () => {
    try {
      const snapshot = await state.workerClient.goToPrevPage({
        viewportHeight: getViewportHeight(),
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.nextPage.addEventListener("click", async () => {
    try {
      const snapshot = await state.workerClient.goToNextPage({
        viewportHeight: getViewportHeight(),
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.prevChunk.addEventListener("click", async () => {
    if (!state.currentSnapshot) return;
    try {
      const snapshot = await state.workerClient.goToChunk({
        chunkIndex: state.currentSnapshot.chunkSummary.order - 2,
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.nextChunk.addEventListener("click", async () => {
    if (!state.currentSnapshot) return;
    try {
      const snapshot = await state.workerClient.goToChunk({
        chunkIndex: state.currentSnapshot.chunkSummary.order,
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.clearSelection.addEventListener("click", async () => {
    try {
      const snapshot = await state.workerClient.clearSelection({
        annotations: getCurrentAnnotations()
      });
      applySnapshot(snapshot);
      setStatus("Selection cleared.", "ok");
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.copyRestoreToken.addEventListener("click", async () => {
    try {
      await handleCopyRestoreToken();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.copySelectionRange.addEventListener("click", async () => {
    try {
      await handleCopySelectionRange();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.createHighlight.addEventListener("click", async () => {
    try {
      await createHighlightFromSelection();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.addNoteSelection.addEventListener("click", async () => {
    try {
      await addNoteToSelection();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.addNoteHighlight.addEventListener("click", async () => {
    try {
      await addNoteToHighlight();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.deleteAnnotation.addEventListener("click", async () => {
    try {
      await deleteSelectedAnnotation();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.exportAnnotations.addEventListener("click", async () => {
    try {
      await exportAnnotations();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.importAnnotations.addEventListener("click", async () => {
    try {
      await importAnnotations();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  if (elements.downloadSyncFile) {
    elements.downloadSyncFile.addEventListener("click", async () => {
      try {
        await downloadSyncFile();
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.copyHandoffState) {
    elements.copyHandoffState.addEventListener("click", async () => {
      try {
        await copyHandoffState();
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.loadSyncFile) {
    elements.loadSyncFile.addEventListener("click", async () => {
      try {
        await loadSyncFileFromPicker();
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.syncFileInput) {
    elements.syncFileInput.addEventListener("change", (event) => {
      handleSyncFileChosen(event).catch((error) => {
        console.error(error);
        state.fileSyncCompatibilityStatus = "corrupt";
        state.lastFileTransferResult = "protected-sync-load:corrupt";
        renderRuntimeMeta();
        setStatus(error.message || String(error), "error");
      });
    });
  }

  if (elements.clearLocalState) {
    elements.clearLocalState.addEventListener("click", async () => {
      try {
        await clearLocalProtectedState();
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

  elements.importProductionPayload.addEventListener("click", async () => {
    try {
      await importProductionPayload();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.exportProductionNotes.addEventListener("click", async () => {
    try {
      await exportProductionNotes();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.exportSharePayload.addEventListener("click", async () => {
    try {
      await exportSharePayload();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.exportSnapshotPatch.addEventListener("click", async () => {
    try {
      await exportSnapshotPatch();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.restoreToken.addEventListener("click", async () => {
    try {
      await handleRestoreToken();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.copySelection.addEventListener("click", async () => {
    try {
      await handleCopySelection();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.canvas.addEventListener("mousedown", (event) => {
    handleMouseDown(event).catch((error) => {
      console.error(error);
      setStatus(error.message || String(error), "error");
    });
  });
  elements.canvas.addEventListener("mousemove", (event) => {
    handleMouseMove(event).catch((error) => {
      console.error(error);
      setStatus(error.message || String(error), "error");
    });
  });
  window.addEventListener("mouseup", (event) => {
    handleMouseUp(event).catch((error) => {
      console.error(error);
      setStatus(error.message || String(error), "error");
    });
  });

  try {
    if (state.workerClient.mode !== "worker") {
      state.artifactLoadStatus = "secure-worker-unavailable";
      renderRuntimeMeta();
      setStatus(state.workerClient.unavailableReason || "Protected mode is unavailable in this environment.", "error");
      return;
    }
    await loadArtifact(state.artifactRoot);
  } catch (error) {
    console.error(error);
    state.artifactLoadStatus = "failed";
    setStatus(error.message || String(error), "error");
  }
}

boot();
