import {
  createReconstructionScope,
  disposeReconstructionScope,
  reconstructSelectionRange
} from "./protected-text-reconstruction.js";
import { createRestoreDescriptor, buildSerializableRange } from "./protected-range-serialization.js";
import { serializeRestoreToken } from "./protected-global-location.js";
import { createHighlightAnnotation } from "./protected-annotation-model.js";
import { createNoteAnnotation } from "./protected-note-model.js";

function stableSelectionHash(input) {
  const value = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSelectionScope(chunkModel, selectionResult, purpose) {
  return createReconstructionScope({
    chunkModel,
    purpose,
    startOffset: selectionResult.startOffset,
    endOffset: selectionResult.endOffset
  });
}

function buildSelectionAnchor({ globalModel, chunkModel, layout, selectionResult, page }) {
  const rangeDescriptor = buildSerializableRange({
    globalModel,
    chunkModel,
    layout,
    selectionResult
  });
  if (!rangeDescriptor) {
    throw new Error("Selection range is unavailable.");
  }
  const restoreToken = page
    ? serializeRestoreToken(
        createRestoreDescriptor({
          globalModel,
          chunkModel,
          layout,
          page
        })
      )
    : "";
  return {
    rangeDescriptor,
    anchor: {
      chunkId: rangeDescriptor.start.chunkId,
      startOffset: rangeDescriptor.start.localOffset,
      endOffset: rangeDescriptor.end.localOffset,
      restoreToken
    }
  };
}

export function buildAnnotationFromCurrentSelection({
  bookId,
  globalModel,
  chunkModel,
  layout,
  selectionResult,
  page,
  type,
  noteText = "",
  highlightColor = "amber",
  noteColor = "blue"
}) {
  if (!selectionResult || selectionResult.isCollapsed) {
    throw new Error("Selection is empty.");
  }
  if (type !== "highlight" && type !== "note") {
    throw new Error(`Unsupported annotation type: ${type}`);
  }
  const { rangeDescriptor, anchor } = buildSelectionAnchor({
    globalModel,
    chunkModel,
    layout,
    selectionResult,
    page
  });
  const quoteHash = stableSelectionHash(JSON.stringify({
    bookId,
    chunkId: anchor.chunkId,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset
  }));
  const metadata = {
    anchor,
    quoteHash,
    selectedChars: selectionResult.selectedChars,
    selectedBlocks: selectionResult.selectedBlocks,
    selectedLines: selectionResult.selectedLines,
    selectionMode: rangeDescriptor.selectionMode,
    locationId: rangeDescriptor.start.locationId,
    source: "worker-current-selection"
  };
  const annotation = type === "highlight"
    ? createHighlightAnnotation({
        bookId,
        rangeDescriptor,
        color: highlightColor,
        metadata
      })
    : createNoteAnnotation({
        bookId,
        rangeDescriptor,
        noteText,
        color: noteColor,
        metadata
      });

  return {
    ...annotation,
    anchor,
    quoteHash,
    selectedChars: selectionResult.selectedChars,
    selectedBlocks: selectionResult.selectedBlocks,
    selectedLines: selectionResult.selectedLines,
    noteText: type === "note" ? String(noteText || "").trim() : undefined
  };
}
