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

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function extractOrderedListsFromFile({ inputRoot, textHref, textFilePath }) {
  const xhtml = fs.readFileSync(textFilePath, "utf8");
  const listPattern = /<ol\b([^>]*)>\s*([\s\S]*?)<\/ol>/gi;
  const additionalBlocks = [];
  const listContainers = [];
  let match = listPattern.exec(xhtml);
  let listIndex = 0;
  while (match) {
    const attrs = parseAttributes(match[1]);
    if (String(attrs.type || "").trim() !== "1") {
      match = listPattern.exec(xhtml);
      continue;
    }
    const listBody = match[2];
    const itemPattern = /<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi;
    const items = [];
    let itemMatch = itemPattern.exec(listBody);
    while (itemMatch) {
      const inlineText = extractInlineTextFromParagraphHtmlList([itemMatch[1]], {
        inputRoot,
        sourceHref: textHref
      });
      const textContent = inlineText.textContent;
      if (!textContent) {
        items.length = 0;
        break;
      }
      items.push({
        textContent,
        inlineSemantics: inlineText.inlineSemantics
      });
      itemMatch = itemPattern.exec(listBody);
    }
    if (!items.length) {
      match = listPattern.exec(xhtml);
      continue;
    }

    listIndex += 1;
    const prefix = `${textHref.replace(/[^\w]+/g, "_")}-ordered-list-${String(listIndex).padStart(4, "0")}`;
    const itemBlockIds = items.map((_item, index) => `${prefix}-item-${String(index + 1).padStart(4, "0")}`);
    items.forEach((item, index) => {
      const itemBlock = {
        blockId: itemBlockIds[index],
        sourceHref: textHref,
        blockRole: "list-item",
        textContent: item.textContent
      };
      if (item.inlineSemantics) {
        itemBlock.inlineSemantics = item.inlineSemantics;
      }
      additionalBlocks.push(itemBlock);
    });
    listContainers.push({
      containerId: `${prefix}-container`,
      sourceHref: textHref,
      listType: "ordered",
      markerStyle: "decimal",
      start: parsePositiveInteger(attrs.start, 1),
      itemBlockIds
    });
    match = listPattern.exec(xhtml);
  }

  return { additionalBlocks, listContainers };
}

export function extractOrderedListContainers(inputRoot, logicalBlockList) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) {
    return { logicalBlockList: Array.isArray(logicalBlockList) ? logicalBlockList : [], listContainers: [] };
  }

  const blocks = Array.isArray(logicalBlockList) ? [...logicalBlockList] : [];
  const listContainers = [];
  const files = getSpineTextFiles(resolvedInputRoot, { includeCover: false });

  for (const file of files) {
    const textFilePath = file.textFilePath;
    const textHref = file.textHref;
    const extracted = extractOrderedListsFromFile({ inputRoot: resolvedInputRoot, textHref, textFilePath });
    blocks.push(...extracted.additionalBlocks);
    listContainers.push(...extracted.listContainers);
  }

  return {
    logicalBlockList: blocks,
    listContainers
  };
}
