import {
  buildProtectedSyncTransport,
  createProtectedAnnotationRepository,
  createProtectedDriveTransport,
  createProtectedReaderRuntimeState,
  DEFAULT_PROTECTED_READER_ARTIFACT as DEFAULT_ARTIFACT,
  downloadJsonFile,
  escapeProtectedReaderHtml as escapeHtml,
  isProtectedReaderAutomationSafeMode,
  isProtectedReaderDriveUiDisabled,
  isProtectedReaderEmbeddedShellMode,
  loadProtectedBook,
  loadProtectedChunkModel,
  normalizeProtectedReaderFontMode as normalizeFontMode,
  normalizeProtectedReaderGeneration as normalizeGeneration,
  normalizeProtectedSyncTransportHandoff,
  parseRestoreToken,
  protectedReaderEntryConfig as entryConfig,
  readTextFile,
  reconstructCrossChunkRangeText,
  reconstructVisibleWindow,
  renderChunkToCanvas,
  resolveProductionPayloadFromRoute,
  serializeRangeDescriptor
} from "./protected-reader-runtime-core.js";
import {
  createProtectedReaderHostBridge
} from "./protected-reader-host-bridge.js?v=20260422-v5-image-viewer-2";
import {
  createProtectedReaderEventChannel,
  PROTECTED_READER_CANONICAL_EVENT_NAMES
} from "./protected-reader-events.js";
import { createInitialProtectedDriveState, mergeProtectedDriveState } from "../runtime/protected-drive-state.js";
import { extractReadingStateFromBundle } from "../runtime/protected-reading-state-store.js";

// Harness/dev shell DOM wiring stays here. Runtime state is owned by protected-reader-runtime-core.js.
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
  importReportJson: document.querySelector("#import-report-json"),
  syncFileInput: document.querySelector("#sync-file-input"),
  annotationCount: document.querySelector("#annotation-count"),
  annotationList: document.querySelector("#annotation-list"),
  clearSelection: document.querySelector("#clear-selection"),
  copySelection: document.querySelector("#copy-selection"),
  canvas: document.querySelector("#reader-canvas"),
  overlayCanvas: document.querySelector("#overlay-canvas"),
  mediaLayer: document.querySelector("#reader-media-layer"),
  readerFrame: document.querySelector(".reader-frame")
};

const state = createProtectedReaderRuntimeState();
state.footnoteHoverToken = 0;
state.footnoteHoverPoint = null;
state.footnoteHoverScheduled = false;
const readerContractEvents = createProtectedReaderEventChannel({
  onEmit(eventName, payload) {
    try {
      window.__PROTECTED_READER_EVENT_HISTORY__ = readerContractEvents.getHistory();
    } catch (_error) {}
    if (!isEmbeddedProtectedShellMode()) return;
    const renderHostMode =
      state && state.entryConfig && String(state.entryConfig.renderHost || "").trim().toLowerCase() === "direct"
        ? "direct"
        : "iframe";
    if (renderHostMode === "direct") return;
    try {
      window.parent.postMessage(
        {
          channel: "protected-shell-v1",
          type: "reader-event",
          eventName,
          payload
        },
        window.location.origin
      );
    } catch (_error) {}
  }
});

window.__PROTECTED_READER_EVENTS__ = readerContractEvents;

function ensureMediaLayer() {
  if (elements.mediaLayer) return elements.mediaLayer;
  if (!elements.readerFrame) {
    elements.readerFrame =
      document.querySelector(".reader-frame") ||
      (elements.canvas && elements.canvas.parentElement ? elements.canvas.parentElement : null) ||
      (elements.overlayCanvas && elements.overlayCanvas.parentElement ? elements.overlayCanvas.parentElement : null);
  }
  if (!elements.readerFrame) return null;
  const layer = document.createElement("div");
  layer.id = "reader-media-layer";
  layer.style.position = "absolute";
  layer.style.inset = "0";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "1";
  layer.style.overflow = "hidden";
  elements.readerFrame.append(layer);
  elements.mediaLayer = layer;
  return layer;
}

function isEmbeddedProtectedShellMode() {
  return isProtectedReaderEmbeddedShellMode(state);
}

function isProtectedShellHostMode() {
  const shellMode = state && state.entryConfig
    ? String(state.entryConfig.shellMode || "").trim().toLowerCase()
    : "";
  return isEmbeddedProtectedShellMode() || shellMode === "protected-shell";
}

function isDriveUiDisabled() {
  return isProtectedReaderDriveUiDisabled(state);
}

function isAutomationSafeMode() {
  return isProtectedReaderAutomationSafeMode(state);
}

if (isEmbeddedProtectedShellMode()) {
  document.documentElement.dataset.shellMode = "embedded-protected-shell";
  document.body.dataset.shellMode = "embedded-protected-shell";
  document.body.dataset.driveMode = state.entryConfig && state.entryConfig.driveMode ? state.entryConfig.driveMode : "full";
}

function supportsPointerEvents() {
  return typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
}

function installNativeToolbarBlock() {
  const block = (event) => {
    try {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation && event.stopImmediatePropagation();
    } catch (_error) {}
    return false;
  };
  try { document.addEventListener("contextmenu", block, true); } catch (_error) {}
  try { window.addEventListener("contextmenu", block, true); } catch (_error) {}
  try { document.addEventListener("longpress", block, true); } catch (_error) {}
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

function getCoverLookupCandidates() {
  const params = new URLSearchParams(window.location.search || "");
  const metadataBookId =
    state.bookSummary && state.bookSummary.bookId ? String(state.bookSummary.bookId).trim() : "";
  const routeBookId = String(params.get("id") || "").trim();
  const candidates = [
    String(params.get("protectedCanonicalBookId") || "").trim(),
    String(params.get("canonicalBookId") || "").trim(),
    String(params.get("storageBookId") || "").trim(),
    metadataBookId,
    routeBookId
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function getBookLocationsShardPath(bookId) {
  const digits = String(bookId || "").replace(/\D+/g, "");
  if (!digits) return "";
  const shard = digits.slice(-2).padStart(2, "0");
  return `/books/api/book-locations/${shard}.json`;
}

function normalizeCoverAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const protectedArtifactMatch = raw.match(/^(?:https?:\/\/[^/]+)?\/reader_render_v5\/artifacts\/protected-books\/(\d+)\//);
  if (protectedArtifactMatch) {
    return raw.replace(
      /^(?:https?:\/\/[^/]+)?\/reader_render_v5\/artifacts\/protected-books\/(\d+)\//,
      "/books/protected-content/$1/"
    );
  }
  try {
    return new URL(raw, window.location.origin).href;
  } catch (_error) {
    return raw;
  }
}

async function resolveCoverFromBookLocations(bookId) {
  const shardPath = getBookLocationsShardPath(bookId);
  if (!shardPath) return "";
  const response = await fetch(shardPath, { credentials: "same-origin" });
  if (!response.ok) return "";
  const payload = await response.json();
  const items = payload && payload.items ? payload.items : null;
  const entry = items && items[String(bookId)] ? items[String(bookId)] : null;
  const cover = entry && entry.cover ? String(entry.cover).trim() : "";
  return cover || "";
}

async function ensureCurrentBookCoverResolved() {
  const hinted = getCoverHintFromLocation();
  if (hinted) {
    state.resolvedCoverUrl = normalizeCoverAssetUrl(hinted);
    state.resolvedCoverLookupKey = `hint:${hinted}`;
    return state.resolvedCoverUrl;
  }
  const candidates = getCoverLookupCandidates();
  const lookupKey = candidates.join("|");
  if (!lookupKey) {
    state.resolvedCoverUrl = "";
    state.resolvedCoverLookupKey = "";
    return "";
  }
  if (state.resolvedCoverLookupKey === lookupKey && state.resolvedCoverUrl) {
    return state.resolvedCoverUrl;
  }
  state.resolvedCoverLookupKey = lookupKey;
  const run = (async () => {
    for (const candidate of candidates) {
      try {
        const resolved = await resolveCoverFromBookLocations(candidate);
        if (resolved) {
          const finalCover = normalizeCoverAssetUrl(resolved);
          if (state.resolvedCoverLookupKey === lookupKey && state.resolvedCoverUrl !== finalCover) {
            state.resolvedCoverUrl = finalCover;
            notifyEmbeddedBridge();
          }
          return finalCover;
        }
      } catch (error) {
        console.error(error);
      }
    }
    if (state.resolvedCoverLookupKey === lookupKey) {
      state.resolvedCoverUrl = "";
      notifyEmbeddedBridge();
    }
    return "";
  })();
  state.resolvedCoverLookupPromise = run;
  return run;
}

function getCurrentBookCoverUrl() {
  const hinted = getCoverHintFromLocation();
  if (hinted) return hinted;
  return state.resolvedCoverUrl || "";
}

function applyEmbeddedTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  document.body.dataset.theme = state.theme;
  refreshCanvas();
  emitReaderContractEventsFromSummary(buildBridgeSummary());
  notifyEmbeddedBridge();
}

function setStatus(message, tone = "idle") {
  elements.status.textContent = message;
  elements.status.dataset.state = tone;
  notifyEmbeddedBridge();
}

function setDlRows(container, rows) {
  if (!container) return;
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
    hostBridgeMode: getHostBridgeMode(),
    configGeneration: state.configGeneration,
    layoutGeneration: state.layoutGeneration,
    hostedMode: !!state.hostedMode,
    hostMode: state.hostedMode ? "reader_new" : "dev-shell",
    embeddedMode: isEmbeddedProtectedShellMode(),
    readerMode: state.hostedMode ? "protected" : "dev-shell",
    bookId: state.bookSummary ? state.bookSummary.bookId : "",
    bookTitle: state.bookSummary && state.bookSummary.metadata ? state.bookSummary.metadata.title || "" : "",
    bookAuthor: getCurrentBookAuthor(),
    metadata: state.bookSummary && state.bookSummary.metadata
      ? {
          languages: Array.isArray(state.bookSummary.metadata.languages)
            ? state.bookSummary.metadata.languages.filter(Boolean)
            : []
        }
      : { languages: [] },
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
    fontMode:
      runtimeMeta && runtimeMeta.typographySummary
        ? normalizeFontMode(runtimeMeta.typographySummary.fontMode || state.fontMode)
        : state.fontMode,
    supportedFontModes:
      state.protectedBook && state.protectedBook.artifactContract && Array.isArray(state.protectedBook.artifactContract.supportedFontModes)
        ? state.protectedBook.artifactContract.supportedFontModes.slice()
        : ["sans"],
    artifactContractKind:
      state.protectedBook && state.protectedBook.artifactContract
        ? state.protectedBook.artifactContract.kind || ""
        : "",
    runtimeFontMode:
      runtimeMeta && runtimeMeta.typographySummary
        ? normalizeFontMode(runtimeMeta.typographySummary.runtimeFontMode || runtimeMeta.typographySummary.fontMode || state.fontMode)
        : state.fontMode,
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
      quote:
        annotation && annotation.metadata && annotation.metadata.selectionQuote
          ? String(annotation.metadata.selectionQuote)
          : "",
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
            currentMatch: Number(runtimeMeta.searchSummary.currentMatch || 0),
            matches: Array.isArray(runtimeMeta.searchSummary.matches)
              ? runtimeMeta.searchSummary.matches.map((match) => ({
                  chunkIndex: Number(match.chunkIndex || 0),
                  chunkId: match.chunkId || "",
                  globalStartOffset: Number(match.globalStartOffset || 0),
                  globalEndOffset: Number(match.globalEndOffset || 0),
                  excerpt: escapeHtml(match.excerpt || ""),
                  globalPageLabel: match.globalPageLabel || "",
                  current: !!match.current
                }))
              : []
          }
        : { active: false, query: "", totalMatches: 0, currentMatch: 0, matches: [] },
    driveStatus: {
      transport: state.driveState.transportStatus,
      configured: !!state.driveState.configured,
      authorized: !!state.driveState.authorized
    },
    runtimeMeta: {
      rolloutDecision: state.rolloutStatus ? state.rolloutStatus.action : "",
      eligibilityStatus: state.rolloutEligibility ? state.rolloutEligibility.status : "n/a",
      pilotStatus: state.pilotStatus ? state.pilotStatus.status : "n/a",
      book: state.bookSummary
        ? {
            source: state.bookSummary.source || {},
            v4Compatibility: state.bookSummary.v4Compatibility || null
          }
        : null
    }
  };
}

function applyGenerationMeta(generationMeta = {}) {
  state.configGeneration = normalizeGeneration(generationMeta.configGeneration, state.configGeneration || 1);
  state.layoutGeneration = normalizeGeneration(generationMeta.layoutGeneration, state.layoutGeneration || 1);
}

function getGenerationPayload() {
  return {
    configGeneration: state.configGeneration,
    layoutGeneration: state.layoutGeneration
  };
}

function getSnapshotGenerations(snapshot) {
  const runtimeSummary =
    snapshot &&
    snapshot.runtimeMeta &&
    snapshot.runtimeMeta.generationSummary
      ? snapshot.runtimeMeta.generationSummary
      : null;
  return {
    configGeneration: normalizeGeneration(
      snapshot && snapshot.configGeneration,
      normalizeGeneration(runtimeSummary && runtimeSummary.configGeneration, 0)
    ),
    layoutGeneration: normalizeGeneration(
      snapshot && snapshot.layoutGeneration,
      normalizeGeneration(runtimeSummary && runtimeSummary.layoutGeneration, 0)
    )
  };
}

function isStaleSnapshot(snapshot) {
  const info = getSnapshotGenerations(snapshot);
  if (!info.configGeneration || !info.layoutGeneration) return false;
  if (info.configGeneration < state.configGeneration) return true;
  if (info.layoutGeneration < state.layoutGeneration) return true;
  if (info.configGeneration !== state.configGeneration) return true;
  if (info.layoutGeneration !== state.layoutGeneration) return true;
  return false;
}

function buildDebugLayoutState() {
  const layout =
    state.currentSnapshot &&
    state.currentSnapshot.renderPacket &&
    state.currentSnapshot.renderPacket.layout
      ? state.currentSnapshot.renderPacket.layout
      : null;
  const pageWindow =
    state.currentSnapshot &&
    state.currentSnapshot.renderPacket &&
    state.currentSnapshot.renderPacket.pageWindow
      ? state.currentSnapshot.renderPacket.pageWindow
      : null;
  if (!layout || !pageWindow || !Array.isArray(layout.lines)) {
    return {
      ready: false,
      lines: [],
      pageWindow: null,
      selectionHighlights: [],
      searchHighlights: [],
      focusHighlights: [],
      annotationHighlights: [],
      noteMarkers: []
    };
  }
  const renderPacket =
    state.currentSnapshot && state.currentSnapshot.renderPacket
      ? state.currentSnapshot.renderPacket
      : null;
  const lines = layout.lines
    .filter((line) => line && line.lineIndex >= pageWindow.lineStartIndex && line.lineIndex <= pageWindow.lineEndIndex)
    .map((line) => ({
      lineIndex: Number(line.lineIndex || 0),
      width: Number(line.width || 0),
      maxWidth: Number(line.maxWidth || 0),
      widthRatio: Number(line.maxWidth || 0) > 0 ? Number(line.width || 0) / Number(line.maxWidth || 1) : 0,
      x: Number(line.x || 0),
      y: Number(line.y || 0),
      height: Number(line.height || 0),
      fragmentCount: Array.isArray(line.fragments) ? line.fragments.length : 0,
      tokenKinds: Array.isArray(line.fragments) ? line.fragments.map((fragment) => String(fragment.tokenKind || "")) : [],
      fragments: Array.isArray(line.fragments)
        ? line.fragments.map((fragment) => ({
            x: Number(fragment.x || 0),
            y: Number(fragment.y || 0),
            width: Number(fragment.width || 0),
            height: Number(fragment.height || 0),
            startOffset: Number(fragment.startOffset || 0),
            endOffset: Number(fragment.endOffset || 0),
            tokenKind: String(fragment.tokenKind || ""),
            glyphCount: Number(fragment.glyphCount || 0),
            text: String(fragment.syntheticText || fragment.text || "")
          }))
        : [],
      preview: Array.isArray(line.fragments)
        ? line.fragments.map((fragment) => ({
            tokenKind: String(fragment.tokenKind || ""),
            width: Number(fragment.width || 0),
            glyphCount: Number(fragment.glyphCount || 0)
          }))
        : []
    }));
  return {
    ready: true,
    pageLabel: buildBridgeSummary().pageLabel,
    globalPageLabel: buildBridgeSummary().globalPageLabel,
    pageWindow: {
      left: Number(pageWindow.left || 0),
      top: Number(pageWindow.top || 0),
      width: Number(pageWindow.width || 0),
      height: Number(pageWindow.height || 0),
      lineStartIndex: Number(pageWindow.lineStartIndex || 0),
      lineEndIndex: Number(pageWindow.lineEndIndex || 0)
    },
    lines,
    selectionHighlights: Array.isArray(renderPacket && renderPacket.selectionHighlights)
      ? renderPacket.selectionHighlights.map((rect) => ({
          x: Number(rect && rect.x || 0),
          y: Number(rect && rect.y || 0) - Number(pageWindow.top || 0),
          width: Number(rect && rect.width || 0),
          height: Number(rect && rect.height || 0)
        }))
      : [],
    searchHighlights: Array.isArray(renderPacket && renderPacket.searchHighlights)
      ? renderPacket.searchHighlights.map((rect) => ({
          x: Number(rect && rect.x || 0),
          y: Number(rect && rect.y || 0) - Number(pageWindow.top || 0),
          width: Number(rect && rect.width || 0),
          height: Number(rect && rect.height || 0)
        }))
      : [],
    focusHighlights: Array.isArray(renderPacket && renderPacket.focusHighlights)
      ? renderPacket.focusHighlights.map((rect) => ({
          x: Number(rect && rect.x || 0),
          y: Number(rect && rect.y || 0) - Number(pageWindow.top || 0),
          width: Number(rect && rect.width || 0),
          height: Number(rect && rect.height || 0)
        }))
      : [],
    annotationHighlights: Array.isArray(renderPacket && renderPacket.annotationHighlights)
      ? renderPacket.annotationHighlights.map((rect) => ({
          x: Number(rect && rect.x || 0),
          y: Number(rect && rect.y || 0) - Number(pageWindow.top || 0),
          width: Number(rect && rect.width || 0),
          height: Number(rect && rect.height || 0)
        }))
      : [],
    noteMarkers: Array.isArray(renderPacket && renderPacket.noteMarkers)
      ? renderPacket.noteMarkers.map((marker) => ({
          x: Number(marker && marker.x || 0),
          y: Number(marker && marker.y || 0) - Number(pageWindow.top || 0),
          width: Number(marker && marker.width || 0),
          height: Number(marker && marker.height || 0)
        }))
      : []
  };
}

function notifyEmbeddedBridge() {
  return;
}

function emitReaderContractEventsFromSummary(summary, options = {}) {
  readerContractEvents.emitFromSummary(summary || buildBridgeSummary(), options);
}

function getHostBridgeMode() {
  return "direct";
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

function isPublicProtectedRoute() {
  return !!(entryConfig && entryConfig.readerNewRoute && entryConfig.readerNewRoute.publicProtectedRoute);
}

function syncLocationParams() {
  if (isPublicProtectedRoute()) return;
  const url = new URL(window.location.href);
  if (state.hostedMode && state.entryConfig && state.entryConfig.bookId) {
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
  if (elements.artifactInput) elements.artifactInput.value = state.artifactRoot;
  state.renderMode = "shape";
  if (elements.renderMode) elements.renderMode.value = "shape";
  if (elements.metricsMode) elements.metricsMode.value = state.metricsMode;
  if (elements.renderMode) elements.renderMode.disabled = true;
  const textModeOption = elements.renderMode ? elements.renderMode.querySelector('option[value="text"]') : null;
  if (textModeOption) textModeOption.disabled = true;
  if (elements.metricsMode) elements.metricsMode.disabled = false;
  if (elements.debugGeometry) elements.debugGeometry.checked = state.debugGeometry;
}

function getViewportHeight() {
  const frameHeight = Math.round((elements.readerFrame ? elements.readerFrame.clientHeight : 0) || 0);
  if (isProtectedShellHostMode()) {
    return Math.max(420, frameHeight || 720);
  }
  return Math.max(420, frameHeight - 40 || 720);
}

function getViewportWidth() {
  const frameWidth = Math.round((elements.readerFrame ? elements.readerFrame.clientWidth : 0) || 0);
  if (isProtectedShellHostMode()) {
    return Math.max(280, frameWidth || 760);
  }
  return Math.max(420, frameWidth || 760);
}

function getViewportConfig() {
  return {
    viewportWidth: getViewportWidth(),
    viewportHeight: getViewportHeight()
  };
}

function getSelectionBounds() {
  const pageWindow =
    state.currentSnapshot &&
    state.currentSnapshot.renderPacket &&
    state.currentSnapshot.renderPacket.pageWindow
      ? state.currentSnapshot.renderPacket.pageWindow
      : null;
  const pageTop = pageWindow ? Number(pageWindow.top || 0) : 0;
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
    top = Math.min(top, Number(highlight.y || 0) - pageTop);
    right = Math.max(right, Number(highlight.x || 0) + Number(highlight.width || 0));
    bottom = Math.max(bottom, Number(highlight.y || 0) - pageTop + Number(highlight.height || 0));
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

function ensureTurnPreviewRoot(direction) {
  const normalizedDirection = direction === "prev" ? "prev" : "next";
  const rootId = `protected-turn-preview-${normalizedDirection}`;
  let root = document.getElementById(rootId);
  if (root) return root;
  root = document.createElement("div");
  root.id = rootId;
  root.dataset.direction = normalizedDirection;
  root.dataset.ready = "0";
  root.setAttribute("aria-hidden", "true");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.visibility = "hidden";
  root.style.opacity = "0";
  root.style.pointerEvents = "none";
  root.style.overflow = "hidden";
  root.style.zIndex = "-1";
  (elements.readerFrame || document.body).append(root);
  return root;
}

function renderSnapshotIntoTurnPreview(snapshot, direction, previewKey = getTurnPreviewKey()) {
  const root = ensureTurnPreviewRoot(direction);
  root.replaceChildren();
  const runtimeMeta = snapshot && snapshot.runtimeMeta ? snapshot.runtimeMeta : null;
  const typographySummary = runtimeMeta && runtimeMeta.typographySummary ? runtimeMeta.typographySummary : null;
  const generationSummary = runtimeMeta && runtimeMeta.generationSummary ? runtimeMeta.generationSummary : null;
  if (!snapshot || !snapshot.renderPacket) {
    root.dataset.ready = "1";
    root.dataset.previewKey = previewKey;
    root.dataset.pageLabel = "";
    root.dataset.fontMode = state.fontMode;
    root.dataset.runtimeFontMode = state.fontMode;
    root.dataset.configGeneration = String(state.configGeneration || 0);
    root.dataset.layoutGeneration = String(state.layoutGeneration || 0);
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "protected-turn-preview-layer";
  wrap.style.position = "absolute";
  wrap.style.inset = "0";
  wrap.style.display = "block";
  wrap.style.overflow = "hidden";
  const canvas = document.createElement("canvas");
  const overlayCanvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  overlayCanvas.style.position = "absolute";
  overlayCanvas.style.top = "0";
  overlayCanvas.style.left = "0";
  renderChunkToCanvas({
    canvas,
    overlayCanvas,
    renderPacket: snapshot.renderPacket,
    debugGeometry: false,
    offscreenCanvasStatus: state.workerClient.offscreenCanvas === "available" ? "inactive" : "not-available"
  });
  wrap.append(canvas, overlayCanvas);
  root.append(wrap);
  root.dataset.ready = "1";
  root.dataset.previewKey = previewKey;
  root.dataset.fontMode = normalizeFontMode(
    typographySummary && typographySummary.fontMode ? typographySummary.fontMode : state.fontMode
  );
  root.dataset.runtimeFontMode = normalizeFontMode(
    typographySummary && typographySummary.runtimeFontMode
      ? typographySummary.runtimeFontMode
      : (typographySummary && typographySummary.fontMode ? typographySummary.fontMode : state.fontMode)
  );
  root.dataset.configGeneration = String(
    normalizeGeneration(snapshot && snapshot.configGeneration, normalizeGeneration(generationSummary && generationSummary.configGeneration, state.configGeneration))
  );
  root.dataset.layoutGeneration = String(
    normalizeGeneration(snapshot && snapshot.layoutGeneration, normalizeGeneration(generationSummary && generationSummary.layoutGeneration, state.layoutGeneration))
  );
  root.dataset.pageLabel =
    snapshot.pageSummary && snapshot.pageSummary.globalPageLabel
      ? String(snapshot.pageSummary.globalPageLabel)
      : snapshot.pageSummary && snapshot.pageSummary.pageLabel
        ? String(snapshot.pageSummary.pageLabel)
        : "";
}

function commitTurnPreview(snapshot, direction, previewKey) {
  const root = ensureTurnPreviewRoot(direction);
  renderSnapshotIntoTurnPreview(snapshot, direction, previewKey);
  return root;
}

function getTurnPreviewKey() {
  const summary = buildBridgeSummary();
  return [
    Number(summary.pageGlobalStartOffset || 0),
    Number(summary.chunkOrder || 0),
    summary.runtimeFontMode || summary.fontMode || state.fontMode,
    summary.theme || state.theme,
    Number(summary.viewportWidth || 0),
    Number(summary.viewportHeight || 0),
    Number(summary.configGeneration || state.configGeneration || 0),
    Number(summary.layoutGeneration || state.layoutGeneration || 0)
  ].join("|");
}

function isPreviewSnapshotStale(snapshot, expectedPreviewKey) {
  if (isStaleSnapshot(snapshot)) return true;
  return expectedPreviewKey !== getTurnPreviewKey();
}

async function refreshTurnPreview(direction, refreshKey) {
  if (!state.currentSnapshot || !isProtectedShellHostMode()) return;
  window.__PROTECTED_TURN_PREVIEW_DEBUG__ = window.__PROTECTED_TURN_PREVIEW_DEBUG__ || {};
  window.__PROTECTED_TURN_PREVIEW_DEBUG__[direction] = {
    stage: "start",
    refreshKey
  };
  try {
    const snapshot = await state.workerClient.previewNeighborPage({
      direction,
      annotations: getCurrentAnnotations()
    });
    window.__PROTECTED_TURN_PREVIEW_DEBUG__[direction] = {
      stage: "snapshot",
      refreshKey,
      hasSnapshot: !!snapshot,
      hasRenderPacket: !!(snapshot && snapshot.renderPacket)
    };
    if (isPreviewSnapshotStale(snapshot, refreshKey)) {
      window.__PROTECTED_TURN_PREVIEW_DEBUG__[direction] = {
        stage: "stale-snapshot",
        refreshKey
      };
      return;
    }
    const root = commitTurnPreview(snapshot, direction, refreshKey);
    window.__PROTECTED_TURN_PREVIEW_DEBUG__[direction] = {
      stage: "rendered",
      refreshKey,
      ready: root.dataset.ready || "",
      canvasCount: root.querySelectorAll("canvas").length
    };
  } catch (_error) {
    window.__PROTECTED_TURN_PREVIEW_DEBUG__[direction] = {
      stage: "error",
      refreshKey,
      message: _error && _error.message ? _error.message : String(_error)
    };
    const root = ensureTurnPreviewRoot(direction);
    if (!root.querySelector("canvas")) {
      commitTurnPreview(null, direction, refreshKey);
    }
  }
}

async function refreshTurnPreviews() {
  if (!isProtectedShellHostMode() || !state.currentSnapshot) return;
  const refreshKey = getTurnPreviewKey();
  const run = async () => {
    state.turnPreviewRefreshToken += 1;
    await Promise.all([
      refreshTurnPreview("prev", refreshKey),
      refreshTurnPreview("next", refreshKey)
    ]);
  };
  state.turnPreviewRefreshPromise = state.turnPreviewRefreshPromise
    .catch(() => {})
    .then(run);
  await state.turnPreviewRefreshPromise;
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

async function autoImportSharedPayload() {
  if (!state.hostedMode || !state.annotationRepository || !state.protectedBook) return false;
  const route = state.entryConfig && state.entryConfig.readerNewRoute;
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

  state.shareImportStatus = resolved.mode || "none";
  state.sharePayloadParseStatus = resolved.mode || "none";
  state.shareImportWarnings = Array.isArray(resolved.warnings) ? resolved.warnings : [];

  if (!resolved.payload) {
    state.importReport = {
      total: 0,
      exact: 0,
      approximate: 0,
      unresolved: 0,
      createdHighlights: 0,
      createdNotes: 0,
      warnings: state.shareImportWarnings
    };
    elements.importReportJson.value = JSON.stringify(state.importReport, null, 2);
    state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
    renderRuntimeMeta();
    return false;
  }

  const result = await state.annotationRepository.importProductionPayload(resolved.payload, {
    book: state.protectedBook,
    merge: false,
    preserveReadingStateIfMissing: true
  });
  state.importReport = result.report;
  state.shareImportStatus = resolved.mode || "loaded";
  state.sharePayloadParseStatus = resolved.mode || "loaded";
  elements.importReportJson.value = JSON.stringify(result.report, null, 2);
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  renderAnnotationList();
  renderRuntimeMeta();
  return true;
}

async function restoreReadingStateIfAvailable(bookId) {
  if (!state.annotationRepository || !state.protectedBook) return null;
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
    const parsed = parseRestoreToken(readingState.restoreToken);
    const targetGlobalOffset = Number.isFinite(Number(readingState.resumeAnchorGlobalOffset))
      ? Number(readingState.resumeAnchorGlobalOffset)
      : Number(parsed && parsed.position && parsed.position.globalOffset);
    const targetChunkOrder = Number.isFinite(Number(readingState && readingState.globalPosition && readingState.globalPosition.chunkOrder))
      ? Number(readingState.globalPosition.chunkOrder)
      : Number.isFinite(Number(parsed && parsed.position && parsed.position.chunkOrder))
        ? Number(parsed.position.chunkOrder)
        : null;
    const useVisibleRangeHint = String(readingState.resumeAnchorSource || "") === "page-midpoint";
    return {
      snapshot: Number.isFinite(targetGlobalOffset)
        ? await state.workerClient.goToChunk({
            chunkIndex: Number.isFinite(targetChunkOrder) ? Math.max(0, Math.floor(targetChunkOrder)) : 0,
            globalOffset: targetGlobalOffset,
            preferredGlobalStartOffset:
              useVisibleRangeHint &&
              readingState.visibleRange &&
              Number.isFinite(Number(readingState.visibleRange.globalStartOffset))
                ? Number(readingState.visibleRange.globalStartOffset)
                : null,
            preferredGlobalEndOffset:
              useVisibleRangeHint &&
              readingState.visibleRange &&
              Number.isFinite(Number(readingState.visibleRange.globalEndOffset))
                ? Number(readingState.visibleRange.globalEndOffset)
                : null,
            ...getViewportConfig(),
            annotations: getCurrentAnnotations()
          })
        : await state.workerClient.restoreFromToken({
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
      { book: state.protectedBook, merge: true }
    );
    const restoredReadingState = result.report && result.report.readingState && result.report.readingState.protectedReadingState;
    if (restoredReadingState && restoredReadingState.globalPosition) {
      state.readingStateSource = "production-fallback";
      state.readingStateRestoreApplied = true;
      state.persistedReadingState = restoredReadingState;
      state.lastReadingStateSaveAt = restoredReadingState.updatedAt || null;
      return {
        snapshot: await state.workerClient.goToChunk({
          chunkIndex: restoredReadingState.globalPosition.chunkOrder,
          globalOffset: restoredReadingState.globalPosition.globalOffset,
          ...getViewportConfig(),
          annotations: getCurrentAnnotations()
        }),
        source: "production-fallback",
        readingState: restoredReadingState
      };
    }
  }

  state.readingStateSource = "default-start";
  state.readingStateRestoreApplied = false;
  state.persistedReadingState = null;
  state.lastReadingStateSaveAt = null;
  return null;
}

function loadHostedPersistedReadingState(bookId) {
  if (!bookId || !state.entryConfig || !state.entryConfig.repositoryPersistence) return null;
  const persistence = state.entryConfig.repositoryPersistence;
  if (String(persistence.type || "") !== "localStorage") return null;
  const namespace = String(persistence.namespace || "").trim();
  if (!namespace) return null;
  try {
    const storage = persistence.storage || window.localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    const raw = storage.getItem(`${namespace}:${bookId}:default:bundle`);
    if (!raw) return null;
    const parsedBundle = JSON.parse(raw);
    return extractReadingStateFromBundle(parsedBundle);
  } catch (_error) {
    return null;
  }
}

function resolveInitialReadingRestore(bookId) {
  const explicitRestoreToken = state.entryConfig && state.entryConfig.explicitRestoreToken
    ? String(state.entryConfig.explicitRestoreToken).trim()
    : "";
  if (explicitRestoreToken) {
    return {
      applied: true,
      source: "token",
      readingState: null,
      workerPayload: {
        initialRestoreToken: explicitRestoreToken
      }
    };
  }
  const readingState = loadHostedPersistedReadingState(bookId);
  if (!readingState || !readingState.restoreToken) {
    return {
      applied: false,
      source: "default-start",
      readingState: null,
      workerPayload: {}
    };
  }
  const parsed = parseRestoreToken(readingState.restoreToken);
  const targetGlobalOffset = Number.isFinite(Number(readingState.resumeAnchorGlobalOffset))
    ? Number(readingState.resumeAnchorGlobalOffset)
    : Number(parsed && parsed.position && parsed.position.globalOffset);
  const targetChunkOrder = Number.isFinite(Number(readingState && readingState.globalPosition && readingState.globalPosition.chunkOrder))
    ? Number(readingState.globalPosition.chunkOrder)
    : Number.isFinite(Number(parsed && parsed.position && parsed.position.chunkOrder))
      ? Number(parsed.position.chunkOrder)
      : null;
  const useVisibleRangeHint = String(readingState.resumeAnchorSource || "") === "page-midpoint";
  return {
    applied: Number.isFinite(targetGlobalOffset),
    source: "protected-persisted",
    readingState,
    workerPayload: Number.isFinite(targetGlobalOffset)
      ? {
          initialChunkIndex: Number.isFinite(targetChunkOrder) ? Math.max(0, Math.floor(targetChunkOrder)) : 0,
          initialGlobalOffset: targetGlobalOffset,
          initialPreferredGlobalStartOffset:
            useVisibleRangeHint &&
            readingState.visibleRange &&
            Number.isFinite(Number(readingState.visibleRange.globalStartOffset))
              ? Number(readingState.visibleRange.globalStartOffset)
              : null,
          initialPreferredGlobalEndOffset:
            useVisibleRangeHint &&
            readingState.visibleRange &&
            Number.isFinite(Number(readingState.visibleRange.globalEndOffset))
              ? Number(readingState.visibleRange.globalEndOffset)
              : null
        }
      : {
          initialRestoreToken: readingState.restoreToken
        }
  };
}

function renderBookMeta() {
  if (!state.bookSummary) return setDlRows(elements.bookMeta, []);
  const metadata = state.bookSummary.metadata || {};
  setDlRows(elements.bookMeta, [
    ["Title", metadata.title || "(untitled)"],
    ["Creators", (metadata.creators || []).join(", ") || "unknown"],
    ["Languages", (metadata.languages || []).join(", ") || "unknown"],
    ["Reader mode", state.hostedMode ? "protected" : "dev-shell"],
    ["Artifact", state.artifactRoot],
    ["Mode", state.bookSummary.mode],
    ["Chunks", state.bookSummary.chunkCount]
  ]);
}

function renderToc() {
  if (!elements.tocCount || !elements.tocList) return;
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
        ["Reader mode", state.hostedMode ? "protected" : "dev-shell"],
        ["Reader host", state.hostedMode ? "reader_new" : "dev-shell"],
        ["Rollout enabled", state.rolloutStatus && state.rolloutStatus.rolloutEnabled ? "yes" : "no"],
        ["Eligibility status", state.rolloutEligibility ? state.rolloutEligibility.status : "n/a"],
        ["Rollout decision", state.rolloutStatus ? state.rolloutStatus.action : "n/a"],
        ["Pilot status", state.pilotStatus ? state.pilotStatus.status : "n/a"],
        ["Pilot certified", state.pilotStatus && state.pilotStatus.pilotCertified ? "yes" : "no"],
        ["Protected artifact", state.rolloutStatus && state.rolloutStatus.artifactAvailable ? "yes" : "no"],
        ["Worker available", state.rolloutStatus && state.rolloutStatus.workerAvailable ? "yes" : "no"],
        ["Book allowed", state.rolloutStatus && state.rolloutStatus.bookAllowed ? "yes" : "no"],
        ["Unavailable reason", state.rolloutStatus && state.rolloutStatus.unavailableReason ? state.rolloutStatus.unavailableReason : "none"],
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
    ["Reader mode", state.hostedMode ? "protected" : "dev-shell"],
    ["Reader host", state.hostedMode ? "reader_new" : "dev-shell"],
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
    ["Unavailable reason", state.rolloutStatus && state.rolloutStatus.unavailableReason ? state.rolloutStatus.unavailableReason : "none"],
    ["Rollout warnings", state.rolloutStatus && state.rolloutStatus.warnings && state.rolloutStatus.warnings.length ? state.rolloutStatus.warnings.join(", ") : "none"],
    ["Reading state source", state.readingStateSource],
    ["Persisted page index", state.persistedReadingState && state.persistedReadingState.page ? state.persistedReadingState.page.pageIndex ?? "n/a" : "n/a"],
    ["Persisted chunk id", state.persistedReadingState && state.persistedReadingState.globalPosition ? state.persistedReadingState.globalPosition.chunkId || "n/a" : "n/a"],
    ["Persisted global offset", state.persistedReadingState && state.persistedReadingState.globalPosition ? state.persistedReadingState.globalPosition.globalOffset ?? "n/a" : "n/a"],
    ["Last save timestamp", state.lastReadingStateSaveAt ? new Date(state.lastReadingStateSaveAt).toISOString() : "n/a"],
    ["Restore applied", state.readingStateRestoreApplied ? "yes" : "no"],
    ["Storage backend", persistenceDiagnostics ? persistenceDiagnostics.storageBackend : "inactive"],
    ["Bundle schema version", persistenceDiagnostics ? persistenceDiagnostics.schemaVersion : "n/a"],
    ["Bundle status", persistenceDiagnostics ? persistenceDiagnostics.persistenceStatus : "n/a"],
    ["Bundle warning", persistenceDiagnostics && persistenceDiagnostics.persistenceWarning ? persistenceDiagnostics.persistenceWarning : "none"],
    ["Persisted bundle updated", persistenceDiagnostics && persistenceDiagnostics.lastSavedAt ? new Date(persistenceDiagnostics.lastSavedAt).toISOString() : "n/a"],
    ["Reading-state saved", persistenceDiagnostics ? (persistenceDiagnostics.readingStateSaved ? "yes" : "no") : "n/a"],
    ["Persisted annotation count", persistenceDiagnostics ? persistenceDiagnostics.annotationCount : "n/a"],
    ["Book fingerprint", persistenceDiagnostics ? persistenceDiagnostics.bookFingerprint : "n/a"],
    ["File sync status", state.syncAssessmentStatus],
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
    ["Artifact source requested", state.artifactSourceRequested || "local"],
    ["Artifact remote mode", state.artifactRemoteMode || "default"],
    ["Artifact source resolved", state.artifactSourceResolved || "unknown"],
    ["Artifact origin resolved", state.artifactOriginResolved || "unknown"],
    ["Artifact fallback detected", state.artifactFallbackDetected || "unknown"],
    ["Share import", state.shareImportStatus],
    ["Share payload parse", state.sharePayloadParseStatus],
    ["Annotation repository", state.annotationRepository ? "active" : "inactive"],
    ["Protected repository", state.annotationRepository ? "repository-active" : "inactive"],
    ["Last import report", state.importReport ? `${state.importReport.exact} exact / ${state.importReport.approximate} approx / ${state.importReport.unresolved} unresolved` : "none"],
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
  const mediaLayer = ensureMediaLayer();
  state.currentRenderDiagnostics = renderChunkToCanvas({
    canvas: elements.canvas,
    overlayCanvas: elements.overlayCanvas,
    renderPacket: state.currentSnapshot.renderPacket,
    mediaLayer,
    debugGeometry: state.debugGeometry,
    offscreenCanvasStatus: state.workerClient.offscreenCanvas === "available" ? "inactive" : "not-available"
  });
  renderRuntimeMeta();
}

function applySnapshot(snapshot) {
  if (!snapshot || isStaleSnapshot(snapshot)) return false;
  state.currentSnapshot = snapshot;
  if (snapshot.bookSummary) state.bookSummary = snapshot.bookSummary;
  if (snapshot.tocItems) state.tocItems = snapshot.tocItems;
  if (snapshot.runtimeMeta && snapshot.runtimeMeta.typographySummary) {
    state.fontScale = Number(snapshot.runtimeMeta.typographySummary.fontScale || 1);
    state.fontMode = normalizeFontMode(snapshot.runtimeMeta.typographySummary.fontMode || state.fontMode);
  }
  persistReadingStateFromSnapshot(snapshot).catch((error) => {
    console.error(error);
  });
  renderBookMeta();
  renderToc();
  renderSelectionMeta();
  renderAnnotationList();
  refreshCanvas();
  emitReaderContractEventsFromSummary(buildBridgeSummary());
  notifyEmbeddedBridge();
  ensureCurrentBookCoverResolved().catch((error) => {
    console.error(error);
  });
  return true;
}

async function persistReadingStateFromSnapshot(snapshot) {
  if (!state.annotationRepository || !snapshot || !snapshot.restoreToken || !state.bookSummary) return;
  const parsed = parseRestoreToken(snapshot.restoreToken);
  const pageSummary = snapshot.pageSummary && typeof snapshot.pageSummary === "object"
    ? snapshot.pageSummary
    : {};
  const focusSummary = snapshot.runtimeMeta && snapshot.runtimeMeta.focusSummary && typeof snapshot.runtimeMeta.focusSummary === "object"
    ? snapshot.runtimeMeta.focusSummary
    : {};
  const focusedAnnotation = focusSummary.annotationId && state.annotationStore
    ? state.annotationStore.get(focusSummary.annotationId)
    : null;
  const selectionRange = snapshot.rangeDescriptor && snapshot.rangeDescriptor.start
    ? snapshot.rangeDescriptor
    : null;
  const pageStartOffset = Number(pageSummary.globalStartOffset || (parsed.position && parsed.position.globalOffset) || 0);
  const pageEndOffset = Number(pageSummary.globalEndOffset || pageStartOffset || 0);
  const midpointOffset = pageEndOffset > pageStartOffset
    ? Math.round(pageStartOffset + ((pageEndOffset - pageStartOffset) / 2))
    : pageStartOffset;
  const resumeAnchorGlobalOffset = focusedAnnotation && focusedAnnotation.rangeDescriptor && focusedAnnotation.rangeDescriptor.start
    ? Number(focusedAnnotation.rangeDescriptor.start.globalOffset || midpointOffset || 0)
    : selectionRange
      ? Number(selectionRange.start.globalOffset || midpointOffset || 0)
      : midpointOffset;
  const resumeAnchorSource = focusedAnnotation && focusedAnnotation.annotationId
    ? "focused-annotation"
    : selectionRange
      ? "selection-start"
      : "page-midpoint";
  const previous = await state.annotationRepository.loadReadingState(state.bookSummary.bookId);
  const nextState = await state.annotationRepository.saveReadingState(state.bookSummary.bookId, {
    restoreToken: snapshot.restoreToken,
    globalPosition: parsed.position || null,
    visibleRange: {
      globalStartOffset: pageStartOffset,
      globalEndOffset: pageEndOffset
    },
    resumeAnchorGlobalOffset,
    resumeAnchorSource,
    page: {
      pageIndex: parsed.pageIndex,
      pageCount: parsed.pageCount
    },
    productionSnapshot: previous && previous.productionSnapshot ? previous.productionSnapshot : null,
    updatedAt: Date.now()
  });
  state.persistedReadingState = nextState;
  state.lastReadingStateSaveAt = nextState && nextState.updatedAt ? nextState.updatedAt : null;
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
}

async function probeArtifactDiagnostics(artifactRoot) {
  try {
    const manifestProbeUrl = new URL(`${artifactRoot.replace(/\/$/, "")}/manifest.json`, window.location.href);
    manifestProbeUrl.searchParams.set("readerArtifactSource", state.artifactSourceRequested || "local");
    manifestProbeUrl.searchParams.set("readerRemoteMode", state.artifactRemoteMode || "default");
    manifestProbeUrl.searchParams.set("_cb", String(Date.now()));
    const probeResponse = await fetch(manifestProbeUrl.toString(), {
      credentials: "same-origin",
      cache: "no-store"
    });
    const resolvedSource = String(probeResponse.headers.get("x-reader-artifact-source") || "").trim().toLowerCase();
    const resolvedOrigin = String(probeResponse.headers.get("x-reader-artifact-origin") || "").trim().toLowerCase();
    const fallbackState = String(probeResponse.headers.get("x-reader-artifact-fallback") || "").trim().toLowerCase();
    state.artifactSourceResolved = resolvedSource || "unknown";
    state.artifactOriginResolved = resolvedOrigin || "unknown";
    state.artifactFallbackDetected = fallbackState || "unknown";
    if (!probeResponse.ok) {
      state.artifactLoadStatus = `preflight-failed:${probeResponse.status}`;
      renderRuntimeMeta();
      throw new Error(`Artifact preflight failed (${probeResponse.status}) for ${manifestProbeUrl.toString()}`);
    }
    renderRuntimeMeta();
    return true;
  } catch (error) {
    if (/Artifact preflight failed/.test(String(error && error.message ? error.message : error))) {
      throw error;
    }
    state.artifactSourceResolved = "unavailable";
    state.artifactOriginResolved = "unavailable";
    state.artifactFallbackDetected = "unavailable";
    renderRuntimeMeta();
    return false;
  }
}

async function initializeProtectedRepository(bookId, protectedBookPromise) {
  state.protectedBook = await protectedBookPromise;
  state.annotationRepository = createProtectedAnnotationRepository({
    bookId,
    book: state.protectedBook,
    persistence: state.hostedMode ? state.entryConfig.repositoryPersistence || null : null
  });
  state.annotationStore = state.annotationRepository.store;
  await state.annotationRepository.ensureHydrated();
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  renderAnnotationList();
  renderRuntimeMeta();
}

function resetProtectedStateForArtifactLoad() {
  state.selectedAnnotationId = null;
  state.importReport = null;
  state.protectedBook = null;
  state.persistedReadingState = null;
  state.lastReadingStateSaveAt = null;
  state.readingStateRestoreApplied = false;
  state.syncAssessmentStatus = "none";
  state.lastFileTransferResult = null;
  state.currentSyncTransport = null;
  state.currentHandoffState = null;
  state.driveState = createInitialProtectedDriveState();
  state.shareImportStatus = state.entryConfig && state.entryConfig.shareImportStatus
    ? state.entryConfig.shareImportStatus
    : "none";
  state.sharePayloadParseStatus = state.shareImportStatus
    ? state.shareImportStatus
    : "none";
  elements.noteInput.value = "";
  setTextareaValue(elements.annotationImport, "");
  setTextareaValue(elements.handoffState, "");
  setTextareaValue(elements.importReportJson, "");
}

async function finalizeArtifactLoad({
  artifactRoot,
  snapshot,
  bookId,
  protectedBookPromise,
  blockForRestore = false,
  repositoryReadyPromise = null,
  restoredPromise = null,
  diagnosticsPromise = null,
  initialRestoreApplied = false
}) {
  if (repositoryReadyPromise) {
    await repositoryReadyPromise;
  } else {
    await initializeProtectedRepository(bookId, protectedBookPromise);
  }
  const restored = restoredPromise
    ? await restoredPromise
    : await restoreReadingStateIfAvailable(bookId);
  const finalSnapshot = restored && restored.snapshot ? {
    ...restored.snapshot,
    bookSummary: restored.snapshot.bookSummary || snapshot.bookSummary,
    tocItems: restored.snapshot.tocItems || snapshot.tocItems
  } : snapshot;
  if (!restored && !initialRestoreApplied) {
    state.readingStateSource = "default-start";
  }
  applySnapshot(finalSnapshot);
  await refreshTurnPreviews();
  if (diagnosticsPromise) {
    await diagnosticsPromise;
  }
  state.artifactLoadStatus = "loaded";
  renderRuntimeMeta();
  await autoImportSharedPayload();
  if (state.annotationStore && state.annotationStore.all().length) {
    await requestAndApply("getRuntimeStatus");
  }
  const persistenceWarning = state.persistenceDiagnostics && state.persistenceDiagnostics.persistenceWarning
    ? ` Warning: ${state.persistenceDiagnostics.persistenceWarning}`
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
      lastWarning: "drive-disabled-for-embedded-protected-shell"
    });
    renderRuntimeMeta();
  }
  setStatus(
    `Opened ${finalSnapshot.chunkSummary.chunkId} (${finalSnapshot.chunkSummary.order}/${finalSnapshot.chunkSummary.total}) in ${state.renderMode}/${state.metricsMode} mode.${persistenceWarning}`,
    persistenceWarning ? "warning" : "ok"
  );
  return finalSnapshot;
}

async function loadArtifact(artifactRoot) {
  if (state.workerClient.mode !== "worker") {
    state.artifactLoadStatus = "secure-worker-unavailable";
    renderRuntimeMeta();
    throw new Error(state.workerClient.unavailableReason || "Protected mode is unavailable in this environment.");
  }
  state.artifactRoot = artifactRoot;
  state.artifactLoadStatus = "loading";
  state.artifactSourceResolved = "unknown";
  state.artifactOriginResolved = "unknown";
  state.artifactFallbackDetected = "unknown";
  syncArtifactInput();
  syncLocationParams();
  setStatus(`Loading protected artifact ${artifactRoot}...`);
  const diagnosticsPromise = probeArtifactDiagnostics(artifactRoot);
  const initialRestore = resolveInitialReadingRestore(
    (state.entryConfig && state.entryConfig.bookId) || ""
  );
  const snapshot = await state.workerClient.initBook({
    artifactRoot,
    renderMode: "shape",
    metricsMode: state.metricsMode,
    fontScale: state.fontScale,
    fontMode: state.fontMode,
    ...initialRestore.workerPayload,
    ...getGenerationPayload(),
    ...getViewportConfig(),
    annotations: []
  });
  const bookId = (snapshot.bookSummary && snapshot.bookSummary.bookId) ||
    "protected-book";
  resetProtectedStateForArtifactLoad();
  if (snapshot.bookSummary) state.bookSummary = snapshot.bookSummary;
  if (snapshot.tocItems) state.tocItems = snapshot.tocItems;
  state.artifactLoadStatus = "initial-page-ready";
  state.readingStateSource = initialRestore.source || "default-start";
  state.readingStateRestoreApplied = !!initialRestore.applied;
  state.persistedReadingState = initialRestore.readingState || null;
  state.lastReadingStateSaveAt = initialRestore.readingState && initialRestore.readingState.updatedAt
    ? initialRestore.readingState.updatedAt
    : null;
  applySnapshot(snapshot);
  setStatus(
    `Opened ${snapshot.chunkSummary.chunkId} (${snapshot.chunkSummary.order}/${snapshot.chunkSummary.total}) in ${state.renderMode}/${state.metricsMode} mode. Finalizing reader state...`,
    "info"
  );
  const blockForRestore = !!(
    initialRestore.applied ||
    (
      state.entryConfig &&
      state.entryConfig.explicitRestoreToken &&
      String(state.entryConfig.explicitRestoreToken).trim()
    )
  );
  if (!blockForRestore) {
    state.artifactLoadStatus = "restoring";
    renderRuntimeMeta();
  }
  const protectedBookPromise = Promise.resolve().then(() => loadProtectedBook(artifactRoot));
  const repositoryReadyPromise = initializeProtectedRepository(bookId, protectedBookPromise);
  const restoredPromise = initialRestore.applied
    ? Promise.resolve(null)
    : repositoryReadyPromise.then(() => restoreReadingStateIfAvailable(bookId));
  void finalizeArtifactLoad({
    artifactRoot,
    snapshot,
    bookId,
    protectedBookPromise,
    blockForRestore,
    repositoryReadyPromise,
    restoredPromise,
    diagnosticsPromise,
    initialRestoreApplied: !!initialRestore.applied
  }).catch((error) => {
    console.error(error);
    state.artifactLoadStatus = "failed";
    renderRuntimeMeta();
    setStatus(error.message || String(error), "error");
  });
  return snapshot;
}

function getCanvasPoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  const page = state.currentSnapshot ? state.currentSnapshot.renderPacket.pageWindow : null;
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top + (page ? Number(page.top || 0) : 0)
  };
}

function getCanvasPointFromClient(clientX, clientY) {
  const rect = elements.canvas.getBoundingClientRect();
  const page = state.currentSnapshot ? state.currentSnapshot.renderPacket.pageWindow : null;
  return {
    x: Number(clientX || 0) - rect.left,
    y: Number(clientY || 0) - rect.top + (page ? Number(page.top || 0) : 0)
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

async function selectWordAt(point) {
  const snapshot = await state.workerClient.selectWordAtPoint({
    ...getViewportConfig(),
    annotations: getCurrentAnnotations(),
    x: point.x,
    y: point.y
  });
  applySnapshot(snapshot);
  return snapshot;
}

async function getFootnoteAtClientPoint(clientX, clientY, pointerType = "mouse") {
  if (!state.currentSnapshot) return { active: false, anchor: null };
  const point = getCanvasPointFromClient(clientX, clientY);
  return getFootnoteAt(point, pointerType);
}

async function getLinkAtClientPoint(clientX, clientY, pointerType = "mouse") {
  if (!state.currentSnapshot) return { active: false, anchor: null };
  const point = getCanvasPointFromClient(clientX, clientY);
  return getLinkAt(point, pointerType);
}

function buildExpandedMediaHitBounds(item, pointerType = "mouse") {
  if (!item) return null;
  const left = Number(item.x || 0);
  const top = Number(item.y || 0);
  const width = Math.max(1, Number(item.width || 0));
  const height = Math.max(1, Number(item.height || 0));
  const right = left + width;
  const bottom = top + height;
  const normalizedPointer = String(pointerType || "mouse").trim().toLowerCase();
  if (normalizedPointer === "touch" || normalizedPointer === "pen") {
    const targetWidth = Math.max(width, 96);
    const targetHeight = Math.max(height, 96);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    return {
      left: centerX - targetWidth / 2,
      right: centerX + targetWidth / 2,
      top: centerY - targetHeight / 2,
      bottom: centerY + targetHeight / 2
    };
  }
  return { left, right, top, bottom };
}

function pointHitsMediaItem(item, x, y, pointerType = "mouse") {
  const bounds = buildExpandedMediaHitBounds(item, pointerType);
  if (!bounds) return false;
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  return (
    px >= Number(bounds.left || 0) &&
    px <= Number(bounds.right || 0) &&
    py >= Number(bounds.top || 0) &&
    py <= Number(bounds.bottom || 0)
  );
}

async function getMediaAtClientPoint(clientX, clientY, pointerType = "mouse") {
  if (!state.currentSnapshot || !state.currentSnapshot.renderPacket) {
    return { active: false, media: null };
  }
  const point = getCanvasPointFromClient(clientX, clientY);
  const mediaItems = Array.isArray(state.currentSnapshot.renderPacket.mediaItems)
    ? state.currentSnapshot.renderPacket.mediaItems
    : [];
  for (let index = mediaItems.length - 1; index >= 0; index -= 1) {
    const item = mediaItems[index];
    if (!item || !item.assetUrl) continue;
    if (item.inlineAvatar || String(item.placement || "").trim() === "inline-avatar") continue;
    if (!pointHitsMediaItem(item, point.x, point.y, pointerType)) continue;
    return {
      active: true,
      media: {
        mediaId: String(item.mediaId || ""),
        blockId: String(item.blockId || ""),
        assetUrl: String(item.assetUrl || ""),
        resolvedHref: String(item.resolvedHref || ""),
        placement: String(item.placement || "block"),
        width: Number(item.width || 0),
        height: Number(item.height || 0),
        x: Number(item.x || 0),
        y: Number(item.y || 0)
      }
    };
  }
  return { active: false, media: null };
}

async function getFootnoteAt(point, pointerType = "mouse") {
  if (!state.currentSnapshot) return { active: false, anchor: null };
  return state.workerClient.getFootnoteAtPoint({
    ...getViewportConfig(),
    x: point.x,
    y: point.y,
    pointerType
  });
}

async function getLinkAt(point, pointerType = "mouse") {
  if (!state.currentSnapshot) return { active: false, anchor: null };
  return state.workerClient.getLinkAtPoint({
    ...getViewportConfig(),
    x: point.x,
    y: point.y,
    pointerType
  });
}

function setFootnoteHoverCursor(active) {
  const nextCursor = active ? "pointer" : "";
  [elements.canvas, elements.overlayCanvas, elements.readerFrame].forEach((node) => {
    if (!node || !node.style) return;
    if (node.style.cursor === nextCursor) return;
    node.style.cursor = nextCursor;
  });
}

function scheduleFootnoteHoverCheck(event) {
  if (!event || String(event.pointerType || "mouse") !== "mouse" || !state.currentSnapshot) {
    setFootnoteHoverCursor(false);
    return;
  }
  state.footnoteHoverPoint = {
    clientX: Number(event.clientX || 0),
    clientY: Number(event.clientY || 0)
  };
  if (state.footnoteHoverScheduled) return;
  state.footnoteHoverScheduled = true;
  const token = ++state.footnoteHoverToken;
  window.requestAnimationFrame(() => {
    state.footnoteHoverScheduled = false;
    const point = state.footnoteHoverPoint;
    if (!point) {
      setFootnoteHoverCursor(false);
      return;
    }
    getFootnoteAtClientPoint(point.clientX, point.clientY, "mouse")
      .then((payload) => {
        if (token !== state.footnoteHoverToken) return;
        setFootnoteHoverCursor(!!(payload && payload.active && payload.anchor));
      })
      .catch(() => {
        if (token !== state.footnoteHoverToken) return;
        setFootnoteHoverCursor(false);
      });
  });
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

function resetPointerGesture() {
  if (state.pointerGesture.longPressTimer) {
    try {
      window.clearTimeout(state.pointerGesture.longPressTimer);
    } catch (_error) {}
  }
  state.pointerGesture = {
    active: false,
    selectionStarted: false,
    pointerId: null,
    pointerType: "",
    inputSource: "",
    shiftKey: false,
    startClientX: 0,
    startClientY: 0,
    startCanvasPoint: null,
    moved: false,
    moveScheduled: false,
    pendingMovePoint: null,
    longPressTimer: null,
    touchSelectionPending: false,
    touchSelectionActive: false,
    touchSelectionClaimed: false
  };
  syncTouchSelectionState();
}

function syncTouchSelectionState() {
  const gesture = state.pointerGesture || {};
  const payload = {
    pending: !!gesture.touchSelectionPending,
    active: !!gesture.touchSelectionActive,
    claimed: !!gesture.touchSelectionClaimed,
    selectionStarted: !!gesture.selectionStarted,
    moved: !!gesture.moved
  };
  window.__PROTECTED_TOUCH_SELECTION__ = payload;
  try {
    if (window.parent && window.parent !== window) {
      window.parent.__PROTECTED_TOUCH_SELECTION__ = payload;
    }
  } catch (_error) {}
}

function recordPointerDebug(stage, payload = null) {
  try {
    const trace = Array.isArray(window.__PROTECTED_POINTER_DEBUG__)
      ? window.__PROTECTED_POINTER_DEBUG__
      : [];
    trace.push({
      at: Date.now(),
      stage: String(stage || ""),
      payload: payload && typeof payload === "object" ? { ...payload } : payload
    });
    if (trace.length > 120) trace.shift();
    window.__PROTECTED_POINTER_DEBUG__ = trace;
  } catch (_error) {}
}

function notifySelectionReleased(clientX, clientY, snapshot, pointerType) {
  if (!snapshot || !snapshot.selectionActive || Number(snapshot.selectedChars || 0) <= 0) return;
  try {
    if (window.parent && window.parent !== window) {
      const showSelectionToolbar =
        typeof window.parent.__PROTECTED_SHELL_SHOW_SELECTION_TOOLBAR__ === "function"
          ? window.parent.__PROTECTED_SHELL_SHOW_SELECTION_TOOLBAR__
            : null;
      if (showSelectionToolbar) {
        showSelectionToolbar(
          {
            selectionActive: !!snapshot.selectionActive,
            selectedChars: Number(snapshot.selectedChars || 0),
            selectionBounds: snapshot.selectionBounds || null
          },
          Number(clientX || 0),
          Number(clientY || 0),
          String(pointerType || "")
        );
      }
      window.parent.postMessage({
        channel: "protected-selection-release",
        clientX: Number(clientX || 0),
        clientY: Number(clientY || 0),
        pointerType: String(pointerType || ""),
        summary: {
          selectionActive: !!snapshot.selectionActive,
          selectedChars: Number(snapshot.selectedChars || 0),
          selectionBounds: snapshot.selectionBounds || null
        }
      }, "*");
    }
  } catch (_error) {}
}

function notifySelectionReleasedWhenReady(clientX, clientY, pointerType, attemptsLeft = 10) {
  const snapshot = state.currentSnapshot;
  if (snapshot && snapshot.selectionActive && Number(snapshot.selectedChars || 0) > 0) {
    notifySelectionReleased(clientX, clientY, snapshot, pointerType);
    return;
  }
  if (attemptsLeft <= 0) return;
  window.setTimeout(() => {
    notifySelectionReleasedWhenReady(clientX, clientY, pointerType, attemptsLeft - 1);
  }, 60);
}

function notifyFootnoteActivated(clientX, clientY, payload, pointerType) {
  if (!payload || !payload.active || !payload.anchor) return;
  try {
    const localPreview =
      typeof window.__PROTECTED_SHELL_SHOW_FOOTNOTE__ === "function"
        ? window.__PROTECTED_SHELL_SHOW_FOOTNOTE__
        : null;
    if (localPreview) {
      localPreview(payload.anchor, Number(clientX || 0), Number(clientY || 0), String(pointerType || ""));
    }
    if (window.parent && window.parent !== window) {
      const parentPreview =
        typeof window.parent.__PROTECTED_SHELL_SHOW_FOOTNOTE__ === "function"
          ? window.parent.__PROTECTED_SHELL_SHOW_FOOTNOTE__
          : null;
      if (parentPreview) {
        parentPreview(payload.anchor, Number(clientX || 0), Number(clientY || 0), String(pointerType || ""));
      }
      window.parent.postMessage({
        channel: "protected-footnote-activate",
        clientX: Number(clientX || 0),
        clientY: Number(clientY || 0),
        pointerType: String(pointerType || ""),
        anchor: payload.anchor
      }, "*");
    }
  } catch (_error) {}
}

function enqueuePointerRequest(task) {
  const next = state.pointerRequestChain
    .catch(() => {})
    .then(task);
  state.pointerRequestChain = next.catch(() => {});
  return next;
}

function schedulePointerMove(point) {
  const gesture = state.pointerGesture;
  if (!gesture.active) return;
  gesture.pendingMovePoint = point;
  if (gesture.moveScheduled) return;
  gesture.moveScheduled = true;
  enqueuePointerRequest(async () => {
    while (gesture.active && gesture.pendingMovePoint) {
      const nextPoint = gesture.pendingMovePoint;
      gesture.pendingMovePoint = null;
      await requestAndApply("pointerMove", {
        x: nextPoint.x,
        y: nextPoint.y
      });
    }
    gesture.moveScheduled = false;
  }).catch((error) => {
    gesture.moveScheduled = false;
    console.error(error);
    setStatus(error.message || String(error), "error");
  });
}

function scheduleWordSelectionLongPress(gesture, startPoint, pointerType) {
  if (!gesture || !startPoint) return;
  gesture.longPressTimer = window.setTimeout(() => {
    const activeGesture = state.pointerGesture;
    if (!activeGesture.active || activeGesture !== gesture) return;
    if (activeGesture.moved || activeGesture.selectionStarted) return;
    if (String(activeGesture.pointerType || "") !== String(pointerType || "")) return;
    activeGesture.longPressTimer = null;
    activeGesture.selectionStarted = true;
    if (pointerType === "touch") {
      activeGesture.touchSelectionPending = false;
      activeGesture.touchSelectionActive = true;
      activeGesture.touchSelectionClaimed = true;
      recordPointerDebug("touch:longpress-fired", {
        startCanvasPoint: activeGesture.startCanvasPoint
      });
      syncTouchSelectionState();
    } else {
      recordPointerDebug("mouse:longpress-fired", {
        startCanvasPoint: activeGesture.startCanvasPoint
      });
    }
    enqueuePointerRequest(async () => {
      const snapshot = await selectWordAt(startPoint);
      recordPointerDebug(`${pointerType}:select-word-result`, {
        selectionActive: !!(snapshot && snapshot.selectionActive),
        selectedChars: Number(snapshot && snapshot.selectedChars || 0),
        selectionBounds: snapshot && snapshot.selectionBounds ? snapshot.selectionBounds : null
      });
    }).catch((error) => {
      console.error(error);
      setStatus(error.message || String(error), "error");
    });
  }, 500);
}

function handlePointerDown(event) {
  if (!state.currentSnapshot) {
    recordPointerDebug("pointerdown:ignored-no-snapshot", {
      pointerType: String(event && event.pointerType || ""),
      clientX: Number(event && event.clientX || 0),
      clientY: Number(event && event.clientY || 0)
    });
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    recordPointerDebug("pointerdown:ignored-nonprimary-mouse", {
      button: Number(event.button || 0)
    });
    return;
  }
  event.preventDefault();
  if (elements.canvas.setPointerCapture && event.pointerId != null) {
    try {
      elements.canvas.setPointerCapture(event.pointerId);
    } catch (_) {}
  }
  state.pointerGesture = {
    active: true,
    selectionStarted: false,
    pointerId: event.pointerId ?? "mouse",
    pointerType: event.pointerType || "mouse",
    inputSource: String(event.__protectedInputSource || (event.pointerType || "mouse")),
    shiftKey: !!event.shiftKey,
    startClientX: Number(event.clientX || 0),
    startClientY: Number(event.clientY || 0),
    startCanvasPoint: getCanvasPoint(event),
    moved: false,
    moveScheduled: false,
    pendingMovePoint: null,
    longPressTimer: null,
    touchSelectionPending: event.pointerType === "touch",
    touchSelectionActive: false,
    touchSelectionClaimed: false
  };
  recordPointerDebug("pointerdown:accepted", {
    pointerType: String(event.pointerType || ""),
    pointerId: event.pointerId ?? null,
    clientX: Number(event.clientX || 0),
    clientY: Number(event.clientY || 0),
    startCanvasPoint: state.pointerGesture.startCanvasPoint
  });
  syncTouchSelectionState();
  const startPoint = state.pointerGesture.startCanvasPoint;
  if (event.pointerType === "touch") {
    scheduleWordSelectionLongPress(state.pointerGesture, startPoint, "touch");
    return;
  }
  if (event.pointerType === "mouse") {
    scheduleWordSelectionLongPress(state.pointerGesture, startPoint, "mouse");
  }
  enqueuePointerRequest(async () => {
    await requestAndApply("pointerDown", {
      x: startPoint.x,
      y: startPoint.y,
      shiftKey: !!event.shiftKey
    });
  }).catch((error) => {
    console.error(error);
    setStatus(error.message || String(error), "error");
  });
}

function handlePointerMove(event) {
  if (String(event.pointerType || "") === "mouse") {
    scheduleFootnoteHoverCheck(event);
  }
  if (!state.currentSnapshot) return;
  const gesture = state.pointerGesture;
  if (!gesture.active) return;
  if (gesture.pointerId != null && event.pointerId != null && gesture.pointerId !== event.pointerId) return;
  const point = getCanvasPoint(event);
  const deltaX = Math.abs(Number(event.clientX || 0) - Number(gesture.startClientX || 0));
  const deltaY = Math.abs(Number(event.clientY || 0) - Number(gesture.startClientY || 0));
  if (deltaX > 3 || deltaY > 3) gesture.moved = true;
  if (gesture.pointerType === "touch" && !gesture.selectionStarted) {
    if (deltaX > 16 || deltaY > 16) {
      if (gesture.longPressTimer) {
        try {
          window.clearTimeout(gesture.longPressTimer);
        } catch (_error) {}
        gesture.longPressTimer = null;
      }
      gesture.touchSelectionPending = false;
      recordPointerDebug("touch:longpress-cancelled-by-move", {
        deltaX,
        deltaY
      });
      syncTouchSelectionState();
    }
    return;
  }
  if (gesture.pointerType === "mouse" && !gesture.selectionStarted) {
    if (deltaX > 6 || deltaY > 6) {
      if (gesture.longPressTimer) {
        try {
          window.clearTimeout(gesture.longPressTimer);
        } catch (_error) {}
        gesture.longPressTimer = null;
      }
      recordPointerDebug("mouse:longpress-cancelled-by-move", {
        deltaX,
        deltaY
      });
    }
  }
  event.preventDefault();
  schedulePointerMove(point);
}

function handlePointerUp(event) {
  if (!state.currentSnapshot) return;
  const gesture = state.pointerGesture;
  if (!gesture.active) return;
  if (gesture.pointerId != null && event.pointerId != null && gesture.pointerId !== event.pointerId) return;
  event.preventDefault();
  const point = getCanvasPoint(event);
  const shouldDismissFocusedAnnotation =
    !gesture.moved &&
    !!(state.currentSnapshot && state.currentSnapshot.runtimeMeta && state.currentSnapshot.runtimeMeta.focusSummary &&
      state.currentSnapshot.runtimeMeta.focusSummary.annotationId);
  if (elements.canvas.releasePointerCapture && event.pointerId != null) {
    try {
      elements.canvas.releasePointerCapture(event.pointerId);
    } catch (_) {}
  }
  const wasTouchWithoutSelection = gesture.pointerType === "touch" && !gesture.selectionStarted;
  recordPointerDebug("pointerup:received", {
    pointerType: String(gesture.pointerType || ""),
    wasTouchWithoutSelection,
    moved: !!gesture.moved
  });
  resetPointerGesture();
  if (wasTouchWithoutSelection) {
    enqueuePointerRequest(async () => {
      const payload = await getFootnoteAt(point);
      if (payload && payload.active && payload.anchor) {
        notifyFootnoteActivated(event.clientX, event.clientY, payload, "touch");
      }
    }).catch((error) => {
      console.error(error);
      setStatus(error.message || String(error), "error");
    });
    return;
  }
  enqueuePointerRequest(async () => {
    if (shouldDismissFocusedAnnotation) {
      await requestAndApply("clearSelection");
      return;
    }
    const snapshot = await requestAndApply("pointerUp", {
      x: point.x,
      y: point.y
    });
    notifySelectionReleased(event.clientX, event.clientY, snapshot, gesture.pointerType);
    if (!(snapshot && snapshot.selectionActive && Number(snapshot.selectedChars || 0) > 0)) {
      const payload = await getFootnoteAt(point);
      if (payload && payload.active && payload.anchor) {
        notifyFootnoteActivated(event.clientX, event.clientY, payload, gesture.pointerType);
        return;
      }
    }
    if (!(snapshot && snapshot.selectionActive && Number(snapshot.selectedChars || 0) > 0)) {
      notifySelectionReleasedWhenReady(event.clientX, event.clientY, gesture.pointerType);
    }
  }).catch((error) => {
    console.error(error);
    setStatus(error.message || String(error), "error");
  });
}

function handleMouseGestureStart(event) {
  if (state.pointerGesture.active) return;
  handlePointerDown({
    ...event,
    pointerType: "mouse",
    pointerId: "mouse"
  });
}

function handleMouseGestureMove(event) {
  scheduleFootnoteHoverCheck({
    ...event,
    pointerType: "mouse"
  });
  const gesture = state.pointerGesture;
  if (!gesture.active || (gesture.pointerId !== "mouse" && gesture.pointerId !== null)) return;
  handlePointerMove({
    ...event,
    pointerType: "mouse",
    pointerId: "mouse"
  });
}

function handleCapturedPointerDown(event) {
  if (event && event.__protectedPointerHandled) return;
  if (event) event.__protectedPointerHandled = true;
  handlePointerDown(event);
}

function handleCapturedPointerMove(event) {
  if (event && event.__protectedPointerMoveHandled) return;
  if (event) event.__protectedPointerMoveHandled = true;
  handlePointerMove(event);
}

function getTouchByIdentifier(event, identifier = null) {
  const changed = event && event.changedTouches ? Array.from(event.changedTouches) : [];
  const touches = event && event.touches ? Array.from(event.touches) : [];
  const all = changed.concat(touches);
  if (!all.length) return null;
  if (identifier == null) return all[0] || null;
  return all.find((item) => Number(item.identifier) === Number(identifier)) || all[0] || null;
}

function handleTouchStartFallback(event) {
  if (state.pointerGesture.active) return;
  const touch = getTouchByIdentifier(event, null);
  if (!touch) return;
  handleCapturedPointerDown({
    pointerType: "touch",
    pointerId: touch.identifier,
    button: 0,
    shiftKey: false,
    clientX: Number(touch.clientX || 0),
    clientY: Number(touch.clientY || 0),
    preventDefault: () => {
      if (event && event.cancelable && event.preventDefault) event.preventDefault();
    },
    __protectedInputSource: "touch-fallback"
  });
}

function handleTouchMoveFallback(event) {
  const gesture = state.pointerGesture;
  if (!gesture.active || gesture.pointerType !== "touch" || gesture.inputSource !== "touch-fallback") return;
  const touch = getTouchByIdentifier(event, gesture.pointerId);
  if (!touch) return;
  handleCapturedPointerMove({
    pointerType: "touch",
    pointerId: touch.identifier,
    button: 0,
    clientX: Number(touch.clientX || 0),
    clientY: Number(touch.clientY || 0),
    preventDefault: () => {
      if (event && event.cancelable && event.preventDefault) event.preventDefault();
    }
  });
}

function handleTouchEndFallback(event) {
  const gesture = state.pointerGesture;
  if (!gesture.active || gesture.pointerType !== "touch" || gesture.inputSource !== "touch-fallback") return;
  const touch = getTouchByIdentifier(event, gesture.pointerId);
  if (!touch) return;
  handlePointerUp({
    pointerType: "touch",
    pointerId: touch.identifier,
    button: 0,
    clientX: Number(touch.clientX || 0),
    clientY: Number(touch.clientY || 0),
    preventDefault: () => {
      if (event && event.cancelable && event.preventDefault) event.preventDefault();
    }
  });
}

function handleMouseGestureEnd(event) {
  const gesture = state.pointerGesture;
  if (!gesture.active || (gesture.pointerId !== "mouse" && gesture.pointerId !== null)) return;
  handlePointerUp({
    ...event,
    pointerType: "mouse",
    pointerId: "mouse"
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

async function addNoteFromRangeDescriptor(rangeDescriptor, noteText = "", quoteText = "") {
  if (!rangeDescriptor || !rangeDescriptor.start || !rangeDescriptor.end) {
    throw new Error("Create a selection before adding a note.");
  }
  const normalizedText = String(noteText || "").trim();
  if (!normalizedText) throw new Error("Enter note text before adding a note.");
  let normalizedQuote = String(quoteText || "").replace(/\s+/g, " ").trim();
  if (!normalizedQuote && state.book && state.book.globalLocationModel) {
    try {
      normalizedQuote = String(
        await reconstructCrossChunkRangeText({
          book: state.book,
          globalModel: state.book.globalLocationModel,
          rangeDescriptor,
          loadChunkModel: loadProtectedChunkModel
        })
      ).replace(/\s+/g, " ").trim();
    } catch (_error) {
      normalizedQuote = "";
    }
  }
  const note = state.annotationStore.createNote({
    rangeDescriptor,
    noteText: normalizedText,
    metadata: normalizedQuote
      ? {
          selectionQuote: normalizedQuote
        }
      : {}
  });
  state.selectedAnnotationId = note.annotationId;
  await syncRepositoryAnnotations();
  renderAnnotationList();
  const snapshot = await state.workerClient.goToAnnotation({
    rangeDescriptor,
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  setStatus(`Added note ${note.annotationId}.`, "ok");
  return note;
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
  state.syncAssessmentStatus = "exact";
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
  state.syncAssessmentStatus = "exact";
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
  state.syncAssessmentStatus = assessed.status;
  if (!assessed.allowed) {
    state.lastFileTransferResult = `protected-sync-import:${assessed.status}`;
    renderRuntimeMeta();
    throw new Error(assessed.warning || "Protected sync handoff cannot be applied.");
  }
  let result = null;
  try {
    result = await state.annotationRepository.importSyncFile(payload);
  } catch (error) {
    const syncAssessment = error && error.syncAssessment;
    if (syncAssessment) {
      state.syncAssessmentStatus = syncAssessment.status;
      state.lastFileTransferResult = `protected-sync-import:${syncAssessment.status}`;
      renderRuntimeMeta();
    }
    throw error;
  }
  state.readingStateSource = "protected-sync-file-import";
  state.selectedAnnotationId = null;
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
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
  const importAssessment = result.syncAssessment || null;
  renderAnnotationList();
  if (importAssessment) {
    state.syncAssessmentStatus = importAssessment.status;
    state.lastFileTransferResult = `protected-sync-import:${importAssessment.status}`;
  }
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
  const syncAssessment = await state.annotationRepository.assessSyncTransport(payload, transport.handoffState);
  state.currentSyncTransport = transport;
  state.currentHandoffState = transport.handoffState;
  setTextareaValue(elements.annotationImport, transport.serializedSyncFile);
  setTextareaValue(elements.handoffState, transport.serializedHandoffState);
  state.syncAssessmentStatus = syncAssessment.status;
  state.lastFileTransferResult = `protected-sync-load:${syncAssessment.status}`;
  renderRuntimeMeta();
  setStatus(`Loaded protected sync file ${file.name}.`, syncAssessment.allowed ? "ok" : "warning");
}

async function refreshDriveStatus({ interactive = false } = {}) {
  if (isDriveUiDisabled()) {
    state.driveState = mergeProtectedDriveState(state.driveState, {
      configured: false,
      authorized: false,
      remotePresent: false,
      transportStatus: "disabled",
      lastWarning: "drive-disabled-for-embedded-protected-shell"
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
    if (!interactive) return state.driveState;
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
  const downloadAssessment = result.syncAssessment || null;
  state.driveState = mergeProtectedDriveState(state.driveState, {
    configured: true,
    authorized: true,
    transportStatus: downloadAssessment && downloadAssessment.allowed ? "downloaded" : "error",
    remotePresent: !!(result.remoteFile && result.remoteFile.fileId),
    remoteFileId: result.remoteFile && result.remoteFile.fileId ? result.remoteFile.fileId : "",
    remoteFileName: result.remoteFile && result.remoteFile.name ? result.remoteFile.name : "",
    remoteModifiedAt: result.remoteFile && result.remoteFile.modifiedAt ? result.remoteFile.modifiedAt : "",
    remoteSize: result.remoteFile && result.remoteFile.size ? result.remoteFile.size : 0,
    freshness: result.freshness || "unknown",
    lastDownloadResult: downloadAssessment ? downloadAssessment.status : "unknown",
    pendingRemoteSyncFile: result.serializedSyncFile || null,
    pendingRemoteHandoffState: result.handoffState || null,
    lastWarning: downloadAssessment && downloadAssessment.warning ? downloadAssessment.warning : ""
  });
  if (result.serializedSyncFile) {
    setTextareaValue(elements.annotationImport, result.serializedSyncFile);
  }
  if (result.handoffState) {
    setTextareaValue(elements.handoffState, JSON.stringify(result.handoffState, null, 2));
  }
  state.syncAssessmentStatus = downloadAssessment ? downloadAssessment.status : "unknown";
  renderRuntimeMeta();
  if (!downloadAssessment || !downloadAssessment.allowed) {
    setStatus((downloadAssessment && downloadAssessment.warning) || "Downloaded Drive state cannot be applied.", "warning");
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
  if (!state.annotationRepository || !state.protectedBook) throw new Error("Nothing is loaded yet.");
  const payload = getTextareaValue(elements.importReportJson);
  if (!payload) throw new Error("Paste production snapshot fragment JSON before importing.");
  const result = await state.annotationRepository.importProductionSnapshotFragment(payload, {
    book: state.protectedBook,
    preserveReadingStateIfMissing: true
  });
  state.importReport = result.report;
  state.shareImportStatus = "manual-snapshot-import";
  state.selectedAnnotationId = null;
  setTextareaValue(elements.annotationImport, JSON.stringify(
    await state.annotationRepository.exportSyncFile(state.bookSummary.bookId),
    null,
    2
  ));
  setTextareaValue(elements.importReportJson, JSON.stringify(result.report, null, 2));
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  state.syncAssessmentStatus = "production-snapshot-import";
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
  setTextareaValue(elements.importReportJson, JSON.stringify(result.productionNotes, null, 2));
  state.importReport = result.report;
  await navigator.clipboard.writeText(elements.importReportJson ? elements.importReportJson.value : "");
  renderRuntimeMeta();
  setStatus("Exported production notes array.", "ok");
}

async function exportSharePayload() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const result = await state.annotationRepository.exportProductionPayload();
  setTextareaValue(elements.importReportJson, JSON.stringify(result.sharePayload, null, 2));
  state.importReport = result.report;
  await navigator.clipboard.writeText(elements.importReportJson ? elements.importReportJson.value : "");
  renderRuntimeMeta();
  setStatus("Exported production share payload.", "ok");
}

async function exportSnapshotPatch() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const result = await state.annotationRepository.exportProductionSnapshotPatch();
  setTextareaValue(elements.importReportJson, JSON.stringify(result.snapshotPatch, null, 2));
  state.importReport = result.protectedSyncBundle
    && result.protectedSyncBundle.syncCapabilities
    && result.protectedSyncBundle.syncCapabilities.productionSnapshotPatch
    ? {
        total: result.protectedSyncBundle.metadata?.annotationCount || 0,
        exact: 0,
        approximate: 0,
        unresolved: 0
      }
    : state.importReport;
  state.lastFileTransferResult = "production-snapshot-export";
  await navigator.clipboard.writeText(elements.importReportJson ? elements.importReportJson.value : "");
  renderRuntimeMeta();
  setStatus("Exported production snapshot patch.", "ok");
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

async function deleteAnnotationById(annotationId) {
  const targetId = String(annotationId || "").trim();
  if (!targetId) throw new Error("Annotation id is required.");
  const annotation = state.annotationStore ? state.annotationStore.get(targetId) : null;
  if (!annotation) throw new Error(`Unknown annotation ${targetId}.`);
  const shouldClearFocusedSelection =
    !!(state.currentSnapshot && state.currentSnapshot.runtimeMeta && state.currentSnapshot.runtimeMeta.focusSummary &&
      state.currentSnapshot.runtimeMeta.focusSummary.annotationId === targetId);
  state.annotationStore.delete(targetId);
  if (state.selectedAnnotationId === targetId) {
    state.selectedAnnotationId = null;
    elements.noteInput.value = "";
  }
  await syncRepositoryAnnotations();
  state.persistenceDiagnostics = state.annotationRepository.getPersistenceDiagnostics();
  renderAnnotationList();
  if (shouldClearFocusedSelection) {
    const snapshot = await state.workerClient.clearSelection({
      annotations: getCurrentAnnotations()
    });
    applySnapshot(snapshot);
  } else {
    await requestAndApply("getRuntimeStatus");
  }
  setStatus(`Deleted annotation ${targetId}.`, "ok");
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
  state.syncAssessmentStatus = "none";
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
    ...getGenerationPayload(),
    ...getViewportConfig(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  void refreshTurnPreviews().catch(() => {});
  return buildBridgeSummary();
}

async function bridgePrevPage() {
  const snapshot = await state.workerClient.goToPrevPage({
    ...getGenerationPayload(),
    ...getViewportConfig(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  void refreshTurnPreviews().catch(() => {});
  return buildBridgeSummary();
}

async function bridgePreparePageTurnPreviews() {
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeGoToToc(tocId) {
  const snapshot = await state.workerClient.goToToc({
    tocId,
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  await refreshTurnPreviews();
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
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  state.selectedAnnotationId = annotation.annotationId;
  applySnapshot(snapshot);
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeRestoreFromToken(token) {
  const snapshot = await state.workerClient.restoreFromToken({
    token: String(token || ""),
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeGoToGlobalOffset(globalOffset, chunkOrder = null) {
  const normalizedChunkOrder = Number(chunkOrder);
  const chunkIndex = Number.isFinite(normalizedChunkOrder)
    ? Math.max(0, Math.floor(normalizedChunkOrder))
    : Math.max(0, Number(state.currentSnapshot && state.currentSnapshot.chunkSummary ? state.currentSnapshot.chunkSummary.order - 1 : 0) || 0);
  const snapshot = await state.workerClient.goToChunk({
    chunkIndex,
    globalOffset: Number(globalOffset || 0),
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeCopySelection() {
  await handleCopySelection();
  return buildBridgeSummary();
}

async function bridgeExportSelectionForUserAction() {
  if (!state.currentSnapshot) {
    throw new Error("Nothing is loaded yet.");
  }
  if (!state.currentSnapshot.selectionResult || state.currentSnapshot.selectionResult.isCollapsed) {
    throw new Error("Create a non-empty selection first.");
  }
  return state.workerClient.copyCurrentSelection();
}

async function bridgeCaptureSelectionForUserAction() {
  if (!state.currentSnapshot || !state.currentSnapshot.selectionResult || state.currentSnapshot.selectionResult.isCollapsed) {
    state.pendingSelectionRangeDescriptor = null;
    return { hasSelection: false };
  }
  state.pendingSelectionRangeDescriptor = state.currentSnapshot.rangeDescriptor
    ? JSON.parse(JSON.stringify(state.currentSnapshot.rangeDescriptor))
    : null;
  const exported = await state.workerClient.copyCurrentSelection();
  return {
    hasSelection: !!state.pendingSelectionRangeDescriptor,
    rangeDescriptor: state.pendingSelectionRangeDescriptor
      ? JSON.parse(JSON.stringify(state.pendingSelectionRangeDescriptor))
      : null,
    clipboardText: exported && exported.clipboardText ? String(exported.clipboardText) : "",
    selectedChars: exported ? Number(exported.selectedChars || 0) : 0
  };
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

async function bridgeCaptureSelectionForNote() {
  state.pendingSelectionRangeDescriptor = state.currentSnapshot && state.currentSnapshot.rangeDescriptor
    ? JSON.parse(JSON.stringify(state.currentSnapshot.rangeDescriptor))
    : null;
  return {
    hasSelection: !!state.pendingSelectionRangeDescriptor,
    summary: buildBridgeSummary()
  };
}

async function bridgeAddNoteFromCapturedSelection(noteText = "") {
  if (!state.pendingSelectionRangeDescriptor) {
    throw new Error("Create a selection before adding a note.");
  }
  const rangeDescriptor = state.pendingSelectionRangeDescriptor;
  state.pendingSelectionRangeDescriptor = null;
  elements.noteInput.value = String(noteText || "");
  await addNoteFromRangeDescriptor(rangeDescriptor, String(noteText || ""));
  return buildBridgeSummary();
}

async function bridgeAddNoteFromRangeDescriptor(rangeDescriptor, noteText = "", quoteText = "") {
  await addNoteFromRangeDescriptor(rangeDescriptor, String(noteText || ""), String(quoteText || ""));
  return buildBridgeSummary();
}

async function bridgeClearSelection() {
  const snapshot = await state.workerClient.clearSelection({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeExportNotesSharePayload() {
  if (!state.annotationRepository) throw new Error("Nothing is loaded yet.");
  const exported = await state.annotationRepository.exportProductionPayload();
  const bookId = exported && exported.sharePayload && exported.sharePayload.bookId
    ? String(exported.sharePayload.bookId)
    : state.bookSummary && state.bookSummary.bookId
      ? String(state.bookSummary.bookId)
      : state.annotationStore && state.annotationStore.bookId
        ? String(state.annotationStore.bookId)
        : "";
  return {
    bookId,
    productionNotes: Array.isArray(exported.productionNotes) ? exported.productionNotes : [],
    sharePayload: exported.sharePayload || { v: 2, bookId, createdAt: Date.now(), notes: [] },
    report: exported.report || null
  };
}

async function bridgeDeleteAnnotation(annotationId) {
  await deleteAnnotationById(annotationId);
  return buildBridgeSummary();
}

async function bridgeSelectAutomationSample() {
  if (!isAutomationSafeMode()) {
    throw new Error("Automation selection is unavailable outside automation-safe mode.");
  }
  const snapshot = await state.workerClient.selectAutomationSample({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function debugSelectAutomationSample() {
  const snapshot = await state.workerClient.selectAutomationSample({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function debugSelectWordAtPoint(x, y) {
  const snapshot = await state.workerClient.selectWordAtPoint({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations(),
    x: Number(x || 0),
    y: Number(y || 0)
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSearchBook(query = "") {
  const snapshot = await state.workerClient.searchBook({
    query: String(query || ""),
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSearchNextResult() {
  const snapshot = await state.workerClient.searchNextResult({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeSearchPrevResult() {
  const snapshot = await state.workerClient.searchPrevResult({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeGoToSearchResult(resultIndex = -1) {
  const snapshot = await state.workerClient.goToSearchResult({
    resultIndex: Number(resultIndex || 0),
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

async function bridgeClearSearch() {
  const snapshot = await state.workerClient.clearSearch({
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  return buildBridgeSummary();
}

function bridgeGetSearchResults() {
  return state.workerClient.getSearchResults({});
}

function bridgeGetPageNumbersForGlobalOffsets(globalOffsets = []) {
  const offsets = Array.isArray(globalOffsets) ? globalOffsets : [];
  return state.workerClient.getPageNumbersForGlobalOffsets({ globalOffsets: offsets });
}

async function bridgeGetReadAloudPayload() {
  if (!state.currentSnapshot || !state.protectedBook) {
    return {
      text: "",
      pageLabel: "",
      globalPageLabel: ""
    };
  }
  const chunkOrder = Math.max(
    0,
    Number(state.currentSnapshot && state.currentSnapshot.chunkSummary ? state.currentSnapshot.chunkSummary.order - 1 : 0) || 0
  );
  const pageWindow =
    state.currentSnapshot &&
    state.currentSnapshot.renderPacket &&
    state.currentSnapshot.renderPacket.pageWindow
      ? state.currentSnapshot.renderPacket.pageWindow
      : null;
  if (!pageWindow) {
    return {
      text: "",
      pageLabel: buildBridgeSummary().pageLabel,
      globalPageLabel: buildBridgeSummary().globalPageLabel
    };
  }
  const chunkModel = await loadProtectedChunkModel(state.protectedBook, chunkOrder, {
    runtimeFontMode: state.fontMode
  });
  const rawText = reconstructVisibleWindow(chunkModel, pageWindow) || "";
  const text = String(rawText)
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return {
    text,
    pageLabel: buildBridgeSummary().pageLabel,
    globalPageLabel: buildBridgeSummary().globalPageLabel
  };
}

async function bridgeSetTheme(theme = "light", generationMeta = null) {
  if (generationMeta) applyGenerationMeta(generationMeta);
  applyEmbeddedTheme(theme);
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeSetFontScale(fontScale = 1, generationMeta = null) {
  if (generationMeta) applyGenerationMeta(generationMeta);
  const snapshot = await state.workerClient.setFontScale({
    fontScale,
    fontMode: state.fontMode,
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeSetFontMode(fontMode = "sans", generationMeta = null) {
  if (generationMeta) applyGenerationMeta(generationMeta);
  state.fontMode = normalizeFontMode(fontMode);
  const snapshot = await state.workerClient.updateRenderConfig({
    renderMode: state.renderMode,
    metricsMode: state.metricsMode,
    viewportWidth: getViewportWidth(),
    viewportHeight: getViewportHeight(),
    fontScale: state.fontScale,
    fontMode: state.fontMode,
    ...getGenerationPayload(),
    annotations: getCurrentAnnotations()
  });
  applySnapshot(snapshot);
  await refreshTurnPreviews();
  return buildBridgeSummary();
}

async function bridgeGetFootnoteAtClientPoint(clientX = 0, clientY = 0, pointerType = "mouse") {
  return getFootnoteAtClientPoint(clientX, clientY, pointerType);
}

async function bridgeGetLinkAtClientPoint(clientX = 0, clientY = 0, pointerType = "mouse") {
  return getLinkAtClientPoint(clientX, clientY, pointerType);
}

async function bridgeGetMediaAtClientPoint(clientX = 0, clientY = 0, pointerType = "mouse") {
  return getMediaAtClientPoint(clientX, clientY, pointerType);
}

function buildEmbeddedHostHandlers() {
  return {
    getSummary: buildBridgeSummary,
    getDebugLayoutState: buildDebugLayoutState,
    subscribe: (eventName, listener) => readerContractEvents.subscribe(eventName, listener),
    unsubscribe: (eventName, listener) => readerContractEvents.unsubscribe(eventName, listener),
    getSupportedEvents: () => PROTECTED_READER_CANONICAL_EVENT_NAMES.slice(),
    getEventHistory: () => readerContractEvents.getHistory(),
    getLastEventPayload: (eventName) => readerContractEvents.getLastPayload(eventName),
    nextPage: bridgeNextPage,
    prevPage: bridgePrevPage,
    preparePageTurnPreviews: bridgePreparePageTurnPreviews,
    goToToc: bridgeGoToToc,
    goToAnnotation: bridgeGoToAnnotation,
    restoreFromToken: bridgeRestoreFromToken,
    goToGlobalOffset: bridgeGoToGlobalOffset,
    getFootnoteAtClientPoint: bridgeGetFootnoteAtClientPoint,
    getLinkAtClientPoint: bridgeGetLinkAtClientPoint,
    getMediaAtClientPoint: bridgeGetMediaAtClientPoint,
    copySelection: bridgeCopySelection,
    exportSelectionForUserAction: bridgeExportSelectionForUserAction,
    captureSelectionForUserAction: bridgeCaptureSelectionForUserAction,
    captureSelectionForNote: bridgeCaptureSelectionForNote,
    selectAutomationSample: bridgeSelectAutomationSample,
    createHighlight: bridgeCreateHighlight,
    addNoteToSelection: bridgeAddNoteToSelection,
    addNoteFromCapturedSelection: bridgeAddNoteFromCapturedSelection,
    addNoteFromRangeDescriptor: bridgeAddNoteFromRangeDescriptor,
    deleteAnnotation: bridgeDeleteAnnotation,
    clearSelection: bridgeClearSelection,
    exportNotesSharePayload: bridgeExportNotesSharePayload,
    searchBook: bridgeSearchBook,
    goToSearchResult: bridgeGoToSearchResult,
    searchNextResult: bridgeSearchNextResult,
    searchPrevResult: bridgeSearchPrevResult,
    clearSearch: bridgeClearSearch,
    getSearchResults: bridgeGetSearchResults,
    getPageNumbersForGlobalOffsets: bridgeGetPageNumbersForGlobalOffsets,
    getReadAloudPayload: bridgeGetReadAloudPayload,
    setTheme: bridgeSetTheme,
    setFontScale: bridgeSetFontScale,
    setFontMode: bridgeSetFontMode
  };
}

function installHostBridge() {
  window.__PROTECTED_READER_HOST_BRIDGE__ = createProtectedReaderHostBridge(
    buildEmbeddedHostHandlers(),
    {
      getHostBridgeInfo: () => ({
        hostBridgeMode: "direct",
        embeddedMode: isEmbeddedProtectedShellMode(),
        hostedMode: !!state.hostedMode,
        implementedMethods:
          window.__PROTECTED_READER_HOST_BRIDGE__ &&
          Array.isArray(window.__PROTECTED_READER_HOST_BRIDGE__.implementedMethods)
            ? window.__PROTECTED_READER_HOST_BRIDGE__.implementedMethods.slice()
            : []
      })
    }
  );
  return window.__PROTECTED_READER_HOST_BRIDGE__;
}

function installDebugSurface() {
  window.__PROTECTED_READER_DEBUG__ = {
    getSummary: buildBridgeSummary,
    getDebugLayoutState: buildDebugLayoutState,
    selectAutomationSample: debugSelectAutomationSample,
    selectWordAtPoint: debugSelectWordAtPoint
  };
}

async function boot() {
  state.artifactRoot = getArtifactRootFromLocation();
  state.renderMode = "shape";
  state.metricsMode = getMetricsModeFromLocation(state.renderMode);
  state.debugGeometry = getDebugGeometryFromLocation();
  applyEmbeddedTheme("light");
  emitReaderContractEventsFromSummary(buildBridgeSummary(), { force: true });
  installNativeToolbarBlock();
  syncArtifactInput();
  installDebugSurface();
  installHostBridge();

  if (elements.artifactForm) {
    elements.artifactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadArtifact((elements.artifactInput && elements.artifactInput.value || "").trim() || DEFAULT_ARTIFACT);
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

  if (elements.load19686) {
    elements.load19686.addEventListener("click", async () => {
      try {
        await loadArtifact(DEFAULT_ARTIFACT);
      } catch (error) {
        console.error(error);
        setStatus(error.message || String(error), "error");
      }
    });
  }

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
        state.syncAssessmentStatus = "corrupt";
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

  window.__PROTECTED_POINTER_BINDING__ = {
    mode: supportsPointerEvents() ? "pointer" : "mouse",
    canvasPresent: !!elements.canvas,
    overlayPresent: !!elements.overlayCanvas,
    readerFramePresent: !!elements.readerFrame,
    bound: false,
    at: Date.now()
  };
  if (elements.canvas && elements.canvas.dataset) {
    elements.canvas.dataset.protectedPointerBinding = "active";
  }

  if (supportsPointerEvents()) {
    elements.canvas.addEventListener("pointerdown", handleCapturedPointerDown, { capture: true });
    elements.canvas.addEventListener("pointermove", handleCapturedPointerMove, { capture: true });
    elements.canvas.addEventListener("pointerleave", () => setFootnoteHoverCursor(false), { capture: true });
    elements.canvas.addEventListener("touchstart", handleTouchStartFallback, { capture: true, passive: false });
    elements.canvas.addEventListener("touchmove", handleTouchMoveFallback, { capture: true, passive: false });
    elements.canvas.addEventListener("touchend", handleTouchEndFallback, { capture: true, passive: false });
    elements.canvas.addEventListener("touchcancel", () => {
      if (state.pointerGesture.inputSource === "touch-fallback") resetPointerGesture();
    }, { capture: true, passive: false });
    document.addEventListener("touchstart", handleTouchStartFallback, { capture: true, passive: false });
    document.addEventListener("touchmove", handleTouchMoveFallback, { capture: true, passive: false });
    document.addEventListener("touchend", handleTouchEndFallback, { capture: true, passive: false });
    document.addEventListener("touchcancel", () => {
      if (state.pointerGesture.inputSource === "touch-fallback") resetPointerGesture();
    }, { capture: true, passive: false });
    if (elements.readerFrame && elements.readerFrame !== elements.canvas) {
      elements.readerFrame.addEventListener("pointerdown", handleCapturedPointerDown, { capture: true });
      elements.readerFrame.addEventListener("pointermove", handleCapturedPointerMove, { capture: true });
      elements.readerFrame.addEventListener("pointerleave", () => setFootnoteHoverCursor(false), { capture: true });
      elements.readerFrame.addEventListener("touchstart", handleTouchStartFallback, { capture: true, passive: false });
      elements.readerFrame.addEventListener("touchmove", handleTouchMoveFallback, { capture: true, passive: false });
      elements.readerFrame.addEventListener("touchend", handleTouchEndFallback, { capture: true, passive: false });
      elements.readerFrame.addEventListener("touchcancel", () => {
        if (state.pointerGesture.inputSource === "touch-fallback") resetPointerGesture();
      }, { capture: true, passive: false });
    }
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", () => {
      resetPointerGesture();
    }, { capture: true });
    window.__PROTECTED_POINTER_BINDING__.bound = true;
  } else {
    elements.canvas.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      handleMouseGestureStart(event);
    }, { capture: true });
    elements.canvas.addEventListener("mousemove", handleMouseGestureMove, { capture: true });
    elements.canvas.addEventListener("mouseleave", () => setFootnoteHoverCursor(false), { capture: true });
    window.addEventListener("mouseup", (event) => {
      if (event.button !== 0) return;
      handleMouseGestureEnd(event);
    }, { capture: true });
    window.__PROTECTED_POINTER_BINDING__.bound = true;
  }

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
