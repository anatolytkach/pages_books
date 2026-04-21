import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSpineTextFiles } from "./get-spine-text-files.js";
import {
  extractInlineTextFromParagraphHtmlList,
  stripHtmlToText
} from "./extract-inline-semantics.js";

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

function parseAttributes(tagOpen) {
  const attrs = {};
  const attrPattern = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  let match = attrPattern.exec(String(tagOpen || ""));
  while (match) {
    attrs[match[1]] = match[2];
    match = attrPattern.exec(String(tagOpen || ""));
  }
  return attrs;
}

function sanitizePrefix(textHref) {
  return String(textHref || "").replace(/[^\w]+/g, "_");
}

function queueKey(sourceHref, type) {
  return `${sourceHref}::${type}`;
}

function classifyExistingBlock(block) {
  if (!block || typeof block !== "object") return "";
  const role = String(block.blockRole || "").trim();
  const mediaItems = Array.isArray(block.mediaItems) ? block.mediaItems : [];
  const mediaRole = mediaItems.length ? String(mediaItems[0] && mediaItems[0].mediaRole || "").trim() : "";
  if (mediaRole === "inline-avatar") return "inline-avatar";
  if (mediaRole === "content-image") return "content-image";
  if (mediaRole === "separator-image") return "separator-image";
  if (role === "figure-lead") return "figure-lead";
  if (role === "list-item") return "list-item";
  if (role === "blockquote") return "blockquote";
  return "";
}

function buildBlockQueues(blocks) {
  const queues = new Map();
  const allBlocks = Array.isArray(blocks) ? blocks : [];
  for (const block of allBlocks) {
    const type = classifyExistingBlock(block);
    const sourceHref = String(block && block.sourceHref || "").trim();
    if (!type || !sourceHref) continue;
    const key = queueKey(sourceHref, type);
    if (!queues.has(key)) {
      queues.set(key, []);
    }
    queues.get(key).push(block);
  }
  return queues;
}

function consumeQueuedBlock(queues, sourceHref, type, consumedBlockIds) {
  const key = queueKey(sourceHref, type);
  const queue = queues.get(key) || [];
  while (queue.length) {
    const block = queue.shift();
    const blockId = String(block && block.blockId || "").trim();
    if (!blockId || consumedBlockIds.has(blockId)) {
      continue;
    }
    consumedBlockIds.add(blockId);
    return block;
  }
  return null;
}

function buildOrderedBlocksFromFile({ inputRoot, textHref, textFilePath, queues, consumedBlockIds }) {
  const xhtml = fs.readFileSync(textFilePath, "utf8");
  const blocks = [];
  const prefix = sanitizePrefix(textHref);
  const tokenPattern = /<blockquote\b[^>]*>[\s\S]*?<\/blockquote>|<ol\b[^>]*>[\s\S]*?<\/ol>|<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>|<p\b([^>]*)>([\s\S]*?)<\/p>/gi;

  let headingIndex = 0;
  let paragraphIndex = 0;
  let match = tokenPattern.exec(xhtml);

  while (match) {
    const raw = match[0];
    if (/^<blockquote\b/i.test(raw)) {
      const block = consumeQueuedBlock(queues, textHref, "blockquote", consumedBlockIds);
      if (block) {
        blocks.push(block);
      }
      match = tokenPattern.exec(xhtml);
      continue;
    }

    if (/^<ol\b/i.test(raw)) {
      const itemPattern = /<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi;
      let itemMatch = itemPattern.exec(raw);
      while (itemMatch) {
        const block = consumeQueuedBlock(queues, textHref, "list-item", consumedBlockIds);
        if (block) {
          blocks.push(block);
        }
        itemMatch = itemPattern.exec(raw);
      }
      match = tokenPattern.exec(xhtml);
      continue;
    }

    if (/^<h[1-6]\b/i.test(raw)) {
      const level = Number.parseInt(match[1], 10);
      const attrs = parseAttributes(match[2]);
      const innerHtml = match[3];
      if (/\binline-avatar\b/.test(innerHtml || "")) {
        const avatarBlock = consumeQueuedBlock(queues, textHref, "inline-avatar", consumedBlockIds);
        if (avatarBlock) {
          blocks.push(avatarBlock);
        }
      } else if (/<img\b/i.test(innerHtml || "") && !stripHtmlToText(innerHtml || "")) {
        const separatorBlock = consumeQueuedBlock(queues, textHref, "separator-image", consumedBlockIds);
        if (separatorBlock) {
          blocks.push(separatorBlock);
        }
      }
      const inlineText = extractInlineTextFromParagraphHtmlList([innerHtml || ""], {
        inputRoot,
        sourceHref: textHref
      });
      const textContent = inlineText.textContent;
      if (textContent) {
        headingIndex += 1;
        const headingBlock = {
          blockId: `${prefix}-heading-${String(headingIndex).padStart(4, "0")}`,
          sourceHref: textHref,
          headingLevel: level,
          textContent,
          sourceTag: `h${level}`,
          sourceClassName: String(attrs.class || "").trim()
        };
        if (inlineText.inlineSemantics) {
          headingBlock.inlineSemantics = inlineText.inlineSemantics;
        }
        blocks.push(headingBlock);
      }
      match = tokenPattern.exec(xhtml);
      continue;
    }

    if (/^<p\b/i.test(raw)) {
      const attrs = parseAttributes(match[4]);
      const className = String(attrs.class || "").trim();
      const body = match[5];
      if (/\bfigure-lead\b/.test(className)) {
        const figureLead = consumeQueuedBlock(queues, textHref, "figure-lead", consumedBlockIds);
        if (figureLead) {
          blocks.push(figureLead);
        }
        match = tokenPattern.exec(xhtml);
        continue;
      }
      if (/\bimage-block\b/.test(className)) {
        const contentImage = consumeQueuedBlock(queues, textHref, "content-image", consumedBlockIds);
        if (contentImage) {
          blocks.push(contentImage);
        }
        match = tokenPattern.exec(xhtml);
        continue;
      }
      const inlineText = extractInlineTextFromParagraphHtmlList([body || ""], {
        inputRoot,
        sourceHref: textHref
      });
      const textContent = inlineText.textContent;
      if (textContent) {
        paragraphIndex += 1;
        const paragraphBlock = {
          blockId: `${prefix}-paragraph-${String(paragraphIndex).padStart(4, "0")}`,
          sourceHref: textHref,
          textContent,
          sourceTag: "p",
          sourceClassName: className
        };
        if (inlineText.inlineSemantics) {
          paragraphBlock.inlineSemantics = inlineText.inlineSemantics;
        }
        blocks.push(paragraphBlock);
      }
      match = tokenPattern.exec(xhtml);
      continue;
    }

    match = tokenPattern.exec(xhtml);
  }

  return blocks;
}

export function extractReadingTextBlocks(inputRoot, logicalBlockList) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  const existingBlocks = Array.isArray(logicalBlockList) ? logicalBlockList : [];
  if (!resolvedInputRoot) {
    return existingBlocks;
  }

  const queues = buildBlockQueues(existingBlocks);
  const consumedBlockIds = new Set();
  const orderedBlocks = [];
  const files = getSpineTextFiles(resolvedInputRoot, { includeCover: false });

  for (const file of files) {
    const textFilePath = file.textFilePath;
    const textHref = file.textHref;
    orderedBlocks.push(...buildOrderedBlocksFromFile({
      inputRoot: resolvedInputRoot,
      textHref,
      textFilePath,
      queues,
      consumedBlockIds
    }));
  }

  for (const block of existingBlocks) {
    const blockId = String(block && block.blockId || "").trim();
    if (!blockId || consumedBlockIds.has(blockId)) {
      continue;
    }
    orderedBlocks.push(block);
  }

  return orderedBlocks;
}
