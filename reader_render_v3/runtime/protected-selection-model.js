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
      isCollapsed: true,
      blockIds: [],
      selectedBlocks: 0,
      selectedLines: 0,
      selectedChars: 0,
      startOffset: null,
      endOffset: null
    };
  }

  const startOffset = normalized.start.offset;
  const endOffset = normalized.end.offset;
  const selectedFragments = [];
  const selectedLineIndexes = new Set();
  const selectedBlockIds = new Set();

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

  const blockAnchors = (chunkModel.chunk.selectionLayer && chunkModel.chunk.selectionLayer.blockAnchors) || [];
  const blockAnchorMap = new Map(blockAnchors.map((item) => [item.blockId, item]));

  return {
    selectionType: normalized.isCollapsed ? "caret" : "range",
    isCollapsed: normalized.isCollapsed,
    chunkId: chunkModel.chunk.chunkId,
    locationId: chunkModel.chunkLocation ? chunkModel.chunkLocation.locationId : null,
    hitTestingBackend: layout.hitTestingBackend || "text-geometry",
    selectionPrecisionMode: layout.selectionPrecisionMode || "text-metrics-approx",
    startOffset,
    endOffset,
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

export function buildSelectionHighlights(layout, selectionResult) {
  if (!selectionResult || selectionResult.isCollapsed) return [];
  const byLine = new Map();

  for (const line of layout.lines) {
    const lineFragments = selectionResult.selectedFragments.filter((item) => item.lineIndex === line.lineIndex);
    if (!lineFragments.length) continue;
    const spans = [];
    for (const fragment of line.fragments) {
      const selected = lineFragments.find((item) =>
        item.segmentId === fragment.segmentId &&
        item.startOffset < fragment.endOffset &&
        item.endOffset > fragment.startOffset
      );
      if (!selected) continue;
      const startIndex = selected.startOffset - fragment.startOffset;
      const endIndex = selected.endOffset - fragment.startOffset;
      const startX = fragment.x + fragment.charPositions[startIndex];
      const endX = fragment.x + fragment.charPositions[endIndex];
      spans.push({
        x: startX,
        y: line.y,
        width: Math.max(2, endX - startX),
        height: line.height
      });
    }
    if (spans.length) byLine.set(line.lineIndex, spans);
  }

  return Array.from(byLine.values())
    .flatMap((spans) => {
      const sorted = [...spans].sort((a, b) => a.x - b.x);
      const merged = [];
      for (const span of sorted) {
        const prev = merged[merged.length - 1];
        if (!prev) {
          merged.push({ ...span });
          continue;
        }
        const prevRight = prev.x + prev.width;
        if (span.x <= prevRight + 3) {
          prev.width = Math.max(prevRight, span.x + span.width) - prev.x;
          prev.height = Math.max(prev.height, span.height);
        } else {
          merged.push({ ...span });
        }
      }
      return merged;
    });
}
