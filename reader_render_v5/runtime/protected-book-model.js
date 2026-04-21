import { buildTocIndex, getChunkTocLabel } from "./protected-navigation-model.js";
import { buildWordBoundaryModel } from "./protected-word-boundary.js";
import { buildGlobalLocationModel } from "./protected-global-location.js";
import { loadProtectedManifest as loadV4BootstrapManifest } from "./v5-load-protected-manifest.js";

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

async function loadRuntimeSafeProtectedBook(artifactRoot) {
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
    nextBlockPresentation.marginTopEm = 0;
    nextBlockPresentation.marginBottomEm = 0;
  }
  if (candidate.figureSequenceId) {
    nextBlockPresentation.pageBreakBefore = !!candidate.figureBreakBefore;
    if (candidate.figureMemberRole === "lead-text") {
      nextBlockPresentation.marginBottomEm = Math.max(Number(nextBlockPresentation.marginBottomEm || 0), 0.5);
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
    mediaRole: String(item.mediaRole || "").trim()
  };
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
    if (String(block.blockRole || "").trim() === "figure-lead") {
      const nextBlock = logicalBlocks[index + 1];
      const nextSourceHref = normalizeRuntimeSafeSourceHref(nextBlock && nextBlock.sourceHref);
      const nextMedia = Array.isArray(nextBlock && nextBlock.mediaItems)
        ? nextBlock.mediaItems.map(normalizeV4MediaItemForRuntime).filter(Boolean)
        : [];
      if (
        nextBlock &&
        nextSourceHref === sourceHref &&
        !nextBlock.textContent &&
        !Number.isInteger(nextBlock.headingLevel) &&
        nextMedia.length &&
        !nextMedia.every((item) => item.inlineAvatar)
      ) {
      attachedMedia.push(...nextMedia);
        index += 1;
      }
    }
    const rawBlockId = String(block.blockId || "").trim();
    const figureLeadMeta = figureLeadMap.get(rawBlockId) || null;
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
      figureSequenceId: figureLeadMeta ? figureLeadMeta.figureSequenceId : "",
      figureMemberRole: figureLeadMeta ? figureLeadMeta.figureMemberRole : "",
      figureBreakBefore: !!(figureLeadMeta && figureLeadMeta.figureBreakBefore),
      listContainerId: listItemMeta ? listItemMeta.listContainerId : "",
      listType: listItemMeta ? listItemMeta.listType : "",
      listIndex: listItemMeta ? listItemMeta.listIndex : -1
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
  if (oldHeadingMatch) {
    const expectedLevel = Number(oldHeadingMatch[1]);
    if (Number(candidate.headingLevel) !== expectedLevel) return 0;
    if (oldHasMedia && !candidate.mediaItems.length) return 0;
    return candidate.openingClusterId ? 7 : (candidate.sequenceRole === "comment-heading" ? 5 : 4);
  }
  if (oldType === "figure") {
    return !!candidate.mediaItems.length && !candidate.textContent ? 4 : 0;
  }
  if (oldType === "list-item") {
    if (candidate.blockRole === "list-item") return 5;
    return 0;
  }
  if (oldType === "paragraph") {
    if (oldHasMedia) {
      if (!candidate.mediaItems.length) return 0;
      if (oldTag === "td" && candidate.blockRole === "figure-lead") return 6;
      if (candidate.sequenceRole === "comment-heading") return 5;
      return (!!candidate.textContent || !!candidate.blockRole) ? 3 : 0;
    }
    if (candidate.blockRole === "blockquote") return 5;
    if (
      previousOldBlock &&
      String(previousOldBlock.blockType || "").trim().toLowerCase() === "heading-5" &&
      Array.isArray(previousOldBlock.mediaItems) &&
      previousOldBlock.mediaItems.some((item) => item && item.inlineAvatar) &&
      candidate.sequenceRole === "comment-body"
    ) {
      return 6;
    }
    return !candidate.headingLevel && !candidate.mediaItems.length && !candidate.blockRole ? 3 : 0;
  }
  return 0;
}

function mergeV4CompatibilityIntoRuntimeSafeChunk(chunk, book) {
  if (!chunk || !book || !book.v4Bootstrap || !book.v4Bootstrap.manifest) return chunk;
  const queues = buildV4CompatibleBlockQueues(book.v4Bootstrap.manifest);
  let previousOldBlock = null;
  const mergedLogicalBlockList = (Array.isArray(chunk.logicalBlockList) ? chunk.logicalBlockList : []).map((block) => {
    const sourceHref = normalizeRuntimeSafeSourceHref(block && block.sourceRef && block.sourceRef.href);
    const queue = sourceHref ? (queues.get(sourceHref) || []) : [];
    const oldType = String(block && block.blockType || "").trim().toLowerCase();
    const maxSearch =
      oldType === "list-item"
        ? queue.length
        : oldType === "heading-5"
          ? Math.min(queue.length, 48)
        : oldType === "paragraph"
          ? Math.min(queue.length, 16)
          : Math.min(queue.length, 8);
    let candidateIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < maxSearch; index += 1) {
      const score = getCompatibleRuntimeSafeBlockScore(block, queue[index], { previousOldBlock });
      if (score > bestScore) {
        bestScore = score;
        candidateIndex = index;
      }
    }
    if (candidateIndex < 0) {
      previousOldBlock = block;
      return block;
    }
    const candidate = queue.splice(candidateIndex, 1)[0];
    const nextBlock = {
      ...block,
      blockPresentation: candidate.blockPresentation || block.blockPresentation || {},
      mediaItems: candidate.mediaItems && candidate.mediaItems.length ? candidate.mediaItems : (block.mediaItems || []),
      blockRole: candidate.blockRole || block.blockRole || "",
      headingLevel: Number.isInteger(candidate.headingLevel)
        ? candidate.headingLevel
        : (Number.isInteger(block.headingLevel) ? block.headingLevel : null),
      v4Compatibility: {
        sourceHref: candidate.sourceHref,
        rawBlockId: candidate.rawBlockId,
        sequenceRole: candidate.sequenceRole || "",
        commentThreadId: candidate.commentThreadId || "",
        openingClusterId: candidate.openingClusterId || "",
        openingClusterIndex: Number.isInteger(candidate.openingClusterIndex) ? candidate.openingClusterIndex : -1
      }
    };
    previousOldBlock = nextBlock;
    return nextBlock;
  });
  return {
    ...chunk,
    logicalBlockList: mergedLogicalBlockList
  };
}

function mergeV4BootstrapMetadataIntoRuntimeSafeBook(runtimeSafeBook, v4Bootstrap) {
  if (!runtimeSafeBook || !v4Bootstrap || !v4Bootstrap.manifest) return runtimeSafeBook;
  const manifest = v4Bootstrap.manifest || {};
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
  runtimeSafeBook.v4Bootstrap = v4Bootstrap;
  runtimeSafeBook.v4Compatibility = {
    enabled: true,
    requestedArtifactRoot: v4Bootstrap.requestedArtifactRoot,
    requestedManifestUrl: v4Bootstrap.manifestUrl,
    runtimeSafeArtifactRoot: runtimeSafeBook.rootUrl,
    bookId: v4Bootstrap.bookId,
    syntheticTocCount: syntheticTocItems.length
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
  try {
    return await loadV4BootstrapCompatibleBook(artifactRoot);
  } catch (error) {
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
