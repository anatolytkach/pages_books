import { buildTocIndex, getChunkTocLabel } from "./protected-navigation-model.js";
import { buildWordBoundaryModel } from "./protected-word-boundary.js";
import { buildGlobalLocationModel } from "./protected-global-location.js";

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
    if (key === "char" || key === "fullText" || key === "text" || key === "codePoint") {
      throw new Error(`Runtime-safe leakage field at ${where}.${key}`);
    }
    assertNoLeakage(next, `${where}.${key}`);
  }
}

function buildSubstrateLaneMap(substrate) {
  return new Map(((substrate && substrate.lanes) || []).map((lane) => [lane.slot, lane]));
}

function normalizeFontMode(value, fallback = "sans") {
  return String(value || "").trim().toLowerCase() === "serif" ? "serif" : fallback;
}

function classifyArtifactContract(manifest) {
  const version = Number(manifest && manifest.version) || 0;
  const contract = manifest && manifest.artifactContract ? manifest.artifactContract : null;
  if (version >= 4) {
    if (!contract || contract.kind !== "dual-family-static-v1") {
      throw new Error(`Unsupported protected artifact contract for manifest version ${version}`);
    }
    const supportedFontModes = Array.isArray(contract.supportedFontModes) && contract.supportedFontModes.length
      ? contract.supportedFontModes.map((item) => normalizeFontMode(item))
      : ["sans", "serif"];
    return {
      kind: "dual-family-static-v1",
      version,
      supportedFontModes,
      defaultFontMode: normalizeFontMode(contract.defaultFontMode, supportedFontModes[0] || "sans")
    };
  }
  if (version === 3) {
    return {
      kind: "legacy-single-mode-v1",
      version,
      supportedFontModes: ["sans"],
      defaultFontMode: "sans"
    };
  }
  throw new Error(`Unsupported protected artifact version: ${version}`);
}

function selectVisualFontMode(book, payload, requestedFontMode = null) {
  const supported = (book && book.artifactContract && book.artifactContract.supportedFontModes) || ["sans"];
  const fallback = (book && book.artifactContract && book.artifactContract.defaultFontMode) || "sans";
  const payloadModes = payload && payload.supportedFontModes;
  const normalizedRequested = requestedFontMode ? normalizeFontMode(requestedFontMode, fallback) : null;
  if (normalizedRequested && supported.includes(normalizedRequested)) {
    if (Array.isArray(payloadModes) && payloadModes.length) {
      if (payloadModes.includes(normalizedRequested)) return normalizedRequested;
      const requestedSupported = supported.find((item) => payloadModes.includes(item));
      if (requestedSupported) return normalizeFontMode(requestedSupported, normalizeFontMode(payloadModes[0], fallback));
      return normalizeFontMode(payloadModes[0], fallback);
    }
    return normalizedRequested;
  }
  if (Array.isArray(payloadModes) && payloadModes.length) {
    const preferred = supported.find((item) => payloadModes.includes(item));
    return normalizeFontMode(preferred, normalizeFontMode(payloadModes[0], fallback));
  }
  return normalizeFontMode(fallback, "sans");
}

function normalizeGlyphPayloadForRuntime(book, glyphPayload, requestedFontMode = null) {
  if (!glyphPayload || typeof glyphPayload !== "object") return glyphPayload;
  if (book.artifactContract.kind !== "dual-family-static-v1") return glyphPayload;
  const runtimeFontMode = selectVisualFontMode(book, glyphPayload, requestedFontMode);
  const glyphs = Object.fromEntries(
    Object.entries(glyphPayload.glyphs || {}).map(([glyphId, glyph]) => {
      const visualRefs = glyph && glyph.visualRefs ? glyph.visualRefs : null;
      const visual =
        (visualRefs && visualRefs[runtimeFontMode]) ||
        (visualRefs && visualRefs.sans) ||
        (visualRefs && Object.values(visualRefs)[0]) ||
        {};
      return [glyphId, {
        ...glyph,
        ...visual,
        runtimeFontMode
      }];
    })
  );
  return {
    ...glyphPayload,
    glyphs,
    runtimeFontMode
  };
}

function normalizeShapeBundleForRuntime(book, shapeBundle, requestedFontMode = null) {
  if (!shapeBundle || typeof shapeBundle !== "object") return shapeBundle;
  if (book.artifactContract.kind !== "dual-family-static-v1") return shapeBundle;
  const runtimeFontMode = selectVisualFontMode(book, shapeBundle, requestedFontMode);
  const selectedBundle =
    (shapeBundle.fontModes && shapeBundle.fontModes[runtimeFontMode]) ||
    (shapeBundle.fontModes && shapeBundle.fontModes.sans) ||
    (shapeBundle.fontModes && Object.values(shapeBundle.fontModes)[0]) ||
    { summary: shapeBundle.summary || null, shapeRecords: shapeBundle.shapeRecords || [] };
  return {
    chunkId: shapeBundle.chunkId,
    version: shapeBundle.version,
    visualPayload: shapeBundle.visualPayload || "legacy-single-family-v1",
    defaultFontMode: shapeBundle.defaultFontMode || runtimeFontMode,
    supportedFontModes: shapeBundle.supportedFontModes || [runtimeFontMode],
    runtimeFontMode,
    summary: selectedBundle.summary || null,
    shapeRecords: selectedBundle.shapeRecords || []
  };
}

function assertRuntimeContract(chunk, glyphPayload) {
  if (!chunk.renderLayer || !Array.isArray(chunk.renderLayer.glyphRuns)) {
    throw new Error(`Runtime-safe chunk ${chunk.chunkId} is missing glyphRuns.`);
  }
  if ("textRuns" in chunk.renderLayer) {
    throw new Error(`Runtime-safe chunk ${chunk.chunkId} still exposes textRuns.`);
  }
  for (const glyph of Object.values(glyphPayload.glyphs || {})) {
    if (!glyph.glyphToken || !glyph.shapeRef) {
      throw new Error(`Runtime-safe chunk ${chunk.chunkId} has incomplete glyph token records.`);
    }
    if ("reconRef" in glyph) {
      throw new Error(`Runtime-safe chunk ${chunk.chunkId} leaks reconstruction linkage.`);
    }
  }
  if (!glyphPayload.substrate || glyphPayload.substrate.mode !== "sealed-window-substrate-v1") {
    throw new Error(`Runtime-safe chunk ${chunk.chunkId} is missing sealed reconstruction substrate.`);
  }
}

export async function loadProtectedBook(artifactRoot) {
  const baseHref = (globalThis.location && globalThis.location.href) || "http://127.0.0.1:8788/";
  const rootUrl = new URL(artifactRoot, baseHref).toString().replace(/\/$/, "");
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
  const book = {
    rootUrl,
    manifestUrl,
    manifest,
    artifactContract: classifyArtifactContract(manifest),
    tocItems: toc.items || [],
    tocIndex: buildTocIndex(toc.items || []),
    locations,
    fontProfiles: styles.fontProfiles || null,
    styleMap: new Map((styles.styleTokens || []).map((item) => [item.styleToken, item])),
    chunkCache: new Map()
  };
  book.globalLocationModel = buildGlobalLocationModel(book);
  return book;
}

function buildChunkCacheKey(book, chunkId, requestedFontMode = null) {
  if (!book || !book.artifactContract || book.artifactContract.kind !== "dual-family-static-v1") {
    return chunkId;
  }
  const runtimeFontMode = normalizeFontMode(
    requestedFontMode,
    (book.artifactContract && book.artifactContract.defaultFontMode) || "sans"
  );
  return `${chunkId}::${runtimeFontMode}`;
}

export async function loadProtectedChunkModel(book, chunkIndex, { runtimeFontMode = null } = {}) {
  const manifestChunk = book.manifest.chunks[chunkIndex];
  if (!manifestChunk) throw new Error(`Missing chunk index ${chunkIndex}`);
  const cacheKey = buildChunkCacheKey(book, manifestChunk.chunkId, runtimeFontMode);
  if (book.chunkCache.has(cacheKey)) return book.chunkCache.get(cacheKey);

  const chunkUrl = resolveUrl(book.manifestUrl, manifestChunk.chunkPath);
  const glyphUrl = resolveUrl(book.manifestUrl, manifestChunk.glyphsPath);
  const shapesUrl = manifestChunk.shapesPath ? resolveUrl(book.manifestUrl, manifestChunk.shapesPath) : "";
  assertNoDebug(chunkUrl);
  assertNoDebug(glyphUrl);
  if (shapesUrl) assertNoDebug(shapesUrl);

  const [chunk, rawGlyphPayload, rawShapeBundle] = await Promise.all([
    fetchJson(chunkUrl),
    fetchJson(glyphUrl),
    shapesUrl ? fetchJson(shapesUrl) : Promise.resolve(null)
  ]);
  assertNoLeakage(chunk.selectionLayer, "chunk.selectionLayer");
  assertNoLeakage(rawGlyphPayload.glyphs, "glyphs.glyphs");
  if (rawShapeBundle) assertNoLeakage(rawShapeBundle, "shapeBundle");
  if (rawGlyphPayload.substrate) assertNoLeakage(rawGlyphPayload.substrate, "glyphPayload.substrate");
  const glyphPayload = normalizeGlyphPayloadForRuntime(book, rawGlyphPayload, runtimeFontMode);
  const shapeBundle = normalizeShapeBundleForRuntime(book, rawShapeBundle, runtimeFontMode);
  assertRuntimeContract(chunk, glyphPayload);

  const glyphMap = new Map(Object.entries(glyphPayload.glyphs || {}));
  const runsByBlock = new Map();
  const runBySegmentKey = new Map();
  const textSegments = [...(((chunk.selectionLayer && chunk.selectionLayer.textSegments) || []))].sort(
    (a, b) => a.start - b.start
  );
  for (const run of chunk.renderLayer.glyphRuns || []) {
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
    runtimeFontMode: glyphPayload && glyphPayload.runtimeFontMode
      ? glyphPayload.runtimeFontMode
      : (shapeBundle && shapeBundle.runtimeFontMode) || (
        book && book.artifactContract
          ? (book.artifactContract.defaultFontMode || "sans")
          : "sans"
      ),
    substrate: glyphPayload.substrate || null,
    substrateLaneMap: buildSubstrateLaneMap(glyphPayload.substrate || null),
    glyphMap,
    runsByBlock,
    runBySegmentKey,
    textSegments,
    wordBoundaryModel: buildWordBoundaryModel(chunk.selectionLayer),
    chunkLocation,
    tocLabel: getChunkTocLabel(chunkLocation)
  };

  book.chunkCache.set(cacheKey, model);
  return model;
}
