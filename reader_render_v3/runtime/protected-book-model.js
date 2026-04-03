import { buildTocIndex, getChunkTocLabel } from "./protected-navigation-model.js";
import { reconstructBlockText } from "./protected-text-reconstruction.js";

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function resolveUrl(base, target) {
  return new URL(target, base).toString();
}

function assertNoDebug(url) {
  if (String(url).includes("/debug/")) {
    throw new Error(`Runtime attempted to read debug artifact: ${url}`);
  }
}

function assertNoLeakage(value, where) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLeakage(item, `${where}[${index}]`));
    return;
  }
  for (const [key, next] of Object.entries(value)) {
    if (key === "char" || key === "fullText" || key === "text") {
      throw new Error(`Runtime-safe leakage field at ${where}.${key}`);
    }
    assertNoLeakage(next, `${where}.${key}`);
  }
}

export async function loadProtectedBook(artifactRoot) {
  const rootUrl = new URL(artifactRoot, window.location.href).toString().replace(/\/$/, "");
  const manifestUrl = `${rootUrl}/manifest.json`;
  assertNoDebug(manifestUrl);
  const manifest = await fetchJson(manifestUrl);
  if (manifest.mode !== "protected-runtime-safe") {
    throw new Error(`Unsupported manifest mode: ${manifest.mode}`);
  }
  const [toc, locations, styles] = await Promise.all([
    fetchJson(resolveUrl(manifestUrl, manifest.tocPath)),
    fetchJson(resolveUrl(manifestUrl, manifest.locationsPath)),
    fetchJson(resolveUrl(manifestUrl, manifest.stylesPath))
  ]);
  return {
    rootUrl,
    manifestUrl,
    manifest,
    tocItems: toc.items || [],
    tocIndex: buildTocIndex(toc.items || []),
    locations,
    styleMap: new Map((styles.styleTokens || []).map((item) => [item.styleToken, item])),
    chunkCache: new Map()
  };
}

export async function loadProtectedChunkModel(book, chunkIndex) {
  const manifestChunk = book.manifest.chunks[chunkIndex];
  if (!manifestChunk) throw new Error(`Missing chunk index ${chunkIndex}`);
  if (book.chunkCache.has(manifestChunk.chunkId)) return book.chunkCache.get(manifestChunk.chunkId);

  const chunkUrl = resolveUrl(book.manifestUrl, manifestChunk.chunkPath);
  const glyphUrl = resolveUrl(book.manifestUrl, manifestChunk.glyphsPath);
  const shapesUrl = manifestChunk.shapesPath ? resolveUrl(book.manifestUrl, manifestChunk.shapesPath) : "";
  assertNoDebug(chunkUrl);
  assertNoDebug(glyphUrl);
  if (shapesUrl) assertNoDebug(shapesUrl);

  const [chunk, glyphPayload, shapeBundle] = await Promise.all([
    fetchJson(chunkUrl),
    fetchJson(glyphUrl),
    shapesUrl ? fetchJson(shapesUrl) : Promise.resolve(null)
  ]);
  assertNoLeakage(chunk.selectionLayer, "chunk.selectionLayer");
  assertNoLeakage(glyphPayload.glyphs, "glyphs.glyphs");
  if (shapeBundle) assertNoLeakage(shapeBundle, "shapeBundle");

  const glyphMap = new Map(Object.entries(glyphPayload.glyphs || {}));
  const runsByBlock = new Map();
  const runBySegmentKey = new Map();
  const textSegments = [...(((chunk.selectionLayer && chunk.selectionLayer.textSegments) || []))].sort(
    (a, b) => a.start - b.start
  );
  for (const run of chunk.renderLayer.textRuns || []) {
    if (!runsByBlock.has(run.blockId)) runsByBlock.set(run.blockId, []);
    const runIndex = runsByBlock.get(run.blockId).length;
    runsByBlock.get(run.blockId).push(run);
    runBySegmentKey.set(`${run.blockId}:${runIndex}`, run);
  }

  const chunkLocation = (book.locations.chunks || []).find((item) => item.chunkId === chunk.chunkId) || null;
  const model = {
    chunk,
    glyphPayload,
    shapeBundle,
    glyphMap,
    runsByBlock,
    runBySegmentKey,
    textSegments,
    chunkLocation,
    tocLabel: getChunkTocLabel(chunkLocation),
    getBlockText(blockId) {
      return reconstructBlockText(model, blockId);
    }
  };

  book.chunkCache.set(manifestChunk.chunkId, model);
  return model;
}
