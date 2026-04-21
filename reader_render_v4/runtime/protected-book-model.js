import { loadProtectedManifest } from "./load-protected-manifest.js";
import { resolveFootnotePreviews } from "./resolve-footnote-previews.js";
import { buildSemanticReadingFlow } from "./semantic-reading-flow.js";

function resolveManifestCoverUrl(manifest) {
  const cover = manifest && manifest.cover && typeof manifest.cover === "object" ? manifest.cover : null;
  if (!cover) return "";
  const publicRootPath = String(manifest && manifest.source && manifest.source.publicRootPath || "").trim().replace(/\/$/, "");
  const resolvedHref = String(cover.resolvedHref || "").trim().replace(/^\/+/, "");
  if (!publicRootPath || !resolvedHref) return "";
  return `${publicRootPath}/${resolvedHref}`;
}

function resolveArtifactMediaUrl(manifest, resolvedHref) {
  const publicRootPath = String(manifest && manifest.source && manifest.source.publicRootPath || "").trim().replace(/\/$/, "");
  const normalizedHref = String(resolvedHref || "").trim().replace(/^\/+/, "");
  if (!publicRootPath || !normalizedHref) return "";
  return `${publicRootPath}/${normalizedHref}`;
}

function normalizeBlockPresentation(presentation) {
  if (!presentation || typeof presentation !== "object") return null;
  const normalized = {};
  if (typeof presentation.textIndentEm === "number" && Number.isFinite(presentation.textIndentEm)) {
    normalized.textIndentEm = presentation.textIndentEm;
  }
  if (typeof presentation.marginTopEm === "number" && Number.isFinite(presentation.marginTopEm)) {
    normalized.marginTopEm = presentation.marginTopEm;
  }
  if (typeof presentation.marginBottomEm === "number" && Number.isFinite(presentation.marginBottomEm)) {
    normalized.marginBottomEm = presentation.marginBottomEm;
  }
  if (typeof presentation.lineHeight === "number" && Number.isFinite(presentation.lineHeight)) {
    normalized.lineHeight = presentation.lineHeight;
  }
  const textAlign = String(presentation.textAlign || "").trim();
  if (textAlign) {
    normalized.textAlign = textAlign;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeBlockquotePresentation(presentation) {
  if (!presentation || typeof presentation !== "object") return null;
  const normalized = {};
  const variant = String(presentation.variant || "").trim();
  if (variant) {
    normalized.variant = variant;
  }
  if (typeof presentation.suppressTextIndent === "boolean") {
    normalized.suppressTextIndent = presentation.suppressTextIndent;
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeInlineSemantics(inlineSemantics) {
  if (!inlineSemantics || typeof inlineSemantics !== "object") return null;
  const paragraphs = Array.isArray(inlineSemantics.paragraphs) ? inlineSemantics.paragraphs : [];
  const normalizedParagraphs = paragraphs
    .map((paragraph) => {
      const runs = Array.isArray(paragraph && paragraph.runs) ? paragraph.runs : [];
      const normalizedRuns = runs
        .map((run) => {
          const text = String(run && run.text || "");
          if (!text) return null;
          const marks = Array.isArray(run && run.marks)
            ? run.marks.map((mark) => String(mark || "").trim()).filter(Boolean)
            : [];
          const normalizedRun = marks.length ? { text, marks } : { text };
          const anchor = run && run.anchor && typeof run.anchor === "object" ? run.anchor : null;
          if (anchor) {
            const normalizedAnchor = {};
            const anchorRole = String(anchor.anchorRole || "").trim();
            if (anchorRole) {
              normalizedAnchor.anchorRole = anchorRole;
            }
            const href = String(anchor.href || "").trim();
            if (href) {
              normalizedAnchor.href = href;
            }
            const sourceAnchorId = String(anchor.sourceAnchorId || "").trim();
            if (sourceAnchorId) {
              normalizedAnchor.sourceAnchorId = sourceAnchorId;
            }
            const targetSourceHref = String(anchor.targetSourceHref || "").trim();
            if (targetSourceHref) {
              normalizedAnchor.targetSourceHref = targetSourceHref;
            }
            const targetAnchorId = String(anchor.targetAnchorId || "").trim();
            if (targetAnchorId) {
              normalizedAnchor.targetAnchorId = targetAnchorId;
            }
            const targetRole = String(anchor.targetRole || "").trim();
            if (targetRole) {
              normalizedAnchor.targetRole = targetRole;
            }
            if (Object.keys(normalizedAnchor).length) {
              normalizedRun.anchor = normalizedAnchor;
            }
          }
          return normalizedRun;
        })
        .filter(Boolean);
      if (!normalizedRuns.length) return null;
      return { runs: normalizedRuns };
    })
    .filter(Boolean);
  return normalizedParagraphs.length ? { paragraphs: normalizedParagraphs } : null;
}

function normalizeMediaBlocks(manifest) {
  const logicalBlockList = Array.isArray(manifest && manifest.logicalBlockList) ? manifest.logicalBlockList : [];
  return logicalBlockList
    .filter((block) => block && typeof block === "object" && Array.isArray(block.mediaItems) && block.mediaItems.length)
    .map((block) => ({
      blockId: String(block.blockId || "").trim(),
      sourceHref: String(block.sourceHref || "").trim(),
      mediaItems: block.mediaItems
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          mediaId: String(item.mediaId || "").trim(),
          mediaRole: String(item.mediaRole || "").trim(),
          sourceHref: String(item.sourceHref || "").trim(),
          resolvedHref: String(item.resolvedHref || "").trim(),
          assetUrl: resolveArtifactMediaUrl(manifest, item.resolvedHref),
          intrinsicWidthPx: typeof item.intrinsicWidthPx === "number" ? item.intrinsicWidthPx : null,
          intrinsicHeightPx: typeof item.intrinsicHeightPx === "number" ? item.intrinsicHeightPx : null,
          preferredRenderWidthPx: typeof item.preferredRenderWidthPx === "number" ? item.preferredRenderWidthPx : null,
          preferredRenderHeightPx: typeof item.preferredRenderHeightPx === "number" ? item.preferredRenderHeightPx : null,
          placement: String(item.placement || "").trim()
        }))
    }))
    .filter((block) => block.mediaItems.length);
}

function buildInFlowExcerpt(blocks) {
  const excerpt = [];
  const avatarPerSource = new Map();
  const nonAvatarPerSource = new Map();
  const rolesSeen = new Set();

  for (const block of blocks) {
    const media = Array.isArray(block.mediaItems) ? block.mediaItems[0] : null;
    if (!media) continue;
    const role = media.mediaRole;
    if (role !== "inline-avatar" && role !== "content-image" && role !== "separator-image") {
      continue;
    }
    const sourceHref = block.sourceHref || "";
    let include = false;
    if (role === "inline-avatar") {
      const seen = avatarPerSource.get(sourceHref) || 0;
      if (seen < 4) {
        avatarPerSource.set(sourceHref, seen + 1);
        include = true;
      }
    } else {
      const seen = nonAvatarPerSource.get(sourceHref) || 0;
      if (seen < 3) {
        nonAvatarPerSource.set(sourceHref, seen + 1);
        include = true;
      }
    }
    if (!include) continue;
    excerpt.push(block);
    rolesSeen.add(role);
    if (excerpt.length >= 18 && rolesSeen.has("inline-avatar") && rolesSeen.has("content-image") && rolesSeen.has("separator-image")) {
      break;
    }
  }

  return {
    mode: "prototype-media-flow",
    totalBlocks: excerpt.length,
    includesRoles: Array.from(rolesSeen),
    blocks: excerpt
  };
}

function summarizeNonCoverMedia(manifest) {
  const blocks = normalizeMediaBlocks(manifest);

  const avatarBlocks = blocks.filter((block) => block.mediaItems.some((item) => item.mediaRole === "inline-avatar"));
  const contentImageBlocks = blocks.filter((block) => block.mediaItems.some((item) => item.mediaRole === "content-image"));
  const separatorImageBlocks = blocks.filter((block) => block.mediaItems.some((item) => item.mediaRole === "separator-image"));

  return {
    mediaBlocks: blocks.length,
    inlineAvatarBlocks: avatarBlocks.length,
    contentImageBlocks: contentImageBlocks.length,
    separatorImageBlocks: separatorImageBlocks.length,
    avatarSamples: avatarBlocks.slice(0, 3),
    contentImageSamples: contentImageBlocks.slice(0, 3),
    separatorImageSamples: separatorImageBlocks.slice(0, 3),
    inFlowExcerpt: buildInFlowExcerpt(blocks)
  };
}

function normalizeLogicalBlocks(manifest) {
  const logicalBlockList = Array.isArray(manifest && manifest.logicalBlockList) ? manifest.logicalBlockList : [];
  return logicalBlockList
    .filter((block) => block && typeof block === "object" && typeof block.blockId === "string" && block.blockId.trim())
    .map((block) => ({
      blockId: String(block.blockId || "").trim(),
      blockRole: String(block.blockRole || "").trim(),
      sourceHref: String(block.sourceHref || "").trim(),
      textContent: String(block.textContent || "").trim(),
      blockPresentation: normalizeBlockPresentation(block.blockPresentation),
      blockquotePresentation: normalizeBlockquotePresentation(block.blockquotePresentation),
      inlineSemantics: normalizeInlineSemantics(block.inlineSemantics),
      headingLevel: Number.isInteger(block.headingLevel) ? block.headingLevel : null,
      mediaItems: Array.isArray(block.mediaItems)
        ? block.mediaItems
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            mediaId: String(item.mediaId || "").trim(),
            mediaRole: String(item.mediaRole || "").trim(),
            sourceHref: String(item.sourceHref || "").trim(),
            resolvedHref: String(item.resolvedHref || "").trim(),
            assetUrl: resolveArtifactMediaUrl(manifest, item.resolvedHref),
            intrinsicWidthPx: typeof item.intrinsicWidthPx === "number" ? item.intrinsicWidthPx : null,
            intrinsicHeightPx: typeof item.intrinsicHeightPx === "number" ? item.intrinsicHeightPx : null,
            preferredRenderWidthPx: typeof item.preferredRenderWidthPx === "number" ? item.preferredRenderWidthPx : null,
            preferredRenderHeightPx: typeof item.preferredRenderHeightPx === "number" ? item.preferredRenderHeightPx : null,
            placement: String(item.placement || "").trim()
          }))
        : []
    }));
}

function summarizeFigureContainers(manifest) {
  const figureContainers = Array.isArray(manifest && manifest.figureContainers) ? manifest.figureContainers : [];
  const textBlocks = new Map(normalizeLogicalBlocks(manifest).map((block) => [block.blockId, block]));
  const mediaBlocks = new Map(normalizeMediaBlocks(manifest).map((block) => [block.blockId, block]));

  const normalized = figureContainers
    .filter((container) => container && typeof container === "object" && container.containerType === "figure")
    .map((container) => {
      const members = Array.isArray(container.members) ? container.members : [];
      const leadMember = members.find((member) => member && member.memberRole === "lead-text") || null;
      const imageMember = members.find((member) => member && member.memberRole === "image") || null;
      const leadBlock = leadMember ? textBlocks.get(String(leadMember.blockId || "").trim()) || null : null;
      const imageBlock = imageMember ? mediaBlocks.get(String(imageMember.mediaBlockId || "").trim()) || null : null;
      const imageMedia = imageBlock && Array.isArray(imageBlock.mediaItems)
        ? imageBlock.mediaItems.find((item) => String(item && item.mediaId || "").trim() === String(imageMember && imageMember.mediaId || "").trim()) || imageBlock.mediaItems[0] || null
        : null;
      return {
        containerId: String(container.containerId || "").trim(),
        sourceHref: String(container.sourceHref || "").trim(),
        containerType: "figure",
        breakBefore: !!container.breakBefore,
        lead: leadBlock ? {
          blockId: leadBlock.blockId,
          blockRole: leadBlock.blockRole,
          sourceHref: leadBlock.sourceHref,
          textContent: leadBlock.textContent,
          blockPresentation: leadBlock.blockPresentation,
          inlineSemantics: leadBlock.inlineSemantics
        } : null,
        image: imageBlock && imageMedia ? {
          mediaBlockId: imageBlock.blockId,
          mediaId: String(imageMedia.mediaId || "").trim(),
          mediaRole: String(imageMedia.mediaRole || "").trim(),
          resolvedHref: String(imageMedia.resolvedHref || "").trim(),
          assetUrl: String(imageMedia.assetUrl || "").trim(),
          intrinsicWidthPx: typeof imageMedia.intrinsicWidthPx === "number" ? imageMedia.intrinsicWidthPx : null,
          intrinsicHeightPx: typeof imageMedia.intrinsicHeightPx === "number" ? imageMedia.intrinsicHeightPx : null,
          preferredRenderWidthPx: typeof imageMedia.preferredRenderWidthPx === "number" ? imageMedia.preferredRenderWidthPx : null,
          preferredRenderHeightPx: typeof imageMedia.preferredRenderHeightPx === "number" ? imageMedia.preferredRenderHeightPx : null,
          placement: String(imageMedia.placement || "").trim()
        } : null
      };
    });

  return {
    totalContainers: normalized.length,
    breakBeforeCount: normalized.filter((container) => container.breakBefore).length,
    resolvedLeadCount: normalized.filter((container) => container.lead && container.lead.textContent).length,
    resolvedImageCount: normalized.filter((container) => container.image && container.image.assetUrl).length,
    samples: normalized.slice(0, 3),
    containers: normalized
  };
}

function summarizeListContainers(manifest) {
  const listContainers = Array.isArray(manifest && manifest.listContainers) ? manifest.listContainers : [];
  const textBlocks = new Map(normalizeLogicalBlocks(manifest).map((block) => [block.blockId, block]));

  const normalized = listContainers
    .filter((container) => container && typeof container === "object" && container.listType === "ordered")
    .map((container) => {
      const start = typeof container.start === "number" && Number.isFinite(container.start) ? container.start : 1;
      const itemBlockIds = Array.isArray(container.itemBlockIds) ? container.itemBlockIds : [];
      const items = itemBlockIds
        .map((itemBlockId, index) => {
          const block = textBlocks.get(String(itemBlockId || "").trim()) || null;
          if (!block) return null;
          return {
            blockId: block.blockId,
            blockRole: block.blockRole,
            sourceHref: block.sourceHref,
            textContent: block.textContent,
            blockPresentation: block.blockPresentation,
            blockquotePresentation: block.blockquotePresentation,
            inlineSemantics: block.inlineSemantics,
            listNumber: start + index
          };
        })
        .filter(Boolean);
      return {
        containerId: String(container.containerId || "").trim(),
        sourceHref: String(container.sourceHref || "").trim(),
        listType: "ordered",
        markerStyle: String(container.markerStyle || "").trim(),
        start,
        itemBlockIds: itemBlockIds.map((itemBlockId) => String(itemBlockId || "").trim()).filter(Boolean),
        items
      };
    });

  return {
    totalContainers: normalized.length,
    totalItems: normalized.reduce((sum, container) => sum + container.items.length, 0),
    samples: normalized.slice(0, 3),
    containers: normalized
  };
}

function summarizeLogicalBlocks(manifest) {
  const logicalBlocks = normalizeLogicalBlocks(manifest);
  return {
    totalLogicalBlocks: logicalBlocks.length,
    mediaBlocks: logicalBlocks.filter((block) => Array.isArray(block.mediaItems) && block.mediaItems.length).length,
    headingBlocks: logicalBlocks.filter((block) => Number.isInteger(block.headingLevel)).length,
    paragraphBlocks: logicalBlocks.filter((block) => (
      !block.blockRole &&
      !Number.isInteger(block.headingLevel) &&
      !!block.textContent &&
      !(Array.isArray(block.mediaItems) && block.mediaItems.length)
    )).length,
    figureLeadBlocks: logicalBlocks.filter((block) => block.blockRole === "figure-lead").length,
    listItemBlocks: logicalBlocks.filter((block) => block.blockRole === "list-item").length,
    blockquoteBlocks: logicalBlocks.filter((block) => block.blockRole === "blockquote").length,
    blocksWithPresentation: logicalBlocks.filter((block) => !!block.blockPresentation).length
  };
}

function buildStructuredReadingFlow(manifest, listSummary, figureSummary) {
  const logicalBlocks = normalizeLogicalBlocks(manifest);
  const blockOrder = new Map(logicalBlocks.map((block, index) => [block.blockId, index]));
  const renderedListIds = new Set();
  const renderedFigureIds = new Set();

  const listByItemBlockId = new Map();
  for (const container of Array.isArray(listSummary && listSummary.containers) ? listSummary.containers : []) {
    for (const itemBlockId of Array.isArray(container.itemBlockIds) ? container.itemBlockIds : []) {
      listByItemBlockId.set(itemBlockId, container);
    }
  }

  const figureStartBlockIdByContainerId = new Map();
  const figureByMemberBlockId = new Map();
  for (const container of Array.isArray(figureSummary && figureSummary.containers) ? figureSummary.containers : []) {
    const candidateIds = [];
    if (container && container.lead && container.lead.blockId) {
      candidateIds.push(container.lead.blockId);
      figureByMemberBlockId.set(container.lead.blockId, container);
    }
    if (container && container.image && container.image.mediaBlockId) {
      candidateIds.push(container.image.mediaBlockId);
      figureByMemberBlockId.set(container.image.mediaBlockId, container);
    }
    const startBlockId = candidateIds
      .filter((blockId) => blockOrder.has(blockId))
      .sort((left, right) => (blockOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (blockOrder.get(right) ?? Number.MAX_SAFE_INTEGER))[0] || "";
    figureStartBlockIdByContainerId.set(container.containerId, startBlockId);
  }

  const entries = [];
  for (const block of logicalBlocks) {
    if (listByItemBlockId.has(block.blockId)) {
      const container = listByItemBlockId.get(block.blockId);
      if (!container || renderedListIds.has(container.containerId)) {
        continue;
      }
      if (String(container.itemBlockIds && container.itemBlockIds[0] || "") !== block.blockId) {
        continue;
      }
      renderedListIds.add(container.containerId);
      entries.push({
        entryType: "ordered-list",
        container
      });
      continue;
    }

    if (figureByMemberBlockId.has(block.blockId)) {
      const container = figureByMemberBlockId.get(block.blockId);
      if (!container || renderedFigureIds.has(container.containerId)) {
        continue;
      }
      if (figureStartBlockIdByContainerId.get(container.containerId) !== block.blockId) {
        continue;
      }
      renderedFigureIds.add(container.containerId);
      entries.push({
        entryType: "figure",
        container
      });
      continue;
    }

    if (Array.isArray(block.mediaItems) && block.mediaItems.length) {
      const media = block.mediaItems[0];
      if (media && (media.mediaRole === "inline-avatar" || media.mediaRole === "content-image" || media.mediaRole === "separator-image")) {
        entries.push({
          entryType: "media",
          block
        });
      }
      continue;
    }

    if (!block.textContent) {
      continue;
    }

    if (block.blockRole === "blockquote") {
      entries.push({
        entryType: "blockquote",
        block
      });
      continue;
    }

    entries.push({
      entryType: "text",
      block
    });
  }

  return {
    mode: "structured-reading-flow-v1",
    totalEntries: entries.length,
    entryCounts: entries.reduce((counts, entry) => {
      counts[entry.entryType] = (counts[entry.entryType] || 0) + 1;
      return counts;
    }, {}),
    entries
  };
}

export async function loadProtectedBook(artifactRoot) {
  const { rootUrl, manifestUrl, manifest } = await loadProtectedManifest(artifactRoot);
  const logicalBlocks = normalizeLogicalBlocks(manifest);
  const nonCoverMedia = summarizeNonCoverMedia(manifest);
  const figureContainers = summarizeFigureContainers(manifest);
  const listContainers = summarizeListContainers(manifest);
  const logicalBlockSummary = summarizeLogicalBlocks(manifest);
  const footnotePreviews = await resolveFootnotePreviews(manifest, logicalBlocks);
  const structuredFlow = buildStructuredReadingFlow(manifest, listContainers, figureContainers);
  const semanticReadingFlow = buildSemanticReadingFlow(structuredFlow);
  return {
    rootUrl,
    manifestUrl,
    manifest,
    title: String(manifest.metadata && manifest.metadata.title || "").trim(),
    bookId: String(manifest.source && manifest.source.bookId || "").trim(),
    contractKind: String(manifest.artifactContract && manifest.artifactContract.kind || "").trim(),
    coverUrl: resolveManifestCoverUrl(manifest),
    logicalBlockSummary,
    nonCoverMedia,
    figureContainers,
    listContainers,
    footnotePreviews,
    structuredFlow,
    semanticReadingFlow
  };
}
