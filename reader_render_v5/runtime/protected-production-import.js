import { createProtectedAnnotationBundle } from "./protected-annotation-bundle.js";
import { buildProtectedCfiResolver, collectResolverDiagnostics, normalizeProductionPayloadShape } from "./protected-cfi-resolver.js";
import { createNoteAnnotation } from "./protected-note-model.js";

function nowIso() {
  return new Date().toISOString();
}

function toCurrentProductionShape(note, index = 0) {
  if (!note || typeof note !== "object") return null;
  const protectedAnchor = note.protectedAnchor || note.rangeDescriptor || null;
  if (note.cfi) {
    return {
      id: String(note.id || `shared-${index}`),
      cfi: String(note.cfi),
      href: note.href ? String(note.href) : null,
      quote: String(note.quote || "").trim(),
      comment: String(note.comment || ""),
      protectedAnchor
    };
  }
  if (protectedAnchor && protectedAnchor.start && protectedAnchor.end) {
    return {
      id: String(note.id || note.protectedAnnotationId || `protected-shared-${index}`),
      cfi: "",
      href: note.href ? String(note.href) : null,
      quote: String(note.quote || "").trim(),
      comment: String(note.comment || note.noteText || ""),
      protectedAnchor
    };
  }
  if (note.anchor) {
    return {
      id: String(note.id || `legacy-${index}`),
      cfi: String(note.anchor),
      href: note.href ? String(note.href) : null,
      quote: "",
      comment: String(note.body || "")
    };
  }
  return null;
}

export async function importProductionPayloadToProtected({ book, payload }) {
  const resolver = buildProtectedCfiResolver(book);
  const normalized = normalizeProductionPayloadShape(typeof payload === "string" ? JSON.parse(payload) : payload);
  const notes = (normalized.notes || []).map((note, index) => toCurrentProductionShape(note, index)).filter(Boolean);
  const resolutions = [];
  const annotations = [];
  let createdHighlights = 0;
  let createdNotes = 0;

  for (const [index, note] of notes.entries()) {
    if (note.protectedAnchor && note.protectedAnchor.start && note.protectedAnchor.end && !note.cfi) {
      if (note.comment) {
        annotations.push(createNoteAnnotation({
          bookId: resolver.globalModel.bookId,
          rangeDescriptor: note.protectedAnchor,
          highlightId: null,
          color: "blue",
          noteText: String(note.comment),
          annotationId: `note_protected_share_${note.id}`,
          metadata: {
            source: "protected-share-import",
            resolutionStatus: "protected-range",
            productionAnchor: note,
            selectionQuote: note.quote || ""
          }
        }));
        createdNotes += 1;
      }
      resolutions.push({
        index,
        noteId: note.id,
        status: "exact",
        reason: "protected-range",
        rangeDescriptor: note.protectedAnchor
      });
      continue;
    }
    const resolution = resolver.resolveProductionNote(note);
    resolutions.push({
      index,
      noteId: note.id,
      ...resolution
    });
    if (!resolution.rangeDescriptor) continue;

    const highlightId = `hl_production_import_${note.id}`;
    annotations.push({
      annotationId: highlightId,
      type: "highlight",
      bookId: resolver.globalModel.bookId,
      rangeDescriptor: resolution.rangeDescriptor,
      color: "amber",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      metadata: {
        source: "production-import",
        resolutionStatus: resolution.status,
        resolutionReason: resolution.reason,
        productionAnchor: note
      }
    });
    createdHighlights += 1;

    if (note.comment) {
      annotations.push({
        annotationId: `note_production_import_${note.id}`,
        type: "note",
        bookId: resolver.globalModel.bookId,
        rangeDescriptor: resolution.rangeDescriptor,
        highlightId,
        color: "blue",
        noteText: String(note.comment),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        metadata: {
          source: "production-import",
          resolutionStatus: resolution.status,
          resolutionReason: resolution.reason,
          productionAnchor: note
        }
      });
      createdNotes += 1;
    }
  }

  const readingStateResult = normalized.readingState
    ? resolver.resolveProductionReadingState(normalized.readingState)
    : null;

  const baseStats = collectResolverDiagnostics(resolutions);
  const report = {
    total: baseStats.total,
    exact: baseStats.exact,
    approximate: baseStats.approximate,
    unresolved: baseStats.unresolved,
    createdHighlights,
    createdNotes,
    warnings: [
      ...baseStats.warnings,
      ...(readingStateResult?.warnings || [])
    ],
    resolutions,
    readingState: readingStateResult
  };

  return {
    bundle: createProtectedAnnotationBundle({
      bookId: resolver.globalModel.bookId,
      userScope: "production-import",
      annotations,
      readingState: readingStateResult?.protectedReadingState || null,
      metadata: {
        importedFrom: normalized.kind,
        report: {
          total: report.total,
          exact: report.exact,
          approximate: report.approximate,
          unresolved: report.unresolved
        }
      }
    }),
    report
  };
}
