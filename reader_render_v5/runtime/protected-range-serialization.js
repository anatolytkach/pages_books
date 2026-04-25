import { createGlobalPosition } from "./protected-global-location.js";

export function normalizeSerializableRange(range) {
  if (!range || !range.start || !range.end) return null;
  const start = range.start.globalOffset <= range.end.globalOffset ? range.start : range.end;
  const end = start === range.start ? range.end : range.start;
  return {
    ...range,
    start,
    end
  };
}

export function buildSerializableRange({ globalModel, chunkModel, layout, selectionResult }) {
  if (!selectionResult || selectionResult.isCollapsed) return null;
  const start = createGlobalPosition(globalModel, chunkModel, layout, selectionResult.startOffset);
  const end = createGlobalPosition(globalModel, chunkModel, layout, selectionResult.endOffset);
  return normalizeSerializableRange({
    kind: "protected-range-v1",
    bookId: globalModel.bookId,
    selectionMode: selectionResult.selectionMode || "word-snapped",
    wordSnapped: true,
    start,
    end,
    sourceAnchors: selectionResult.anchors || [],
    excerptHashSeed: `${globalModel.bookId}:${start.globalOffset}:${end.globalOffset}`
  });
}

export function serializeRangeDescriptor(rangeDescriptor) {
  return JSON.stringify(rangeDescriptor);
}

export function parseRangeDescriptor(serialized) {
  const parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  return normalizeSerializableRange(parsed);
}

export function createRestoreDescriptor({ globalModel, chunkModel, layout, page }) {
  const position = createGlobalPosition(globalModel, chunkModel, layout, page.startOffset);
  return {
    kind: "protected-restore-v1",
    bookId: globalModel.bookId,
    pageIndex: page.pageIndex,
    pageCount: page.pageCount,
    visibleRange: {
      globalStartOffset: Number(page.globalStartOffset || position.globalOffset || 0),
      globalEndOffset: Number(page.globalEndOffset || position.globalOffset || 0)
    },
    position
  };
}
