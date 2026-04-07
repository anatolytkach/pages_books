#!/usr/bin/env node
"use strict";

function splitHrefTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return { path: "", fragment: "" };
  const hashIndex = raw.indexOf("#");
  if (hashIndex < 0) return { path: raw, fragment: "" };
  return {
    path: raw.slice(0, hashIndex),
    fragment: raw.slice(hashIndex + 1)
  };
}

function normalizePathTail(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const noLeading = noOrigin.replace(/^\/+/, "");
  const parts = noLeading.split("/").filter(Boolean);
  if (!parts.length) return "";
  const oebpsIndex = parts.lastIndexOf("OEBPS");
  if (oebpsIndex >= 0) return parts.slice(oebpsIndex).join("/");
  return parts.join("/");
}

function sourceRefMatchesToc(sourceRef, tocItem, inlineIds = []) {
  const { path, fragment } = splitHrefTarget(tocItem && tocItem.href);
  const tocHref = normalizePathTail(path || (tocItem && tocItem.spineHref));
  const sourceHref = normalizePathTail(sourceRef && sourceRef.href);
  if (!tocHref || !sourceHref) return false;
  const hrefMatches =
    sourceHref === tocHref ||
    sourceHref.endsWith(`/${tocHref}`) ||
    tocHref.endsWith(`/${sourceHref}`);
  if (!hrefMatches) return false;
  if (!fragment) return true;
  const nodeId = String(sourceRef && sourceRef.nodeId || "").trim();
  if (nodeId && nodeId === fragment) return true;
  return Array.isArray(inlineIds) && inlineIds.some((value) => String(value || "").trim() === fragment);
}

function buildTocAnchors(tocItems, chunk) {
  const anchors = [];
  const seen = new Set();
  const blockAnchors = Array.isArray(chunk && chunk.selectionLayer && chunk.selectionLayer.blockAnchors)
    ? chunk.selectionLayer.blockAnchors
    : [];

  for (const item of tocItems) {
    const blockMatch = chunk.logicalBlockList.find((block) =>
      sourceRefMatchesToc(block && block.sourceRef, item, block && block.inlineIds)
    ) || null;
    const anchorMatch = blockAnchors.find((anchor) =>
      sourceRefMatchesToc(anchor && anchor.sourceRef, item, anchor && anchor.inlineIds)
    ) || null;
    const match = blockMatch || (anchorMatch ? { blockId: anchorMatch.blockId } : null);
    if (!match) continue;
    const key = `${item.id}:${match.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({
      tocId: item.id,
      label: item.label,
      href: item.href,
      blockId: match.blockId,
      locationId: `${chunk.chunkId}:${match.blockId}`,
      sourceRef: (anchorMatch && anchorMatch.sourceRef) || (blockMatch && blockMatch.sourceRef) || null
    });
  }

  return anchors;
}

function buildLocations(chunks, tocItems) {
  return {
    version: 1,
    chunks: chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      order: index,
      locationId: `loc:${chunk.chunkId}`,
      startOffset: chunk.selectionLayer.chunkRange.start,
      endOffset: chunk.selectionLayer.chunkRange.end,
      textLength: chunk.selectionLayer.textLength,
      blockCount: chunk.logicalBlockList.length,
      sourceRefs: chunk.sourceRefs,
      blockBoundaries: chunk.selectionLayer.blockAnchors.map((anchor) => ({
        locationId: `${chunk.chunkId}:${anchor.blockId}`,
        blockId: anchor.blockId,
        startOffset: anchor.start,
        endOffset: anchor.end,
        sourceRef: anchor.sourceRef,
        inlineIds: anchor.inlineIds,
        linkTargets: anchor.linkTargets
      })),
      tocAnchors: buildTocAnchors(tocItems, chunk),
      restoreAnchor: {
        locationId: `loc:${chunk.chunkId}`,
        startOffset: chunk.selectionLayer.chunkRange.start,
        endOffset: chunk.selectionLayer.chunkRange.end
      },
      noteAnchors: chunk.selectionLayer.noteAnchors.map((anchor) => ({
        anchorId: anchor.anchorId,
        blockId: anchor.blockId,
        startOffset: anchor.start,
        endOffset: anchor.end,
        href: anchor.href
      }))
    }))
  };
}

function buildTocCoverage(chunks, tocItems) {
  const coverage = new Map();
  for (const chunk of chunks) {
    const tocAnchors = buildTocAnchors(tocItems, chunk);
    for (const anchor of tocAnchors) {
      if (anchor && anchor.tocId && !coverage.has(anchor.tocId)) {
        coverage.set(anchor.tocId, {
          chunkId: chunk.chunkId,
          blockId: anchor.blockId
        });
      }
    }
  }
  return coverage;
}

function normalizeStyleToken(style) {
  return {
    styleToken: style.styleToken,
    blockType: style.blockType,
    blockRole: style.blockRole,
    headingLevel: style.headingLevel,
    bold: style.bold,
    italic: style.italic,
    boldItalic: style.boldItalic,
    superscript: style.superscript,
    linkLike: style.linkLike,
    scriptBucket: style.scriptBucket,
    fontFamilyCandidate: style.fontFamilyCandidate,
    fontRole: style.fontRole,
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    policyStatus: style.policyStatus,
    policyGaps: style.policyGaps
  };
}

function buildStyles(styles, fontPlan) {
  return {
    version: 1,
    styleTokens: styles.stylesList.map(normalizeStyleToken),
    fontPlanReference: fontPlan ? {
      scriptsDetected: fontPlan.scriptsDetected || [],
      styleNeeds: fontPlan.styleNeeds || {},
      gaps: (fontPlan.gaps && fontPlan.gaps.styleGaps) || []
    } : null
  };
}

function buildProtectedManifest({ book, toc, runtimeChunks, runtimeGlyphChunks, runtimeShapeChunks, debugChunks, debugGlyphChunks, styles, fontPlan, debugArtifactEnabled }) {
  const tocCoverage = buildTocCoverage(runtimeChunks, toc);
  const missingToc = toc.filter((item) => item && item.href && !tocCoverage.has(item.id));
  if (missingToc.length) {
    const sample = missingToc.slice(0, 5).map((item) => `${item.id}:${item.label}`).join(", ");
    throw new Error(`Protected build could not map ${missingToc.length} TOC items to chunk anchors (${sample})`);
  }
  const manifest = {
    version: 3,
    mode: "protected-runtime-safe",
    metadata: {
      title: book.metadata.title,
      creators: book.metadata.creators,
      languages: book.metadata.languages
    },
    source: {
      inputType: book.inputType,
      bookId: book.bookId
    },
    chunking: {
      mode: "logical-deterministic",
      viewportIndependent: true
    },
    runtimeContract: {
      glyphMode: "opaque-chunk-local",
      renderPayload: "opaque-glyph-ops",
      reconstructionMode: "sealed-window-scoped",
      reconstructionSurface: "embedded-substrate",
      unicodeLeakage: "forbidden-in-runtime-safe-render-path"
    },
    debugArtifactAvailable: !!debugArtifactEnabled,
    chunks: runtimeChunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      order: index,
      chunkPath: `chunks/${chunk.chunkId}.json`,
      glyphsPath: `glyphs/${chunk.chunkId}.glyphs.json`,
      shapesPath: `shapes/${chunk.chunkId}.shapes.json`,
      startOffset: chunk.selectionLayer.chunkRange.start,
      endOffset: chunk.selectionLayer.chunkRange.end,
      textLength: chunk.selectionLayer.textLength
    })),
    tocPath: "toc.json",
    locationsPath: "locations.json",
    stylesPath: "styles.json"
  };

  return {
    manifest,
    toc: {
      version: 1,
      items: toc
    },
    locations: buildLocations(runtimeChunks, toc),
    styles: buildStyles(styles, fontPlan),
    runtimeChunks,
    runtimeGlyphChunks,
    runtimeShapeChunks,
    debugChunks,
    debugGlyphChunks,
    debugArtifactEnabled: !!debugArtifactEnabled
  };
}

module.exports = { buildProtectedManifest };
