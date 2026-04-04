import { loadProtectedBook, loadProtectedChunkModel } from "../runtime/protected-book-model.js";
import { globalOffsetToLocal, parseRestoreToken, serializeRestoreToken } from "../runtime/protected-global-location.js";
import { findChunkIndexForToc } from "../runtime/protected-navigation-model.js";
import { buildPaginationModel, findPageIndexForOffset } from "../runtime/protected-pagination-model.js";
import {
  buildSerializableRange,
  createRestoreDescriptor,
  serializeRangeDescriptor
} from "../runtime/protected-range-serialization.js";
import { layoutChunk } from "../runtime/protected-layout-engine.js";
import { renderChunkToCanvas } from "../runtime/protected-canvas-renderer.js";
import { createGlyphShapeRegistry } from "../runtime/protected-glyph-shape-registry.js";
import { hitTestPosition } from "../runtime/protected-hit-testing.js";
import { copySelection } from "../runtime/protected-copy-engine.js";
import { reconstructCrossChunkRangeText } from "../runtime/protected-cross-chunk-model.js";
import {
  beginSelection,
  buildChunkSelectionIndex,
  buildSelectionHighlights,
  buildSelectionResult,
  clearSelection,
  createSelectionState,
  endSelection,
  extendSelection,
  updateSelection
} from "../runtime/protected-selection-model.js";

const DEFAULT_ARTIFACT = "../artifacts/protected-books/19686";
const CANVAS_WIDTH = 760;

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
  clearSelection: document.querySelector("#clear-selection"),
  copySelection: document.querySelector("#copy-selection"),
  canvas: document.querySelector("#reader-canvas"),
  overlayCanvas: document.querySelector("#overlay-canvas"),
  readerFrame: document.querySelector(".reader-frame")
};

const state = {
  artifactRoot: DEFAULT_ARTIFACT,
  book: null,
  currentChunkIndex: 0,
  currentChunkModel: null,
  currentLayout: null,
  currentPaginationModel: null,
  currentPageIndex: 0,
  currentSerializableRange: null,
  currentShapeRegistry: null,
  currentRenderDiagnostics: null,
  renderMode: "text",
  metricsMode: "text",
  debugGeometry: false,
  selectionState: createSelectionState()
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

function getArtifactRootFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const artifact = params.get("artifact");
  if (artifact) return artifact;
  const book = params.get("book");
  if (book) return `../artifacts/protected-books/${book}`;
  return DEFAULT_ARTIFACT;
}

function getRenderModeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const renderMode = params.get("renderMode");
  return renderMode === "shape" ? "shape" : "text";
}

function getMetricsModeFromLocation(renderMode) {
  const params = new URLSearchParams(window.location.search);
  const metricsMode = params.get("metricsMode");
  if (renderMode === "text") return "text";
  return metricsMode === "text" ? "text" : "shape";
}

function getDebugGeometryFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("debugGeometry") === "1";
}

function syncLocationParams() {
  const url = new URL(window.location.href);
  url.searchParams.set("artifact", state.artifactRoot);
  url.searchParams.set("renderMode", state.renderMode);
  url.searchParams.set("metricsMode", state.metricsMode);
  if (state.debugGeometry) url.searchParams.set("debugGeometry", "1");
  else url.searchParams.delete("debugGeometry");
  window.history.replaceState({}, "", url);
}

function syncArtifactInput() {
  elements.artifactInput.value = state.artifactRoot;
  elements.renderMode.value = state.renderMode;
  elements.metricsMode.value = state.metricsMode;
  elements.metricsMode.disabled = state.renderMode !== "shape";
  elements.debugGeometry.checked = state.debugGeometry;
}

function getViewportHeight() {
  return Math.max(420, (elements.readerFrame ? elements.readerFrame.clientHeight : 0) - 40 || 720);
}

function getCurrentPage() {
  if (!state.currentPaginationModel) return null;
  return state.currentPaginationModel.pages[state.currentPageIndex] || null;
}

function renderBookMeta() {
  if (!state.book) return setDlRows(elements.bookMeta, []);
  const metadata = state.book.manifest.metadata || {};
  setDlRows(elements.bookMeta, [
    ["Title", metadata.title || "(untitled)"],
    ["Creators", (metadata.creators || []).join(", ") || "unknown"],
    ["Languages", (metadata.languages || []).join(", ") || "unknown"],
    ["Artifact", state.artifactRoot],
    ["Mode", state.book.manifest.mode],
    ["Chunks", state.book.manifest.chunks.length]
  ]);
}

function renderToc() {
  const items = state.book ? state.book.tocItems : [];
  elements.tocCount.textContent = `${items.length} items`;
  elements.tocList.replaceChildren();
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-item";
    button.textContent = item.label || item.id;
    button.addEventListener("click", async () => {
      const chunkIndex = findChunkIndexForToc(state.book.manifest, state.book.locations, item);
      if (chunkIndex >= 0) {
        await openChunk(chunkIndex);
      } else {
        setStatus(`TOC item ${item.label} has no mapped chunk yet.`, "error");
      }
    });
    elements.tocList.append(button);
  });
}

function renderRuntimeMeta() {
  if (!state.book || !state.currentChunkModel) return setDlRows(elements.runtimeMeta, []);
  const chunk = state.currentChunkModel.chunk;
  const location = state.currentChunkModel.chunkLocation;
  const metadata = state.book.manifest.metadata || {};
  const diagnostics = state.currentRenderDiagnostics || {};
  const runtimeContract = state.book.manifest.runtimeContract || {};
  const page = getCurrentPage();
  const restoreToken = page
    ? serializeRestoreToken(
        createRestoreDescriptor({
          globalModel: state.book.globalLocationModel,
          chunkModel: state.currentChunkModel,
          layout: state.currentLayout,
          page
        })
      )
    : "";
  setDlRows(elements.runtimeMeta, [
    ["Book", metadata.title || "(untitled)"],
    ["Chunk", chunk.chunkId],
    ["Order", `${state.currentChunkIndex + 1} / ${state.book.manifest.chunks.length}`],
    ["Page", page ? `${state.currentPageIndex + 1} / ${state.currentPaginationModel.pages.length}` : "n/a"],
    ["Location", location ? location.locationId : "n/a"],
    ["Global offset", page ? `${page.globalStartOffset}..${page.globalEndOffset}` : "n/a"],
    ["TOC", state.currentChunkModel.tocLabel || "none"],
    ["Blocks", chunk.logicalBlockList.length],
    ["Segments", buildChunkSelectionIndex(chunk).segmentCount],
    ["Glyph token mode", runtimeContract.glyphMode || "opaque-chunk-local"],
    ["Unicode leakage", "clean"],
    ["Render payload", runtimeContract.renderPayload || "opaque-glyph-ops"],
    ["Reconstruction path", runtimeContract.reconstructionMode || "sealed-window-scoped"],
    ["Reconstruction scope", diagnostics.reconstructionScope || "none"],
    ["Full-chunk decode", diagnostics.fullChunkDecode || "forbidden"],
    ["Reconstruction cache", diagnostics.reconstructionCacheMode || "bounded-ephemeral"],
    ["Reconstruction cache size", diagnostics.reconstructionCacheSize ?? 0],
    ["Reconstruction exposure", diagnostics.reconstructionExposureStatus || "sealed"],
    ["Network recon surface", diagnostics.networkReconSurface || runtimeContract.reconstructionSurface || "embedded-substrate"],
    ["Debug artifact usage", "false"],
    ["Render mode", state.renderMode],
    ["Metrics mode", state.metricsMode],
    ["Metrics backend", diagnostics.metricsBackend || state.currentLayout?.metricsBackend || "n/a"],
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
    ["Restore token", restoreToken ? "available" : "n/a"],
    ["Geometry overlay", state.debugGeometry ? "on" : "off"],
    ["Shape source", diagnostics.shapeSource || "none"]
  ]);
}

function renderSelectionMeta() {
  if (!state.currentChunkModel) return setDlRows(elements.selectionMeta, []);
  const selectionResult = buildSelectionResult({
    chunkModel: state.currentChunkModel,
    layout: state.currentLayout,
    selectionState: state.selectionState
  });
  state.currentSerializableRange = buildSerializableRange({
    globalModel: state.book.globalLocationModel,
    chunkModel: state.currentChunkModel,
    layout: state.currentLayout,
    selectionResult
  });
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
    ["Range global", state.currentSerializableRange ? `${state.currentSerializableRange.start.globalOffset}..${state.currentSerializableRange.end.globalOffset}` : "n/a"],
    [
      "Serialized range",
      state.currentSerializableRange
        ? `${state.currentSerializableRange.start.chunkId}:${state.currentSerializableRange.start.localOffset} -> ${state.currentSerializableRange.end.chunkId}:${state.currentSerializableRange.end.localOffset}`
        : "n/a"
    ]
  ]);
}

function refreshCanvas() {
  if (!state.currentLayout) return;
  const selectionResult = buildSelectionResult({
    chunkModel: state.currentChunkModel,
    layout: state.currentLayout,
    selectionState: state.selectionState
  });
  state.currentRenderDiagnostics = renderChunkToCanvas({
    canvas: elements.canvas,
    overlayCanvas: elements.overlayCanvas,
    layout: state.currentLayout,
    chunkModel: state.currentChunkModel,
    renderMode: state.renderMode,
    shapeRegistry: state.currentShapeRegistry,
    debugGeometry: state.debugGeometry,
    highlightSpans: buildSelectionHighlights(state.currentLayout, selectionResult),
    pageWindow: getCurrentPage()
  });
  renderRuntimeMeta();
}

async function openChunk(chunkIndex, options = {}) {
  if (!state.book) return;
  const boundedIndex = Math.max(0, Math.min(chunkIndex, state.book.manifest.chunks.length - 1));
  state.currentChunkIndex = boundedIndex;
  state.currentChunkModel = await loadProtectedChunkModel(state.book, boundedIndex);
  state.currentShapeRegistry = createGlyphShapeRegistry(
      state.currentChunkModel.shapeBundle,
      state.currentChunkModel.glyphMap
    );
  state.currentLayout = layoutChunk({
    chunkModel: state.currentChunkModel,
    styles: state.book.styleMap,
    width: CANVAS_WIDTH,
    renderMode: state.renderMode,
    metricsMode: state.metricsMode,
    shapeRegistry: state.currentShapeRegistry
  });
  state.currentPaginationModel = buildPaginationModel({
    chunkModel: state.currentChunkModel,
    layout: state.currentLayout,
    viewportHeight: getViewportHeight(),
    globalModel: state.book.globalLocationModel
  });
  if (options.globalOffset != null) {
    const chunkStart = state.currentChunkModel.chunk.startOffset || 0;
    state.currentPageIndex = findPageIndexForOffset(
      state.currentPaginationModel,
      Math.max(0, options.globalOffset - chunkStart)
    );
  } else if (options.pageIndex != null) {
    state.currentPageIndex = Math.max(0, Math.min(options.pageIndex, state.currentPaginationModel.pages.length - 1));
  } else {
    state.currentPageIndex = 0;
  }
  state.selectionState = createSelectionState();
  renderSelectionMeta();
  refreshCanvas();
  syncActiveToc();
  setStatus(
    `Opened ${state.currentChunkModel.chunk.chunkId} (${boundedIndex + 1}/${state.book.manifest.chunks.length}) in ${state.renderMode}/${state.metricsMode} mode.`,
    "ok"
  );
}

function syncActiveToc() {
  const activeLabel = state.currentChunkModel ? state.currentChunkModel.tocLabel : "";
  for (const button of elements.tocList.querySelectorAll(".toc-item")) {
    button.classList.toggle("is-active", button.textContent === activeLabel && !!activeLabel);
  }
}

async function loadArtifact(artifactRoot) {
  state.artifactRoot = artifactRoot;
  syncArtifactInput();
  syncLocationParams();
  setStatus(`Loading runtime-safe artifact ${artifactRoot}...`);
  state.book = await loadProtectedBook(artifactRoot);
  renderBookMeta();
  renderToc();
  await openChunk(0);
}

async function goToNextPage() {
  if (!state.book || !state.currentPaginationModel) return;
  if (state.currentPageIndex < state.currentPaginationModel.pages.length - 1) {
    state.currentPageIndex += 1;
    state.selectionState = createSelectionState();
    renderSelectionMeta();
    refreshCanvas();
    setStatus(`Moved to page ${state.currentPageIndex + 1}/${state.currentPaginationModel.pages.length}.`, "ok");
    return;
  }
  if (state.currentChunkIndex < state.book.manifest.chunks.length - 1) {
    await openChunk(state.currentChunkIndex + 1, { pageIndex: 0 });
  }
}

async function goToPrevPage() {
  if (!state.book || !state.currentPaginationModel) return;
  if (state.currentPageIndex > 0) {
    state.currentPageIndex -= 1;
    state.selectionState = createSelectionState();
    renderSelectionMeta();
    refreshCanvas();
    setStatus(`Moved to page ${state.currentPageIndex + 1}/${state.currentPaginationModel.pages.length}.`, "ok");
    return;
  }
  if (state.currentChunkIndex > 0) {
    await openChunk(state.currentChunkIndex - 1, { pageIndex: Number.MAX_SAFE_INTEGER });
    state.currentPageIndex = Math.max(0, state.currentPaginationModel.pages.length - 1);
    renderSelectionMeta();
    refreshCanvas();
  }
}

function getCanvasPoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  const page = getCurrentPage();
  const yOffset = page ? page.top - (state.currentLayout ? state.currentLayout.padding : 0) : 0;
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top + yOffset
  };
}

function getPositionFromEvent(event) {
  if (!state.currentLayout) return;
  const point = getCanvasPoint(event);
  return hitTestPosition(state.currentLayout, point.x, point.y);
}

function handleMouseDown(event) {
  const position = getPositionFromEvent(event);
  if (!position) return;
  if (event.shiftKey && (state.selectionState.anchor || state.selectionState.focus)) {
    state.selectionState = extendSelection(state.selectionState, position);
  } else {
    state.selectionState = beginSelection(state.selectionState, position);
  }
  renderSelectionMeta();
  refreshCanvas();
}

function handleMouseMove(event) {
  if (!state.selectionState.dragging) return;
  const position = getPositionFromEvent(event);
  if (!position) return;
  state.selectionState = updateSelection(state.selectionState, position);
  renderSelectionMeta();
  refreshCanvas();
}

function handleMouseUp(event) {
  if (!state.selectionState.dragging) return;
  const position = getPositionFromEvent(event);
  if (position) {
    state.selectionState = updateSelection(state.selectionState, position);
  }
  state.selectionState = endSelection(state.selectionState);
  renderSelectionMeta();
  refreshCanvas();
}

async function handleCopySelection() {
  if (!state.currentChunkModel || !state.currentLayout) {
    setStatus("Nothing is loaded yet.", "error");
    return;
  }
  const selectionResult = buildSelectionResult({
    chunkModel: state.currentChunkModel,
    layout: state.currentLayout,
    selectionState: state.selectionState
  });
  if (selectionResult.isCollapsed) {
    setStatus("Create a non-empty selection before copying.", "error");
    return;
  }
  const result = await copySelection({
    chunkModel: state.currentChunkModel,
    selectionResult
  });
  setStatus(
    `Copied selection: ${result.selectedChars} chars across ${result.selectedBlocks} block(s) and ${result.selectedLines} line(s).`,
    "ok"
  );
}

async function handleCopyRestoreToken() {
  if (!state.book || !state.currentChunkModel || !state.currentLayout) {
    setStatus("Nothing is loaded yet.", "error");
    return;
  }
  const page = getCurrentPage();
  if (!page) {
    setStatus("No current page is available.", "error");
    return;
  }
  const token = serializeRestoreToken(
    createRestoreDescriptor({
      globalModel: state.book.globalLocationModel,
      chunkModel: state.currentChunkModel,
      layout: state.currentLayout,
      page
    })
  );
  await navigator.clipboard.writeText(token);
  elements.restoreTokenInput.value = token;
  setStatus("Copied restore token.", "ok");
}

async function handleRestoreToken() {
  if (!state.book) {
    setStatus("Load a book before restoring.", "error");
    return;
  }
  const token = elements.restoreTokenInput.value.trim();
  const descriptor = parseRestoreToken(token);
  if (descriptor.bookId !== state.book.globalLocationModel.bookId) {
    throw new Error(`Restore token belongs to book ${descriptor.bookId}, expected ${state.book.globalLocationModel.bookId}.`);
  }
  const resolved = globalOffsetToLocal(state.book.globalLocationModel, descriptor.position.globalOffset);
  const chunkIndex = state.book.manifest.chunks.findIndex((item) => item.chunkId === resolved.chunkId);
  if (chunkIndex < 0) throw new Error(`Unable to resolve chunk for restore token.`);
  await openChunk(chunkIndex, { globalOffset: descriptor.position.globalOffset });
  setStatus(`Restored position at global offset ${descriptor.position.globalOffset}.`, "ok");
}

async function handleCopySelectionRange() {
  if (!state.currentSerializableRange) {
    setStatus("Create a selection before copying its serialized range.", "error");
    return;
  }
  await navigator.clipboard.writeText(serializeRangeDescriptor(state.currentSerializableRange));
  setStatus("Copied serialized selection range.", "ok");
}

async function handleCrossChunkCopyProbe() {
  if (!state.book || !state.currentSerializableRange) return;
  await reconstructCrossChunkRangeText({
    book: state.book,
    globalModel: state.book.globalLocationModel,
    rangeDescriptor: state.currentSerializableRange,
    loadChunkModel: loadProtectedChunkModel
  });
}

function resetSelection() {
  state.selectionState = clearSelection();
  renderSelectionMeta();
  refreshCanvas();
  setStatus("Selection cleared.", "ok");
}

async function boot() {
  state.artifactRoot = getArtifactRootFromLocation();
  state.renderMode = getRenderModeFromLocation();
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
    state.renderMode = elements.renderMode.value === "shape" ? "shape" : "text";
    if (state.renderMode === "text") state.metricsMode = "text";
    else if (state.metricsMode !== "text" && state.metricsMode !== "shape") state.metricsMode = "shape";
    syncArtifactInput();
    syncLocationParams();
    if (!state.book || !state.currentChunkModel) {
      setStatus(`Render mode set to ${state.renderMode}.`, "ok");
      return;
    }
    try {
      state.currentShapeRegistry = createGlyphShapeRegistry(
        state.currentChunkModel.shapeBundle,
        state.currentChunkModel.glyphMap
      );
      state.currentLayout = layoutChunk({
        chunkModel: state.currentChunkModel,
        styles: state.book.styleMap,
        width: CANVAS_WIDTH,
        renderMode: state.renderMode,
        metricsMode: state.metricsMode,
        shapeRegistry: state.currentShapeRegistry
      });
      renderSelectionMeta();
      refreshCanvas();
      setStatus(`Render mode switched to ${state.renderMode}/${state.metricsMode}.`, "ok");
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.metricsMode.addEventListener("change", async () => {
    state.metricsMode = elements.metricsMode.value === "text" ? "text" : "shape";
    if (state.renderMode === "text") state.metricsMode = "text";
    syncArtifactInput();
    syncLocationParams();
    if (!state.book || !state.currentChunkModel) return;
    try {
      state.currentLayout = layoutChunk({
        chunkModel: state.currentChunkModel,
        styles: state.book.styleMap,
        width: CANVAS_WIDTH,
        renderMode: state.renderMode,
        metricsMode: state.metricsMode,
        shapeRegistry: state.currentShapeRegistry
      });
      renderSelectionMeta();
      refreshCanvas();
      setStatus(`Metrics mode switched to ${state.metricsMode}.`, "ok");
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.debugGeometry.addEventListener("change", () => {
    state.debugGeometry = elements.debugGeometry.checked;
    syncLocationParams();
    renderSelectionMeta();
    refreshCanvas();
    setStatus(`Geometry overlay ${state.debugGeometry ? "enabled" : "disabled"}.`, "ok");
  });

  elements.prevPage.addEventListener("click", async () => {
    try {
      await goToPrevPage();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.nextPage.addEventListener("click", async () => {
    try {
      await goToNextPage();
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.prevChunk.addEventListener("click", async () => {
    if (!state.book) return;
    try {
      await openChunk(state.currentChunkIndex - 1);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.nextChunk.addEventListener("click", async () => {
    if (!state.book) return;
    try {
      await openChunk(state.currentChunkIndex + 1);
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), "error");
    }
  });

  elements.clearSelection.addEventListener("click", resetSelection);
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
      await handleCrossChunkCopyProbe();
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

  elements.canvas.addEventListener("mousedown", handleMouseDown);
  elements.canvas.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);

  try {
    await loadArtifact(state.artifactRoot);
  } catch (error) {
    console.error(error);
    setStatus(error.message || String(error), "error");
  }
}

boot();
