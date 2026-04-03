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
