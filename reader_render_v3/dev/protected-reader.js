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
import { createProtectedDriveTransport } from "../runtime/protected-drive-transport.js";
import { createInitialProtectedDriveState, mergeProtectedDriveState } from "../runtime/protected-drive-state.js";

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
  checkDriveStatus: document.querySelector("#check-drive-status"),
  uploadDriveFile: document.querySelector("#upload-drive-file"),
  downloadDriveFile: document.querySelector("#download-drive-file"),
  applyDriveFile: document.querySelector("#apply-drive-file"),
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
  driveTransport: null,
  driveState: createInitialProtectedDriveState(),
  rolloutStatus: entryConfig && entryConfig.integrationDiagnostics ? entryConfig.integrationDiagnostics.rolloutStatus || null : null,
  rolloutEligibility: entryConfig && entryConfig.integrationDiagnostics ? entryConfig.integrationDiagnostics.eligibility || null : null,
  rolloutPolicy: entryConfig && entryConfig.integrationDiagnostics ? entryConfig.integrationDiagnostics.rollout || null : null,
  pilotStatus: entryConfig && entryConfig.integrationDiagnostics ? entryConfig.integrationDiagnostics.pilot || null : null,
  theme: "light",
  fontScale: 1,
  renderMode: "shape",
  metricsMode: "shape",
  debugGeometry: false
};

if (isEmbeddedOldShellMode()) {
  document.documentElement.dataset.shellMode = "embedded-old-shell";
  document.body.dataset.shellMode = "embedded-old-shell";
  document.body.dataset.driveMode = state.entryConfig && state.entryConfig.driveMode ? state.entryConfig.driveMode : "full";
}

function isEmbeddedOldShellMode() {
  return !!(state.entryConfig && state.entryConfig.embeddedMode === "old-shell");
}

function isDriveUiDisabled() {
  return !!(state.entryConfig && state.entryConfig.driveMode === "disabled");
}

function isAutomationSafeMode() {
  return !!(state.entryConfig && state.entryConfig.automationSafe);
}

function getCurrentBookAuthor() {
  const metadata = state.bookSummary && state.bookSummary.metadata ? state.bookSummary.metadata : {};
  const creators = Array.isArray(metadata.creators) ? metadata.creators.filter(Boolean) : [];
  return creators.join(", ");
}

function getCoverHintFromLocation() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return String(params.get("cover") || "").trim();
  } catch (error) {
    return "";
  }
}

function buildGeneratedCoverDataUrl(title, author) {
  const safeTitle = String(title || "").trim() || "Protected Book";
  const safeAuthor = String(author || "").trim() || "ReaderPub";
  const titleLine = safeTitle.length > 36 ? `${safeTitle.slice(0, 33)}...` : safeTitle;
  const authorLine = safeAuthor.length > 30 ? `${safeAuthor.slice(0, 27)}...` : safeAuthor;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="640" viewBox="0 0 420 640">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#16324f" />
          <stop offset="100%" stop-color="#c98b4f" />
        </linearGradient>
      </defs>
      <rect width="420" height="640" rx="32" fill="url(#g)" />
      <rect x="30" y="30" width="360" height="580" rx="24" fill="rgba(255,255,255,0.10)" />
      <text x="48" y="128" fill="#f8f5ef" font-family="Georgia, serif" font-size="18" opacity="0.72">Protected Edition</text>
      <text x="48" y="236" fill="#ffffff" font-family="Georgia, serif" font-size="36" font-weight="700">${titleLine.replace(/[<&>]/g, "")}</text>
      <text x="48" y="288" fill="#f4e6d3" font-family="Georgia, serif" font-size="22">${authorLine.replace(/[<&>]/g, "")}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getCurrentBookCoverUrl() {
  const hinted = getCoverHintFromLocation();
  if (hinted) return hinted;
  const metadata = state.bookSummary && state.bookSummary.metadata ? state.bookSummary.metadata : {};
  return buildGeneratedCoverDataUrl(metadata.title || "", getCurrentBookAuthor());
}

function applyEmbeddedTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  notifyEmbeddedBridge();
}

function setStatus(message, tone = "idle") {
  elements.status.textContent = message;
  elements.status.dataset.state = tone;
  notifyEmbeddedBridge();
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

function getLocalStateUpdatedAt() {
  const diagnostics = state.annotationRepository
    ? state.annotationRepository.getPersistenceDiagnostics()
    : state.persistenceDiagnostics;
  return diagnostics && diagnostics.lastSavedAt ? diagnostics.lastSavedAt : null;
}

function ensureDriveTransport() {
  if (!state.driveTransport) {
    state.driveTransport = createProtectedDriveTransport();
  }
  return state.driveTransport;
}

function buildBridgeSummary() {
  const annotations = state.annotationStore ? state.annotationStore.all() : [];
  const runtimeMeta =
    state.currentSnapshot && state.currentSnapshot.runtimeMeta ? state.currentSnapshot.runtimeMeta : null;
  const chunkSummary =
    runtimeMeta && runtimeMeta.chunkSummary
      ? runtimeMeta.chunkSummary
      : state.currentSnapshot && state.currentSnapshot.chunkSummary
        ? state.currentSnapshot.chunkSummary
        : null;
  const pageSummary =
    runtimeMeta && runtimeMeta.pageSummary
      ? {
          ...(state.currentSnapshot && state.currentSnapshot.pageSummary ? state.currentSnapshot.pageSummary : {}),
          ...runtimeMeta.pageSummary
        }
      : state.currentSnapshot && state.currentSnapshot.pageSummary
        ? state.currentSnapshot.pageSummary
        : null;
  const pageWindow =
    state.currentSnapshot && state.currentSnapshot.renderPacket
      ? state.currentSnapshot.renderPacket.pageWindow || null
      : null;
  const layoutLines =
    state.currentSnapshot &&
    state.currentSnapshot.renderPacket &&
    state.currentSnapshot.renderPacket.layout &&
    Array.isArray(state.currentSnapshot.renderPacket.layout.lines)
      ? state.currentSnapshot.renderPacket.layout.lines
      : [];
  const visibleLines = pageWindow
    ? layoutLines.filter((line) => line && line.lineIndex >= pageWindow.lineStartIndex && line.lineIndex <= pageWindow.lineEndIndex)
    : [];
  const layoutFingerprint = visibleLines.length
    ? visibleLines
        .slice(0, 4)
        .map((line) => [
          Number(line.lineIndex || 0),
          Math.round(Number(line.x || 0)),
          Math.round(Number(line.y || 0)),
          Math.round(Number(line.height || 0)),
          Number(line.pageSlot || 0),
          Number(line.columnIndex || 0)
        ].join(":"))
        .join("|")
    : "";
  return {
    ready: !!state.currentSnapshot,
    integrationMode: !!state.integrationMode,
    embeddedMode: isEmbeddedOldShellMode(),
    readerMode: state.integrationMode ? "protected" : "dev-shell",
    bookId: state.bookSummary ? state.bookSummary.bookId : "",
    bookTitle: state.bookSummary && state.bookSummary.metadata ? state.bookSummary.metadata.title || "" : "",
    bookAuthor: getCurrentBookAuthor(),
    coverUrl: getCurrentBookCoverUrl(),
    chapterLabel: chunkSummary ? chunkSummary.tocLabel || "" : "",
    chunkLabel: chunkSummary ? `${chunkSummary.chunkId} (${chunkSummary.order}/${chunkSummary.total})` : "",
    chunkOrder: chunkSummary ? Number(chunkSummary.order || 0) : 0,
    chunkTotal: chunkSummary ? Number(chunkSummary.total || 0) : 0,
    localPageLabel: pageSummary ? pageSummary.pageLabel || "" : "",
    pageLabel: pageSummary ? pageSummary.pageLabel || "" : "",
    globalPageLabel: pageSummary ? pageSummary.globalPageLabel || pageSummary.pageLabel || "" : "",
    globalPageIndex: pageSummary ? Number(pageSummary.globalPageIndex || 0) : 0,
    globalPageCount: pageSummary ? Number(pageSummary.globalPageCount || 0) : 0,
    restoreToken: state.currentSnapshot ? state.currentSnapshot.restoreToken || "" : "",
    currentPageLineCount:
      pageWindow
        ? Math.max(
            0,
            Number(pageWindow.lineEndIndex || 0) -
              Number(pageWindow.lineStartIndex || 0) +
              1
          )
        : 0,
    currentPageLineRange: pageWindow
      ? `${Number(pageWindow.lineStartIndex || 0)}..${Number(pageWindow.lineEndIndex || 0)}`
      : "",
    pageLayoutFingerprint: layoutFingerprint,
    globalOffsetLabel: pageSummary ? pageSummary.globalOffsetLabel || "" : "",
    pageGlobalStartOffset: pageSummary ? Number(pageSummary.globalStartOffset || 0) : 0,
    pageGlobalEndOffset: pageSummary ? Number(pageSummary.globalEndOffset || 0) : 0,
    fontScale:
      runtimeMeta && runtimeMeta.typographySummary
        ? Number(runtimeMeta.typographySummary.fontScale || 1)
        : state.fontScale,
    viewportWidth:
      runtimeMeta && runtimeMeta.typographySummary
        ? Number(runtimeMeta.typographySummary.viewportWidth || getViewportWidth())
        : getViewportWidth(),
    viewportHeight:
      runtimeMeta && runtimeMeta.typographySummary
        ? Number(runtimeMeta.typographySummary.viewportHeight || getViewportHeight())
        : getViewportHeight(),
    columnCount:
      runtimeMeta && runtimeMeta.typographySummary
        ? Number(runtimeMeta.typographySummary.columnCount || 1)
        : 1,
    focusedAnnotationId:
      runtimeMeta && runtimeMeta.focusSummary
        ? runtimeMeta.focusSummary.annotationId || ""
        : "",
    focusHighlightCount:
      runtimeMeta && runtimeMeta.focusSummary
        ? Number(runtimeMeta.focusSummary.highlightCount || 0)
        : 0,
    canGoPrev: !!(
      state.currentSnapshot &&
      (
        (state.currentSnapshot.pageSummary && state.currentSnapshot.pageSummary.pageIndex > 0) ||
        (state.currentSnapshot.chunkSummary && state.currentSnapshot.chunkSummary.order > 1)
      )
    ),
    canGoNext: !!(
      state.currentSnapshot &&
      (
        (state.currentSnapshot.pageSummary && state.currentSnapshot.pageSummary.pageIndex < (state.currentSnapshot.pageSummary.pageCount - 1)) ||
        (state.currentSnapshot.chunkSummary && state.currentSnapshot.chunkSummary.order < state.currentSnapshot.chunkSummary.total)
      )
    ),
    selectionActive: !!(state.currentSnapshot && state.currentSnapshot.rangeDescriptor),
    selectionBounds: getSelectionBounds(),
    selectedChars:
      state.currentSnapshot && state.currentSnapshot.selectionResult
        ? Number(state.currentSnapshot.selectionResult.selectedChars || 0)
        : 0,
    selectedLines:
      state.currentSnapshot && state.currentSnapshot.selectionResult
        ? Number(state.currentSnapshot.selectionResult.selectedLines || 0)
        : 0,
    selectedBlocks:
      state.currentSnapshot && state.currentSnapshot.selectionResult
        ? Number(state.currentSnapshot.selectionResult.selectedBlocks || 0)
        : 0,
    annotationCount: annotations.length,
    annotations: annotations.map((annotation) => ({
      annotationId: annotation.annotationId,
      type: annotation.type,
      noteText: annotation.noteText || "",
      globalRange: `${annotation.rangeDescriptor.start.globalOffset}..${annotation.rangeDescriptor.end.globalOffset}`
    })),
    tocItems: (state.tocItems || []).map((item) => ({
      id: item.id,
      label: item.label || item.id,
      href: item.href || "",
      active: !!(runtimeMeta && runtimeMeta.chunkSummary && runtimeMeta.chunkSummary.tocId && runtimeMeta.chunkSummary.tocId === item.id)
    })),
    statusText: elements.status ? elements.status.textContent || "" : "",
    theme: state.theme,
    searchSummary:
      runtimeMeta && runtimeMeta.searchSummary
        ? {
            active: !!runtimeMeta.searchSummary.active,
            query: runtimeMeta.searchSummary.query || "",
            totalMatches: Number(runtimeMeta.searchSummary.totalMatches || 0),
            currentMatch: Number(runtimeMeta.searchSummary.currentMatch || 0)
          }
        : { active: false, query: "", totalMatches: 0, currentMatch: 0 },
    driveStatus: {
      transport: state.driveState.transportStatus,
      configured: !!state.driveState.configured,
      authorized: !!state.driveState.authorized
    },
    runtimeMeta: state.rolloutStatus
      ? {
          rolloutDecision: state.rolloutStatus.action,
          eligibilityStatus: state.rolloutEligibility ? state.rolloutEligibility.status : "n/a",
          pilotStatus: state.pilotStatus ? state.pilotStatus.status : "n/a"
        }
      : null
  };
}

function notifyEmbeddedBridge() {
  if (!isEmbeddedOldShellMode()) return;
  const summary = buildBridgeSummary();
  window.__PROTECTED_READER_BRIDGE__ = window.__PROTECTED_READER_BRIDGE__ || {};
  window.__PROTECTED_READER_BRIDGE__.getSummary = buildBridgeSummary;
  try {
    window.parent.postMessage(
      {
        channel: "protected-old-shell-v1",
        type: "state-changed",
        summary
      },
      window.location.origin
    );
  } catch (error) {}
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

function getViewportWidth() {
  return Math.max(420, Math.round((elements.readerFrame ? elements.readerFrame.clientWidth : 0) || 760));
}

function getViewportConfig() {
  return {
    viewportWidth: getViewportWidth(),
    viewportHeight: getViewportHeight()
  };
}

function getSelectionBounds() {
  const highlights =
    state.currentSnapshot &&
    state.currentSnapshot.renderPacket &&
    Array.isArray(state.currentSnapshot.renderPacket.selectionHighlights)
      ? state.currentSnapshot.renderPacket.selectionHighlights
      : [];
  if (!highlights.length) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const highlight of highlights) {
    if (!highlight) continue;
    left = Math.min(left, Number(highlight.x || 0));
    top = Math.min(top, Number(highlight.y || 0));
    right = Math.max(right, Number(highlight.x || 0) + Number(highlight.width || 0));
    bottom = Math.max(bottom, Number(highlight.y || 0) + Number(highlight.height || 0));
  }
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
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
        ...getViewportConfig(),
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
        ...getViewportConfig(),
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
          ...getViewportConfig(),
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
        ["Rollout enabled", state.rolloutStatus && state.rolloutStatus.rolloutEnabled ? "yes" : "no"],
        ["Eligibility status", state.rolloutEligibility ? state.rolloutEligibility.status : "n/a"],
        ["Rollout decision", state.rolloutStatus ? state.rolloutStatus.action : "n/a"],
        ["Pilot status", state.pilotStatus ? state.pilotStatus.status : "n/a"],
        ["Pilot certified", state.pilotStatus && state.pilotStatus.pilotCertified ? "yes" : "no"],
        ["Protected artifact", state.rolloutStatus && state.rolloutStatus.artifactAvailable ? "yes" : "no"],
        ["Worker available", state.rolloutStatus && state.rolloutStatus.workerAvailable ? "yes" : "no"],
        ["Book allowed", state.rolloutStatus && state.rolloutStatus.bookAllowed ? "yes" : "no"],
        ["Fallback reason", state.rolloutStatus && state.rolloutStatus.fallbackReason ? state.rolloutStatus.fallbackReason : "none"],
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
    ["Search", runtimeMeta.searchSummary && runtimeMeta.searchSummary.active ? `${runtimeMeta.searchSummary.currentMatch}/${runtimeMeta.searchSummary.totalMatches}` : "inactive"],
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
    ["Rollout enabled", state.rolloutStatus && state.rolloutStatus.rolloutEnabled ? "yes" : "no"],
    ["Eligibility status", state.rolloutEligibility ? state.rolloutEligibility.status : "n/a"],
    ["Rollout decision", state.rolloutStatus ? state.rolloutStatus.action : "n/a"],
    ["Pilot status", state.pilotStatus ? state.pilotStatus.status : "n/a"],
    ["Pilot certified", state.pilotStatus && state.pilotStatus.pilotCertified ? "yes" : "no"],
    ["Pilot recommended", state.pilotStatus && state.pilotStatus.recommended ? "yes" : "no"],
    ["Pilot scope", state.pilotStatus ? state.pilotStatus.userScope : "n/a"],
    ["Book allowed", state.rolloutStatus && state.rolloutStatus.bookAllowed ? "yes" : "no"],
    ["Allowlisted", state.rolloutStatus && state.rolloutStatus.allowlisted ? "yes" : "no"],
    ["Denylisted", state.rolloutStatus && state.rolloutStatus.denylisted ? "yes" : "no"],
    ["Protected artifact", state.rolloutStatus && state.rolloutStatus.artifactAvailable ? "yes" : "no"],
    ["Worker available", state.rolloutStatus && state.rolloutStatus.workerAvailable ? "yes" : "no"],
    ["Fallback reason", state.rolloutStatus && state.rolloutStatus.fallbackReason ? state.rolloutStatus.fallbackReason : "none"],
    ["Rollout warnings", state.rolloutStatus && state.rolloutStatus.warnings && state.rolloutStatus.warnings.length ? state.rolloutStatus.warnings.join(", ") : "none"],
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
    ["Drive transport", state.driveState.transportStatus],
    ["Drive configured", state.driveState.configured ? "yes" : "no"],
    ["Drive authorized", state.driveState.authorized ? "yes" : "no"],
    ["Drive remote file", state.driveState.remotePresent ? "yes" : "no"],
    ["Drive file id", state.driveState.remoteFileId || "none"],
    ["Drive modified", state.driveState.remoteModifiedAt || "n/a"],
    ["Drive freshness", state.driveState.freshness || "unknown"],
    ["Drive upload", state.driveState.lastUploadResult || "none"],
    ["Drive download", state.driveState.lastDownloadResult || "none"],
    ["Drive apply", state.driveState.lastApplyResult || "none"],
    ["Drive warning", state.driveState.lastWarning || "none"],
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
  notifyEmbeddedBridge();
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
  if (snapshot.runtimeMeta && snapshot.runtimeMeta.typographySummary) {
    state.fontScale = Number(snapshot.runtimeMeta.typographySummary.fontScale || 1);
  }
  persistReadingStateFromSnapshot(snapshot).catch((error) => {
    console.error(error);
  });
  renderBookMeta();
  renderToc();
  renderSelectionMeta();
  renderAnnotationList();
  refreshCanvas();
  notifyEmbeddedBridge();
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
    ...getViewportConfig(),
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
  state.driveState = createInitialProtectedDriveState();
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
  if (!isDriveUiDisabled()) {
    try {
      await refreshDriveStatus({ interactive: false });
    } catch (error) {
      console.error(error);
    }
  } else {
    state.driveState = mergeProtectedDriveState(state.driveState, {
      transportStatus: "disabled",
      configured: false,
      authorized: false,
      remotePresent: false,
      lastWarning: "drive-disabled-for-embedded-old-shell"
    });
    renderRuntimeMeta();
  }
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
    ...getViewportConfig(),
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
  try {
    await navigator.clipboard.writeText(result.clipboardText);
  } catch (error) {
    if (!isAutomationSafeMode()) throw error;
  }
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
    ...getViewportConfig(),
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
      ...getViewportConfig(),
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

async function refreshDriveStatus({ interactive = false } = {}) {
  if (isDriveUiDisabled()) {
    state.driveState = mergeProtectedDriveState(state.driveState, {
      configured: false,
      authorized: false,
      remotePresent: false,
      transportStatus: "disabled",
      lastWarning: "drive-disabled-for-embedded-old-shell"
    });
    renderRuntimeMeta();
    return state.driveState;
  }
  if (!state.bookSummary || !state.annotationRepository) {
    state.driveState = mergeProtectedDriveState(state.driveState, {
      transportStatus: "idle"
    });
    renderRuntimeMeta();
    return state.driveState;
  }
  const transport = ensureDriveTransport();
  state.driveState = mergeProtectedDriveState(state.driveState, {
    transportStatus: interactive ? "connecting" : "checking",
    lastWarning: ""
  });
  renderRuntimeMeta();
  try {
    const result = await transport.getRemoteStatus({
      bookId: state.bookSummary.bookId,
      userScope: state.annotationRepository.userScope,
      localUpdatedAt: getLocalStateUpdatedAt(),
      interactive
    });
    state.driveState = mergeProtectedDriveState(state.driveState, {
      configured: !!(result.availability && result.availability.configured),
      authorized: !!(result.availability && result.availability.authorized),
      transportStatus:
        result.availability && !result.availability.configured
          ? "unavailable"
          : result.availability && !result.availability.authorized
            ? "unauthorized"
            : "idle",
      remotePresent: !!(result.remoteFile && result.remoteFile.fileId),
      remoteFileId: result.remoteFile && result.remoteFile.fileId ? result.remoteFile.fileId : "",
      remoteFileName: result.remoteFile && result.remoteFile.name ? result.remoteFile.name : "",
      remoteModifiedAt: result.remoteFile && result.remoteFile.modifiedAt ? result.remoteFile.modifiedAt : "",
      remoteSize: result.remoteFile && result.remoteFile.size ? result.remoteFile.size : 0,
      freshness: result.freshness || "unknown",
      lastWarning: ""
    });
    renderRuntimeMeta();
    return state.driveState;
  } catch (error) {
    state.driveState = mergeProtectedDriveState(state.driveState, {
      transportStatus: "error",
      lastWarning: error && error.message ? error.message : "Drive status check failed."
    });
    renderRuntimeMeta();
    throw error;
  }
}

async function uploadSyncFileToDrive() {
  if (isDriveUiDisabled()) throw new Error("Drive transport is disabled for this protected shell mode.");
  if (!state.annotationRepository || !state.bookSummary) throw new Error("Nothing is loaded yet.");
  const transport = ensureDriveTransport();
  const syncTransport = await state.annotationRepository.exportSyncTransport(state.bookSummary.bookId);
  state.currentSyncTransport = syncTransport;
  state.currentHandoffState = syncTransport.handoffState;
  setTextareaValue(elements.annotationImport, syncTransport.serializedSyncFile);
  setTextareaValue(elements.handoffState, syncTransport.serializedHandoffState);
  state.driveState = mergeProtectedDriveState(state.driveState, {
    transportStatus: "uploading",
    lastWarning: ""
  });
  renderRuntimeMeta();
  const result = await transport.uploadSyncFile({
    syncTransport,
    interactive: true,
    localUpdatedAt: getLocalStateUpdatedAt()
  });
  state.driveState = mergeProtectedDriveState(state.driveState, {
    configured: true,
    authorized: true,
    transportStatus: "uploaded",
    remotePresent: true,
    remoteFileId: result.remoteFile.fileId,
    remoteFileName: result.remoteFile.name,
    remoteModifiedAt: result.remoteFile.modifiedAt,
    remoteSize: result.remoteFile.size,
    freshness: result.freshness || "same",
    lastUploadResult: `${result.action}:${result.remoteFile.fileId}`,
    lastWarning: ""
  });
  renderRuntimeMeta();
  setStatus(`Drive ${result.action}: ${result.remoteFile.name}.`, "ok");
  return result;
}

async function downloadSyncFileFromDrive() {
  if (isDriveUiDisabled()) throw new Error("Drive transport is disabled for this protected shell mode.");
  if (!state.annotationRepository || !state.bookSummary) throw new Error("Nothing is loaded yet.");
  const transport = ensureDriveTransport();
  state.driveState = mergeProtectedDriveState(state.driveState, {
    transportStatus: "downloading",
    lastWarning: ""
  });
  renderRuntimeMeta();
  const result = await transport.downloadSyncFile({
    bookId: state.bookSummary.bookId,
    userScope: state.annotationRepository.userScope,
    bookFingerprint: state.annotationRepository.persistenceManager.bookFingerprint,
    localUpdatedAt: getLocalStateUpdatedAt(),
    interactive: true
  });
  state.driveState = mergeProtectedDriveState(state.driveState, {
    configured: true,
    authorized: true,
    transportStatus: result.compatibility.compatible ? "downloaded" : "error",
    remotePresent: !!(result.remoteFile && result.remoteFile.fileId),
    remoteFileId: result.remoteFile && result.remoteFile.fileId ? result.remoteFile.fileId : "",
    remoteFileName: result.remoteFile && result.remoteFile.name ? result.remoteFile.name : "",
    remoteModifiedAt: result.remoteFile && result.remoteFile.modifiedAt ? result.remoteFile.modifiedAt : "",
    remoteSize: result.remoteFile && result.remoteFile.size ? result.remoteFile.size : 0,
    freshness: result.freshness || "unknown",
    lastDownloadResult: result.compatibility.status,
    pendingRemoteSyncFile: result.serializedSyncFile || null,
    pendingRemoteHandoffState: result.handoffState || null,
    lastWarning: result.compatibility.warning || ""
  });
  if (result.serializedSyncFile) {
    setTextareaValue(elements.annotationImport, result.serializedSyncFile);
  }
  if (result.handoffState) {
    setTextareaValue(elements.handoffState, JSON.stringify(result.handoffState, null, 2));
  }
  state.fileSyncCompatibilityStatus = result.compatibility.status;
  renderRuntimeMeta();
  if (!result.compatibility.compatible) {
    setStatus(result.compatibility.warning || "Downloaded Drive state is incompatible.", "warning");
    return result;
  }
  setStatus("Downloaded protected sync file from Google Drive.", "ok");
  return result;
}

async function applyDownloadedDriveState() {
  if (isDriveUiDisabled()) throw new Error("Drive transport is disabled for this protected shell mode.");
  const payload = state.driveState.pendingRemoteSyncFile || getTextareaValue(elements.annotationImport);
  if (!payload) throw new Error("Download a Drive sync file before applying it.");
  const handoffState = state.driveState.pendingRemoteHandoffState || (getTextareaValue(elements.handoffState)
    ? normalizeProtectedSyncTransportHandoff(getTextareaValue(elements.handoffState))
    : null);
  await importAnnotations();
  state.driveState = mergeProtectedDriveState(state.driveState, {
    transportStatus: "applied",
    lastApplyResult: "applied",
    pendingRemoteSyncFile: null,
    pendingRemoteHandoffState: null,
    lastWarning: ""
  });
  renderRuntimeMeta();
  setStatus("Applied downloaded Drive state.", "ok");
  return handoffState;
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

async function bridgeNextPage() {
  const snapshot = await state.workerClient.goToNextPage({
    ...getViewportConfig(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgePrevPage() {
  const snapshot = await state.workerClient.goToPrevPage({
    ...getViewportConfig(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeGoToToc(tocId) {
  const snapshot = await state.workerClient.goToToc({
    tocId,
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeGoToAnnotation(annotationId) {
  if (!state.annotationStore) throw new Error("Annotations are unavailable.");
  const annotation = state.annotationStore.get(annotationId);
  if (!annotation) throw new Error(`Unknown annotation ${annotationId}.`);
  const snapshot = await state.workerClient.goToAnnotation({
    rangeDescriptor: {
      ...annotation.rangeDescriptor,
      annotationId: annotation.annotationId
    },
    annotations: getCurrentAnnotations()
  });
  state.selectedAnnotationId = annotation.annotationId;
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeRestoreFromToken(token) {
  const snapshot = await state.workerClient.restoreFromToken({
    token: String(token || ""),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeCopySelection() {
  await handleCopySelection();
  return buildBridgeSummary();
}

async function bridgeCreateHighlight() {
  await createHighlightFromSelection();
  return buildBridgeSummary();
}

async function bridgeAddNoteToSelection(noteText = "") {
  elements.noteInput.value = String(noteText || "");
  await addNoteToSelection();
  return buildBridgeSummary();
}

async function bridgeSelectAutomationSample() {
  if (!isAutomationSafeMode()) {
    throw new Error("Automation selection is unavailable outside automation-safe mode.");
  }
  const snapshot = await state.workerClient.selectAutomationSample({
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSearchBook(query = "") {
  const snapshot = await state.workerClient.searchBook({
    query: String(query || ""),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSearchNextResult() {
  const snapshot = await state.workerClient.searchNextResult({
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSearchPrevResult() {
  const snapshot = await state.workerClient.searchPrevResult({
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeClearSearch() {
  const snapshot = await state.workerClient.clearSearch({
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSetTheme(theme = "light") {
  applyEmbeddedTheme(theme);
  return buildBridgeSummary();
}

async function bridgeSetFontScale(fontScale = 1) {
  const snapshot = await state.workerClient.setFontScale({
    fontScale,
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

function installEmbeddedBridge() {
  window.__PROTECTED_READER_BRIDGE__ = {
    getSummary: buildBridgeSummary,
    nextPage: bridgeNextPage,
    prevPage: bridgePrevPage,
    goToToc: bridgeGoToToc,
    goToAnnotation: bridgeGoToAnnotation,
    restoreFromToken: bridgeRestoreFromToken,
    copySelection: bridgeCopySelection,
    selectAutomationSample: bridgeSelectAutomationSample,
    createHighlight: bridgeCreateHighlight,
    addNoteToSelection: bridgeAddNoteToSelection,
    searchBook: bridgeSearchBook,
    searchNextResult: bridgeSearchNextResult,
    searchPrevResult: bridgeSearchPrevResult,
    clearSearch: bridgeClearSearch,
    setTheme: bridgeSetTheme,
    setFontScale: bridgeSetFontScale
  };
  notifyEmbeddedBridge();
}

async function boot() {
  state.artifactRoot = getArtifactRootFromLocation();
  state.renderMode = "shape";
  state.metricsMode = getMetricsModeFromLocation(state.renderMode);
  state.debugGeometry = getDebugGeometryFromLocation();
  applyEmbeddedTheme("light");
  syncArtifactInput();
  if (isEmbeddedOldShellMode()) installEmbeddedBridge();

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
        ...getViewportConfig(),
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
        ...getViewportConfig(),
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
        ...getViewportConfig(),
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
        ...getViewportConfig(),
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

  if (elements.checkDriveStatus) {
    elements.checkDriveStatus.addEventListener("click", async () => {
      try {
        await refreshDriveStatus({ interactive: true });
        setStatus("Checked Google Drive transport status.", "ok");
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.uploadDriveFile) {
    elements.uploadDriveFile.addEventListener("click", async () => {
      try {
        await uploadSyncFileToDrive();
      } catch (error) {
        console.error(error);
        state.driveState = mergeProtectedDriveState(state.driveState, {
          transportStatus: "error",
          lastWarning: error && error.message ? error.message : "Drive upload failed."
        });
        renderRuntimeMeta();
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.downloadDriveFile) {
    elements.downloadDriveFile.addEventListener("click", async () => {
      try {
        await downloadSyncFileFromDrive();
      } catch (error) {
        console.error(error);
        state.driveState = mergeProtectedDriveState(state.driveState, {
          transportStatus: "error",
          lastWarning: error && error.message ? error.message : "Drive download failed."
        });
        renderRuntimeMeta();
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.applyDriveFile) {
    elements.applyDriveFile.addEventListener("click", async () => {
      try {
        await applyDownloadedDriveState();
      } catch (error) {
        console.error(error);
        state.driveState = mergeProtectedDriveState(state.driveState, {
          transportStatus: "error",
          lastWarning: error && error.message ? error.message : "Drive apply failed."
        });
        renderRuntimeMeta();
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
    if (event.button !== 0) return;
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
    if (event.button !== 0) return;
    handleMouseUp(event).catch((error) => {
      console.error(error);
      setStatus(error.message || String(error), "error");
    });
  });

  let viewportSyncTimer = null;
  const scheduleViewportSync = () => {
    if (!state.currentSnapshot || state.workerClient.mode !== "worker") return;
    if (viewportSyncTimer) window.clearTimeout(viewportSyncTimer);
    viewportSyncTimer = window.setTimeout(async () => {
      viewportSyncTimer = null;
      try {
        const snapshot = await state.workerClient.updateRenderConfig({
          renderMode: "shape",
          metricsMode: state.metricsMode,
          fontScale: state.fontScale,
          ...getViewportConfig(),
          annotations: getCurrentAnnotations()
        });
        applySnapshot(snapshot);
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    }, 120);
  };
  window.addEventListener("resize", scheduleViewportSync, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleViewportSync, { passive: true });
  }
  if (typeof ResizeObserver !== "undefined" && elements.readerFrame) {
    const readerFrameObserver = new ResizeObserver(() => {
      scheduleViewportSync();
    });
    readerFrameObserver.observe(elements.readerFrame);
  }

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
