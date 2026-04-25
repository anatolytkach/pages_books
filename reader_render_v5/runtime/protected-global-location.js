function sortChunks(chunks = []) {
  return [...chunks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function buildGlobalLocationModel(book) {
  const manifestChunks = sortChunks(book.manifest.chunks || []);
  const locationChunks = sortChunks((book.locations && book.locations.chunks) || []);
  const byChunkId = new Map();

  for (const manifestChunk of manifestChunks) {
    const locationChunk = locationChunks.find((item) => item.chunkId === manifestChunk.chunkId) || null;
    const descriptor = {
      chunkId: manifestChunk.chunkId,
      chunkOrder: manifestChunk.order,
      startOffset: manifestChunk.startOffset,
      endOffset: manifestChunk.endOffset,
      textLength: manifestChunk.textLength,
      locationId: locationChunk ? locationChunk.locationId : `loc:${manifestChunk.chunkId}`,
      restoreAnchor: locationChunk ? locationChunk.restoreAnchor || null : null,
      blockBoundaries: locationChunk ? locationChunk.blockBoundaries || [] : [],
      tocAnchors: locationChunk ? locationChunk.tocAnchors || [] : [],
      sourceRefs: locationChunk ? locationChunk.sourceRefs || [] : []
    };
    byChunkId.set(manifestChunk.chunkId, descriptor);
  }

  return {
    bookId:
      (book.manifest.source && book.manifest.source.bookId) ||
      (book.manifest.metadata && book.manifest.metadata.identifier) ||
      "unknown",
    chunks: manifestChunks.map((item) => byChunkId.get(item.chunkId)).filter(Boolean),
    byChunkId
  };
}

export function localOffsetToGlobal(globalModel, chunkId, localOffset) {
  const chunk = globalModel.byChunkId.get(chunkId);
  if (!chunk) throw new Error(`Unknown chunk for global model: ${chunkId}`);
  return chunk.startOffset + Math.max(0, localOffset || 0);
}

export function globalOffsetToLocal(globalModel, globalOffset) {
  const target = Number(globalOffset);
  const chunk =
    globalModel.chunks.find((item) => target >= item.startOffset && target < item.endOffset) ||
    globalModel.chunks[globalModel.chunks.length - 1] ||
    null;
  if (!chunk) return null;
  return {
    bookId: globalModel.bookId,
    chunkId: chunk.chunkId,
    chunkOrder: chunk.chunkOrder,
    globalOffset: target,
    localOffset: Math.max(0, target - chunk.startOffset),
    locationId: chunk.locationId
  };
}

export function resolveBlockBoundary(globalModel, chunkId, localOffset) {
  const chunk = globalModel.byChunkId.get(chunkId);
  if (!chunk) return null;
  return (
    chunk.blockBoundaries.find((item) => localOffset >= item.startOffset && localOffset < item.endOffset) ||
    chunk.blockBoundaries[chunk.blockBoundaries.length - 1] ||
    null
  );
}

export function createGlobalPosition(globalModel, chunkModel, layout, localOffset) {
  const chunkId = chunkModel.chunk.chunkId;
  const chunkEntry = globalModel.byChunkId.get(chunkId);
  const globalOffset = localOffsetToGlobal(globalModel, chunkId, localOffset);
  const blockBoundary = resolveBlockBoundary(globalModel, chunkId, localOffset);
  const line =
    layout && layout.lines
      ? layout.lines.find((item) => localOffset >= item.startOffset && localOffset <= item.endOffset) || null
      : null;

  return {
    bookId: globalModel.bookId,
    chunkId,
    chunkOrder: chunkEntry ? chunkEntry.chunkOrder : chunkModel.chunk.order,
    localOffset,
    globalOffset,
    blockId: blockBoundary ? blockBoundary.blockId : null,
    lineIndex: line ? line.lineIndex : null,
    locationId: chunkEntry ? chunkEntry.locationId : null,
    sourceRef: blockBoundary ? blockBoundary.sourceRef || null : null,
    restoreAnchor: chunkEntry ? chunkEntry.restoreAnchor || null : null
  };
}

export function serializeRestoreToken(descriptor) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(descriptor))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function parseRestoreToken(token) {
  const normalized = String(token || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) throw new Error("Restore token is empty.");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(padded))));
}
