import { createProductionSnapshotPatch } from "./protected-annotation-bundle.js";

function normalizeQuote(value) {
  const collapsed = String(value || "").replace(/\s+/g, " ").trim();
  return collapsed || "…";
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getAnnotationQuote(annotation, fallback = "") {
  const metadata = annotation && annotation.metadata ? annotation.metadata : {};
  return normalizeQuote(
    metadata.productionAnchor && metadata.productionAnchor.quote
      ? metadata.productionAnchor.quote
      : metadata.selectionQuote || fallback
  );
}

function buildProtectedNoteShareRecord(note, index = 0) {
  if (!note || note.type !== "note" || !note.rangeDescriptor || !note.noteText) return null;
  const productionAnchor = note.metadata?.productionAnchor || null;
  return {
    id: productionAnchor && productionAnchor.id ? String(productionAnchor.id) : note.annotationId || `protected-note-${index}`,
    cfi: productionAnchor && productionAnchor.cfi ? String(productionAnchor.cfi) : "",
    href: productionAnchor && productionAnchor.href ? String(productionAnchor.href) : null,
    quote: getAnnotationQuote(note),
    comment: String(note.noteText || ""),
    protectedAnchor: cloneJson(note.rangeDescriptor),
    protectedAnnotationId: String(note.annotationId || ""),
    protectedAnnotationType: "note"
  };
}

export async function exportProtectedAnnotationsToProduction({
  annotations = [],
  bookId,
  readingState = null
}) {
  const highlights = annotations.filter((item) => item && item.type === "highlight");
  const notes = annotations.filter((item) => item && item.type === "note");
  const notesByHighlight = new Map(
    notes
      .filter((item) => item.highlightId)
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
      comment: linkedNote ? String(linkedNote.noteText || "") : String(productionAnchor.comment || ""),
      protectedAnchor: cloneJson((linkedNote || highlight).rangeDescriptor),
      protectedAnnotationId: linkedNote ? String(linkedNote.annotationId || "") : "",
      protectedHighlightId: String(highlight.annotationId || ""),
      protectedAnnotationType: linkedNote ? "note" : "highlight"
    });
  }

  const exportedNoteIds = new Set(
    Array.from(notesByHighlight.values()).map((note) => String(note.annotationId || ""))
  );
  notes.forEach((note, index) => {
    if (exportedNoteIds.has(String(note.annotationId || ""))) return;
    const record = buildProtectedNoteShareRecord(note, index);
    if (record) productionNotes.push(record);
  });

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
