import { loadProtectedBook, loadProtectedChunkModel } from "./protected-book-model.js";
import { findChunkIndexForToc } from "./protected-navigation-model.js";
import { buildPaginationModel, findPageIndexForOffset } from "./protected-pagination-model.js";
import {
  buildSerializableRange,
  createRestoreDescriptor,
  serializeRangeDescriptor
} from "./protected-range-serialization.js";
import {
  globalOffsetToLocal,
  parseRestoreToken,
  serializeRestoreToken
} from "./protected-global-location.js";
import { layoutChunk } from "./protected-layout-engine.js";
import { createGlyphShapeRegistry } from "./protected-glyph-shape-registry.js";
import { buildGlyphRenderOps } from "./protected-shape-layout.js";
import { hitTestPosition } from "./protected-hit-testing.js";
import { buildVisibleAnnotationOverlay } from "./protected-highlight-renderer.js";
import {
  buildAnnotationFromCurrentSelection,
  buildCopyCurrentSelectionResult
} from "./protected-selection-action-engine.js";
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
} from "./protected-selection-model.js";
import {
  createReconstructionScope,
  disposeReconstructionScope,
  getReconstructionScopeDiagnostics
} from "./protected-text-reconstruction.js";

function summarizeBook(book) {
  return {
    bookId: book.globalLocationModel.bookId,
    metadata: book.manifest.metadata || {},
    mode: book.manifest.mode,
    runtimeContract: book.manifest.runtimeContract || {},
    chunkCount: (book.manifest.chunks || []).length,
    tocItems: book.tocItems || []
  };
}

function summarizeChunk(core) {
  const chunk = core.currentChunkModel.chunk;
  const location = core.currentChunkModel.chunkLocation;
  return {
    chunkId: chunk.chunkId,
    order: core.currentChunkIndex + 1,
    total: core.book.manifest.chunks.length,
    locationId: location ? location.locationId : null,
    tocLabel: core.currentChunkModel.tocLabel || "none",
    blocks: chunk.logicalBlockList.length,
    segments: buildChunkSelectionIndex(chunk).segmentCount
  };
}

function filterGlyphOpsForPage(glyphOps, pageWindow) {
  if (!pageWindow) return glyphOps;
  return glyphOps.filter((op) => op.lineIndex >= pageWindow.lineStartIndex && op.lineIndex <= pageWindow.lineEndIndex);
}

function gatherShapeRecords(shapeBundle, glyphOps) {
  const refs = new Set(glyphOps.map((item) => item.shapeRef).filter(Boolean));
  return ((shapeBundle && shapeBundle.shapeRecords) || []).filter((record) => refs.has(record.shapeRef));
}

export class ProtectedReaderRuntimeCore {
  constructor() {
    this.book = null;
    this.bookSummary = null;
    this.currentChunkIndex = 0;
    this.currentChunkModel = null;
    this.currentShapeRegistry = null;
    this.currentLayout = null;
    this.currentPaginationModel = null;
    this.currentPageIndex = 0;
    this.selectionState = createSelectionState();
    this.renderMode = "shape";
    this.metricsMode = "shape";
    this.viewportHeight = 720;
  }

  getCurrentPage() {
    if (!this.currentPaginationModel) return null;
    return this.currentPaginationModel.pages[this.currentPageIndex] || null;
  }

  async initBook({ artifactRoot, renderMode = "text", metricsMode = "text", viewportHeight = 720, annotations = [] }) {
    this.renderMode = "shape";
    this.metricsMode = metricsMode === "text" ? "text" : "shape";
    this.viewportHeight = viewportHeight;
    this.book = await loadProtectedBook(artifactRoot);
    this.bookSummary = summarizeBook(this.book);
    return this.goToChunk({ chunkIndex: 0, annotations, includeBook: true });
  }

  async goToChunk({ chunkIndex, pageIndex = null, globalOffset = null, annotations = [], includeBook = false }) {
    if (!this.book) throw new Error("Book is not initialized.");
    const boundedIndex = Math.max(0, Math.min(chunkIndex, this.book.manifest.chunks.length - 1));
    this.currentChunkIndex = boundedIndex;
    this.currentChunkModel = await loadProtectedChunkModel(this.book, boundedIndex);
    this.currentShapeRegistry = createGlyphShapeRegistry(
      this.currentChunkModel.shapeBundle,
      this.currentChunkModel.glyphMap
    );
    this.currentLayout = layoutChunk({
      chunkModel: this.currentChunkModel,
      styles: this.book.styleMap,
      width: 760,
      renderMode: this.renderMode,
      metricsMode: this.metricsMode,
      shapeRegistry: this.currentShapeRegistry
    });
    this.currentPaginationModel = buildPaginationModel({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      viewportHeight: this.viewportHeight,
      globalModel: this.book.globalLocationModel
    });
    if (globalOffset != null) {
      const resolvedOffset = globalOffsetToLocal(this.book.globalLocationModel, globalOffset);
      const localOffset =
        resolvedOffset && resolvedOffset.chunkId === this.currentChunkModel.chunk.chunkId
          ? resolvedOffset.localOffset
          : 0;
      this.currentPageIndex = findPageIndexForOffset(
        this.currentPaginationModel,
        Math.max(0, localOffset)
      );
    } else if (pageIndex != null) {
      this.currentPageIndex = Math.max(0, Math.min(pageIndex, this.currentPaginationModel.pages.length - 1));
    } else {
      this.currentPageIndex = 0;
    }
    this.selectionState = createSelectionState();
    return this.buildSnapshot({ annotations, includeBook });
  }

  async goToToc({ tocId, annotations = [] }) {
    const tocItem = (this.book && this.book.tocItems || []).find((item) => item.id === tocId) || null;
    const chunkIndex = findChunkIndexForToc(this.book.manifest, this.book.locations, tocItem);
    if (chunkIndex < 0) throw new Error(`TOC item ${tocId} has no mapped chunk.`);
    return this.goToChunk({ chunkIndex, annotations });
  }

  async goToNextPage({ annotations = [] }) {
    if (this.currentPageIndex < this.currentPaginationModel.pages.length - 1) {
      this.currentPageIndex += 1;
      this.selectionState = createSelectionState();
      return this.buildSnapshot({ annotations });
    }
    if (this.currentChunkIndex < this.book.manifest.chunks.length - 1) {
      return this.goToChunk({ chunkIndex: this.currentChunkIndex + 1, pageIndex: 0, annotations });
    }
    return this.buildSnapshot({ annotations });
  }

  async goToPrevPage({ annotations = [] }) {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex -= 1;
      this.selectionState = createSelectionState();
      return this.buildSnapshot({ annotations });
    }
    if (this.currentChunkIndex > 0) {
      const snapshot = await this.goToChunk({
        chunkIndex: this.currentChunkIndex - 1,
        pageIndex: Number.MAX_SAFE_INTEGER,
        annotations
      });
      this.currentPageIndex = Math.max(0, this.currentPaginationModel.pages.length - 1);
      return this.buildSnapshot({ annotations, includeBook: !!snapshot.bookSummary });
    }
    return this.buildSnapshot({ annotations });
  }

  async updateRenderConfig({ renderMode, metricsMode, viewportHeight = this.viewportHeight, annotations = [] }) {
    this.renderMode = "shape";
    this.metricsMode = metricsMode === "text" ? "text" : "shape";
    this.viewportHeight = viewportHeight;
    return this.goToChunk({
      chunkIndex: this.currentChunkIndex,
      pageIndex: this.currentPageIndex,
      annotations
    });
  }

  pointerDown({ x, y, shiftKey = false, annotations = [] }) {
    const position = hitTestPosition(this.currentLayout, x, y);
    if (!position) return this.buildSnapshot({ annotations });
    this.selectionState = shiftKey && (this.selectionState.anchor || this.selectionState.focus)
      ? extendSelection(this.selectionState, position)
      : beginSelection(this.selectionState, position);
    return this.buildSnapshot({ annotations });
  }

  pointerMove({ x, y, annotations = [] }) {
    if (!this.selectionState.dragging) return this.buildSnapshot({ annotations });
    const position = hitTestPosition(this.currentLayout, x, y);
    if (position) this.selectionState = updateSelection(this.selectionState, position);
    return this.buildSnapshot({ annotations });
  }

  pointerUp({ x, y, annotations = [] }) {
    if (this.selectionState.dragging) {
      const position = hitTestPosition(this.currentLayout, x, y);
      if (position) this.selectionState = updateSelection(this.selectionState, position);
      this.selectionState = endSelection(this.selectionState);
    }
    return this.buildSnapshot({ annotations });
  }

  clearSelection({ annotations = [] }) {
    this.selectionState = clearSelection();
    return this.buildSnapshot({ annotations });
  }

  copyCurrentSelection() {
    const selectionResult = buildSelectionResult({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionState: this.selectionState
    });
    return buildCopyCurrentSelectionResult({
      chunkModel: this.currentChunkModel,
      selectionResult
    });
  }

  createAnnotationFromCurrentSelection({ type, noteText = "" } = {}) {
    const selectionResult = buildSelectionResult({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionState: this.selectionState
    });
    return buildAnnotationFromCurrentSelection({
      bookId: this.book.globalLocationModel.bookId,
      globalModel: this.book.globalLocationModel,
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionResult,
      page: this.getCurrentPage(),
      type,
      noteText
    });
  }

  getRestoreToken() {
    const page = this.getCurrentPage();
    if (!page) throw new Error("No current page is available.");
    return {
      token: serializeRestoreToken(
        createRestoreDescriptor({
          globalModel: this.book.globalLocationModel,
          chunkModel: this.currentChunkModel,
          layout: this.currentLayout,
          page
        })
      )
    };
  }

  async restoreFromToken({ token, annotations = [] }) {
    const descriptor = parseRestoreToken(token);
    if (descriptor.bookId !== this.book.globalLocationModel.bookId) {
      throw new Error(`Restore token belongs to book ${descriptor.bookId}, expected ${this.book.globalLocationModel.bookId}.`);
    }
    const resolved = globalOffsetToLocal(this.book.globalLocationModel, descriptor.position.globalOffset);
    const chunkIndex = this.book.manifest.chunks.findIndex((item) => item.chunkId === resolved.chunkId);
    if (chunkIndex < 0) throw new Error("Unable to resolve chunk for restore token.");
    return this.goToChunk({
      chunkIndex,
      globalOffset: descriptor.position.globalOffset,
      annotations
    });
  }

  getSelectionRange() {
    const selectionResult = buildSelectionResult({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionState: this.selectionState
    });
    const rangeDescriptor = buildSerializableRange({
      globalModel: this.book.globalLocationModel,
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionResult
    });
    return {
      selectionResult,
      rangeDescriptor,
      serializedRange: rangeDescriptor ? serializeRangeDescriptor(rangeDescriptor) : null
    };
  }

  async goToAnnotation({ rangeDescriptor, annotations = [] }) {
    if (!rangeDescriptor || !rangeDescriptor.start) throw new Error("Annotation range is missing.");
    const resolved = globalOffsetToLocal(this.book.globalLocationModel, rangeDescriptor.start.globalOffset);
    if (!resolved) throw new Error("Unable to resolve annotation target.");
    const chunkIndex = this.book.manifest.chunks.findIndex((item) => item.chunkId === resolved.chunkId);
    if (chunkIndex < 0) throw new Error(`Unable to locate chunk ${resolved.chunkId}.`);
    return this.goToChunk({ chunkIndex, globalOffset: rangeDescriptor.start.globalOffset, annotations });
  }

  getRuntimeStatus({ annotations = [] } = {}) {
    return this.buildSnapshot({ annotations });
  }

  buildSnapshot({ annotations = [], includeBook = false } = {}) {
    const page = this.getCurrentPage();
    const selectionResult = buildSelectionResult({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionState: this.selectionState
    });
    const rangeDescriptor = buildSerializableRange({
      globalModel: this.book.globalLocationModel,
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionResult
    });
    const selectionHighlights = buildSelectionHighlights(this.currentLayout, selectionResult);
    const annotationOverlay = buildVisibleAnnotationOverlay({
      annotations,
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      pageWindow: page
    });
    const chunkSummary = summarizeChunk(this);
    const restoreToken = page
      ? serializeRestoreToken(
          createRestoreDescriptor({
            globalModel: this.book.globalLocationModel,
            chunkModel: this.currentChunkModel,
            layout: this.currentLayout,
            page
          })
        )
      : "";

    let glyphOps = [];
    let shapeRecords = [];
    let reconstructionScope = "none";
    let reconstructionCacheSize = 0;
    glyphOps = filterGlyphOpsForPage(
      buildGlyphRenderOps({
        layout: this.currentLayout,
        chunkModel: this.currentChunkModel,
        shapeRegistry: this.currentShapeRegistry,
        renderMode: this.renderMode
      }),
      page
    );
    shapeRecords = gatherShapeRecords(this.currentChunkModel.shapeBundle, glyphOps);

    const renderDiagnostics = {
      glyphOps: glyphOps.length,
      shapeRecords: this.currentShapeRegistry.records.size,
      shapeCoveragePercent: this.currentShapeRegistry.coveragePercent,
      extractedShapeCount: this.currentShapeRegistry.extractedGlyphs,
      syntheticShapeCount: this.currentShapeRegistry.syntheticGlyphs,
      placeholderShapeCount: this.currentShapeRegistry.placeholderGlyphs,
      extractedCoveragePercent: this.currentShapeRegistry.extractedCoveragePercent,
      shapeSource: this.currentShapeRegistry.sourceCounts.extracted ? "extracted" :
        this.currentShapeRegistry.sourceCounts.synthetic ? "synthetic" :
        this.currentShapeRegistry.sourceCounts.placeholder ? "placeholder" : "none",
      metricsBackend: this.currentLayout.metricsBackend,
      metricsMode: this.currentLayout.metricsMode,
      shapeMetricsCoveragePercent: this.currentLayout.shapeMetricsCoveragePercent,
      metricsFallbackCount: this.currentLayout.metricsFallbackCount,
      hitTestingBackend: this.currentLayout.hitTestingBackend,
      selectionPrecisionMode: this.currentLayout.selectionPrecisionMode,
      selectionCompatible: true,
      hasShapeBundle: !!this.currentChunkModel.shapeBundle,
      reconstructionPathMode: "window-scoped",
      reconstructionCacheMode: "bounded-ephemeral",
      reconstructionCacheSize,
      reconstructionExposureStatus: "sealed",
      networkReconSurface: "hidden",
      fullChunkDecode: "forbidden",
      reconstructionScope,
      workerProtocol: "active",
      reconstructionHost: "worker",
      layoutHost: "worker",
      copyHost: "worker",
      renderPreparationHost: "worker"
    };

    return {
      bookSummary: includeBook ? this.bookSummary : null,
      tocItems: includeBook ? this.book.tocItems : null,
      chunkSummary,
      pageSummary: page
        ? {
            pageIndex: this.currentPageIndex,
            pageCount: this.currentPaginationModel.pages.length,
            globalStartOffset: page.globalStartOffset,
            globalEndOffset: page.globalEndOffset,
            startOffset: page.startOffset,
            endOffset: page.endOffset
          }
        : null,
      selectionResult,
      rangeDescriptor,
      serializedRange: rangeDescriptor ? serializeRangeDescriptor(rangeDescriptor) : null,
      restoreToken,
      renderPacket: {
        renderMode: "shape",
        layout: this.currentLayout,
        pageWindow: page,
        glyphOps,
        shapeRecords,
        selectionHighlights,
        annotationHighlights: annotationOverlay.visibleHighlights,
        noteMarkers: annotationOverlay.noteMarkers,
        diagnostics: renderDiagnostics
      },
      runtimeMeta: {
        bookTitle: (this.book.manifest.metadata || {}).title || "(untitled)",
        chunkSummary,
        pageSummary: page
          ? {
              pageLabel: `${this.currentPageIndex + 1} / ${this.currentPaginationModel.pages.length}`,
              globalOffsetLabel: `${page.globalStartOffset}..${page.globalEndOffset}`
            }
          : null,
        runtimeContract: this.book.manifest.runtimeContract || {},
        renderDiagnostics,
        workerMode: "enabled",
        workerProtocol: "active",
        reconstructionHost: "worker",
        layoutHost: "worker",
        copyHost: "worker",
        renderPreparationHost: "worker"
      }
    };
  }
}
