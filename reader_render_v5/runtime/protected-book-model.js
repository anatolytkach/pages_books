import { buildTocIndex, getChunkTocLabel } from "./protected-navigation-model.js";
import { buildWordBoundaryModel } from "./protected-word-boundary.js";
import { buildGlobalLocationModel } from "./protected-global-location.js";
import { loadProtectedManifest as loadV4BootstrapManifest } from "./v5-load-protected-manifest.js";

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
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

async function loadRuntimeSafeProtectedBook(artifactRoot) {
  const baseHref = (globalThis.location && globalThis.location.href) || "http://127.0.0.1:8788/";
  const rootUrl = new URL(artifactRoot, baseHref).toString().replace(/\/$/, "");
  const manifestUrl = `${rootUrl}/manifest.json`;
  assertNoDebug(manifestUrl);
  const manifest = await fetchJson(manifestUrl);
  manifest.source = manifest.source && typeof manifest.source === "object" ? manifest.source : {};
  const currentUrl = new URL(baseHref);
  const bookId = String(manifest.source.bookId || "").trim();
  const isLocalHost = /^(?:127\.0\.0\.1|localhost|::1)$/i.test(currentUrl.hostname || "") || /\.local$/i.test(currentUrl.hostname || "");
  if (!isLocalHost && bookId) {
    manifest.source.publicRootPath = `${currentUrl.origin}/books/protected-content/${encodeURIComponent(bookId)}/assets`;
  }
  if (manifest.mode !== "protected-runtime-safe") {
    throw new Error(`Unsupported manifest mode: ${manifest.mode}`);
  }
  const [toc, styles] = await Promise.all([
    fetchJson(resolveUrl(manifestUrl, manifest.tocPath)),
    fetchJson(resolveUrl(manifestUrl, manifest.stylesPath))
  ]);
  const book = {
    rootUrl,
    manifestUrl,
    manifest,
    artifactContract: classifyArtifactContract(manifest),
    tocItems: toc.items || [],
    tocIndex: buildTocIndex(toc.items || []),
    locations: { chunks: [] },
    locationsUrl: resolveUrl(manifestUrl, manifest.locationsPath),
    locationsLoaded: false,
    locationsPromise: null,
    fontProfiles: styles.fontProfiles || null,
    styleMap: new Map((styles.styleTokens || []).map((item) => [item.styleToken, item])),
    chunkCache: new Map()
  };
  book.globalLocationModel = buildGlobalLocationModel(book);
  return book;
}

export async function ensureProtectedBookLocations(book) {
  if (!book || typeof book !== "object") {
    throw new Error("Cannot load locations for an empty protected book.");
  }
  if (book.locationsLoaded && book.locations && Array.isArray(book.locations.chunks)) {
    return book.locations;
  }
  if (book.locationsPromise) {
    return book.locationsPromise;
  }
  book.locationsPromise = fetchJson(book.locationsUrl)
    .then((locations) => {
      if (!locations || !Array.isArray(locations.chunks)) {
        throw new Error("Protected locations payload is missing chunks.");
      }
      book.locations = locations;
      book.locationsLoaded = true;
      book.globalLocationModel = buildGlobalLocationModel(book);
      for (const chunkModel of book.chunkCache.values()) {
        const chunkId = chunkModel && chunkModel.chunk && chunkModel.chunk.chunkId;
        if (!chunkId) continue;
        const chunkLocation = locations.chunks.find((item) => item && item.chunkId === chunkId) || null;
        chunkModel.chunkLocation = chunkLocation;
        chunkModel.tocLabel = getChunkTocLabel(chunkLocation) || chunkModel.tocLabel || "";
      }
      return locations;
    })
    .catch((error) => {
      book.locationsPromise = null;
      throw error;
    });
  return book.locationsPromise;
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

async function loadRuntimeSafeProtectedChunkModel(book, chunkIndex, { runtimeFontMode = null } = {}) {
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

  const [rawChunk, rawGlyphPayload, rawShapeBundle] = await Promise.all([
    fetchJson(chunkUrl),
    fetchJson(glyphUrl),
    shapesUrl ? fetchJson(shapesUrl) : Promise.resolve(null)
  ]);
  const chunk = mergeV4CompatibilityIntoRuntimeSafeChunk(rawChunk, book);
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

function resolveV4CompatibilityRuntimeSafeRoot(bookId) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) {
    throw new Error("Cannot resolve v4 compatibility artifact without bookId.");
  }
  return `/reader_render_v5/artifacts/protected-books/${encodeURIComponent(normalizedBookId)}`;
}

function normalizeV4TocPathTail(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  return raw
    .replace(/^\/+/, "")
    .replace(/^EPUB\//i, "")
    .replace(/^OEBPS\//i, "");
}

function buildV4BootstrapTocItems(manifest) {
  const logicalBlocks = Array.isArray(manifest && manifest.logicalBlockList) ? manifest.logicalBlockList : [];
  const items = [];
  const seen = new Set();
  for (const block of logicalBlocks) {
    if (!block || Number(block.headingLevel) !== 1) continue;
    const label = String(block.textContent || "").trim();
    const sourceHref = normalizeV4TocPathTail(block.sourceHref);
    if (!label || !sourceHref) continue;
    const key = `${sourceHref}::${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `v4-toc-${items.length + 1}`,
      label,
      href: sourceHref,
      spineHref: sourceHref,
      fragment: "",
      source: "v4-bootstrap"
    });
  }
  return items;
}

function mergeTocItemsFromV4(runtimeSafeItems = [], v4Items = []) {
  if (!Array.isArray(runtimeSafeItems) || !runtimeSafeItems.length) {
    return Array.isArray(v4Items) ? v4Items.slice() : [];
  }
  if (!Array.isArray(v4Items) || !v4Items.length) {
    return runtimeSafeItems.slice();
  }
  const v4ByPath = new Map();
  for (const item of v4Items) {
    const key = normalizeV4TocPathTail(item && (item.spineHref || item.href));
    if (key && !v4ByPath.has(key)) v4ByPath.set(key, item);
  }
  return runtimeSafeItems.map((item) => {
    const key = normalizeV4TocPathTail(item && (item.spineHref || item.href));
    const replacement = key ? v4ByPath.get(key) : null;
    if (!replacement) return item;
    return {
      ...item,
      label: replacement.label || item.label,
      spineHref: replacement.spineHref || item.spineHref,
      href: replacement.href || item.href
    };
  });
}

function normalizeRuntimeSafeSourceHref(value) {
  return normalizeV4TocPathTail(value);
}

function normalizeV4TypographyOverride(entry) {
  if (!entry || typeof entry !== "object") return null;
  const normalized = {};
  const numericFields = [
    "fontSizePx",
    "fontSizeScale",
    "lineHeightPx",
    "lineHeightFactor",
    "letterSpacingPx",
    "letterSpacingEm",
    "wordSpacingPx",
    "wordSpacingEm",
    "textIndentPx",
    "textIndentEm",
    "marginTopPx",
    "marginTopEm",
    "marginBottomPx",
    "marginBottomEm",
    "marginLeftPx",
    "marginLeftEm",
    "marginRightPx",
    "marginRightEm",
    "paddingTopPx",
    "paddingTopEm",
    "paddingRightPx",
    "paddingRightEm",
    "paddingBottomPx",
    "paddingBottomEm",
    "paddingLeftPx",
    "paddingLeftEm"
  ];
  for (const field of numericFields) {
    const value = Number(entry[field]);
    if (Number.isFinite(value)) {
      normalized[field] = value;
    }
  }
  const textAlign = String(entry.textAlign || "").trim().toLowerCase();
  if (["left", "center", "right", "justify"].includes(textAlign)) {
    normalized.textAlign = textAlign;
  }
  const whiteSpace = String(entry.whiteSpace || "").trim().toLowerCase();
  if (["normal", "nowrap", "pre", "pre-wrap", "pre-line"].includes(whiteSpace)) {
    normalized.whiteSpace = whiteSpace;
  }
  const hyphens = String(entry.hyphens || "").trim().toLowerCase();
  if (["none", "manual", "auto"].includes(hyphens)) {
    normalized.hyphens = hyphens;
  }
  const wordBreak = String(entry.wordBreak || "").trim().toLowerCase();
  if (["normal", "break-all", "break-word", "keep-all"].includes(wordBreak)) {
    normalized.wordBreak = wordBreak;
  }
  const overflowWrap = String(entry.overflowWrap || "").trim().toLowerCase();
  if (["normal", "break-word", "anywhere"].includes(overflowWrap)) {
    normalized.overflowWrap = overflowWrap;
  }
  const fontStyle = String(entry.fontStyle || "").trim().toLowerCase();
  if (fontStyle === "normal" || fontStyle === "italic") {
    normalized.fontStyle = fontStyle;
  }
  const fontWeight = String(entry.fontWeight || "").trim().toLowerCase();
  if (fontWeight === "regular" || fontWeight === "bold") {
    normalized.fontWeight = fontWeight;
  }
  const fontFamilyCandidate = String(entry.fontFamilyCandidate || "").trim();
  if (fontFamilyCandidate) {
    normalized.fontFamilyCandidate = fontFamilyCandidate;
  }
  const textColor = String(entry.textColor || "").trim();
  if (textColor) {
    normalized.textColor = textColor;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeV4TypographyStyles(typographyStyles) {
  if (!typographyStyles || typeof typographyStyles !== "object") return null;
  const headings = {};
  const rawHeadings = typographyStyles.headings && typeof typographyStyles.headings === "object"
    ? typographyStyles.headings
    : {};
  for (const [level, entry] of Object.entries(rawHeadings)) {
    const numericLevel = Number.parseInt(level, 10);
    const normalizedEntry = normalizeV4TypographyOverride(entry);
    if (Number.isInteger(numericLevel) && normalizedEntry) {
      headings[numericLevel] = normalizedEntry;
    }
  }
  const normalized = {
    paragraph: normalizeV4TypographyOverride(typographyStyles.paragraph),
    blockquote: normalizeV4TypographyOverride(typographyStyles.blockquote),
    figureLead: normalizeV4TypographyOverride(typographyStyles.figureLead),
    listItem: normalizeV4TypographyOverride(typographyStyles.listItem),
    headings
  };
  if (!normalized.paragraph) delete normalized.paragraph;
  if (!normalized.blockquote) delete normalized.blockquote;
  if (!normalized.figureLead) delete normalized.figureLead;
  if (!normalized.listItem) delete normalized.listItem;
  if (!Object.keys(normalized.headings).length) delete normalized.headings;
  return Object.keys(normalized).length ? normalized : null;
}

function mergeStyleTokenWithV4Typography(styleTokenRecord, override) {
  if (!styleTokenRecord || !override) return styleTokenRecord;
  const next = { ...styleTokenRecord };
  const numericFields = [
    "fontSizePx",
    "fontSizeScale",
    "lineHeightPx",
    "lineHeightFactor",
    "letterSpacingPx",
    "letterSpacingEm",
    "wordSpacingPx",
    "wordSpacingEm",
    "textIndentPx",
    "textIndentEm",
    "marginTopPx",
    "marginTopEm",
    "marginBottomPx",
    "marginBottomEm",
    "marginLeftPx",
    "marginLeftEm",
    "marginRightPx",
    "marginRightEm",
    "paddingTopPx",
    "paddingTopEm",
    "paddingRightPx",
    "paddingRightEm",
    "paddingBottomPx",
    "paddingBottomEm",
    "paddingLeftPx",
    "paddingLeftEm"
  ];
  for (const field of numericFields) {
    if (override[field] != null) {
      next[field] = override[field];
    }
  }
  if (override.textAlign) {
    next.textAlign = override.textAlign;
  }
  if (override.whiteSpace) {
    next.whiteSpace = override.whiteSpace;
  }
  if (override.hyphens) {
    next.hyphens = override.hyphens;
  }
  if (override.wordBreak) {
    next.wordBreak = override.wordBreak;
  }
  if (override.overflowWrap) {
    next.overflowWrap = override.overflowWrap;
  }
  if (override.fontFamilyCandidate) {
    next.fontFamilyCandidate = override.fontFamilyCandidate;
  }
  if (override.textColor) {
    next.textColor = override.textColor;
  }
  if (override.fontStyle) {
    next.fontStyle = (
      String(styleTokenRecord.fontStyle || "").trim().toLowerCase() === "italic" ||
      override.fontStyle === "italic"
    ) ? "italic" : "normal";
  }
  if (override.fontWeight) {
    next.fontWeight = (
      String(styleTokenRecord.fontWeight || "").trim().toLowerCase() === "bold" ||
      override.fontWeight === "bold"
    ) ? "bold" : "regular";
  }
  return next;
}

function applyV4TypographyToStyleMap(styleMap, typographyStyles) {
  if (!(styleMap instanceof Map) || !typographyStyles) return styleMap;
  const nextStyleMap = new Map();
  for (const [styleToken, styleTokenRecord] of styleMap.entries()) {
    const token = String(styleToken || "").trim().toLowerCase();
    let override = null;
    const headingMatch = token.match(/^heading-(\d+)/);
    if (headingMatch) {
      override = typographyStyles.headings && typographyStyles.headings[Number.parseInt(headingMatch[1], 10)];
    } else if (token.startsWith("paragraph")) {
      override = typographyStyles.paragraph || null;
    } else if (token.startsWith("blockquote")) {
      override = typographyStyles.blockquote || null;
    } else if (token === "list-item") {
      override = typographyStyles.listItem || typographyStyles.paragraph || null;
    }
    nextStyleMap.set(styleToken, mergeStyleTokenWithV4Typography(styleTokenRecord, override));
  }
  return nextStyleMap;
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[«»“”"']/g, "")
    .replace(/[–—-]/g, "-")
    .replace(/[^a-z0-9а-яё\-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTextMatchStrength(oldText, candidateText) {
  const rawLeft = String(oldText || "").trim();
  const rawRight = String(candidateText || "").trim();
  if (rawLeft && rawRight && rawLeft === rawRight) return 3;
  const left = normalizeComparableText(oldText);
  const right = normalizeComparableText(candidateText);
  const collapsedLeft = left.replace(/\s+/g, "");
  const collapsedRight = right.replace(/\s+/g, "");
  if (collapsedLeft && collapsedRight && collapsedLeft === collapsedRight) return 3;
  if (
    collapsedLeft &&
    collapsedRight &&
    Math.min(collapsedLeft.length, collapsedRight.length) >= 32 &&
    (
      collapsedLeft.startsWith(collapsedRight) ||
      collapsedRight.startsWith(collapsedLeft) ||
      collapsedLeft.slice(0, 32) === collapsedRight.slice(0, 32)
    )
  ) {
    return 2;
  }
  if (!left || !right) return 0;
  if (left === right) return 3;
  if (left.length >= 16 && right.length >= 16 && (left.includes(right) || right.includes(left))) return 2;
  if (left.length >= 12 && right.length >= 12 && left.slice(0, 24) === right.slice(0, 24)) return 1;
  return 0;
}

function normalizeV4BlockPresentationForRuntime(blockPresentation) {
  const next = blockPresentation && typeof blockPresentation === "object" ? blockPresentation : {};
  return {
    textAlign: String(next.textAlign || "justify").trim().toLowerCase() || "justify",
    textIndentEm: Number(next.textIndentEm || 0) || 0,
    marginTopEm: Number(next.marginTopEm || 0) || 0,
    marginBottomEm: Number(next.marginBottomEm || 0) || 0,
    lineHeightFactor: Number(next.lineHeight || 1.35) || 1.35,
    fontSizeScale: 1,
    letterSpacingEm: 0,
    wordSpacingEm: 0,
    pageBreakBefore: !!next.breakBefore,
    fontFamily: ""
  };
}

function applyV4CandidatePresentationHints(candidate) {
  if (!candidate || typeof candidate !== "object") return candidate;
  const nextBlockPresentation = {
    ...(candidate.blockPresentation && typeof candidate.blockPresentation === "object" ? candidate.blockPresentation : {})
  };
  if (candidate.openingClusterId && Number(candidate.openingClusterIndex) > 0) {
    nextBlockPresentation.pageBreakBefore = false;
  }
  if (candidate.sequenceRole === "comment-heading") {
    nextBlockPresentation.textAlign = "left";
    nextBlockPresentation.textIndentEm = 0;
    nextBlockPresentation.marginTopEm = Math.max(Number(nextBlockPresentation.marginTopEm || 0), 0.5);
    nextBlockPresentation.marginBottomEm = 0;
  } else if (candidate.sequenceRole === "comment-body") {
    nextBlockPresentation.textIndentEm = 0;
    nextBlockPresentation.marginTopEm = 0;
  }
  if (candidate.blockRole === "blockquote") {
    nextBlockPresentation.textAlign = "left";
    nextBlockPresentation.textIndentEm = 0;
    nextBlockPresentation.marginTopEm = Math.max(Number(nextBlockPresentation.marginTopEm || 0), 1.2);
    nextBlockPresentation.marginBottomEm = Math.max(Number(nextBlockPresentation.marginBottomEm || 0), 1.2);
  }
  if (candidate.listContainerId) {
    nextBlockPresentation.textAlign = "justify";
    nextBlockPresentation.textIndentEm = Math.max(Number(nextBlockPresentation.textIndentEm || 0), 1.25);
    nextBlockPresentation.marginTopEm = Number(candidate.listIndex) === 0
      ? Math.max(Number(nextBlockPresentation.marginTopEm || 0), 0.35)
      : 0;
    nextBlockPresentation.marginBottomEm = 0;
  }
  if (candidate.figureSequenceId) {
    nextBlockPresentation.pageBreakBefore = !!candidate.figureBreakBefore;
    if (candidate.figureMemberRole === "lead-text") {
      nextBlockPresentation.marginBottomEm = Math.max(Number(nextBlockPresentation.marginBottomEm || 0), 0.5);
      nextBlockPresentation.textAlign = "justify";
      nextBlockPresentation.textIndentEm = Math.max(Number(nextBlockPresentation.textIndentEm || 0), 1.25);
    } else if (candidate.figureMemberRole === "image") {
      nextBlockPresentation.textAlign = "center";
      nextBlockPresentation.textIndentEm = 0;
      nextBlockPresentation.marginTopEm = Math.max(Number(nextBlockPresentation.marginTopEm || 0), 0.5);
      nextBlockPresentation.marginBottomEm = Math.max(Number(nextBlockPresentation.marginBottomEm || 0), 0.75);
    }
  }
  return {
    ...candidate,
    blockPresentation: nextBlockPresentation
  };
}

function normalizeV4MediaItemForRuntime(item) {
  if (!item || typeof item !== "object") return null;
  const preferredWidth = Number(item.preferredRenderWidthPx || 0) || 0;
  const preferredHeight = Number(item.preferredRenderHeightPx || 0) || 0;
  const intrinsicWidth = Number(item.intrinsicWidthPx || 0) || 0;
  const intrinsicHeight = Number(item.intrinsicHeightPx || 0) || 0;
  return {
    mediaId: String(item.mediaId || "").trim(),
    kind: "image",
    tagName: "image",
    sourceHref: String(item.sourceHref || "").trim(),
    resolvedHref: String(item.resolvedHref || "").trim(),
    nodeId: "",
    className: "",
    widthPx: preferredWidth || intrinsicWidth || 0,
    heightPx: preferredHeight || intrinsicHeight || 0,
    inlineAvatar: String(item.mediaRole || "").trim() === "inline-avatar" || String(item.placement || "").trim() === "inline-avatar",
    placement: String(item.placement || "block").trim() || "block",
    mediaRole: String(item.mediaRole || "").trim(),
    sourceAnchor: item.sourceAnchor && typeof item.sourceAnchor === "object" ? { ...item.sourceAnchor } : null,
    hostSourceAnchor: item.hostSourceAnchor && typeof item.hostSourceAnchor === "object" ? { ...item.hostSourceAnchor } : null
  };
}

function normalizeV4SourceTag(value, fallback = "p") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || String(fallback || "p").trim().toLowerCase();
}

function buildCompatSourceRefFromCandidate(oldSourceRef, candidate) {
  const previous = oldSourceRef && typeof oldSourceRef === "object" ? oldSourceRef : {};
  if (!candidate || typeof candidate !== "object") return previous;
  const sourceHref = String(candidate.sourceHref || previous.href || "").trim();
  const sourceNodeIndex = Number.isInteger(candidate.sourceNodeIndex)
    ? candidate.sourceNodeIndex
    : (Number.isInteger(previous.nodeIndex) ? previous.nodeIndex : -1);
  const sourceTag = normalizeV4SourceTag(candidate.sourceTag, previous.nodeTag || "p");
  const normalizedHref = normalizeRuntimeSafeSourceHref(sourceHref);
  const spineStem = normalizedHref
    ? normalizedHref.replace(/^EPUB\//i, "").replace(/^text\//i, "").replace(/\.xhtml?$/i, "")
    : String(previous.spineId || "").trim();
  return {
    spineId: spineStem || String(previous.spineId || "").trim(),
    spineIndex: Number.isInteger(previous.spineIndex) ? previous.spineIndex : 0,
    href: sourceHref || String(previous.href || "").trim(),
    filePath: String(previous.filePath || "").trim(),
    nodeTag: sourceTag,
    nodeIndex: sourceNodeIndex,
    nodeId: String(candidate.sourceNodeId || previous.nodeId || "").trim(),
    nodeClass: String(candidate.sourceClassName || previous.nodeClass || "").trim()
  };
}

function getCandidateInlineAvatarHostAnchor(candidate) {
  const mediaItems = Array.isArray(candidate && candidate.mediaItems) ? candidate.mediaItems : [];
  return mediaItems.find((item) => item && item.inlineAvatar && item.hostSourceAnchor && typeof item.hostSourceAnchor === "object")
    ?.hostSourceAnchor || null;
}

function candidateInlineAvatarMatchesOldBlock(oldBlock, candidate) {
  const hostAnchor = getCandidateInlineAvatarHostAnchor(candidate);
  if (!hostAnchor) return false;
  const oldSourceRef = oldBlock && oldBlock.sourceRef && typeof oldBlock.sourceRef === "object" ? oldBlock.sourceRef : null;
  if (!oldSourceRef) return false;
  if (normalizeRuntimeSafeSourceHref(oldSourceRef.href) !== normalizeRuntimeSafeSourceHref(hostAnchor.sourceTextHref)) return false;
  if (String(oldSourceRef.nodeTag || "").trim().toLowerCase() !== String(hostAnchor.nodeTag || "").trim().toLowerCase()) return false;
  if (Number.isInteger(oldSourceRef.nodeIndex) && Number(oldSourceRef.nodeIndex) === Number(hostAnchor.nodeIndex)) return true;
  const textMatchStrength = getTextMatchStrength(
    String(oldBlock && oldBlock.labelHint || ""),
    String(candidate && candidate.textContent || "")
  );
  if (textMatchStrength < 2) return false;
  if (!Number.isInteger(oldSourceRef.nodeIndex) || !Number.isInteger(Number(hostAnchor.nodeIndex))) return false;
  return Math.abs(Number(oldSourceRef.nodeIndex) - Number(hostAnchor.nodeIndex)) <= 4;
}

function getSourceNodeDistanceScore(oldBlock, candidate) {
  const oldSourceRef = oldBlock && oldBlock.sourceRef && typeof oldBlock.sourceRef === "object" ? oldBlock.sourceRef : null;
  const candidateNodeIndex = Number(candidate && candidate.sourceNodeIndex);
  if (!oldSourceRef || !Number.isInteger(oldSourceRef.nodeIndex) || !Number.isInteger(candidateNodeIndex)) return 0;
  const oldHref = normalizeRuntimeSafeSourceHref(oldSourceRef.href);
  const candidateHref = normalizeRuntimeSafeSourceHref(candidate && candidate.sourceHref);
  if (!oldHref || !candidateHref || oldHref !== candidateHref) return 0;
  const distance = Math.abs(Number(oldSourceRef.nodeIndex) - candidateNodeIndex);
  if (distance === 0) return 4;
  if (distance <= 2) return 3;
  if (distance <= 6) return 2;
  if (distance <= 12) return 1;
  return 0;
}

function buildV4CompatibleBlockQueues(manifest) {
  const logicalBlocks = Array.isArray(manifest && manifest.logicalBlockList) ? manifest.logicalBlockList : [];
  const figureContainers = Array.isArray(manifest && manifest.figureContainers) ? manifest.figureContainers : [];
  const listContainers = Array.isArray(manifest && manifest.listContainers) ? manifest.listContainers : [];
  const figureLeadMap = new Map();
  const figureImageMap = new Map();
  for (const container of figureContainers) {
    if (!container || !Array.isArray(container.members)) continue;
    const containerId = String(container.containerId || "").trim();
    if (!containerId) continue;
    for (const member of container.members) {
      const memberRole = String(member && member.memberRole || "").trim();
      if (memberRole === "lead-text" && member.blockId) {
        figureLeadMap.set(String(member.blockId).trim(), {
          figureSequenceId: containerId,
          figureMemberRole: "lead-text",
          figureBreakBefore: !!container.breakBefore
        });
      } else if (memberRole === "image" && member.mediaBlockId) {
        figureImageMap.set(String(member.mediaBlockId).trim(), {
          figureSequenceId: containerId,
          figureMemberRole: "image",
          figureBreakBefore: !!container.breakBefore
        });
      }
    }
  }
  const listItemMap = new Map();
  for (const container of listContainers) {
    if (!container || !Array.isArray(container.itemBlockIds)) continue;
    const containerId = String(container.containerId || "").trim();
    if (!containerId) continue;
    container.itemBlockIds.forEach((itemBlockId, index) => {
      const key = String(itemBlockId || "").trim();
      if (!key) return;
      listItemMap.set(key, {
        listContainerId: containerId,
        listType: String(container.listType || "").trim() || "ordered",
        listIndex: index,
        listStart: Number(container.start || (index + 1)) || (index + 1),
        listBreakBefore: !!container.breakBefore
      });
    });
  }
  const figureLeadBreakBefore = new Set(
    figureContainers
      .filter((container) => container && container.breakBefore)
      .flatMap((container) => Array.isArray(container.members) ? container.members : [])
      .filter((member) => member && String(member.memberRole || "").trim() === "lead-text" && member.blockId)
      .map((member) => String(member.blockId).trim())
  );
  const firstListItemBreakBefore = new Set(
    listContainers
      .filter((container) => container && container.breakBefore && Array.isArray(container.itemBlockIds) && container.itemBlockIds.length)
      .map((container) => String(container.itemBlockIds[0] || "").trim())
      .filter(Boolean)
  );
  const queues = new Map();
  const pendingInlineAvatars = new Map();
  const activeCommentThreads = new Map();
  const activeOpeningClusters = new Map();
  function ensureQueue(sourceHref) {
    const key = normalizeRuntimeSafeSourceHref(sourceHref);
    if (!queues.has(key)) queues.set(key, []);
    return queues.get(key);
  }
  for (let index = 0; index < logicalBlocks.length; index += 1) {
    const block = logicalBlocks[index];
    if (!block || typeof block !== "object") continue;
    const sourceHref = normalizeRuntimeSafeSourceHref(block.sourceHref);
    if (!sourceHref) continue;
    const mediaItems = Array.isArray(block.mediaItems)
      ? block.mediaItems.map(normalizeV4MediaItemForRuntime).filter(Boolean)
      : [];
    const sourceQueue = ensureQueue(sourceHref);
    const onlyInlineAvatarMedia = mediaItems.length > 0 && mediaItems.every((item) => item.inlineAvatar);
    if (!block.textContent && !Number.isInteger(block.headingLevel) && !block.blockRole && onlyInlineAvatarMedia) {
      const pending = pendingInlineAvatars.get(sourceHref) || [];
      pending.push(...mediaItems);
      pendingInlineAvatars.set(sourceHref, pending);
      continue;
    }
    const attachedMedia = [];
    const pending = pendingInlineAvatars.get(sourceHref);
    if (pending && pending.length) {
      attachedMedia.push(...pending);
      pendingInlineAvatars.delete(sourceHref);
    }
      if (mediaItems.length) attachedMedia.push(...mediaItems);
    const rawBlockId = String(block.blockId || "").trim();
    const figureLeadMeta = figureLeadMap.get(rawBlockId) || null;
    const figureImageMeta = figureImageMap.get(rawBlockId) || null;
    const listItemMeta = listItemMap.get(rawBlockId) || null;
    const activeOpeningCluster = activeOpeningClusters.get(sourceHref) || null;
    const separatorMedia = attachedMedia.find((item) => item && String(item.mediaRole || "").trim() === "separator-image");
    const isOpeningClusterMember =
      (!activeOpeningCluster && Number(block.headingLevel) === 1) ||
      (!!activeOpeningCluster && (
        (Number(block.headingLevel) >= 2 && Number(block.headingLevel) <= 4) ||
        !!separatorMedia
      ));
    let openingClusterId = activeOpeningCluster || "";
    let openingClusterIndex = -1;
    if (!activeOpeningCluster && Number(block.headingLevel) === 1) {
      openingClusterId = `opening-cluster:${sourceHref}`;
      activeOpeningClusters.set(sourceHref, openingClusterId);
      openingClusterIndex = 0;
    } else if (isOpeningClusterMember && activeOpeningCluster) {
      const queueLength = sourceQueue.length;
      openingClusterIndex = queueLength;
    } else if (activeOpeningCluster) {
      activeOpeningClusters.delete(sourceHref);
      openingClusterId = "";
      openingClusterIndex = -1;
    }
    const isCommentHeading =
      Number(block.headingLevel) === 5 &&
      attachedMedia.some((item) => item && item.inlineAvatar);
    let commentThreadId = "";
    let sequenceRole = "";
    if (isCommentHeading) {
      commentThreadId = `comment-thread:${rawBlockId}`;
      sequenceRole = "comment-heading";
      activeCommentThreads.set(sourceHref, commentThreadId);
    } else {
      const activeCommentThreadId = activeCommentThreads.get(sourceHref) || "";
      const isCommentBody =
        !!activeCommentThreadId &&
        !Number.isInteger(block.headingLevel) &&
        !attachedMedia.length &&
        !String(block.blockRole || "").trim();
      if (isCommentBody) {
        commentThreadId = activeCommentThreadId;
        sequenceRole = "comment-body";
      } else if (activeCommentThreadId) {
        activeCommentThreads.delete(sourceHref);
      }
    }
    sourceQueue.push(applyV4CandidatePresentationHints({
      sourceHref,
      headingLevel: Number.isInteger(block.headingLevel) ? block.headingLevel : null,
      blockRole: listItemMeta ? "list-item" : String(block.blockRole || "").trim(),
      textContent: String(block.textContent || "").trim(),
      sourceTag: normalizeV4SourceTag(block.sourceTag, attachedMedia.some((item) => item && item.inlineAvatar) ? "h5" : "p"),
      sourceNodeIndex: Number.isInteger(block.sourceNodeIndex) ? block.sourceNodeIndex : -1,
      sourceClassName: String(block.sourceClassName || "").trim(),
      blockPresentation: {
        ...normalizeV4BlockPresentationForRuntime(block.blockPresentation),
        pageBreakBefore:
          (!!listItemMeta && listItemMeta.listBreakBefore && Number(listItemMeta.listIndex) === 0) ||
          firstListItemBreakBefore.has(rawBlockId) ||
          figureLeadBreakBefore.has(String(block.blockId || "").trim()) ||
          !!(block.blockPresentation && block.blockPresentation.breakBefore)
      },
      mediaItems: attachedMedia,
      rawBlockId,
      commentThreadId,
      sequenceRole,
      openingClusterId,
      openingClusterIndex,
      figureSequenceId: figureLeadMeta
        ? figureLeadMeta.figureSequenceId
        : (figureImageMeta ? figureImageMeta.figureSequenceId : ""),
      figureMemberRole: figureLeadMeta
        ? figureLeadMeta.figureMemberRole
        : (figureImageMeta ? figureImageMeta.figureMemberRole : ""),
      figureBreakBefore: !!(
        (figureLeadMeta && figureLeadMeta.figureBreakBefore) ||
        (figureImageMeta && figureImageMeta.figureBreakBefore)
      ),
      listContainerId: listItemMeta ? listItemMeta.listContainerId : "",
      listType: listItemMeta ? listItemMeta.listType : "",
      listIndex: listItemMeta ? listItemMeta.listIndex : -1,
      listStart: listItemMeta ? listItemMeta.listStart : -1
    }));
  }
  return queues;
}

function getCompatibleRuntimeSafeBlockScore(oldBlock, candidate, context = {}) {
  if (!oldBlock || !candidate) return false;
  const oldType = String(oldBlock.blockType || "").trim().toLowerCase();
  const oldHeadingMatch = oldType.match(/^heading-(\d+)$/);
  const oldHasMedia = Array.isArray(oldBlock.mediaItems) && oldBlock.mediaItems.length > 0;
  const oldTag = String(oldBlock.sourceRef && oldBlock.sourceRef.nodeTag || "").trim().toLowerCase();
  const previousOldBlock = context.previousOldBlock || null;
  const nextOldBlock = context.nextOldBlock || null;
  const oldText = String(oldBlock.labelHint || "").trim();
  const candidateText = String(candidate.textContent || "").trim();
  const textMatchStrength = getTextMatchStrength(oldText, candidateText);
  const sourceNodeDistanceScore = getSourceNodeDistanceScore(oldBlock, candidate);
  if (oldHeadingMatch) {
    const expectedLevel = Number(oldHeadingMatch[1]);
    if (Number(candidate.headingLevel) !== expectedLevel) return 0;
    if (oldHasMedia && !candidate.mediaItems.length) return 0;
    if (candidate.sequenceRole === "comment-heading") {
      if (!candidateInlineAvatarMatchesOldBlock(oldBlock, candidate)) return 0;
      if (textMatchStrength <= 0) return 0;
    }
    if (textMatchStrength >= 3) return (candidate.sequenceRole === "comment-heading" ? 12 : 11) + sourceNodeDistanceScore;
    if (textMatchStrength === 2) return (candidate.sequenceRole === "comment-heading" ? 10 : 9) + sourceNodeDistanceScore;
    if (textMatchStrength === 1) return (candidate.sequenceRole === "comment-heading" ? 8 : 7) + sourceNodeDistanceScore;
    return 0;
  }
  if (oldType === "figure") {
    const oldMediaHref =
      Array.isArray(oldBlock.mediaItems) && oldBlock.mediaItems.length
        ? String(oldBlock.mediaItems[0] && oldBlock.mediaItems[0].resolvedHref || "").trim()
        : "";
    const candidateMediaHref =
      Array.isArray(candidate.mediaItems) && candidate.mediaItems.length
        ? String(candidate.mediaItems[0] && candidate.mediaItems[0].resolvedHref || "").trim()
        : "";
    if (!candidate.mediaItems.length || candidate.textContent) return 0;
    if (oldMediaHref && candidateMediaHref && oldMediaHref !== candidateMediaHref) return 0;
    if (candidate.figureMemberRole === "image") return 8;
    return 4;
  }
  if (oldType === "list-item") {
    if (candidate.blockRole === "list-item" && textMatchStrength >= 1) return 5 + sourceNodeDistanceScore;
    return 0;
  }
  if (oldType === "blockquote") {
    if (candidate.blockRole !== "blockquote") return 0;
    if (textMatchStrength >= 3) return 11 + sourceNodeDistanceScore;
    if (textMatchStrength === 2) return 9 + sourceNodeDistanceScore;
    if (textMatchStrength === 1) return 7 + sourceNodeDistanceScore;
    return 0;
  }
  if (oldType === "paragraph") {
    if (oldHasMedia) {
      if (!candidate.mediaItems.length) {
        if (oldTag === "td" && candidate.textContent && textMatchStrength >= 2) return 7 + sourceNodeDistanceScore;
        return 0;
      }
      if (candidate.sequenceRole === "comment-heading" && !candidateInlineAvatarMatchesOldBlock(oldBlock, candidate)) return 0;
      if (oldTag === "td" && candidate.figureMemberRole === "image") {
        return oldText ? 0 : 8;
      }
      if (candidate.sequenceRole === "comment-heading") return textMatchStrength >= 1 ? 5 + sourceNodeDistanceScore : 0;
      return (!!candidate.textContent || !!candidate.blockRole) && textMatchStrength >= 1 ? 3 + sourceNodeDistanceScore : 0;
    }
    if (
      nextOldBlock &&
      String(nextOldBlock.blockType || "").trim().toLowerCase() === "paragraph" &&
      Array.isArray(nextOldBlock.mediaItems) &&
      nextOldBlock.mediaItems.length &&
      String(nextOldBlock.sourceRef && nextOldBlock.sourceRef.nodeTag || "").trim().toLowerCase() === "td" &&
      candidate.figureMemberRole === "lead-text"
    ) {
      return 7;
    }
    if (textMatchStrength >= 3) return 9 + sourceNodeDistanceScore;
    if (textMatchStrength === 2) return 7 + sourceNodeDistanceScore;
    if (textMatchStrength === 1) return 5 + sourceNodeDistanceScore;
    if (candidate.blockRole === "blockquote" && textMatchStrength >= 1) return 5 + sourceNodeDistanceScore;
    if (
      previousOldBlock &&
      (
        (
          String(previousOldBlock.blockType || "").trim().toLowerCase() === "heading-5" &&
          Array.isArray(previousOldBlock.mediaItems) &&
          previousOldBlock.mediaItems.some((item) => item && item.inlineAvatar)
        ) ||
        (
          previousOldBlock.v4Compatibility &&
          previousOldBlock.v4Compatibility.sequenceRole === "comment-heading"
        )
      ) &&
      candidate.sequenceRole === "comment-body" &&
      textMatchStrength >= 1
    ) {
      return 6 + sourceNodeDistanceScore;
    }
    return 0;
  }
  return 0;
}

function isStrictArtifactFirstCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  return !!(
    String(candidate.textContent || "").trim() ||
    Number.isInteger(candidate.headingLevel) ||
    candidate.openingClusterId ||
    candidate.sequenceRole ||
    candidate.figureSequenceId ||
    candidate.listContainerId ||
    candidate.blockRole === "blockquote" ||
    (
      Array.isArray(candidate.mediaItems) &&
      candidate.mediaItems.length &&
      !String(candidate.textContent || "").trim()
    )
  );
}

function describeRuntimeSafeBlock(block) {
  if (!block || typeof block !== "object") return "<missing-runtime-safe-block>";
  const sourceHref = normalizeRuntimeSafeSourceHref(block && block.sourceRef && block.sourceRef.href);
  const blockId = String(block.blockId || "").trim() || "<no-block-id>";
  const blockType = String(block.blockType || "").trim() || "<no-block-type>";
  const labelHint = String(block.labelHint || "").trim();
  return `${blockId} (${blockType}) @ ${sourceHref || "<no-source>"}${labelHint ? ` :: ${labelHint.slice(0, 96)}` : ""}`;
}

function describeV4Candidate(candidate) {
  if (!candidate || typeof candidate !== "object") return "<missing-v4-candidate>";
  const rawBlockId = String(candidate.rawBlockId || "").trim() || "<no-raw-block-id>";
  const sourceHref = normalizeRuntimeSafeSourceHref(candidate.sourceHref);
  const textContent = String(candidate.textContent || "").trim();
  return `${rawBlockId} @ ${sourceHref || "<no-source>"}${textContent ? ` :: ${textContent.slice(0, 96)}` : ""}`;
}

function buildChunkSourceRanges(chunkBlocks) {
  const ranges = new Map();
  for (const block of Array.isArray(chunkBlocks) ? chunkBlocks : []) {
    const sourceHref = normalizeRuntimeSafeSourceHref(block && block.sourceRef && block.sourceRef.href);
    const nodeIndex = Number(block && block.sourceRef && block.sourceRef.nodeIndex);
    if (!sourceHref || !Number.isInteger(nodeIndex)) continue;
    const current = ranges.get(sourceHref);
    if (!current) {
      ranges.set(sourceHref, { min: nodeIndex, max: nodeIndex });
      continue;
    }
    current.min = Math.min(current.min, nodeIndex);
    current.max = Math.max(current.max, nodeIndex);
  }
  return ranges;
}

function candidateFallsInsideChunkRange(candidate, sourceRange) {
  if (!candidate || !sourceRange) return false;
  const nodeIndex = Number(candidate.sourceNodeIndex);
  if (!Number.isInteger(nodeIndex)) return false;
  return nodeIndex >= sourceRange.min && nodeIndex <= sourceRange.max;
}

function mergeV4CompatibilityIntoRuntimeSafeChunk(chunk, book) {
  if (!chunk || !book || !book.v4Bootstrap || !book.v4Bootstrap.manifest) return chunk;
  const queues = buildV4CompatibleBlockQueues(book.v4Bootstrap.manifest);
  let previousOldBlock = null;
  const chunkBlocks = Array.isArray(chunk.logicalBlockList) ? chunk.logicalBlockList : [];
  const chunkSourceRanges = buildChunkSourceRanges(chunkBlocks);
  const mergedLogicalBlockList = chunkBlocks.map((block, blockIndex) => {
    const sourceHref = normalizeRuntimeSafeSourceHref(block && block.sourceRef && block.sourceRef.href);
    const queue = sourceHref ? (queues.get(sourceHref) || []) : [];
    const sourceRange = sourceHref ? (chunkSourceRanges.get(sourceHref) || null) : null;
    const oldType = String(block && block.blockType || "").trim().toLowerCase();
    const oldHeadingMatch = oldType.match(/^heading-(\d+)$/);
    const oldHasMedia = Array.isArray(block && block.mediaItems) && block.mediaItems.length > 0;
    const oldTag = String(block && block.sourceRef && block.sourceRef.nodeTag || "").trim().toLowerCase();
    const maxSearch =
      oldType === "list-item"
        ? queue.length
        : oldType === "blockquote"
          ? queue.length
        : oldHeadingMatch
          ? queue.length
        : oldType === "paragraph"
          ? queue.length
          : Math.min(queue.length, 8);
    let candidateIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < maxSearch; index += 1) {
      const score = getCompatibleRuntimeSafeBlockScore(block, queue[index], {
        previousOldBlock,
        nextOldBlock: chunkBlocks[blockIndex + 1] || null
      });
      if (score > bestScore) {
        bestScore = score;
        candidateIndex = index;
      }
    }
    if (candidateIndex < 0) {
      const nextStrictCandidate = queue.find((item) =>
        isStrictArtifactFirstCandidate(item) && candidateFallsInsideChunkRange(item, sourceRange)
      );
      if (nextStrictCandidate) {
        throw new Error(
          `Strict artifact-first mapping failed for ${describeRuntimeSafeBlock(block)}; ` +
          `next v4 structural candidate is ${describeV4Candidate(nextStrictCandidate)}`
        );
      }
      previousOldBlock = block;
      return block;
    }
    const candidate = queue.splice(candidateIndex, 1)[0];
    let pairedFigureImageCandidate = null;
    if (
      oldType === "paragraph" &&
      oldHasMedia &&
      oldTag === "td" &&
      candidate &&
      candidate.figureSequenceId &&
      candidate.figureMemberRole === "lead-text"
    ) {
      const pairedIndex = queue.findIndex((item) =>
        item &&
        item.figureSequenceId === candidate.figureSequenceId &&
        item.figureMemberRole === "image" &&
        Array.isArray(item.mediaItems) &&
        item.mediaItems.length
      );
      if (pairedIndex >= 0) {
        pairedFigureImageCandidate = queue.splice(pairedIndex, 1)[0];
      }
    }
    if (
      candidate &&
      candidate.figureSequenceId &&
      candidate.figureMemberRole === "lead-text" &&
      oldType === "paragraph" &&
      oldHasMedia &&
      oldTag === "td" &&
      !(pairedFigureImageCandidate && Array.isArray(pairedFigureImageCandidate.mediaItems) && pairedFigureImageCandidate.mediaItems.length)
    ) {
      throw new Error(
        `Strict artifact-first figure mapping failed for ${describeRuntimeSafeBlock(block)}; ` +
        `missing paired image candidate for ${describeV4Candidate(candidate)}`
      );
    }
    const isCommentHeading = candidate.sequenceRole === "comment-heading";
    const shouldDropLegacyCarriedMedia = (
      oldType === "paragraph" &&
      oldHasMedia &&
      !isCommentHeading &&
      !!candidate.textContent &&
      (!candidate.mediaItems || !candidate.mediaItems.length) &&
      Array.isArray(block.mediaItems) &&
      block.mediaItems.length > 0 &&
      block.mediaItems.every((item) => item && !item.inlineAvatar)
    );
    const strictArtifactOnly = isStrictArtifactFirstCandidate(candidate);
    const resolvedMediaItems =
      pairedFigureImageCandidate && pairedFigureImageCandidate.mediaItems && pairedFigureImageCandidate.mediaItems.length
        ? pairedFigureImageCandidate.mediaItems
        : candidate.mediaItems && candidate.mediaItems.length
        ? candidate.mediaItems
        : (shouldDropLegacyCarriedMedia ? [] : (block.mediaItems || []));
    if (strictArtifactOnly && oldHasMedia && resolvedMediaItems === (block.mediaItems || [])) {
      throw new Error(
        `Strict artifact-first mapping refused legacy media carry-over for ${describeRuntimeSafeBlock(block)}; ` +
        `candidate ${describeV4Candidate(candidate)} did not provide artifact-backed media`
      );
    }
    const nextBlock = {
      ...block,
      blockType:
        isCommentHeading
          ? "paragraph"
          : candidate.figureMemberRole === "image"
          ? "figure"
          : (candidate.blockRole === "list-item"
            ? "list-item"
            : block.blockType),
      textLength: candidate.textContent
        ? Math.max(1, Array.from(String(candidate.textContent || "")).length)
        : block.textLength,
      labelHint:
        candidate.blockRole === "list-item" && Number.isInteger(candidate.listStart) && candidate.listStart > 0
          ? `${candidate.listStart}. ${String(candidate.textContent || "").trim()}`
          : (candidate.textContent || block.labelHint || ""),
      blockPresentation: candidate.blockPresentation || block.blockPresentation || {},
      mediaItems: resolvedMediaItems,
      sourceRef: buildCompatSourceRefFromCandidate(block.sourceRef, candidate),
      blockRole: isCommentHeading ? "" : (candidate.blockRole || block.blockRole || ""),
      headingLevel: isCommentHeading
        ? null
        : Number.isInteger(candidate.headingLevel)
        ? candidate.headingLevel
        : (Number.isInteger(block.headingLevel) ? block.headingLevel : null),
      v4Compatibility: {
        sourceHref: candidate.sourceHref,
        rawBlockId: candidate.rawBlockId,
        sequenceRole: candidate.sequenceRole || "",
        commentThreadId: candidate.commentThreadId || "",
        openingClusterId: candidate.openingClusterId || "",
        openingClusterIndex: Number.isInteger(candidate.openingClusterIndex) ? candidate.openingClusterIndex : -1,
        sourceNodeIndex: Number.isInteger(candidate.sourceNodeIndex) ? candidate.sourceNodeIndex : -1,
        sourceTag: String(candidate.sourceTag || "").trim(),
        figureSequenceId: candidate.figureSequenceId || "",
        figureMemberRole: pairedFigureImageCandidate
          ? "lead-with-image"
          : (candidate.figureMemberRole || ""),
        listContainerId: candidate.listContainerId || "",
        listType: candidate.listType || "",
        listIndex: Number.isInteger(candidate.listIndex) ? candidate.listIndex : -1,
        listStart: Number.isInteger(candidate.listStart) ? candidate.listStart : -1
      }
    };
    previousOldBlock = nextBlock;
    return nextBlock;
  });
  const commentHeadingBlockIds = new Set(
    mergedLogicalBlockList
      .filter((block) => block && block.v4Compatibility && block.v4Compatibility.sequenceRole === "comment-heading")
      .map((block) => String(block.blockId || "").trim())
      .filter(Boolean)
  );
  const mergedRenderLayer = chunk.renderLayer && Array.isArray(chunk.renderLayer.glyphRuns)
    ? {
        ...chunk.renderLayer,
        glyphRuns: chunk.renderLayer.glyphRuns.map((run) => {
          const blockId = String(run && run.blockId || "").trim();
          const mergedBlock = mergedLogicalBlockList.find((block) => String(block && block.blockId || "").trim() === blockId) || null;
          if (!blockId) return run;
          return {
            ...run,
            sourceRef: mergedBlock && mergedBlock.sourceRef ? mergedBlock.sourceRef : (run.sourceRef || null),
            styleToken: commentHeadingBlockIds.has(blockId) ? "paragraph" : run.styleToken
          };
        })
      }
    : chunk.renderLayer;
  const mergedBlockSourceRefById = new Map(
    mergedLogicalBlockList
      .filter((block) => block && block.sourceRef)
      .map((block) => [String(block.blockId || "").trim(), block.sourceRef])
  );
  const mergedSelectionLayer = chunk.selectionLayer && typeof chunk.selectionLayer === "object"
    ? {
        ...chunk.selectionLayer,
        textSegments: Array.isArray(chunk.selectionLayer.textSegments)
          ? chunk.selectionLayer.textSegments.map((segment) => {
              const blockId = String(segment && segment.blockId || "").trim();
              const mergedSourceRef = mergedBlockSourceRefById.get(blockId) || null;
              if (!mergedSourceRef) return segment;
              return {
                ...segment,
                sourceRef: mergedSourceRef,
                sourceNodeId: String(mergedSourceRef.nodeId || "").trim()
              };
            })
          : chunk.selectionLayer.textSegments,
        blockAnchors: Array.isArray(chunk.selectionLayer.blockAnchors)
          ? chunk.selectionLayer.blockAnchors.map((anchor) => {
              const blockId = String(anchor && anchor.blockId || "").trim();
              const mergedSourceRef = mergedBlockSourceRefById.get(blockId) || null;
              if (!mergedSourceRef) return anchor;
              return {
                ...anchor,
                sourceRef: mergedSourceRef
              };
            })
          : chunk.selectionLayer.blockAnchors
      }
    : chunk.selectionLayer;
  const mergedSourceRefs = Array.from(new Map(
    mergedLogicalBlockList
      .map((block) => block && block.sourceRef ? block.sourceRef : null)
      .filter(Boolean)
      .map((sourceRef) => {
        const key = [
          String(sourceRef.href || "").trim(),
          String(sourceRef.nodeTag || "").trim(),
          Number.isInteger(sourceRef.nodeIndex) ? sourceRef.nodeIndex : -1,
          String(sourceRef.nodeId || "").trim()
        ].join("::");
        return [key, sourceRef];
      })
  ).values());
  return {
    ...chunk,
    sourceRefs: mergedSourceRefs,
    logicalBlockList: mergedLogicalBlockList,
    renderLayer: mergedRenderLayer,
    selectionLayer: mergedSelectionLayer
  };
}

function mergeV4BootstrapMetadataIntoRuntimeSafeBook(runtimeSafeBook, v4Bootstrap) {
  if (!runtimeSafeBook || !v4Bootstrap || !v4Bootstrap.manifest) return runtimeSafeBook;
  const manifest = v4Bootstrap.manifest || {};
  const typographyStyles = normalizeV4TypographyStyles(manifest.typographyStyles);
  const metadata = {
    ...(runtimeSafeBook.manifest && runtimeSafeBook.manifest.metadata ? runtimeSafeBook.manifest.metadata : {}),
    ...(manifest.metadata || {})
  };
  const source = {
    ...(runtimeSafeBook.manifest && runtimeSafeBook.manifest.source ? runtimeSafeBook.manifest.source : {}),
    ...(manifest.source || {})
  };
  const syntheticTocItems = buildV4BootstrapTocItems(manifest);
  const mergedTocItems = mergeTocItemsFromV4(runtimeSafeBook.tocItems || [], syntheticTocItems);
  runtimeSafeBook.manifest = {
    ...runtimeSafeBook.manifest,
    metadata,
    source,
    cover: manifest.cover || runtimeSafeBook.manifest.cover || null
  };
  runtimeSafeBook.tocItems = mergedTocItems;
  runtimeSafeBook.tocIndex = buildTocIndex(mergedTocItems);
  runtimeSafeBook.styleMap = applyV4TypographyToStyleMap(runtimeSafeBook.styleMap, typographyStyles);
  runtimeSafeBook.v4Bootstrap = v4Bootstrap;
  runtimeSafeBook.v4Compatibility = {
    enabled: true,
    requestedArtifactRoot: v4Bootstrap.requestedArtifactRoot,
    requestedManifestUrl: v4Bootstrap.manifestUrl,
    runtimeSafeArtifactRoot: runtimeSafeBook.rootUrl,
    bookId: v4Bootstrap.bookId,
    syntheticTocCount: syntheticTocItems.length,
    typographyOverridesApplied: !!typographyStyles
  };
  return runtimeSafeBook;
}

async function loadV4BootstrapCompatibleBook(artifactRoot) {
  const bootstrap = await loadV4BootstrapManifest(artifactRoot);
  const manifest = bootstrap && bootstrap.manifest ? bootstrap.manifest : null;
  const bookId = String(manifest && manifest.source && manifest.source.bookId || "").trim();
  const runtimeSafeRoot = resolveV4CompatibilityRuntimeSafeRoot(bookId);
  const runtimeSafeBook = await loadRuntimeSafeProtectedBook(runtimeSafeRoot);
  return mergeV4BootstrapMetadataIntoRuntimeSafeBook(runtimeSafeBook, {
    ...bootstrap,
    requestedArtifactRoot: artifactRoot,
    bookId
  });
}

export async function loadProtectedBook(artifactRoot) {
  const isExplicitV4Route = /\/protected-bootstrap-books(\/|$)/i.test(String(artifactRoot || ""));
  try {
    return await loadV4BootstrapCompatibleBook(artifactRoot);
  } catch (error) {
    if (isExplicitV4Route) throw error;
    const message = String(error && error.message ? error.message : error || "");
    if (
      !/Unsupported v4 manifest version/i.test(message) &&
      !/Unsupported v4 manifest mode/i.test(message) &&
      !/Unsupported v4 contract kind/i.test(message)
    ) {
      throw error;
    }
  }
  return loadRuntimeSafeProtectedBook(artifactRoot);
}

export async function loadProtectedChunkModel(book, chunkIndex, options = {}) {
  return loadRuntimeSafeProtectedChunkModel(book, chunkIndex, options);
}
