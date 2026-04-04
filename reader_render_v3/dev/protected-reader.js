import { createAnnotationStore } from "../runtime/protected-annotation-store.js";
import { serializeRangeDescriptor } from "../runtime/protected-range-serialization.js";
import { renderChunkToCanvas } from "../runtime/protected-canvas-renderer.js";
import { createProtectedWorkerClient } from "../runtime/protected-worker-client.js";

const DEFAULT_ARTIFACT = "../artifacts/protected-books/19686";

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
  noteInput: document.querySelector("#note-input"),
  annotationImport: document.querySelector("#annotation-import"),
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
  workerClient: createProtectedWorkerClient(),
  annotationStore: null,
  selectedAnnotationId: null,
  renderMode: "text",
  metricsMode: "text",
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
  return params.get("renderMode") === "shape" ? "shape" : "text";
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

function renderBookMeta() {
  if (!state.bookSummary) return setDlRows(elements.bookMeta, []);
  const metadata = state.bookSummary.metadata || {};
  setDlRows(elements.bookMeta, [
    ["Title", metadata.title || "(untitled)"],
    ["Creators", (metadata.creators || []).join(", ") || "unknown"],
    ["Languages", (metadata.languages || []).join(", ") || "unknown"],
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
    setDlRows(elements.runtimeMeta, []);
    return;
  }
  const runtimeMeta = state.currentSnapshot.runtimeMeta || {};
  const diagnostics = runtimeMeta.renderDiagnostics || {};
  const runtimeContract = runtimeMeta.runtimeContract || {};
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
  renderBookMeta();
  renderToc();
  renderSelectionMeta();
  renderAnnotationList();
  refreshCanvas();
}

async function loadArtifact(artifactRoot) {
  state.artifactRoot = artifactRoot;
  syncArtifactInput();
  syncLocationParams();
  setStatus(`Loading runtime-safe artifact ${artifactRoot}...`);
  const snapshot = await state.workerClient.initBook({
    artifactRoot,
    renderMode: state.renderMode,
    metricsMode: state.metricsMode,
    viewportHeight: getViewportHeight(),
    annotations: []
  });
  const bookId = (snapshot.bookSummary && snapshot.bookSummary.bookId) ||
    "protected-book";
  state.annotationStore = createAnnotationStore({ bookId });
  state.selectedAnnotationId = null;
  elements.noteInput.value = "";
  elements.annotationImport.value = "";
  applySnapshot(snapshot);
  setStatus(
    `Opened ${snapshot.chunkSummary.chunkId} (${snapshot.chunkSummary.order}/${snapshot.chunkSummary.total}) in ${state.renderMode}/${state.metricsMode} mode.`,
    "ok"
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
  const result = await state.workerClient.requestCopyPayload();
  await navigator.clipboard.writeText(result.text);
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
  const rangeDescriptor = state.currentSnapshot && state.currentSnapshot.rangeDescriptor;
  if (!state.annotationStore || !rangeDescriptor) {
    throw new Error("Create a selection before creating a highlight.");
  }
  const annotation = state.annotationStore.createHighlight({
    rangeDescriptor,
    color: "amber",
    metadata: {
      locationId: rangeDescriptor.start.locationId,
      selectionMode: rangeDescriptor.selectionMode
    }
  });
  state.selectedAnnotationId = annotation.annotationId;
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Created highlight ${annotation.annotationId}.`, "ok");
  return annotation;
}

async function addNoteToSelection() {
  const rangeDescriptor = state.currentSnapshot && state.currentSnapshot.rangeDescriptor;
  if (!rangeDescriptor) throw new Error("Create a selection before adding a note.");
  const noteText = elements.noteInput.value.trim();
  if (!noteText) throw new Error("Enter note text before adding a note.");
  const highlight = await createHighlightFromSelection();
  const note = state.annotationStore.createNote({
    rangeDescriptor: highlight.rangeDescriptor,
    noteText,
    highlightId: highlight.annotationId,
    color: "blue"
  });
  state.selectedAnnotationId = note.annotationId;
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
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Added note ${note.annotationId}.`, "ok");
}

async function exportAnnotations() {
  if (!state.annotationStore) throw new Error("Nothing is loaded yet.");
  const payload = JSON.stringify(state.annotationStore.exportAnnotations(), null, 2);
  elements.annotationImport.value = payload;
  await navigator.clipboard.writeText(payload);
  setStatus("Exported annotations JSON.", "ok");
}

async function importAnnotations() {
  if (!state.annotationStore) throw new Error("Nothing is loaded yet.");
  const payload = elements.annotationImport.value.trim();
  if (!payload) throw new Error("Paste annotation JSON before importing.");
  state.annotationStore.importAnnotations(payload);
  state.selectedAnnotationId = null;
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus("Imported annotations JSON.", "ok");
}

async function deleteSelectedAnnotation() {
  const selectedAnnotation = getSelectedAnnotation();
  if (!selectedAnnotation) throw new Error("Select an annotation first.");
  state.annotationStore.delete(selectedAnnotation.annotationId);
  state.selectedAnnotationId = null;
  elements.noteInput.value = "";
  renderAnnotationList();
  await requestAndApply("getRuntimeStatus");
  setStatus(`Deleted annotation ${selectedAnnotation.annotationId}.`, "ok");
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
    if (!state.currentSnapshot) {
      setStatus(`Render mode set to ${state.renderMode}.`, "ok");
      return;
    }
    try {
      const snapshot = await state.workerClient.updateRenderConfig({
        renderMode: state.renderMode,
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
    if (state.renderMode === "text") state.metricsMode = "text";
    syncArtifactInput();
    syncLocationParams();
    if (!state.currentSnapshot) return;
    try {
      const snapshot = await state.workerClient.updateRenderConfig({
        renderMode: state.renderMode,
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
    await loadArtifact(state.artifactRoot);
  } catch (error) {
    console.error(error);
    setStatus(error.message || String(error), "error");
  }
}

boot();
