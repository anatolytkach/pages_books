import {
  createReconstructionScope,
  disposeReconstructionScope,
  getReconstructionScopeDiagnostics,
  reconstructSelectionRange
} from "./protected-text-reconstruction.js";

export async function copySelection({ chunkModel, selectionResult }) {
  const payload = buildCopyPayload({ chunkModel, selectionResult });
  await navigator.clipboard.writeText(payload.text);
  return payload;
}

export function buildCopyPayload({ chunkModel, selectionResult }) {
  if (!selectionResult || selectionResult.isCollapsed) {
    throw new Error("Selection is empty.");
  }
  const scope = createReconstructionScope({
    chunkModel,
    purpose: "selection",
    startOffset: selectionResult.startOffset,
    endOffset: selectionResult.endOffset
  });
  const text = reconstructSelectionRange(chunkModel, selectionResult, scope);
  const diagnostics = getReconstructionScopeDiagnostics(scope);
  disposeReconstructionScope(scope);
  return {
    copied: true,
    text,
    textLength: text.length,
    selectedChars: selectionResult.selectedChars,
    selectedBlocks: selectionResult.selectedBlocks,
    selectedLines: selectionResult.selectedLines,
    reconstructionScope: diagnostics.mode,
    reconstructionCacheSize: diagnostics.cacheEntries
  };
}
