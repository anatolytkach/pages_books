import {
  buildAnnotationMarker,
  buildAnnotationRects
} from "./protected-annotation-model.js";

export function buildVisibleAnnotationOverlay({ annotations, chunkModel, layout, pageWindow }) {
  const visibleHighlights = [];
  const noteMarkers = [];
  const lineStart = pageWindow ? pageWindow.lineStartIndex : null;
  const lineEnd = pageWindow ? pageWindow.lineEndIndex : null;

  for (const annotation of annotations || []) {
    if (annotation.type === "highlight") {
      const rects = buildAnnotationRects(annotation, chunkModel, layout).filter((rect) => {
        if (lineStart == null || lineEnd == null) return true;
        return rect.lineIndex >= lineStart && rect.lineIndex <= lineEnd;
      });
      visibleHighlights.push(...rects);
    }
    if (annotation.type === "note") {
      const marker = buildAnnotationMarker(annotation, chunkModel, layout);
      if (!marker) continue;
      if (lineStart != null && lineEnd != null) {
        const rects = buildAnnotationRects(annotation, chunkModel, layout);
        const first = rects[0];
        if (!first || first.lineIndex < lineStart || first.lineIndex > lineEnd) continue;
      }
      noteMarkers.push(marker);
    }
  }

  return {
    visibleHighlights,
    noteMarkers
  };
}
