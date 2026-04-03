import { loadProtectedBook, loadProtectedChunkModel } from "../runtime/protected-book-model.js";
import { findChunkIndexForToc } from "../runtime/protected-navigation-model.js";
import { layoutChunk } from "../runtime/protected-layout-engine.js";
import { renderChunkToCanvas } from "../runtime/protected-canvas-renderer.js";
import { createGlyphShapeRegistry } from "../runtime/protected-glyph-shape-registry.js";
import { hitTestPosition } from "../runtime/protected-hit-testing.js";
import { copySelection } from "../runtime/protected-copy-engine.js";
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
  runtimeMeta: document.querySelector("#runtime-meta"),
  selectionMeta: document.querySelector("#selection-meta"),
  selectionKind: document.querySelector("#selection-kind"),
  prevChunk: document.querySelector("#prev-chunk"),
  nextChunk: document.querySelector("#next-chunk"),
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
  currentShapeRegistry: null,
  currentRenderDiagnostics: null,
  renderMode: "text",
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

function syncLocationParams() {
  const url = new URL(window.location.href);
  url.searchParams.set("artifact", state.artifactRoot);
  url.searchParams.set("renderMode", state.renderMode);
  window.history.replaceState({}, "", url);
}

function syncArtifactInput() {
  elements.artifactInput.value = state.artifactRoot;
  elements.renderMode.value = state.renderMode;
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
  setDlRows(elements.runtimeMeta, [
    ["Book", metadata.title || "(untitled)"],
    ["Chunk", chunk.chunkId],
    ["Order", `${state.currentChunkIndex + 1} / ${state.book.manifest.chunks.length}`],
    ["Location", location ? location.locationId : "n/a"],
    ["TOC", state.currentChunkModel.tocLabel || "none"],
    ["Blocks", chunk.logicalBlockList.length],
    ["Segments", buildChunkSelectionIndex(chunk).segmentCount],
    ["Render mode", state.renderMode],
    ["Metrics backend", diagnostics.metricsBackend || state.currentLayout?.metricsBackend || "n/a"],
    ["Glyph ops", diagnostics.glyphOps ?? "n/a"],
    ["Shape bundle", diagnostics.hasShapeBundle ? "yes" : "no"],
    ["Shape records", diagnostics.shapeRecords ?? 0],
    ["Coverage", diagnostics.shapeCoveragePercent != null ? `${diagnostics.shapeCoveragePercent}%` : "n/a"],
    ["Extracted", diagnostics.extractedShapeCount ?? 0],
    ["Synthetic fallback", diagnostics.syntheticShapeCount ?? 0],
    ["Extracted coverage", diagnostics.extractedCoveragePercent != null ? `${diagnostics.extractedCoveragePercent}%` : "n/a"],
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
  elements.selectionKind.textContent = selectionResult.selectionType;
  setDlRows(elements.selectionMeta, [
    ["Type", selectionResult.selectionType],
    ["Chars", selectionResult.selectedChars],
    ["Blocks", selectionResult.selectedBlocks],
    ["Lines", selectionResult.selectedLines],
    ["Chunk", selectionResult.chunkId || "n/a"],
    ["Location", selectionResult.locationId || "n/a"],
    ["Start", selectionResult.startOffset ?? "n/a"],
    ["End", selectionResult.endOffset ?? "n/a"]
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
    highlightSpans: buildSelectionHighlights(state.currentLayout, selectionResult)
  });
  renderRuntimeMeta();
}

async function openChunk(chunkIndex) {
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
    shapeRegistry: state.currentShapeRegistry
  });
  state.selectionState = createSelectionState();
  renderSelectionMeta();
  refreshCanvas();
  syncActiveToc();
  setStatus(
    `Opened ${state.currentChunkModel.chunk.chunkId} (${boundedIndex + 1}/${state.book.manifest.chunks.length}) in ${state.renderMode} mode.`,
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

function getCanvasPoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
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

function resetSelection() {
  state.selectionState = clearSelection();
  renderSelectionMeta();
  refreshCanvas();
  setStatus("Selection cleared.", "ok");
}

async function boot() {
  state.artifactRoot = getArtifactRootFromLocation();
  state.renderMode = getRenderModeFromLocation();
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
        shapeRegistry: state.currentShapeRegistry
      });
      renderSelectionMeta();
      refreshCanvas();
      setStatus(`Render mode switched to ${state.renderMode}.`, "ok");
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
