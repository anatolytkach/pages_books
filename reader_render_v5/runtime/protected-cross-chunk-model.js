import {
  createReconstructionScope,
  disposeReconstructionScope,
  reconstructRangeText
} from "./protected-text-reconstruction.js";
import { globalOffsetToLocal } from "./protected-global-location.js";
import { parseRangeDescriptor, normalizeSerializableRange } from "./protected-range-serialization.js";

export function getChunksForRange(globalModel, rangeDescriptor) {
  const range = normalizeSerializableRange(rangeDescriptor);
  if (!range) return [];
  return globalModel.chunks.filter(
    (chunk) => chunk.endOffset > range.start.globalOffset && chunk.startOffset < range.end.globalOffset
  );
}

export async function reconstructCrossChunkRangeText({
  book,
  globalModel,
  rangeDescriptor,
  loadChunkModel
}) {
  const range = typeof rangeDescriptor === "string" ? parseRangeDescriptor(rangeDescriptor) : normalizeSerializableRange(rangeDescriptor);
  if (!range) return "";
  const chunks = getChunksForRange(globalModel, range);
  const pieces = [];

  for (const chunkInfo of chunks) {
    const localStart = Math.max(0, range.start.globalOffset - chunkInfo.startOffset);
    const localEnd = Math.min(chunkInfo.textLength, range.end.globalOffset - chunkInfo.startOffset);
    if (localEnd <= localStart) continue;
    const chunkIndex = book.manifest.chunks.findIndex((item) => item.chunkId === chunkInfo.chunkId);
    const chunkModel = await loadChunkModel(book, chunkIndex);
    const scope = createReconstructionScope({
      chunkModel,
      purpose: "cross-chunk-range",
      startOffset: localStart,
      endOffset: localEnd
    });
    pieces.push(reconstructRangeText(chunkModel, localStart, localEnd, scope));
    disposeReconstructionScope(scope);
  }

  return pieces.join("\n");
}

export function resolveRangeEndpoints(globalModel, rangeDescriptor) {
  const range = normalizeSerializableRange(rangeDescriptor);
  if (!range) return null;
  return {
    start: globalOffsetToLocal(globalModel, range.start.globalOffset),
    end: globalOffsetToLocal(globalModel, range.end.globalOffset)
  };
}
