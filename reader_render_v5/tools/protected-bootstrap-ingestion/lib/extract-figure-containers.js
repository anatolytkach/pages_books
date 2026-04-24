import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSpineTextFiles } from "./get-spine-text-files.js";
import { extractInlineTextFromParagraphHtmlList } from "./extract-inline-semantics.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..", "..", "..");

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

function resolveInputRoot(inputRoot) {
  const normalizedInputRoot = String(inputRoot || "").trim();
  if (!normalizedInputRoot) return "";
  return fs.existsSync(path.resolve(normalizedInputRoot))
    ? path.resolve(normalizedInputRoot)
    : path.resolve(REPO_ROOT, normalizedInputRoot);
}

function resolveTextHref(filePath, inputRoot) {
  const relativePath = normalizePath(path.relative(inputRoot, filePath));
  return relativePath ? relativePath : "";
}

function toResolvedHref(textDirRelativePath, sourceHref) {
  return normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(textDirRelativePath), sourceHref)));
}

function parseAttributes(rawAttrs) {
  const attrs = {};
  const attrPattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  let match = attrPattern.exec(rawAttrs);
  while (match) {
    attrs[match[1]] = match[2];
    match = attrPattern.exec(rawAttrs);
  }
  return attrs;
}

function buildMediaLookup(logicalBlockList) {
  const lookup = new Map();
  const blocks = Array.isArray(logicalBlockList) ? logicalBlockList : [];
  for (const block of blocks) {
    const blockId = String(block && block.blockId || "").trim();
    const sourceHref = String(block && block.sourceHref || "").trim();
    const mediaItems = Array.isArray(block && block.mediaItems) ? block.mediaItems : [];
    for (const mediaItem of mediaItems) {
      const role = String(mediaItem && mediaItem.mediaRole || "").trim();
      const resolvedHref = String(mediaItem && mediaItem.resolvedHref || "").trim();
      const mediaId = String(mediaItem && mediaItem.mediaId || "").trim();
      if (!sourceHref || !resolvedHref || role !== "content-image" || !blockId || !mediaId) {
        continue;
      }
      lookup.set(`${sourceHref}::${resolvedHref}`, { blockId, mediaId });
    }
  }
  return lookup;
}

function extractFigureContainersFromFile({ inputRoot, textHref, textFilePath, mediaLookup }) {
  const xhtml = fs.readFileSync(textFilePath, "utf8");
  const figurePattern = /<table\b([^>]*)>\s*<tr>\s*<td>\s*<p\b([^>]*)class="[^"]*\bfigure-lead\b[^"]*"[^>]*>([\s\S]*?)<\/p>\s*<p\b([^>]*)class="[^"]*\bimage-block\b[^"]*"[^>]*>\s*<img\b([^>]*)\/?>\s*<\/p>\s*<\/td>\s*<\/tr>\s*<\/table>/gi;
  const additionalBlocks = [];
  const figureContainers = [];
  let match = figurePattern.exec(xhtml);
  let index = 0;
  while (match) {
    index += 1;
    const tableOpenAttrs = match[1];
    if (!/\bclass="[^"]*\bfigure-block\b[^"]*\bfigure-pair\b[^"]*"/.test(tableOpenAttrs)) {
      match = figurePattern.exec(xhtml);
      continue;
    }
    const tableAttrs = parseAttributes(tableOpenAttrs);
    const leadHtml = match[3];
    const imgAttrs = parseAttributes(match[5]);
    const sourceHref = String(imgAttrs.src || "").trim();
    const resolvedHref = sourceHref ? toResolvedHref(textHref, sourceHref) : "";
    const mediaRef = mediaLookup.get(`${textHref}::${resolvedHref}`);
    const inlineText = extractInlineTextFromParagraphHtmlList([leadHtml], {
      inputRoot,
      sourceHref: textHref
    });
    const leadText = inlineText.textContent;
    if (!mediaRef || !leadText) {
      match = figurePattern.exec(xhtml);
      continue;
    }

    const prefix = `${textHref.replace(/[^\w]+/g, "_")}-figure-${String(index).padStart(4, "0")}`;
    const leadBlockId = `${prefix}-lead`;
    const classes = String(tableAttrs.class || "");
    const leadBlock = {
      blockId: leadBlockId,
      sourceHref: textHref,
      blockRole: "figure-lead",
      textContent: leadText
    };
    if (inlineText.inlineSemantics) {
      leadBlock.inlineSemantics = inlineText.inlineSemantics;
    }
    additionalBlocks.push(leadBlock);
    figureContainers.push({
      containerId: `${prefix}-container`,
      containerType: "figure",
      sourceHref: textHref,
      breakBefore: /\bfigure-break-before\b/.test(classes),
      members: [
        {
          memberId: `${prefix}-member-lead`,
          memberRole: "lead-text",
          blockId: leadBlockId
        },
        {
          memberId: `${prefix}-member-image`,
          memberRole: "image",
          mediaBlockId: mediaRef.blockId,
          mediaId: mediaRef.mediaId
        }
      ]
    });
    match = figurePattern.exec(xhtml);
  }
  return { additionalBlocks, figureContainers };
}

export function extractFigureContainers(inputRoot, logicalBlockList) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) {
    return { logicalBlockList: Array.isArray(logicalBlockList) ? logicalBlockList : [], figureContainers: [] };
  }

  const blocks = Array.isArray(logicalBlockList) ? [...logicalBlockList] : [];
  const figureContainers = [];
  const mediaLookup = buildMediaLookup(blocks);
  const files = getSpineTextFiles(resolvedInputRoot, { includeCover: false });

  for (const file of files) {
    const textFilePath = file.textFilePath;
    const textHref = file.textHref;
    const extracted = extractFigureContainersFromFile({ inputRoot: resolvedInputRoot, textHref, textFilePath, mediaLookup });
    blocks.push(...extracted.additionalBlocks);
    figureContainers.push(...extracted.figureContainers);
  }

  return {
    logicalBlockList: blocks,
    figureContainers
  };
}
