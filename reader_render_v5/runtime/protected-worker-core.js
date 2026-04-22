import {
  ensureProtectedBookLocations,
  loadProtectedBook,
  loadProtectedChunkModel
} from "./protected-book-model.js";
import {
  findChunkIndexForToc,
  findGlobalOffsetForToc,
  getActiveTocAnchorForPosition,
  getChunkTocLabel
} from "./protected-navigation-model.js";
import {
  buildPaginationModel,
  findBestPageIndexForVisibleRange,
  findPageIndexForOffset
} from "./protected-pagination-model.js?v=20260416-protected-padding-3";
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
import { layoutChunk } from "./protected-layout-engine.js?v=20260422-v5-hyphenation-1";
import { createGlyphShapeRegistry } from "./protected-glyph-shape-registry.js";
import { buildGlyphRenderOps } from "./protected-shape-layout.js";
import { hitTestPosition } from "./protected-hit-testing.js";
import { buildVisibleAnnotationOverlay } from "./protected-highlight-renderer.js";
import {
  buildAnnotationFromCurrentSelection
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
import { snapSelectionOffsets } from "./protected-word-boundary.js";
import {
  createReconstructionScope,
  disposeReconstructionScope,
  getReconstructionScopeDiagnostics,
  reconstructRangeText,
  reconstructSelectionRange
} from "./protected-text-reconstruction.js";
import { assertNoForbiddenTextLikeFields } from "./protected-worker-protocol.js";
import { buildRangeHighlights } from "./protected-selection-model.js";

function summarizeBook(book) {
  return {
    bookId: book.globalLocationModel.bookId,
    metadata: book.manifest.metadata || {},
    source: book.manifest.source || {},
    mode: book.manifest.mode,
    runtimeContract: book.manifest.runtimeContract || {},
    chunkCount: (book.manifest.chunks || []).length,
    tocItems: book.tocItems || [],
    v4Compatibility: book.v4Compatibility || null
  };
}

function summarizeChunk(core) {
  const chunk = core.currentChunkModel.chunk;
  const location = core.currentChunkModel.chunkLocation;
  const page = core.getCurrentPage();
  const activeAnchor = page
    ? getActiveTocAnchorForPosition(core.book.locations, core.currentChunkIndex, page.startOffset)
    : null;
  return {
    chunkId: chunk.chunkId,
    order: core.currentChunkIndex + 1,
    total: core.book.manifest.chunks.length,
    locationId: location ? location.locationId : null,
    tocId: activeAnchor ? activeAnchor.tocId || "" : "",
    tocLabel: activeAnchor ? activeAnchor.label || core.currentChunkModel.tocLabel || "none" : core.currentChunkModel.tocLabel || "none",
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

function filterMediaItemsForPage(mediaItems, pageWindow) {
  if (!Array.isArray(mediaItems) || !mediaItems.length) return [];
  if (!pageWindow) return mediaItems;
  const top = Number(pageWindow.top || 0);
  const bottom = top + Number(pageWindow.height || 0);
  return mediaItems.filter((item) => {
    const itemTop = Number(item && item.y || 0);
    const itemBottom = itemTop + Number(item && item.height || 0);
    return itemBottom >= top && itemTop <= bottom;
  });
}

function buildAutomationSelectionPosition(line, offset, projectionMeta = null) {
  const fragment =
    line.fragments.find((item) => offset >= item.startOffset && offset <= item.endOffset) ||
    line.fragments[0] ||
    null;
  if (!fragment) return null;
  return {
    blockId: fragment.blockId,
    lineIndex: line.lineIndex,
    fragmentIndex: fragment.fragmentIndex,
    segmentId: fragment.segmentId,
    offset,
    hitTestingBackend: "automation-sample",
    precisionMode: "automation-sample",
    projectionMeta: projectionMeta
      ? {
          chunkId: String(projectionMeta.chunkId || ""),
          runtimeFontMode: String(projectionMeta.runtimeFontMode || "sans"),
          configGeneration: Number(projectionMeta.configGeneration || 0) || 0,
          layoutGeneration: Number(projectionMeta.layoutGeneration || 0) || 0
        }
      : undefined
  };
}

function getCurrentChunkGlobalStart(core) {
  return Number(
    core &&
    core.currentChunkModel &&
    core.currentChunkModel.chunkLocation &&
    Number.isFinite(Number(core.currentChunkModel.chunkLocation.startOffset))
      ? Number(core.currentChunkModel.chunkLocation.startOffset)
      : core &&
          core.currentChunkModel &&
          core.currentChunkModel.chunk &&
          Number.isFinite(Number(core.currentChunkModel.chunk.startOffset))
        ? Number(core.currentChunkModel.chunk.startOffset)
        : 0
  );
}

const SEARCH_EXCLUDED_TOC_RE = /\b(?:footnotes?|endnotes?|notes?|references?)\b/i;

function isSearchExcludedSectionValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return SEARCH_EXCLUDED_TOC_RE.test(normalized);
}

function isSearchExcludedChunk(manifestChunk, chunkModel) {
  const chunkLocation = chunkModel && chunkModel.chunkLocation ? chunkModel.chunkLocation : null;
  const tocAnchors = chunkLocation && Array.isArray(chunkLocation.tocAnchors) ? chunkLocation.tocAnchors : [];
  const sourceRefs = chunkModel && chunkModel.chunk && Array.isArray(chunkModel.chunk.sourceRefs)
    ? chunkModel.chunk.sourceRefs
    : [];
  const candidates = [];
  const collect = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === "object") {
      Object.values(value).forEach(collect);
      return;
    }
    candidates.push(String(value));
  };
  collect(manifestChunk && manifestChunk.label);
  collect(manifestChunk && manifestChunk.href);
  collect(manifestChunk && manifestChunk.title);
  tocAnchors.forEach((anchor) => collect(anchor));
  sourceRefs.forEach((ref) => collect(ref));
  return candidates.some(isSearchExcludedSectionValue);
}

function splitHrefTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return { path: "", fragment: "" };
  const hashIndex = raw.indexOf("#");
  if (hashIndex < 0) return { path: raw, fragment: "" };
  return {
    path: raw.slice(0, hashIndex),
    fragment: raw.slice(hashIndex + 1)
  };
}

function normalizePathTail(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const noLeading = noOrigin.replace(/^\/+/, "");
  const parts = noLeading.split("/").filter(Boolean);
  if (!parts.length) return "";
  const oebpsIndex = parts.lastIndexOf("OEBPS");
  if (oebpsIndex >= 0) return parts.slice(oebpsIndex).join("/");
  return parts.join("/");
}

function sourceRefMatchesToc(sourceRef, tocItem) {
  const { path, fragment } = splitHrefTarget(tocItem && tocItem.href);
  const tocHref = normalizePathTail(path);
  const sourceHref = normalizePathTail(sourceRef && sourceRef.href);
  if (!tocHref || !sourceHref) return false;
  const hrefMatches =
    sourceHref === tocHref ||
    sourceHref.endsWith(`/${tocHref}`) ||
    tocHref.endsWith(`/${sourceHref}`);
  if (!hrefMatches) return false;
  const nodeId = String(sourceRef && sourceRef.nodeId || "").trim();
  return !fragment || !nodeId || nodeId === fragment;
}

function findFallbackTocMatchForChunk(core, localOffset = 0) {
  if (!core || !core.book || !Array.isArray(core.book.tocItems) || !core.currentChunkModel || !core.currentChunkModel.chunk) {
    return null;
  }
  const blockAnchors = Array.isArray(core.currentChunkModel.chunk.selectionLayer && core.currentChunkModel.chunk.selectionLayer.blockAnchors)
    ? core.currentChunkModel.chunk.selectionLayer.blockAnchors
    : [];
  const orderedAnchors = blockAnchors
    .filter(Boolean)
    .slice()
    .sort((left, right) => Number(left.start || 0) - Number(right.start || 0));
  let matchedAnchor = null;
  for (const anchor of orderedAnchors) {
    const start = Number(anchor.start || 0);
    if (start <= Number(localOffset || 0)) {
      matchedAnchor = anchor;
    } else {
      break;
    }
  }
  matchedAnchor = matchedAnchor || orderedAnchors[0] || null;
  if (!matchedAnchor || !matchedAnchor.sourceRef) return null;
  const tocItem = core.book.tocItems.find((item) => sourceRefMatchesToc(matchedAnchor.sourceRef, item)) || null;
  if (!tocItem) return null;
  return {
    tocId: tocItem.id,
    label: tocItem.label || tocItem.id || "",
    href: tocItem.href || "",
    blockBoundary: {
      startOffset: Number(matchedAnchor.start || 0),
      endOffset: Number(matchedAnchor.end || (Number(matchedAnchor.start || 0) + 1))
    }
  };
}

function buildApproximateFocusedAnnotationRect(core, annotation, page) {
  if (!annotation || !page || !core.currentLayout || !core.currentChunkModel || !core.currentChunkModel.chunk) return null;
  const startGlobal = annotation.rangeDescriptor && annotation.rangeDescriptor.start
    ? Number(annotation.rangeDescriptor.start.globalOffset || 0)
    : null;
  const endGlobal = annotation.rangeDescriptor && annotation.rangeDescriptor.end
    ? Number(annotation.rangeDescriptor.end.globalOffset || 0)
    : null;
  if (startGlobal == null || endGlobal == null) return null;
  const chunkStart = getCurrentChunkGlobalStart(core);
  const localStart = Math.max(0, startGlobal - chunkStart);
  const localEnd = Math.max(localStart + 1, endGlobal - chunkStart);
  if (localEnd <= page.startOffset || localStart >= page.endOffset) return null;
  const visibleLines = (core.currentLayout.lines || []).filter((line) =>
    line.lineIndex >= page.lineStartIndex &&
    line.lineIndex <= page.lineEndIndex &&
    Array.isArray(line.fragments) &&
    line.fragments.length
  );
  if (!visibleLines.length) return null;
  const span = Math.max(1, page.endOffset - page.startOffset);
  const relative = Math.max(0, Math.min(0.999, (Math.max(page.startOffset, localStart) - page.startOffset) / span));
  const targetIndex = Math.max(0, Math.min(visibleLines.length - 1, Math.floor(relative * visibleLines.length)));
  const line = visibleLines[targetIndex];
  const first = line.fragments[0];
  const last = line.fragments[line.fragments.length - 1];
  const x = Math.max(12, (first && Number.isFinite(first.x) ? first.x : 24) - 6);
  const width = Math.max(
    42,
    ((last && Number.isFinite(last.x) ? last.x : x) + (last && Number.isFinite(last.width) ? last.width : 140)) - x + 10
  );
  return {
    x,
    y: Math.max(0, (line.y || 0) - 3),
    width,
    height: Math.max(18, (line.height || 0) + 6),
    lineIndex: line.lineIndex,
    annotationId: annotation.annotationId,
    color: annotation.color || "amber",
    projectionMeta: core && core.currentLayout && core.currentLayout.projectionMeta
      ? { ...core.currentLayout.projectionMeta }
      : null
  };
}

function buildApproximateFocusedOffsetRect(core, startGlobal, endGlobal, page, color = "blue", targetId = "") {
  if (!page || !core.currentLayout || !core.currentChunkModel || !core.currentChunkModel.chunk) return null;
  if (startGlobal == null || endGlobal == null) return null;
  const chunkStart = getCurrentChunkGlobalStart(core);
  const localStart = Math.max(0, Number(startGlobal || 0) - chunkStart);
  const localEnd = Math.max(localStart + 1, Number(endGlobal || 0) - chunkStart);
  if (localEnd <= page.startOffset || localStart >= page.endOffset) return null;
  const visibleLines = (core.currentLayout.lines || []).filter((line) =>
    line.lineIndex >= page.lineStartIndex &&
    line.lineIndex <= page.lineEndIndex &&
    Array.isArray(line.fragments) &&
    line.fragments.length
  );
  if (!visibleLines.length) return null;
  const matchingLine =
    visibleLines.find((line) => localStart >= Number(line.startOffset || 0) && localStart < Number(line.endOffset || 0)) ||
    visibleLines.find((line) => localStart <= Number(line.startOffset || 0)) ||
    visibleLines[0];
  if (!matchingLine) return null;
  const first = matchingLine.fragments[0];
  const last = matchingLine.fragments[matchingLine.fragments.length - 1];
  const x = Math.max(12, (first && Number.isFinite(first.x) ? first.x : 24) - 6);
  const width = Math.max(
    42,
    ((last && Number.isFinite(last.x) ? last.x : x) + (last && Number.isFinite(last.width) ? last.width : 140)) - x + 10
  );
  return {
    x,
    y: Math.max(0, (matchingLine.y || 0) - 3),
    width,
    height: Math.max(18, (matchingLine.height || 0) + 6),
    lineIndex: matchingLine.lineIndex,
    annotationId: targetId,
    color,
    projectionMeta: core && core.currentLayout && core.currentLayout.projectionMeta
      ? { ...core.currentLayout.projectionMeta }
      : null
  };
}

function buildLayoutProjectionMeta(core) {
  return {
    chunkId: core && core.currentChunkModel && core.currentChunkModel.chunk
      ? core.currentChunkModel.chunk.chunkId
      : "",
    runtimeFontMode: core && core.currentChunkModel && core.currentChunkModel.runtimeFontMode
      ? core.currentChunkModel.runtimeFontMode
      : (core ? core.getDefaultArtifactRuntimeFontMode() : "sans"),
    configGeneration: core ? Number(core.configGeneration || 0) || 0 : 0,
    layoutGeneration: core ? Number(core.layoutGeneration || 0) || 0 : 0
  };
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
    this.fontScale = 1;
    this.fontMode = "sans";
    this.configGeneration = 1;
    this.layoutGeneration = 1;
    this.bookPaginationSummary = {
      chunkPageCounts: [],
      totalPages: 0,
      totalChunks: 0
    };
    this.focusedAnnotationId = null;
    this.focusedTocTarget = null;
    this.selectionState = createSelectionState();
    this.searchState = {
      query: "",
      matches: [],
      currentIndex: -1
    };
    this.renderMode = "shape";
    this.metricsMode = "shape";
    this.viewportWidth = 760;
    this.viewportHeight = 720;
  }

  getLayoutWidth() {
    return Math.max(280, Number(this.viewportWidth || 760));
  }

  getCurrentRuntimeFontMode() {
    if (!this.book || !this.book.artifactContract || this.book.artifactContract.kind !== "dual-family-static-v1") {
      return "sans";
    }
    const supported = Array.isArray(this.book.artifactContract.supportedFontModes)
      ? this.book.artifactContract.supportedFontModes
      : ["sans"];
    const fallback = this.book.artifactContract.defaultFontMode || "sans";
    return supported.includes(this.fontMode) ? this.fontMode : fallback;
  }

  getDefaultArtifactRuntimeFontMode() {
    if (!this.book || !this.book.artifactContract) return "sans";
    return this.book.artifactContract.defaultFontMode || "sans";
  }

  getCurrentPage() {
    if (!this.currentPaginationModel) return null;
    return this.currentPaginationModel.pages[this.currentPageIndex] || null;
  }

  getCurrentSearchMatch() {
    if (!this.searchState || !Array.isArray(this.searchState.matches)) return null;
    if (this.searchState.currentIndex < 0 || this.searchState.currentIndex >= this.searchState.matches.length) return null;
    return this.searchState.matches[this.searchState.currentIndex] || null;
  }

  clearSearchState() {
    this.searchState = {
      query: "",
      matches: [],
      currentIndex: -1
    };
  }

  async rebuildBookPaginationSummary() {
    if (!this.book) return;
    const chunkPageCounts = [];
    const runtimeFontMode = this.getCurrentRuntimeFontMode();
    for (let index = 0; index < this.book.manifest.chunks.length; index += 1) {
      const chunkModel = await loadProtectedChunkModel(this.book, index, { runtimeFontMode });
      const shapeRegistry = createGlyphShapeRegistry(chunkModel.shapeBundle, chunkModel.glyphMap);
      const layout = layoutChunk({
        chunkModel,
        styles: this.book.styleMap,
        width: this.getLayoutWidth(),
        viewportHeight: this.viewportHeight,
        fontScale: this.fontScale,
        renderMode: this.renderMode,
        metricsMode: this.metricsMode,
        shapeRegistry
      });
      const pagination = buildPaginationModel({
        chunkModel,
        layout,
        viewportHeight: this.viewportHeight,
        globalModel: this.book.globalLocationModel
      });
      chunkPageCounts.push(Math.max(1, (pagination.pages || []).length));
    }
    this.bookPaginationSummary = {
      chunkPageCounts,
      totalPages: chunkPageCounts.reduce((sum, value) => sum + value, 0),
      totalChunks: this.book.manifest.chunks.length
    };
  }

  buildCurrentSelectionCopyResponse(selectionResult) {
    if (!selectionResult || selectionResult.isCollapsed) {
      throw new Error("Selection is empty.");
    }
    const scope = createReconstructionScope({
      chunkModel: this.currentChunkModel,
      purpose: "copy-current-selection",
      startOffset: selectionResult.startOffset,
      endOffset: selectionResult.endOffset
    });
    try {
      return {
        success: true,
        clipboardText: reconstructSelectionRange(this.currentChunkModel, selectionResult, scope),
        selectedChars: selectionResult.selectedChars,
        selectedBlocks: selectionResult.selectedBlocks,
        selectedLines: selectionResult.selectedLines
      };
    } finally {
      disposeReconstructionScope(scope);
    }
  }

  async initBook({
    artifactRoot,
    renderMode = "text",
    metricsMode = "text",
    viewportWidth = 760,
    viewportHeight = 720,
    fontScale = 1,
    fontMode = "sans",
    configGeneration = this.configGeneration,
    layoutGeneration = this.layoutGeneration,
    initialRestoreToken = "",
    initialGlobalOffset = null,
    initialChunkIndex = null,
    initialPreferredGlobalStartOffset = null,
    initialPreferredGlobalEndOffset = null,
    annotations = []
  }) {
    this.renderMode = "shape";
    this.metricsMode = metricsMode === "text" ? "text" : "shape";
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.fontScale = Math.max(0.8, Math.min(1.6, Number(fontScale || 1)));
    this.fontMode = String(fontMode || "").trim().toLowerCase() === "serif" ? "serif" : "sans";
    this.configGeneration = Math.max(1, Math.floor(Number(configGeneration || this.configGeneration || 1)));
    this.layoutGeneration = Math.max(1, Math.floor(Number(layoutGeneration || this.layoutGeneration || 1)));
    this.book = await loadProtectedBook(artifactRoot);
    this.bookSummary = summarizeBook(this.book);
    let initialSnapshot = null;
    if (initialRestoreToken) {
      const descriptor = parseRestoreToken(initialRestoreToken);
      if (descriptor.bookId !== this.book.globalLocationModel.bookId) {
        throw new Error(`Restore token belongs to book ${descriptor.bookId}, expected ${this.book.globalLocationModel.bookId}.`);
      }
      const resolved = globalOffsetToLocal(this.book.globalLocationModel, descriptor.position.globalOffset);
      const chunkIndex = this.book.manifest.chunks.findIndex((item) => item.chunkId === resolved.chunkId);
      if (chunkIndex < 0) {
        throw new Error("Unable to resolve chunk for initial restore token.");
      }
      initialSnapshot = await this.goToChunk({
        chunkIndex,
        globalOffset: descriptor.position.globalOffset,
        preferredGlobalStartOffset:
          descriptor.visibleRange && Number.isFinite(Number(descriptor.visibleRange.globalStartOffset))
            ? Number(descriptor.visibleRange.globalStartOffset)
            : null,
        preferredGlobalEndOffset:
          descriptor.visibleRange && Number.isFinite(Number(descriptor.visibleRange.globalEndOffset))
            ? Number(descriptor.visibleRange.globalEndOffset)
            : null,
        annotations,
        includeBook: true
      });
    } else if (initialGlobalOffset != null) {
      initialSnapshot = await this.goToChunk({
        chunkIndex: Number.isFinite(Number(initialChunkIndex)) ? Math.max(0, Math.floor(Number(initialChunkIndex))) : 0,
        globalOffset: Number(initialGlobalOffset),
        preferredGlobalStartOffset:
          Number.isFinite(Number(initialPreferredGlobalStartOffset))
            ? Number(initialPreferredGlobalStartOffset)
            : null,
        preferredGlobalEndOffset:
          Number.isFinite(Number(initialPreferredGlobalEndOffset))
            ? Number(initialPreferredGlobalEndOffset)
            : null,
        annotations,
        includeBook: true
      });
    } else {
      initialSnapshot = await this.goToChunk({ chunkIndex: 0, annotations, includeBook: true });
    }
    Promise.resolve()
      .then(() => ensureProtectedBookLocations(this.book))
      .then(() => {
        if (!this.currentChunkModel || !this.book || !this.book.locations || !Array.isArray(this.book.locations.chunks)) {
          return;
        }
        const chunkId = this.currentChunkModel.chunk && this.currentChunkModel.chunk.chunkId;
        const chunkLocation = this.book.locations.chunks.find((item) => item && item.chunkId === chunkId) || null;
        this.currentChunkModel.chunkLocation = chunkLocation;
        this.currentChunkModel.tocLabel = getChunkTocLabel(chunkLocation) || this.currentChunkModel.tocLabel || "";
      })
      .catch(() => {});
    Promise.resolve()
      .then(() => this.rebuildBookPaginationSummary())
      .catch(() => {});
    return initialSnapshot;
  }

  async goToChunk({
    chunkIndex,
    pageIndex = null,
    globalOffset = null,
    preferredGlobalStartOffset = null,
    preferredGlobalEndOffset = null,
    annotations = [],
    includeBook = false,
    runtimeFontMode = this.getCurrentRuntimeFontMode()
  }) {
    if (!this.book) throw new Error("Book is not initialized.");
    const boundedIndex = Math.max(0, Math.min(chunkIndex, this.book.manifest.chunks.length - 1));
    this.currentChunkIndex = boundedIndex;
    this.currentChunkModel = await loadProtectedChunkModel(this.book, boundedIndex, { runtimeFontMode });
    this.currentShapeRegistry = createGlyphShapeRegistry(
      this.currentChunkModel.shapeBundle,
      this.currentChunkModel.glyphMap
    );
    this.currentLayout = layoutChunk({
      chunkModel: this.currentChunkModel,
      styles: this.book.styleMap,
      bookLanguage:
        Array.isArray(this.book && this.book.manifest && this.book.manifest.metadata && this.book.manifest.metadata.languages) &&
        this.book.manifest.metadata.languages.length
          ? String(this.book.manifest.metadata.languages[0] || "")
          : "",
      width: this.getLayoutWidth(),
      viewportHeight: this.viewportHeight,
      fontScale: this.fontScale,
      renderMode: this.renderMode,
      metricsMode: this.metricsMode,
      shapeRegistry: this.currentShapeRegistry
    });
    this.currentLayout.projectionMeta = buildLayoutProjectionMeta(this);
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
      const fallbackPageIndex = findPageIndexForOffset(
        this.currentPaginationModel,
        Math.max(0, localOffset)
      );
      const hasPreferredVisibleRange =
        Number.isFinite(Number(preferredGlobalStartOffset)) &&
        Number.isFinite(Number(preferredGlobalEndOffset)) &&
        Number(preferredGlobalEndOffset) > Number(preferredGlobalStartOffset);
      this.currentPageIndex = hasPreferredVisibleRange
        ? findBestPageIndexForVisibleRange(
            this.currentPaginationModel,
            Number(preferredGlobalStartOffset),
            Number(preferredGlobalEndOffset),
            fallbackPageIndex
          )
        : fallbackPageIndex;
    } else if (pageIndex != null) {
      this.currentPageIndex = Math.max(0, Math.min(pageIndex, this.currentPaginationModel.pages.length - 1));
    } else {
      this.currentPageIndex = 0;
    }
    this.selectionState = createSelectionState();
    this.focusedAnnotationId = null;
    if (!this.focusedTocTarget || this.focusedTocTarget.chunkIndex !== boundedIndex) {
      this.focusedTocTarget = null;
    }
    return this.buildSnapshot({ annotations, includeBook });
  }

  async goToToc({ tocId, annotations = [] }) {
    await ensureProtectedBookLocations(this.book);
    const tocItem = (this.book && this.book.tocItems || []).find((item) => item.id === tocId) || null;
    let chunkIndex = findChunkIndexForToc(this.book.manifest, this.book.locations, tocItem);
    let globalOffset = findGlobalOffsetForToc(this.book.manifest, this.book.locations, tocItem);
    let chunkLocation = this.book.locations && Array.isArray(this.book.locations.chunks)
      ? this.book.locations.chunks[chunkIndex] || null
      : null;
    let blockBoundary = null;

    if ((chunkIndex < 0 || globalOffset == null) && tocItem) {
      for (let index = 0; index < this.book.manifest.chunks.length; index += 1) {
        const candidateModel = await loadProtectedChunkModel(this.book, index);
        const blockAnchors = Array.isArray(candidateModel && candidateModel.chunk && candidateModel.chunk.selectionLayer && candidateModel.chunk.selectionLayer.blockAnchors)
          ? candidateModel.chunk.selectionLayer.blockAnchors
          : [];
        const logicalBlocks = Array.isArray(candidateModel && candidateModel.chunk && candidateModel.chunk.logicalBlockList)
          ? candidateModel.chunk.logicalBlockList
          : [];
        const matchedBlockAnchor = blockAnchors.find((anchor) => sourceRefMatchesToc(anchor && anchor.sourceRef, tocItem)) || null;
        const matchedLogicalBlock = logicalBlocks.find((block) => sourceRefMatchesToc(block && block.sourceRef, tocItem)) || null;
        const matchedSourceRef = (candidateModel.chunk.sourceRefs || []).find((sourceRef) => sourceRefMatchesToc(sourceRef, tocItem)) || null;
        if (!matchedBlockAnchor && !matchedLogicalBlock && !matchedSourceRef) continue;
        chunkIndex = index;
        chunkLocation = candidateModel.chunkLocation || (
          this.book.locations && Array.isArray(this.book.locations.chunks)
            ? this.book.locations.chunks[index] || null
            : null
        );
        blockBoundary = matchedBlockAnchor
          ? {
              startOffset: Number(matchedBlockAnchor.start || 0),
              endOffset: Number(matchedBlockAnchor.end || (Number(matchedBlockAnchor.start || 0) + 1))
            }
          : matchedLogicalBlock
            ? {
                startOffset: 0,
                endOffset: Number(matchedLogicalBlock.textLength || 1)
              }
            : null;
        globalOffset = chunkLocation
          ? Number(chunkLocation.startOffset || 0) + Number(blockBoundary ? blockBoundary.startOffset : 0)
          : Number(candidateModel.chunk.startOffset || 0);
        break;
      }
    }

    if (chunkIndex < 0) throw new Error(`TOC item ${tocId} has no mapped chunk.`);
    if (!chunkLocation) {
      chunkLocation = this.book.locations && Array.isArray(this.book.locations.chunks)
        ? this.book.locations.chunks[chunkIndex] || null
        : null;
    }
    if (globalOffset == null) {
      globalOffset = chunkLocation ? Number(chunkLocation.startOffset || 0) : 0;
    }
    if (!blockBoundary) {
      const tocAnchor = chunkLocation && Array.isArray(chunkLocation.tocAnchors)
        ? chunkLocation.tocAnchors.find((anchor) =>
            anchor && (anchor.tocId === tocId || anchor.href === (tocItem && tocItem.href))
          ) || null
        : null;
      blockBoundary = chunkLocation && Array.isArray(chunkLocation.blockBoundaries)
        ? chunkLocation.blockBoundaries.find((boundary) =>
            boundary && (
              boundary.blockId === (tocAnchor && tocAnchor.blockId) ||
              boundary.locationId === (tocAnchor && tocAnchor.locationId)
            )
          ) || null
        : null;
    }
    this.focusedTocTarget = {
      tocId,
      label: tocItem && tocItem.label ? tocItem.label : "",
      chunkIndex,
      startGlobal: globalOffset,
      endGlobal: blockBoundary
        ? Number(chunkLocation.startOffset || 0) + Number(blockBoundary.endOffset || (Number(blockBoundary.startOffset || 0) + 1))
        : Number(globalOffset || 0) + 1
    };
    return this.goToChunk({ chunkIndex, globalOffset, annotations });
  }

  async goToNextPage({ annotations = [], runtimeFontMode = this.getCurrentRuntimeFontMode() } = {}) {
    this.focusedTocTarget = null;
    if (this.currentPageIndex < this.currentPaginationModel.pages.length - 1) {
      if ((this.currentChunkModel && this.currentChunkModel.runtimeFontMode) !== runtimeFontMode) {
        return this.goToChunk({
          chunkIndex: this.currentChunkIndex,
          pageIndex: this.currentPageIndex + 1,
          annotations,
          runtimeFontMode
        });
      }
      this.currentPageIndex += 1;
      this.selectionState = createSelectionState();
      return this.buildSnapshot({ annotations });
    }
    if (this.currentChunkIndex < this.book.manifest.chunks.length - 1) {
      return this.goToChunk({
        chunkIndex: this.currentChunkIndex + 1,
        pageIndex: 0,
        annotations,
        runtimeFontMode
      });
    }
    return this.buildSnapshot({ annotations });
  }

  async goToPrevPage({ annotations = [], runtimeFontMode = this.getCurrentRuntimeFontMode() } = {}) {
    this.focusedTocTarget = null;
    if (this.currentPageIndex > 0) {
      if ((this.currentChunkModel && this.currentChunkModel.runtimeFontMode) !== runtimeFontMode) {
        return this.goToChunk({
          chunkIndex: this.currentChunkIndex,
          pageIndex: this.currentPageIndex - 1,
          annotations,
          runtimeFontMode
        });
      }
      this.currentPageIndex -= 1;
      this.selectionState = createSelectionState();
      return this.buildSnapshot({ annotations });
    }
    if (this.currentChunkIndex > 0) {
      const snapshot = await this.goToChunk({
        chunkIndex: this.currentChunkIndex - 1,
        pageIndex: Number.MAX_SAFE_INTEGER,
        annotations,
        runtimeFontMode
      });
      this.currentPageIndex = Math.max(0, this.currentPaginationModel.pages.length - 1);
      return this.buildSnapshot({ annotations, includeBook: !!snapshot.bookSummary });
    }
    return this.buildSnapshot({ annotations });
  }

  captureRuntimeState() {
    return {
      currentChunkIndex: this.currentChunkIndex,
      currentChunkModel: this.currentChunkModel,
      currentShapeRegistry: this.currentShapeRegistry,
      currentLayout: this.currentLayout,
      currentPaginationModel: this.currentPaginationModel,
      currentPageIndex: this.currentPageIndex,
      selectionState: this.selectionState,
      focusedAnnotationId: this.focusedAnnotationId,
      focusedTocTarget: this.focusedTocTarget,
      searchState: this.searchState
    };
  }

  restoreRuntimeState(savedState) {
    if (!savedState) return;
    this.currentChunkIndex = savedState.currentChunkIndex;
    this.currentChunkModel = savedState.currentChunkModel;
    this.currentShapeRegistry = savedState.currentShapeRegistry;
    this.currentLayout = savedState.currentLayout;
    this.currentPaginationModel = savedState.currentPaginationModel;
    this.currentPageIndex = savedState.currentPageIndex;
    this.selectionState = savedState.selectionState;
    this.focusedAnnotationId = savedState.focusedAnnotationId;
    this.focusedTocTarget = savedState.focusedTocTarget;
    this.searchState = savedState.searchState;
  }

  async previewNeighborPage({ direction = "next", annotations = [] } = {}) {
    const normalizedDirection = direction === "prev" ? "prev" : "next";
    const hasPrev =
      this.currentPageIndex > 0 ||
      this.currentChunkIndex > 0;
    const hasNext =
      this.currentPageIndex < this.currentPaginationModel.pages.length - 1 ||
      this.currentChunkIndex < this.book.manifest.chunks.length - 1;
    if ((normalizedDirection === "prev" && !hasPrev) || (normalizedDirection === "next" && !hasNext)) {
      return null;
    }
    const savedState = this.captureRuntimeState();
    const runtimeFontMode = this.getCurrentRuntimeFontMode();
    try {
      return normalizedDirection === "prev"
        ? await this.goToPrevPage({ annotations, runtimeFontMode })
        : await this.goToNextPage({ annotations, runtimeFontMode });
    } finally {
      this.restoreRuntimeState(savedState);
    }
  }

  async selectAutomationSample({ annotations = [] } = {}) {
    const page = this.getCurrentPage();
    if (!this.currentLayout || !page) {
      throw new Error("Reader is not ready for automation selection.");
    }
    const projectionMeta = this.currentLayout && this.currentLayout.projectionMeta
      ? this.currentLayout.projectionMeta
      : null;
    const visibleLines = (this.currentLayout.lines || []).filter((line) =>
      line.lineIndex >= page.lineStartIndex &&
      line.lineIndex <= page.lineEndIndex &&
      Array.isArray(line.fragments) &&
      line.fragments.length
    );
    for (const line of visibleLines) {
      const lineLength = Math.max(0, line.endOffset - line.startOffset);
      if (lineLength < 8) continue;
      const startOffset = Math.min(line.endOffset - 4, line.startOffset + 2);
      const endOffset = Math.min(line.endOffset, startOffset + Math.min(36, Math.max(8, lineLength - 2)));
      if (endOffset <= startOffset) continue;
      const anchor = buildAutomationSelectionPosition(line, startOffset, projectionMeta);
      const focus = buildAutomationSelectionPosition(line, endOffset, projectionMeta);
      if (!anchor || !focus) continue;
      this.selectionState = {
        anchor,
        focus,
        dragging: false,
        selectionType: "range"
      };
      return this.buildSnapshot({ annotations });
    }
    throw new Error("No automation-selectable sample range is available on the current page.");
  }

  async setFontScale({
    fontScale = 1,
    fontMode = this.fontMode,
    configGeneration = this.configGeneration,
    layoutGeneration = this.layoutGeneration,
    annotations = []
  } = {}) {
    this.fontScale = Math.max(0.8, Math.min(1.6, Number(fontScale || 1)));
    this.fontMode = String(fontMode || "").trim().toLowerCase() === "serif" ? "serif" : "sans";
    this.configGeneration = Math.max(1, Math.floor(Number(configGeneration || this.configGeneration || 1)));
    this.layoutGeneration = Math.max(1, Math.floor(Number(layoutGeneration || this.layoutGeneration || 1)));
    await this.rebuildBookPaginationSummary();
    return this.goToChunk({
      chunkIndex: this.currentChunkIndex,
      pageIndex: this.currentPageIndex,
      annotations
    });
  }

  async updateRenderConfig({
    renderMode,
    metricsMode,
    viewportWidth = this.viewportWidth,
    viewportHeight = this.viewportHeight,
    fontScale = this.fontScale,
    fontMode = this.fontMode,
    configGeneration = this.configGeneration,
    layoutGeneration = this.layoutGeneration,
    annotations = []
  }) {
    this.renderMode = "shape";
    this.metricsMode = metricsMode === "text" ? "text" : "shape";
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.fontScale = Math.max(0.8, Math.min(1.6, Number(fontScale || 1)));
    this.fontMode = String(fontMode || "").trim().toLowerCase() === "serif" ? "serif" : "sans";
    this.configGeneration = Math.max(1, Math.floor(Number(configGeneration || this.configGeneration || 1)));
    this.layoutGeneration = Math.max(1, Math.floor(Number(layoutGeneration || this.layoutGeneration || 1)));
    await this.rebuildBookPaginationSummary();
    return this.goToChunk({
      chunkIndex: this.currentChunkIndex,
      pageIndex: this.currentPageIndex,
      annotations
    });
  }

  async searchBook({ query = "", annotations = [] } = {}) {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      this.clearSearchState();
      return this.buildSnapshot({ annotations });
    }
    const queryLower = normalizedQuery.toLowerCase();
    const matches = [];
    const chunkPageCounts = this.bookPaginationSummary && Array.isArray(this.bookPaginationSummary.chunkPageCounts)
      ? this.bookPaginationSummary.chunkPageCounts
      : [];
    const globalPageCount = Number(this.bookPaginationSummary && this.bookPaginationSummary.totalPages || 0) || 0;
    const runtimeFontMode = this.getCurrentRuntimeFontMode();
    for (let chunkIndex = 0; chunkIndex < this.book.manifest.chunks.length; chunkIndex += 1) {
      const manifestChunk = this.book.manifest.chunks[chunkIndex] || {};
      const chunkModel = await loadProtectedChunkModel(this.book, chunkIndex, { runtimeFontMode });
      if (isSearchExcludedChunk(manifestChunk, chunkModel)) continue;
      const shapeRegistry = createGlyphShapeRegistry(chunkModel.shapeBundle, chunkModel.glyphMap);
      const layout = layoutChunk({
        chunkModel,
        styles: this.book.styleMap,
        width: this.getLayoutWidth(),
        viewportHeight: this.viewportHeight,
        fontScale: this.fontScale,
        renderMode: this.renderMode,
        metricsMode: this.metricsMode,
        shapeRegistry
      });
      const pagination = buildPaginationModel({
        chunkModel,
        layout,
        viewportHeight: this.viewportHeight,
        globalModel: this.book.globalLocationModel
      });
      const globalPageBeforeChunk = chunkPageCounts
        .slice(0, chunkIndex)
        .reduce((sum, value) => sum + Number(value || 0), 0);
      const textEndOffset = chunkModel.textSegments.length
        ? chunkModel.textSegments[chunkModel.textSegments.length - 1].end
        : 0;
      const scope = createReconstructionScope({
        chunkModel,
        purpose: "search-book",
        startOffset: 0,
        endOffset: textEndOffset
      });
      try {
        const text = reconstructRangeText(chunkModel, 0, textEndOffset, scope);
        const lower = text.toLowerCase();
        let cursor = 0;
        while (cursor < lower.length) {
          const foundAt = lower.indexOf(queryLower, cursor);
          if (foundAt < 0) break;
          let excerptStart = Math.max(0, foundAt - 48);
          let excerptEnd = Math.min(text.length, foundAt + normalizedQuery.length + 72);
          while (excerptStart > 0 && /\S/.test(text.charAt(excerptStart - 1))) excerptStart -= 1;
          while (excerptEnd < text.length && /\S/.test(text.charAt(excerptEnd))) excerptEnd += 1;
          const excerpt = text
            .slice(excerptStart, excerptEnd)
            .replace(/\s+/g, " ")
            .trim();
          const matchPageIndex = findPageIndexForOffset(pagination, foundAt);
          const globalPageIndex = globalPageBeforeChunk + Number(matchPageIndex || 0) + 1;
          matches.push({
            chunkIndex,
            chunkId: chunkModel.chunk.chunkId,
            startOffset: foundAt,
            endOffset: foundAt + normalizedQuery.length,
            globalStartOffset: Number(manifestChunk.startOffset || 0) + foundAt,
            globalEndOffset: Number(manifestChunk.startOffset || 0) + foundAt + normalizedQuery.length,
            excerpt,
            globalPageLabel: globalPageCount ? `${globalPageIndex} / ${globalPageCount}` : `${globalPageIndex}`
          });
          cursor = foundAt + Math.max(1, normalizedQuery.length);
        }
      } finally {
        disposeReconstructionScope(scope);
      }
    }
    this.searchState = {
      query: normalizedQuery,
      matches,
      currentIndex: matches.length ? 0 : -1
    };
    if (!matches.length) {
      return this.buildSnapshot({ annotations });
    }
    const match = matches[0];
    return this.goToChunk({
      chunkIndex: match.chunkIndex,
      globalOffset: match.globalStartOffset,
      annotations
    });
  }

  getSearchResults() {
    return {
      active: !!(this.searchState && this.searchState.query),
      query: this.searchState ? this.searchState.query : "",
      totalMatches: this.searchState && Array.isArray(this.searchState.matches) ? this.searchState.matches.length : 0,
      currentMatch: this.searchState && this.searchState.currentIndex >= 0 ? this.searchState.currentIndex + 1 : 0,
      matches: []
    };
  }

  async getPageNumbersForGlobalOffsets({ globalOffsets = [] } = {}) {
    const labels = {};
    if (!this.book || !Array.isArray(globalOffsets) || !globalOffsets.length) {
      return { labels };
    }
    const runtimeFontMode = this.getCurrentRuntimeFontMode();
    const chunkPageCounts = Array.isArray(this.bookPaginationSummary && this.bookPaginationSummary.chunkPageCounts)
      ? this.bookPaginationSummary.chunkPageCounts
      : [];
    const manifestChunks = Array.isArray(this.book && this.book.manifest && this.book.manifest.chunks)
      ? this.book.manifest.chunks
      : [];
    const chunkCache = new Map();
    const chunkIndexById = new Map(manifestChunks.map((chunk, index) => [String(chunk && chunk.chunkId || ""), index]));
    for (const rawOffset of globalOffsets) {
      const normalizedOffset = Number(rawOffset || 0);
      const key = String(rawOffset);
      if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0) {
        labels[key] = "";
        continue;
      }
      const resolved = globalOffsetToLocal(this.book.globalLocationModel, normalizedOffset);
      if (!resolved || !resolved.chunkId) {
        labels[key] = "";
        continue;
      }
      const chunkIndex = chunkIndexById.get(String(resolved.chunkId || ""));
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        labels[key] = "";
        continue;
      }
      let cached = chunkCache.get(chunkIndex);
      if (!cached) {
        const chunkModel = await loadProtectedChunkModel(this.book, chunkIndex, { runtimeFontMode });
        const shapeRegistry = createGlyphShapeRegistry(chunkModel.shapeBundle, chunkModel.glyphMap);
        const layout = layoutChunk({
          chunkModel,
          styles: this.book.styleMap,
          width: this.getLayoutWidth(),
          viewportHeight: this.viewportHeight,
          fontScale: this.fontScale,
          renderMode: this.renderMode,
          metricsMode: this.metricsMode,
          shapeRegistry
        });
        const pagination = buildPaginationModel({
          chunkModel,
          layout,
          viewportHeight: this.viewportHeight,
          globalModel: this.book.globalLocationModel
        });
        const globalPageBeforeChunk = chunkPageCounts
          .slice(0, chunkIndex)
          .reduce((sum, value) => sum + Number(value || 0), 0);
        cached = {
          pagination,
          globalPageBeforeChunk
        };
        chunkCache.set(chunkIndex, cached);
      }
      const pageIndex = findPageIndexForOffset(cached.pagination, Number(resolved.localOffset || 0));
      labels[key] = String(cached.globalPageBeforeChunk + Number(pageIndex || 0) + 1);
    }
    return { labels };
  }

  async goToSearchResult({ resultIndex = -1, annotations = [] } = {}) {
    const nextIndex = Number(resultIndex);
    if (!Number.isFinite(nextIndex) || nextIndex < 0 || !this.searchState || !Array.isArray(this.searchState.matches)) {
      return this.buildSnapshot({ annotations });
    }
    if (nextIndex >= this.searchState.matches.length) {
      return this.buildSnapshot({ annotations });
    }
    this.searchState.currentIndex = nextIndex;
    const match = this.getCurrentSearchMatch();
    if (!match) return this.buildSnapshot({ annotations });
    return this.goToChunk({
      chunkIndex: match.chunkIndex,
      globalOffset: match.globalStartOffset,
      annotations
    });
  }

  async searchNextResult({ annotations = [] } = {}) {
    if (!this.searchState.matches.length) return this.buildSnapshot({ annotations });
    this.searchState.currentIndex = (this.searchState.currentIndex + 1) % this.searchState.matches.length;
    const match = this.getCurrentSearchMatch();
    return this.goToChunk({
      chunkIndex: match.chunkIndex,
      globalOffset: match.globalStartOffset,
      annotations
    });
  }

  async searchPrevResult({ annotations = [] } = {}) {
    if (!this.searchState.matches.length) return this.buildSnapshot({ annotations });
    const count = this.searchState.matches.length;
    this.searchState.currentIndex = (this.searchState.currentIndex - 1 + count) % count;
    const match = this.getCurrentSearchMatch();
    return this.goToChunk({
      chunkIndex: match.chunkIndex,
      globalOffset: match.globalStartOffset,
      annotations
    });
  }

  clearSearch({ annotations = [] } = {}) {
    this.clearSearchState();
    return this.buildSnapshot({ annotations });
  }

  pointerDown({ x, y, shiftKey = false, annotations = [] }) {
    const position = hitTestPosition(this.currentLayout, x, y);
    this.focusedAnnotationId = null;
    if (!position) return this.buildSnapshot({ annotations });
    this.selectionState = shiftKey && (this.selectionState.anchor || this.selectionState.focus)
      ? extendSelection(this.selectionState, position)
      : beginSelection(this.selectionState, position);
    return this.buildSnapshot({ annotations });
  }

  selectWordAtPoint({ x, y, annotations = [] }) {
    const position = hitTestPosition(this.currentLayout, x, y);
    this.focusedAnnotationId = null;
    if (!position) return this.buildSnapshot({ annotations });
    const snapped = snapSelectionOffsets(
      this.currentChunkModel.wordBoundaryModel,
      position.offset,
      position.offset + 1
    );
    if (
      snapped &&
      snapped.startOffset != null &&
      snapped.endOffset != null &&
      snapped.startOffset !== snapped.endOffset
    ) {
      this.selectionState = {
        anchor: { ...position, offset: snapped.startOffset },
        focus: { ...position, offset: snapped.endOffset },
        dragging: true,
        selectionType: "range"
      };
      return this.buildSnapshot({ annotations });
    }
    this.selectionState = beginSelection(this.selectionState, position);
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
    this.focusedAnnotationId = null;
    return this.buildSnapshot({ annotations });
  }

  copyCurrentSelection() {
    const selectionResult = buildSelectionResult({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionState: this.selectionState
    });
    const payload = this.buildCurrentSelectionCopyResponse(selectionResult);
    assertNoForbiddenTextLikeFields(
      { ...payload, clipboardText: undefined },
      "copyCurrentSelection.metadata"
    );
    return payload;
  }

  createAnnotationFromCurrentSelection({ type, noteText = "" } = {}) {
    const selectionResult = buildSelectionResult({
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionState: this.selectionState
    });
    const payload = buildAnnotationFromCurrentSelection({
      bookId: this.book.globalLocationModel.bookId,
      globalModel: this.book.globalLocationModel,
      chunkModel: this.currentChunkModel,
      layout: this.currentLayout,
      selectionResult,
      page: this.getCurrentPage(),
      type,
      noteText
    });
    assertNoForbiddenTextLikeFields(payload, "createAnnotationFromCurrentSelection");
    return payload;
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
      preferredGlobalStartOffset:
        descriptor.visibleRange && Number.isFinite(Number(descriptor.visibleRange.globalStartOffset))
          ? Number(descriptor.visibleRange.globalStartOffset)
          : null,
      preferredGlobalEndOffset:
        descriptor.visibleRange && Number.isFinite(Number(descriptor.visibleRange.globalEndOffset))
          ? Number(descriptor.visibleRange.globalEndOffset)
          : null,
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
    this.focusedTocTarget = null;
    if (!rangeDescriptor || !rangeDescriptor.start) throw new Error("Annotation range is missing.");
    const resolved = globalOffsetToLocal(this.book.globalLocationModel, rangeDescriptor.start.globalOffset);
    if (!resolved) throw new Error("Unable to resolve annotation target.");
    const chunkIndex = this.book.manifest.chunks.findIndex((item) => item.chunkId === resolved.chunkId);
    if (chunkIndex < 0) throw new Error(`Unable to locate chunk ${resolved.chunkId}.`);
    const snapshot = await this.goToChunk({ chunkIndex, globalOffset: rangeDescriptor.start.globalOffset, annotations });
    this.focusedAnnotationId = rangeDescriptor.annotationId || null;
    return this.buildSnapshot({ annotations, includeBook: !!snapshot.bookSummary });
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
      pageWindow: {
        ...page,
        focusedAnnotationId: this.focusedAnnotationId
      }
    });
    const activeOffset = this.focusedTocTarget &&
      this.focusedTocTarget.chunkIndex === this.currentChunkIndex &&
      page &&
      this.focusedTocTarget.startGlobal >= Number(page.globalStartOffset || 0) &&
      this.focusedTocTarget.startGlobal < Number(page.globalEndOffset || 0)
        ? Number(this.focusedTocTarget.startGlobal || 0) - getCurrentChunkGlobalStart(this)
        : Number(page ? page.startOffset : 0);
    if (this.focusedAnnotationId && annotationOverlay.focusHighlights.length === 0 && page) {
      const focusedAnnotation = (annotations || []).find((annotation) => annotation.annotationId === this.focusedAnnotationId) || null;
      const fallbackFocusRect = buildApproximateFocusedAnnotationRect(this, focusedAnnotation, page);
      if (fallbackFocusRect) {
        annotationOverlay.focusHighlights.push(fallbackFocusRect);
      }
    }
    const chunkPageCounts = this.bookPaginationSummary.chunkPageCounts || [];
    const globalPageBeforeChunk = chunkPageCounts
      .slice(0, this.currentChunkIndex)
      .reduce((sum, value) => sum + value, 0);
    const globalPageIndex = globalPageBeforeChunk + this.currentPageIndex + 1;
    const globalPageCount = this.bookPaginationSummary.totalPages || this.currentPaginationModel.pages.length;
    const currentSearchMatch = this.getCurrentSearchMatch();
    const searchHighlights =
      currentSearchMatch &&
      currentSearchMatch.chunkId === this.currentChunkModel.chunk.chunkId &&
      page &&
      currentSearchMatch.endOffset > page.startOffset &&
      currentSearchMatch.startOffset < page.endOffset
        ? buildRangeHighlights(
            this.currentLayout,
            currentSearchMatch.startOffset,
            currentSearchMatch.endOffset
          )
        : [];
    const chunk = this.currentChunkModel.chunk;
    const location = this.currentChunkModel.chunkLocation;
    const derivedActiveAnchor = page
      ? (
          getActiveTocAnchorForPosition(this.book.locations, this.currentChunkIndex, activeOffset) ||
          findFallbackTocMatchForChunk(this, activeOffset)
        )
      : null;
    const focusedTocAnchor = page && this.focusedTocTarget &&
      Number(this.focusedTocTarget.startGlobal || 0) >= Number(page.globalStartOffset || 0) &&
      Number(this.focusedTocTarget.startGlobal || 0) < Number(page.globalEndOffset || 0)
        ? {
            tocId: this.focusedTocTarget.tocId || "",
            label: this.focusedTocTarget.label || "",
            href: ""
          }
        : null;
    const activeAnchor = focusedTocAnchor || derivedActiveAnchor;
    const chunkSummary = {
      chunkId: chunk.chunkId,
      order: this.currentChunkIndex + 1,
      total: this.book.manifest.chunks.length,
      locationId: location ? location.locationId : null,
      tocId: activeAnchor ? activeAnchor.tocId || "" : "",
      tocLabel: activeAnchor ? activeAnchor.label || this.currentChunkModel.tocLabel || "none" : this.currentChunkModel.tocLabel || "none",
      blocks: chunk.logicalBlockList.length,
      segments: buildChunkSelectionIndex(chunk).segmentCount
    };
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
    let mediaItems = [];
    let reconstructionScope = "none";
    let reconstructionCacheSize = 0;
    glyphOps = filterGlyphOpsForPage(
      buildGlyphRenderOps({
        layout: this.currentLayout,
        chunkModel: this.currentChunkModel,
        shapeRegistry: this.currentShapeRegistry,
        renderMode: this.renderMode,
        styleMap: this.book && this.book.styleMap ? this.book.styleMap : null
      }),
      page
    );
    shapeRecords = gatherShapeRecords(this.currentChunkModel.shapeBundle, glyphOps);
    mediaItems = filterMediaItemsForPage(this.currentLayout && this.currentLayout.mediaItems, page).map((item) => ({
      ...item,
      assetUrl:
        item && item.resolvedHref && this.book && this.book.manifest && this.book.manifest.source && this.book.manifest.source.publicRootPath
          ? `${String(this.book.manifest.source.publicRootPath).replace(/\/$/, "")}/${String(item.resolvedHref).replace(/^\/+/, "")}`
          : ""
    }));

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
      projectionMeta: this.currentLayout && this.currentLayout.projectionMeta
        ? { ...this.currentLayout.projectionMeta }
        : null,
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

    const snapshot = {
      configGeneration: this.configGeneration,
      layoutGeneration: this.layoutGeneration,
      bookSummary: includeBook ? this.bookSummary : null,
      tocItems: includeBook ? this.book.tocItems : null,
      chunkSummary,
      pageSummary: page
        ? {
            pageIndex: this.currentPageIndex,
            pageCount: this.currentPaginationModel.pages.length,
            globalPageIndex,
            globalPageCount,
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
        mediaItems,
        searchHighlights,
        selectionHighlights,
        annotationHighlights: annotationOverlay.visibleHighlights,
        focusHighlights: annotationOverlay.focusHighlights,
        noteMarkers: annotationOverlay.noteMarkers,
        diagnostics: renderDiagnostics
      },
      runtimeMeta: {
        bookTitle: (this.book.manifest.metadata || {}).title || "(untitled)",
        chunkSummary,
        pageSummary: page
          ? {
            pageLabel: `${this.currentPageIndex + 1} / ${this.currentPaginationModel.pages.length}`,
              globalPageLabel: `${globalPageIndex} / ${globalPageCount}`,
              globalOffsetLabel: `${page.globalStartOffset}..${page.globalEndOffset}`
            }
          : null,
        typographySummary: {
          fontScale: this.fontScale,
          fontMode: this.fontMode,
          runtimeFontMode: this.currentChunkModel && this.currentChunkModel.runtimeFontMode
            ? this.currentChunkModel.runtimeFontMode
            : this.getDefaultArtifactRuntimeFontMode(),
          viewportWidth: this.getLayoutWidth(),
          viewportHeight: this.viewportHeight,
          columnCount: this.currentLayout && this.currentLayout.columnCount ? this.currentLayout.columnCount : 1,
          columnWidth: this.currentLayout && this.currentLayout.columnWidth ? this.currentLayout.columnWidth : this.getLayoutWidth(),
          pageSlotCount: this.currentLayout && this.currentLayout.pageSlotCount ? this.currentLayout.pageSlotCount : this.currentPaginationModel.pages.length,
          padding: this.currentLayout && Number.isFinite(this.currentLayout.padding) ? this.currentLayout.padding : 0,
          paddingX: this.currentLayout && Number.isFinite(this.currentLayout.paddingX) ? this.currentLayout.paddingX : 0,
          paddingY: this.currentLayout && Number.isFinite(this.currentLayout.paddingY) ? this.currentLayout.paddingY : 0,
          columnGap: this.currentLayout && Number.isFinite(this.currentLayout.columnGap) ? this.currentLayout.columnGap : 0
        },
        projectionSummary: this.currentLayout && this.currentLayout.projectionMeta
          ? { ...this.currentLayout.projectionMeta }
          : buildLayoutProjectionMeta(this),
        generationSummary: {
          configGeneration: this.configGeneration,
          layoutGeneration: this.layoutGeneration
        },
        focusSummary: {
          annotationId: this.focusedAnnotationId || "",
          highlightCount: Array.isArray(annotationOverlay.focusHighlights)
            ? annotationOverlay.focusHighlights.length
            : 0
        },
        searchSummary: {
          active: !!(this.searchState && this.searchState.query),
          query: this.searchState ? this.searchState.query : "",
          totalMatches: this.searchState && Array.isArray(this.searchState.matches) ? this.searchState.matches.length : 0,
          currentMatch: this.searchState && this.searchState.currentIndex >= 0 ? this.searchState.currentIndex + 1 : 0,
          matches: []
        },
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
    assertNoForbiddenTextLikeFields(snapshot, "snapshot");
    return snapshot;
  }
}
