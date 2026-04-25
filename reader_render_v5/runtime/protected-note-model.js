import { createAnnotationId } from "./protected-annotation-model.js";

export function createNoteAnnotation({
  bookId,
  rangeDescriptor,
  noteText,
  highlightId = null,
  color = "amber",
  metadata = {},
  annotationId = createAnnotationId("note")
}) {
  const now = new Date().toISOString();
  return {
    annotationId,
    type: "note",
    bookId,
    rangeDescriptor,
    highlightId,
    color,
    noteText: String(noteText || "").trim(),
    createdAt: now,
    updatedAt: now,
    metadata
  };
}

export function updateNoteAnnotation(noteAnnotation, noteText) {
  return {
    ...noteAnnotation,
    noteText: String(noteText || "").trim(),
    updatedAt: new Date().toISOString()
  };
}
