import {
  createProtectedAnnotationBundle,
  createProductionSnapshotPatch
} from "./protected-annotation-bundle.js";

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeQuote(value) {
  const collapsed = String(value || "").replace(/\s+/g, " ").trim();
  return collapsed || "…";
}

function normalizeProductionNote(note, index = 0) {
  if (!note || !note.cfi) return null;
  return {
    id: String(note.id || `shared-${index}`),
    cfi: String(note.cfi),
    href: note.href ? String(note.href) : null,
    quote: normalizeQuote(note.quote || ""),
    comment: String(note.comment || "")
  };
}

export async function exportProtectedAnnotationsToProductionNotes({
  annotations = [],
  resolveShareAnchor,
  resolveQuote
}) {
  if (typeof resolveShareAnchor !== "function") {
    throw new Error("resolveShareAnchor callback is required for production note export.");
  }
  const byHighlightId = new Map();
  for (const annotation of annotations) {
    if (!annotation) continue;
    if (annotation.type === "note" && annotation.highlightId) byHighlightId.set(annotation.highlightId, annotation);
  }

  const out = [];
  for (const annotation of annotations) {
    if (!annotation || annotation.type !== "highlight") continue;
    const anchor = await resolveShareAnchor(annotation);
    if (!anchor || !anchor.cfi) continue;
    const linkedNote = byHighlightId.get(annotation.annotationId) || null;
    let quote = "";
    if (typeof resolveQuote === "function") {
      quote = await resolveQuote(annotation);
    } else if (annotation.metadata && annotation.metadata.selectionQuote) {
      quote = String(annotation.metadata.selectionQuote);
    }
    out.push({
      id: String(annotation.annotationId),
      cfi: String(anchor.cfi),
      href: anchor.href ? String(anchor.href) : null,
      quote: normalizeQuote(quote),
      comment: linkedNote ? String(linkedNote.noteText || "") : ""
    });
  }
  return out;
}

export async function exportProtectedBundleToProductionSnapshot({
  bookId,
  annotations = [],
  readingState = null,
  resolveShareAnchor,
  resolveQuote,
  bookMeta = {}
}) {
  const notes = await exportProtectedAnnotationsToProductionNotes({
    annotations,
    resolveShareAnchor,
    resolveQuote
  });
  return createProductionSnapshotPatch({
    bookId,
    readingState,
    bookmarks: [],
    notes,
    bookMeta
  });
}

export async function importProductionNotesToProtectedBundle({
  bookId,
  notes = [],
  resolveRangeFromProductionNote
}) {
  if (typeof resolveRangeFromProductionNote !== "function") {
    throw new Error("resolveRangeFromProductionNote callback is required for protected note import.");
  }
  const annotations = [];
  const unresolved = [];
  let index = 0;
  for (const rawNote of notes) {
    const note = normalizeProductionNote(rawNote, index++);
    if (!note) continue;
    const rangeDescriptor = await resolveRangeFromProductionNote(note);
    if (!rangeDescriptor) {
      unresolved.push(note);
      continue;
    }
    const baseId = `production_import_${note.id}`;
    annotations.push({
      annotationId: `hl_${baseId}`,
      type: "highlight",
      bookId,
      rangeDescriptor,
      color: "amber",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        productionAnchor: cloneJson(note)
      }
    });
    if (note.comment) {
      annotations.push({
        annotationId: `note_${baseId}`,
        type: "note",
        bookId,
        rangeDescriptor,
        highlightId: `hl_${baseId}`,
        color: "amber",
        noteText: String(note.comment),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          productionAnchor: cloneJson(note)
        }
      });
    }
  }
  return {
    bundle: createProtectedAnnotationBundle({
      bookId,
      userScope: "production-import",
      annotations,
      metadata: {
        importedFrom: "production-notes",
        unresolvedCount: unresolved.length
      }
    }),
    unresolved
  };
}

export {
  normalizeProductionNote
};
