import {
  buildAnnotationMarker,
  buildAnnotationRects,
  projectAnnotationToChunk
} from "./protected-annotation-model.js";

function buildFallbackFocusRect(annotation, chunkModel, layout, pageWindow) {
  const projection = projectAnnotationToChunk(annotation, chunkModel);
  if (!projection || !pageWindow) return null;
  if (projection.endOffset <= pageWindow.startOffset || projection.startOffset >= pageWindow.endOffset) return null;
  const visibleLines = (layout.lines || []).filter((line) =>
    line.lineIndex >= pageWindow.lineStartIndex &&
    line.lineIndex <= pageWindow.lineEndIndex &&
    Array.isArray(line.fragments) &&
    line.fragments.length
  );
  if (!visibleLines.length) return null;
  const line =
    visibleLines.find((item) => projection.startOffset >= item.startOffset && projection.startOffset <= item.endOffset) ||
    visibleLines[0];
  const first = line.fragments[0];
  const last = line.fragments[line.fragments.length - 1];
  const x = Math.max(12, first && Number.isFinite(first.x) ? first.x - 6 : 24);
  const width = Math.max(
    36,
    ((last && Number.isFinite(last.x) ? last.x : x) + (last && Number.isFinite(last.width) ? last.width : 120)) - x + 6
  );
  return {
    x,
    y: Math.max(0, (line.y || 0) - 3),
    width,
    height: Math.max(18, (line.height || 0) + 6),
    lineIndex: line.lineIndex,
    annotationId: annotation.annotationId,
    color: annotation.color || "amber"
  };
}

export function buildVisibleAnnotationOverlay({ annotations, chunkModel, layout, pageWindow }) {
  const visibleHighlights = [];
  const focusHighlights = [];
  const noteMarkers = [];
  const focusedAnnotationId = pageWindow && pageWindow.focusedAnnotationId ? pageWindow.focusedAnnotationId : null;
  const lineStart = pageWindow ? pageWindow.lineStartIndex : null;
  const lineEnd = pageWindow ? pageWindow.lineEndIndex : null;

  for (const annotation of annotations || []) {
    const allRects = buildAnnotationRects(annotation, chunkModel, layout);
    const rects = allRects.filter((rect) => {
      if (lineStart == null || lineEnd == null) return true;
      return rect.lineIndex >= lineStart && rect.lineIndex <= lineEnd;
    });
    if (annotation.type === "highlight") {
      visibleHighlights.push(...rects);
    }
    if (focusedAnnotationId && annotation.annotationId === focusedAnnotationId) {
      if (rects.length || allRects.length) {
        focusHighlights.push(...(rects.length ? rects : allRects));
      } else {
        const fallbackRect = buildFallbackFocusRect(annotation, chunkModel, layout, pageWindow);
        if (fallbackRect) focusHighlights.push(fallbackRect);
      }
    }
    if (annotation.type === "note") {
      const marker = buildAnnotationMarker(annotation, chunkModel, layout);
      if (!marker) continue;
      const first = rects[0];
      if (lineStart != null && lineEnd != null && (!first || first.lineIndex < lineStart || first.lineIndex > lineEnd)) continue;
      noteMarkers.push(marker);
    }
  }

  return {
    visibleHighlights,
    focusHighlights,
    noteMarkers
  };
}
