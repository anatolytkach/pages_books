#!/usr/bin/env node
"use strict";

function buildTocAnchors(tocItems, chunk) {
  const anchors = [];
  const seen = new Set();

  for (const item of tocItems) {
    const match = chunk.logicalBlockList.find((block) => {
      const hrefMatch = item.spineHref && block.sourceRef && block.sourceRef.href === item.spineHref;
      const fragmentMatch = item.fragment && block.sourceRef && block.sourceRef.nodeId === item.fragment;
      if (item.fragment) return hrefMatch && fragmentMatch;
      return hrefMatch;
    });
    if (!match) continue;
    const key = `${item.id}:${match.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push({
      tocId: item.id,
      label: item.label,
      href: item.href,
      blockId: match.blockId,
      locationId: `${chunk.chunkId}:${match.blockId}`
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
  const manifest = {
    version: 2,
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
