#!/usr/bin/env node
import path from "path";
import { extractBookCover } from "./lib/extract-book-cover.js";
import { extractNonCoverMedia } from "./lib/extract-non-cover-media.js";
import { extractFigureContainers } from "./lib/extract-figure-containers.js";
import { extractOrderedListContainers } from "./lib/extract-list-containers.js";
import { extractBlockquotes } from "./lib/extract-blockquotes.js";
import { extractReadingTextBlocks } from "./lib/extract-reading-text-blocks.js";
import { extractBlockPresentation } from "./lib/extract-block-presentation.js";
import { extractTypographyStyles } from "./lib/extract-typography-styles.js";
import { buildProtectedManifest } from "./lib/build-protected-manifest.js";
import { writeProtectedBook } from "./lib/write-protected-book.js";

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

const output = getArg("--output");
const input = getArg("--input");
const bookId = getArg("--book-id") || path.basename(String(output || "").trim()) || "unknown";
const title = getArg("--title") || `v4 bootstrap book ${bookId}`;

if (!output) {
  console.error("Usage: npm --prefix reader_render_v5 run protected:bootstrap:build -- --book-id <id> --output <artifact-dir> [--title <title>]");
  process.exit(1);
}

const { cover, publicRootPath } = extractBookCover(input);
const phase1LogicalBlockList = extractNonCoverMedia(input);
const figureExtraction = extractFigureContainers(input, phase1LogicalBlockList);
const listExtraction = extractOrderedListContainers(input, figureExtraction.logicalBlockList);
const blockquoteLogicalBlockList = extractBlockquotes(input, listExtraction.logicalBlockList);
const readingTextLogicalBlockList = extractReadingTextBlocks(input, blockquoteLogicalBlockList);
const logicalBlockList = extractBlockPresentation(input, readingTextLogicalBlockList);
const typographyStyles = extractTypographyStyles(input);
const manifest = buildProtectedManifest({
  bookId,
  title,
  cover,
  publicRootPath,
  logicalBlockList,
  typographyStyles,
  listContainers: listExtraction.listContainers,
  figureContainers: figureExtraction.figureContainers
});
const root = writeProtectedBook(output, manifest);
const logicalBlockListCount = Array.isArray(manifest.logicalBlockList) ? manifest.logicalBlockList.length : 0;
const mediaBlocks = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => block && Array.isArray(block.mediaItems) && block.mediaItems.length).length
  : 0;
const headingBlocks = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => block && Number.isInteger(block.headingLevel)).length
  : 0;
const paragraphBlocks = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => (
    block &&
    !block.blockRole &&
    !Number.isInteger(block.headingLevel) &&
    typeof block.textContent === "string" &&
    block.textContent.trim() &&
    !(Array.isArray(block.mediaItems) && block.mediaItems.length)
  )).length
  : 0;
const figureLeadBlocks = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => block && block.blockRole === "figure-lead").length
  : 0;
const listItemBlocks = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => block && block.blockRole === "list-item").length
  : 0;
const blockquoteBlocks = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => block && block.blockRole === "blockquote").length
  : 0;
const blocksWithPresentation = Array.isArray(manifest.logicalBlockList)
  ? manifest.logicalBlockList.filter((block) => block && block.blockPresentation && typeof block.blockPresentation === "object").length
  : 0;

console.log(JSON.stringify({
  ok: true,
  root,
  bookId,
  contractKind: manifest.artifactContract.kind,
  coverDetected: !!manifest.cover,
  totalLogicalBlocks: logicalBlockListCount,
  mediaBlocks,
  headingBlocks,
  paragraphBlocks,
  figureLeadBlocks,
  listItemBlocks,
  blockquoteBlocks,
  blocksWithPresentation,
  listContainers: Array.isArray(manifest.listContainers) ? manifest.listContainers.length : 0,
  figureContainers: Array.isArray(manifest.figureContainers) ? manifest.figureContainers.length : 0
}, null, 2));
