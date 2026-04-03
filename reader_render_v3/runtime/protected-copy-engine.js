import { reconstructRangeText } from "./protected-text-reconstruction.js";

export async function copySelection({ chunkModel, selectionResult }) {
  if (!selectionResult || selectionResult.isCollapsed) {
    throw new Error("Selection is empty.");
  }
  const text = reconstructRangeText(chunkModel, selectionResult.startOffset, selectionResult.endOffset);
  await navigator.clipboard.writeText(text);
  return {
    copied: true,
    textLength: text.length,
    selectedChars: selectionResult.selectedChars,
    selectedBlocks: selectionResult.selectedBlocks,
    selectedLines: selectionResult.selectedLines
  };
}
