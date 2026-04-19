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
    const productionAnchor = highlight.metadata?.productionAnchor || null;
    if (!productionAnchor || !productionAnchor.cfi) {
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
      id: productionAnchor.id || highlight.annotationId,
      cfi: String(productionAnchor.cfi),
      href: productionAnchor.href ? String(productionAnchor.href) : null,
      quote: normalizeQuote(productionAnchor.quote || ""),
      comment: linkedNote ? String(linkedNote.noteText || "") : String(productionAnchor.comment || "")
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
    readingState: readingState?.productionSnapshot?.cfi
      ? {
          cfi: readingState.productionSnapshot.cfi,
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
        ? ["Some protected annotations do not yet carry production CFI anchors."]
        : []
    }
  };
}
