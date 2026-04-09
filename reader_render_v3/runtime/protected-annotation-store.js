import {
  annotationIntersectsGlobalRange,
  createHighlightAnnotation,
  normalizeAnnotation
} from "./protected-annotation-model.js";
import { createNoteAnnotation, updateNoteAnnotation } from "./protected-note-model.js";

function sortByRange(a, b) {
  return (
    (a.rangeDescriptor?.start?.globalOffset ?? 0) - (b.rangeDescriptor?.start?.globalOffset ?? 0) ||
    String(a.annotationId).localeCompare(String(b.annotationId))
  );
}

export function createAnnotationStore({ bookId }) {
  const annotations = new Map();

  function add(annotation) {
    const normalized = normalizeAnnotation(annotation);
    if (!normalized) throw new Error("Annotation is missing required fields.");
    if (normalized.bookId !== bookId) {
      throw new Error(`Annotation belongs to book ${normalized.bookId}, expected ${bookId}.`);
    }
    annotations.set(normalized.annotationId, normalized);
    return normalized;
  }

  return {
    bookId,
    all() {
      return Array.from(annotations.values()).sort(sortByRange);
    },
    get(annotationId) {
      return annotations.get(annotationId) || null;
    },
    createHighlight({ rangeDescriptor, color = "amber", metadata = {} }) {
      return add(createHighlightAnnotation({ bookId, rangeDescriptor, color, metadata }));
    },
    createNote({ rangeDescriptor, noteText, highlightId = null, color = "amber", metadata = {} }) {
      return add(createNoteAnnotation({ bookId, rangeDescriptor, noteText, highlightId, color, metadata }));
    },
    updateNote(annotationId, noteText) {
      const current = annotations.get(annotationId);
      if (!current || current.type !== "note") throw new Error(`Unknown note annotation: ${annotationId}`);
      const next = updateNoteAnnotation(current, noteText);
      annotations.set(annotationId, next);
      return next;
    },
    delete(annotationId) {
      const current = annotations.get(annotationId);
      if (!current) return false;
      annotations.delete(annotationId);
      if (current.type === "highlight") {
        for (const note of Array.from(annotations.values())) {
          if (note.type === "note" && note.highlightId === annotationId) annotations.delete(note.annotationId);
        }
      }
      return true;
    },
    notesForHighlight(highlightId) {
      return this.all().filter((item) => item.type === "note" && item.highlightId === highlightId);
    },
    queryByGlobalRange(startGlobalOffset, endGlobalOffset) {
      return this.all().filter((item) => annotationIntersectsGlobalRange(item, startGlobalOffset, endGlobalOffset));
    },
    exportAnnotations() {
      return {
        kind: "protected-annotations-v1",
        bookId,
        annotations: this.all()
      };
    },
    importAnnotations(payload) {
      const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (!parsed || parsed.kind !== "protected-annotations-v1") {
        throw new Error("Unsupported annotation payload.");
      }
      if (parsed.bookId !== bookId) {
        throw new Error(`Annotation payload belongs to book ${parsed.bookId}, expected ${bookId}.`);
      }
      annotations.clear();
      for (const annotation of parsed.annotations || []) add(annotation);
      return this.all();
    }
  };
}
