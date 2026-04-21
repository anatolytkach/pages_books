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

function extractBlockquotesFromFile({ inputRoot, textHref, textFilePath }) {
  const xhtml = fs.readFileSync(textFilePath, "utf8");
  const blockquotePattern = /<blockquote>\s*([\s\S]*?)\s*<\/blockquote>/gi;
  const blocks = [];
  let match = blockquotePattern.exec(xhtml);
  let index = 0;
  while (match) {
    const body = match[1];
    const paragraphPattern = /<p>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let paragraphMatch = paragraphPattern.exec(body);
    while (paragraphMatch) {
      const paragraphHtml = paragraphMatch[1];
      if (String(paragraphHtml || "").trim()) {
        paragraphs.push(paragraphHtml);
      }
      paragraphMatch = paragraphPattern.exec(body);
    }
    const inlineText = extractInlineTextFromParagraphHtmlList(paragraphs, {
      inputRoot,
      sourceHref: textHref
    });
    if (!inlineText.textContent) {
      match = blockquotePattern.exec(xhtml);
      continue;
    }
    index += 1;
    const blockId = `${textHref.replace(/[^\w]+/g, "_")}-blockquote-${String(index).padStart(4, "0")}`;
    const blockquoteBlock = {
      blockId,
      sourceHref: textHref,
      blockRole: "blockquote",
      textContent: inlineText.textContent,
      blockquotePresentation: {
        variant: "basic-quote",
        suppressTextIndent: true
      }
    };
    if (inlineText.inlineSemantics) {
      blockquoteBlock.inlineSemantics = inlineText.inlineSemantics;
    }
    blocks.push(blockquoteBlock);
    match = blockquotePattern.exec(xhtml);
  }
  return blocks;
}

export function extractBlockquotes(inputRoot, logicalBlockList) {
  const resolvedInputRoot = resolveInputRoot(inputRoot);
  if (!resolvedInputRoot) {
    return Array.isArray(logicalBlockList) ? logicalBlockList : [];
  }

  const blocks = Array.isArray(logicalBlockList) ? [...logicalBlockList] : [];
  const files = getSpineTextFiles(resolvedInputRoot, { includeCover: false });

  for (const file of files) {
    const textFilePath = file.textFilePath;
    const textHref = file.textHref;
    blocks.push(...extractBlockquotesFromFile({ inputRoot: resolvedInputRoot, textHref, textFilePath }));
  }

  return blocks;
}
