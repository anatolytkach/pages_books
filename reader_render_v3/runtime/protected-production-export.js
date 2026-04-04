import { createProductionSnapshotPatch } from "./protected-annotation-bundle.js";

function normalizeQuote(value) {
  const collapsed = String(value || "").replace(/\s+/g, " ").trim();
  return collapsed || "…";
}

export async function exportProtectedAnnotationsToProduction({
  annotations = [],
  bookId,
  readingState = null
}) {
  const highlights = annotations.filter((item) => item && item.type === "highlight");
  const notesByHighlight = new Map(
    annotations
      .filter((item) => item && item.type === "note" && item.highlightId)
      .map((item) => [item.highlightId, item])
  );

  const productionNotes = [];
  const unresolved = [];
  let exact = 0;
  let approximate = 0;

  for (const highlight of highlights) {
    const compat = highlight.metadata?.productionCompat || null;
    if (!compat || !compat.cfi) {
      unresolved.push({
        annotationId: highlight.annotationId,
        reason: "missing-production-anchor"
      });
      continue;
    }
    const linkedNote = notesByHighlight.get(highlight.annotationId) || null;
    const status = highlight.metadata?.resolutionStatus || "approximate";
    if (status === "exact") exact += 1;
    else approximate += 1;
    productionNotes.push({
      id: compat.id || highlight.annotationId,
      cfi: String(compat.cfi),
      href: compat.href ? String(compat.href) : null,
      quote: normalizeQuote(compat.quote || ""),
      comment: linkedNote ? String(linkedNote.noteText || "") : String(compat.comment || "")
    });
  }

  const sharePayload = {
    v: 2,
    bookId: String(bookId || ""),
    createdAt: Date.now(),
    notes: productionNotes
  };

  const snapshotPatch = createProductionSnapshotPatch({
    bookId,
    readingState: readingState?.compat?.cfi
      ? {
          cfi: readingState.compat.cfi,
          updatedAt: readingState.updatedAt || Date.now()
        }
      : null,
    bookmarks: [],
    notes: productionNotes,
    bookMeta: {}
  });

  return {
    productionNotes,
    sharePayload,
    snapshotPatch,
    report: {
      total: highlights.length,
      exact,
      approximate,
      unresolved: unresolved.length,
      unresolvedItems: unresolved,
      warnings: unresolved.length
        ? ["Some protected annotations do not yet carry production-compatible CFI anchors."]
        : []
    }
  };
}
