import { snapSelectionOffsets } from "./protected-word-boundary.js";

function comparePositions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.offset - b.offset;
}

export function buildChunkSelectionIndex(chunk) {
  const layer = chunk.selectionLayer || {};
  return {
    textLength: layer.textLength || 0,
    segmentCount: Array.isArray(layer.textSegments) ? layer.textSegments.length : 0,
    rangeCount: Array.isArray(layer.ranges) ? layer.ranges.length : 0,
    blockAnchorCount: Array.isArray(layer.blockAnchors) ? layer.blockAnchors.length : 0,
    noteAnchorCount: Array.isArray(layer.noteAnchors) ? layer.noteAnchors.length : 0,
    copyRangeCount: Array.isArray(layer.copyRanges) ? layer.copyRanges.length : 0
  };
}

export function createSelectionState() {
  return {
    anchor: null,
    focus: null,
    dragging: false,
    selectionType: "none"
  };
}

export function beginSelection(state, position) {
  return {
    anchor: position,
    focus: position,
    dragging: true,
    selectionType: "caret"
  };
}

export function updateSelection(state, position) {
  if (!state.anchor) return state;
  const selectionType = comparePositions(state.anchor, position) === 0 ? "caret" : "range";
  return {
    ...state,
    focus: position,
    selectionType
  };
}

export function endSelection(state) {
  return {
    ...state,
    dragging: false
  };
}

export function extendSelection(state, position) {
  const anchor = state.anchor || state.focus || position;
  const selectionType = comparePositions(anchor, position) === 0 ? "caret" : "range";
  return {
    anchor,
    focus: position,
    dragging: false,
    selectionType
  };
}

export function clearSelection() {
  return createSelectionState();
}

export function normalizeSelection(state) {
  if (!state.anchor || !state.focus) {
    return {
      isCollapsed: true,
      selectionType: "none",
      start: null,
      end: null
    };
  }
  const [start, end] = comparePositions(state.anchor, state.focus) <= 0
    ? [state.anchor, state.focus]
    : [state.focus, state.anchor];
  return {
    isCollapsed: start.offset === end.offset,
    selectionType: state.selectionType,
    start,
    end
  };
}

export function buildSelectionResult({ chunkModel, layout, selectionState }) {
  const normalized = normalizeSelection(selectionState);
  if (!normalized.start || !normalized.end) {
    return {
      selectionType: "none",
      selectionMode: "word-snapped",
      highlightMode: "merged-line",
      isCollapsed: true,
      blockIds: [],
      selectedBlocks: 0,
      selectedLines: 0,
      selectedChars: 0,
      rawStartOffset: null,
      rawEndOffset: null,
      startOffset: null,
      endOffset: null
    };
  }

  const rawStartOffset = normalized.start.offset;
  const rawEndOffset = normalized.end.offset;
  const snapped = snapSelectionOffsets(chunkModel.wordBoundaryModel, rawStartOffset, rawEndOffset);
  const startOffset = snapped.startOffset;
  const endOffset = snapped.endOffset;
  const isCollapsed = startOffset == null || endOffset == null || startOffset === endOffset;
  const selectedFragments = [];
  const selectedLineIndexes = new Set();
  const selectedBlockIds = new Set();

  if (!isCollapsed) {
    for (const line of layout.lines) {
      if (line.endOffset <= startOffset || line.startOffset >= endOffset) continue;
      let lineSelected = false;
      for (const fragment of line.fragments) {
        const from = Math.max(fragment.startOffset, startOffset);
        const to = Math.min(fragment.endOffset, endOffset);
        if (to <= from) continue;
        lineSelected = true;
        selectedBlockIds.add(fragment.blockId);
        selectedFragments.push({
          lineIndex: line.lineIndex,
          blockId: fragment.blockId,
          segmentId: fragment.segmentId,
          startOffset: from,
          endOffset: to
        });
      }
      if (lineSelected) selectedLineIndexes.add(line.lineIndex);
    }
  }

  const blockAnchors = (chunkModel.chunk.selectionLayer && chunkModel.chunk.selectionLayer.blockAnchors) || [];
  const blockAnchorMap = new Map(blockAnchors.map((item) => [item.blockId, item]));

  return {
    selectionType: isCollapsed ? "caret" : "range",
    selectionMode: snapped.selectionMode || "word-snapped",
    highlightMode: "merged-line",
    isCollapsed,
    chunkId: chunkModel.chunk.chunkId,
    locationId: chunkModel.chunkLocation ? chunkModel.chunkLocation.locationId : null,
    hitTestingBackend: layout.hitTestingBackend || "text-geometry",
    selectionPrecisionMode: layout.selectionPrecisionMode || "text-metrics-approx",
    rawStartOffset,
    rawEndOffset,
    startOffset,
    endOffset,
    wordBoundaryHits: snapped.wordBoundaryHits || 0,
    selectedChars: Math.max(0, endOffset - startOffset),
    selectedLines: selectedLineIndexes.size,
    selectedBlocks: selectedBlockIds.size,
    blockIds: Array.from(selectedBlockIds),
    selectedFragments,
    start: normalized.start,
    end: normalized.end,
    anchors: Array.from(selectedBlockIds)
      .map((blockId) => blockAnchorMap.get(blockId))
      .filter(Boolean)
  };
}

function offsetToFragmentX(fragment, offset) {
  const localOffset = Math.max(0, Math.min(fragment.endOffset - fragment.startOffset, offset - fragment.startOffset));
  const positions = fragment.charPositions || [0, fragment.width || 0];
  const localX = positions[Math.max(0, Math.min(localOffset, positions.length - 1))] ?? positions[positions.length - 1] ?? 0;
  return fragment.x + localX;
}

function offsetToLineX(line, offset) {
  if (!line.fragments.length) return line.x || 0;
  const first = line.fragments[0];
  const last = line.fragments[line.fragments.length - 1];
  if (offset <= first.startOffset) return first.x;
  if (offset >= last.endOffset) return last.x + last.width;
  for (const fragment of line.fragments) {
    if (offset >= fragment.startOffset && offset <= fragment.endOffset) {
      return offsetToFragmentX(fragment, offset);
    }
  }
  for (let index = 0; index < line.fragments.length - 1; index += 1) {
    const left = line.fragments[index];
    const right = line.fragments[index + 1];
    if (offset >= left.endOffset && offset <= right.startOffset) {
      return right.x;
    }
  }
  return last.x + last.width;
}

export function buildSelectionHighlights(layout, selectionResult) {
  if (!selectionResult || selectionResult.isCollapsed) return [];
  const rects = [];
  for (const line of layout.lines) {
    if (line.endOffset <= selectionResult.startOffset || line.startOffset >= selectionResult.endOffset) continue;
    const from = Math.max(line.startOffset, selectionResult.startOffset);
    const to = Math.min(line.endOffset, selectionResult.endOffset);
    if (to <= from) continue;
    const startX = offsetToLineX(line, from);
    const endX = offsetToLineX(line, to);
    rects.push({
      x: Math.min(startX, endX),
      y: line.y,
      width: Math.max(2, Math.abs(endX - startX)),
      height: line.height,
      lineIndex: line.lineIndex
    });
  }
  return rects;
}
