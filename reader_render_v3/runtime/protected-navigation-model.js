export function buildTocIndex(tocItems = []) {
  return new Map(tocItems.map((item) => [item.id, item]));
}

export function getChunkTocLabel(chunkLocation) {
  const anchor = (chunkLocation && chunkLocation.tocAnchors && chunkLocation.tocAnchors[0]) || null;
  return anchor ? anchor.label : "";
}

export function findChunkIndexForToc(manifest, locations, tocItem) {
  if (!tocItem || !locations || !Array.isArray(locations.chunks)) return -1;
  const byHref = locations.chunks.findIndex((chunk) =>
    (chunk.tocAnchors || []).some((anchor) => anchor.tocId === tocItem.id || anchor.href === tocItem.href)
  );
  if (byHref >= 0) return byHref;
  return manifest.chunks.findIndex((chunk) => chunk.chunkId === tocItem.chunkId);
}

function getChunkGlobalStart(chunkLocation) {
  return Number(chunkLocation && chunkLocation.startOffset || 0);
}

function resolveTocAnchorBlock(chunkLocation, tocItem) {
  if (!chunkLocation) return null;
  const anchors = Array.isArray(chunkLocation.tocAnchors) ? chunkLocation.tocAnchors : [];
  const match = anchors.find((anchor) =>
    anchor &&
    (
      anchor.tocId === tocItem.id ||
      anchor.href === tocItem.href ||
      (tocItem.fragment && anchor.href === `${tocItem.spineHref || ""}#${tocItem.fragment}`)
    )
  ) || null;
  if (!match) return null;
  const blockBoundaries = Array.isArray(chunkLocation.blockBoundaries) ? chunkLocation.blockBoundaries : [];
  return blockBoundaries.find((boundary) =>
    boundary &&
    (
      boundary.blockId === match.blockId ||
      boundary.locationId === match.locationId
    )
  ) || null;
}

export function findGlobalOffsetForToc(manifest, locations, tocItem) {
  if (!tocItem || !locations || !Array.isArray(locations.chunks)) return null;
  const chunkIndex = findChunkIndexForToc(manifest, locations, tocItem);
  if (chunkIndex < 0) return null;
  const chunkLocation = locations.chunks[chunkIndex] || null;
  const blockBoundary = resolveTocAnchorBlock(chunkLocation, tocItem);
  if (!blockBoundary) return getChunkGlobalStart(chunkLocation);
  return getChunkGlobalStart(chunkLocation) + Number(blockBoundary.startOffset || 0);
}

export function getActiveTocAnchor(chunkLocation, localOffset = 0) {
  if (!chunkLocation) return null;
  const anchors = Array.isArray(chunkLocation.tocAnchors) ? chunkLocation.tocAnchors : [];
  const blockBoundaries = Array.isArray(chunkLocation.blockBoundaries) ? chunkLocation.blockBoundaries : [];
  let active = null;
  for (const anchor of anchors) {
    const blockBoundary = blockBoundaries.find((boundary) =>
      boundary &&
      (
        boundary.blockId === anchor.blockId ||
        boundary.locationId === anchor.locationId
      )
    ) || null;
    if (!blockBoundary) continue;
    if (Number(blockBoundary.startOffset || 0) <= Number(localOffset || 0)) {
      active = {
        ...anchor,
        blockBoundary
      };
    }
  }
  return active || (anchors[0] ? { ...anchors[0], blockBoundary: resolveTocAnchorBlock(chunkLocation, anchors[0]) } : null);
}

export function getActiveTocAnchorForPosition(locations, chunkIndex, localOffset = 0) {
  if (!locations || !Array.isArray(locations.chunks)) return null;
  const safeIndex = Math.max(0, Math.min(Number(chunkIndex || 0), locations.chunks.length - 1));
  const currentChunk = locations.chunks[safeIndex] || null;
  const current = getActiveTocAnchor(currentChunk, localOffset);
  if (current && current.tocId) return current;
  for (let index = safeIndex - 1; index >= 0; index -= 1) {
    const chunkLocation = locations.chunks[index] || null;
    const anchors = chunkLocation && Array.isArray(chunkLocation.tocAnchors) ? chunkLocation.tocAnchors : [];
    const last = anchors.length ? anchors[anchors.length - 1] : null;
    if (!last) continue;
    return {
      ...last,
      blockBoundary: resolveTocAnchorBlock(chunkLocation, last)
    };
  }
  return null;
}
