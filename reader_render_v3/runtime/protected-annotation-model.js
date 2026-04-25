import { buildRangeHighlights } from "./protected-selection-model.js";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createAnnotationId(prefix = "ann") {
  return `${prefix}_${Date.now().toString(36)}_${randomId()}`;
}

export function createHighlightAnnotation({
  bookId,
  rangeDescriptor,
  color = "amber",
  metadata = {},
  annotationId = createAnnotationId("hl")
}) {
  const now = new Date().toISOString();
  return {
    annotationId,
    type: "highlight",
    bookId,
    rangeDescriptor,
    color,
    createdAt: now,
    updatedAt: now,
    metadata
  };
}

export function normalizeAnnotation(annotation) {
  if (!annotation || !annotation.annotationId || !annotation.type || !annotation.rangeDescriptor) return null;
  return {
    color: "amber",
    metadata: {},
    ...annotation
  };
}

export function annotationGlobalRange(annotation) {
  const range = annotation && annotation.rangeDescriptor;
  if (!range || !range.start || !range.end) return null;
  return {
    startGlobalOffset: range.start.globalOffset,
    endGlobalOffset: range.end.globalOffset
  };
}

export function annotationIntersectsGlobalRange(annotation, startGlobalOffset, endGlobalOffset) {
  const range = annotationGlobalRange(annotation);
  if (!range) return false;
  return range.endGlobalOffset > startGlobalOffset && range.startGlobalOffset < endGlobalOffset;
}

export function projectAnnotationToChunk(annotation, chunkModel) {
  const range = annotationGlobalRange(annotation);
  if (!range || !chunkModel || !chunkModel.chunk) return null;
  const chunkStart = chunkModel.chunk.startOffset || 0;
  const chunkEnd = chunkModel.chunk.endOffset || chunkStart + (chunkModel.chunk.textLength || 0);
  if (range.endGlobalOffset <= chunkStart || range.startGlobalOffset >= chunkEnd) return null;
  const startOffset = Math.max(0, range.startGlobalOffset - chunkStart);
  const endOffset = Math.min(chunkModel.chunk.textLength || 0, range.endGlobalOffset - chunkStart);
  if (endOffset <= startOffset) return null;
  return {
    annotationId: annotation.annotationId,
    type: annotation.type,
    color: annotation.color || "amber",
    startOffset,
    endOffset,
    isStartChunk: annotation.rangeDescriptor.start.chunkId === chunkModel.chunk.chunkId,
    isEndChunk: annotation.rangeDescriptor.end.chunkId === chunkModel.chunk.chunkId
  };
}

export function buildAnnotationRects(annotation, chunkModel, layout) {
  const projection = projectAnnotationToChunk(annotation, chunkModel);
  if (!projection) return [];
  return buildRangeHighlights(layout, projection.startOffset, projection.endOffset).map((rect) => ({
    ...rect,
    annotationId: annotation.annotationId,
    color: annotation.color || "amber"
  }));
}

export function buildAnnotationMarker(annotation, chunkModel, layout) {
  const projection = projectAnnotationToChunk(annotation, chunkModel);
  if (!projection || !projection.isStartChunk) return null;
  const rects = buildRangeHighlights(layout, projection.startOffset, projection.endOffset);
  const firstRect = rects[0];
  if (!firstRect) return null;
  return {
    annotationId: annotation.annotationId,
    x: firstRect.x + firstRect.width - 6,
    y: firstRect.y + 4,
    color: annotation.color || "amber"
  };
}
