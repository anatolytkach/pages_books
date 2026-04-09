function stableHash(input) {
  const value = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createProtectedBookFingerprintFromArtifactParts({
  manifest = null,
  tocItems = [],
  locations = null
} = {}) {
  if (!manifest) {
    return {
      bookId: "",
      fingerprint: "unknown",
      artifactVersion: null,
      contractVersion: "unknown",
      chunkCount: 0,
      tocCount: 0,
      locationCount: 0
    };
  }
  const bookId = String(
    (manifest.source && manifest.source.bookId) ||
    (manifest.metadata && manifest.metadata.identifier) ||
    ""
  );
  const chunkCount = Array.isArray(manifest.chunks) ? manifest.chunks.length : 0;
  const tocCount = Array.isArray(tocItems) ? tocItems.length : 0;
  const locationCount = Array.isArray(locations && locations.chunks) ? locations.chunks.length : 0;
  const runtimeContract = manifest.runtimeContract || {};
  const contractVersion = String(
    runtimeContract.version ||
    [
      runtimeContract.glyphMode || "opaque-chunk-local",
      runtimeContract.renderPayload || "opaque-glyph-ops",
      runtimeContract.reconstructionMode || "sealed-window-scoped"
    ].join("|")
  );
  const artifactVersion = manifest.version || null;
  const fingerprintSeed = JSON.stringify({
    bookId,
    artifactVersion,
    contractVersion,
    chunkCount,
    tocCount,
    locationCount,
    firstChunk: manifest.chunks && manifest.chunks[0] ? manifest.chunks[0].chunkId : null,
    lastChunk: manifest.chunks && chunkCount ? manifest.chunks[chunkCount - 1].chunkId : null,
    firstLocation: locations && locations.chunks && locations.chunks[0] ? locations.chunks[0].locationId : null,
    lastLocation: locations && locations.chunks && locationCount ? locations.chunks[locationCount - 1].locationId : null
  });
  return {
    bookId,
    fingerprint: stableHash(fingerprintSeed),
    artifactVersion,
    contractVersion,
    chunkCount,
    tocCount,
    locationCount
  };
}

export function createProtectedBookFingerprint(book) {
  if (!book || !book.manifest) {
    return createProtectedBookFingerprintFromArtifactParts();
  }
  return createProtectedBookFingerprintFromArtifactParts({
    manifest: book.manifest,
    tocItems: book.tocItems || [],
    locations: book.locations || null
  });
}

export { stableHash };
