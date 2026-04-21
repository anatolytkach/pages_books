#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {
  PROTECTED_V4_BOOTSTRAP_CONTRACT_KIND,
  PROTECTED_V4_BOOTSTRAP_MANIFEST_VERSION
} from "./lib/build-protected-manifest.js";
import {
  validateManifestCover,
  validateMediaItemVisibilityShape,
  validatePhase1MediaVisibilityContract
} from "./lib/protected-media-visibility-contract.js";
import {
  validateListContainerShape,
  validatePhase2StructuralContract,
  validateStructuralBlockShape
} from "./lib/protected-structural-contract.js";
import {
  validateFigureContainerShape,
  validatePhase3FigureContainerContract
} from "./lib/protected-figure-container-contract.js";

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

const input = getArg("--input");
if (!input) {
  console.error("Usage: npm --prefix reader_render_v5 run protected:bootstrap:validate -- --input <artifact-dir>");
  process.exit(1);
}

const root = path.resolve(input);
const manifestPath = path.join(root, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing manifest.json at ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (Number(manifest.version) !== PROTECTED_V4_BOOTSTRAP_MANIFEST_VERSION) {
  throw new Error(`Unsupported v4 bootstrap manifest version: ${manifest.version}`);
}
if (String(manifest.mode || "") !== "protected-v4-bootstrap") {
  throw new Error(`Unsupported v4 bootstrap manifest mode: ${manifest.mode || "<missing>"}`);
}
if (!manifest.artifactContract || manifest.artifactContract.kind !== PROTECTED_V4_BOOTSTRAP_CONTRACT_KIND) {
  throw new Error(`Unsupported v4 bootstrap contract kind: ${manifest && manifest.artifactContract && manifest.artifactContract.kind}`);
}
if (!manifest.artifactContract || !manifest.artifactContract.mediaVisibilityPhase1) {
  throw new Error("v4 bootstrap manifest is missing artifactContract.mediaVisibilityPhase1");
}
validatePhase1MediaVisibilityContract(manifest.artifactContract.mediaVisibilityPhase1);
if (!manifest.artifactContract || !manifest.artifactContract.structuralPhase2) {
  throw new Error("v4 bootstrap manifest is missing artifactContract.structuralPhase2");
}
validatePhase2StructuralContract(manifest.artifactContract.structuralPhase2);
if (!manifest.artifactContract || !manifest.artifactContract.figureContainerPhase3) {
  throw new Error("v4 bootstrap manifest is missing artifactContract.figureContainerPhase3");
}
validatePhase3FigureContainerContract(manifest.artifactContract.figureContainerPhase3);
if (Object.prototype.hasOwnProperty.call(manifest, "cover")) {
  validateManifestCover(manifest.cover);
}
if (!manifest.metadata || typeof manifest.metadata.title !== "string" || !manifest.metadata.title.trim()) {
  throw new Error("v4 bootstrap manifest is missing metadata.title");
}
if (!manifest.source || typeof manifest.source.bookId !== "string" || !manifest.source.bookId.trim()) {
  throw new Error("v4 bootstrap manifest is missing source.bookId");
}
if (manifest.source.publicRootPath != null && typeof manifest.source.publicRootPath !== "string") {
  throw new Error("v4 bootstrap manifest has invalid source.publicRootPath");
}
const logicalBlockList = Array.isArray(manifest.logicalBlockList) ? manifest.logicalBlockList : [];
const listContainers = Array.isArray(manifest.listContainers) ? manifest.listContainers : [];
const figureContainers = Array.isArray(manifest.figureContainers) ? manifest.figureContainers : [];
const blockIds = new Set();
const mediaByBlockId = new Map();
for (const block of logicalBlockList) {
  if (!block || typeof block !== "object") {
    throw new Error("v4 bootstrap manifest has invalid logicalBlockList entry");
  }
  if (typeof block.blockId !== "string" || !block.blockId.trim()) {
    throw new Error("v4 bootstrap manifest logicalBlockList entry is missing blockId");
  }
  blockIds.add(block.blockId);
  validateStructuralBlockShape(block, `manifest.logicalBlockList[${String(block && block.blockId || "unknown")}]`);
  const mediaItems = Array.isArray(block && block.mediaItems) ? block.mediaItems : [];
  mediaByBlockId.set(block.blockId, mediaItems);
  mediaItems.forEach((mediaItem, index) => {
    validateMediaItemVisibilityShape(
      mediaItem,
      `manifest.logicalBlockList[${String(block && block.blockId || "unknown")}].mediaItems[${index}]`
    );
  });
}
listContainers.forEach((container, index) => {
  const label = `manifest.listContainers[${index}]`;
  validateListContainerShape(container, label);
  const itemBlockIds = Array.isArray(container.itemBlockIds) ? container.itemBlockIds : [];
  itemBlockIds.forEach((itemBlockId, itemIndex) => {
    if (!blockIds.has(itemBlockId)) {
      throw new Error(`${label}.itemBlockIds[${itemIndex}] does not reference an existing logical block`);
    }
  });
});
figureContainers.forEach((container, index) => {
  const label = `manifest.figureContainers[${index}]`;
  validateFigureContainerShape(container, label);
  const members = Array.isArray(container.members) ? container.members : [];
  members.forEach((member, memberIndex) => {
    const memberLabel = `${label}.members[${memberIndex}]`;
    if (member.memberRole === "lead-text") {
      if (!blockIds.has(member.blockId)) {
        throw new Error(`${memberLabel}.blockId does not reference an existing logical block`);
      }
      return;
    }
    if (!blockIds.has(member.mediaBlockId)) {
      throw new Error(`${memberLabel}.mediaBlockId does not reference an existing logical block`);
    }
    if (member.mediaId) {
      const mediaItems = Array.isArray(mediaByBlockId.get(member.mediaBlockId)) ? mediaByBlockId.get(member.mediaBlockId) : [];
      if (!mediaItems.some((item) => item && item.mediaId === member.mediaId)) {
        throw new Error(`${memberLabel}.mediaId does not reference an existing media item`);
      }
    }
  });
});

const mediaBlocks = logicalBlockList.filter((block) => block && Array.isArray(block.mediaItems) && block.mediaItems.length).length;
const headingBlocks = logicalBlockList.filter((block) => block && Number.isInteger(block.headingLevel)).length;
const paragraphBlocks = logicalBlockList.filter((block) => (
  block &&
  !block.blockRole &&
  !Number.isInteger(block.headingLevel) &&
  typeof block.textContent === "string" &&
  block.textContent.trim() &&
  !(Array.isArray(block.mediaItems) && block.mediaItems.length)
)).length;
const figureLeadBlocks = logicalBlockList.filter((block) => block && block.blockRole === "figure-lead").length;
const listItemBlocks = logicalBlockList.filter((block) => block && block.blockRole === "list-item").length;
const blockquoteBlocks = logicalBlockList.filter((block) => block && block.blockRole === "blockquote").length;
const blocksWithPresentation = logicalBlockList.filter((block) => block && block.blockPresentation && typeof block.blockPresentation === "object").length;

console.log(JSON.stringify({
  ok: true,
  root,
  bookId: manifest.source.bookId,
  title: manifest.metadata.title,
  contractKind: manifest.artifactContract.kind,
  coverDetected: !!manifest.cover,
  totalLogicalBlocks: logicalBlockList.length,
  mediaBlocks,
  headingBlocks,
  paragraphBlocks,
  figureLeadBlocks,
  listItemBlocks,
  blockquoteBlocks,
  blocksWithPresentation,
  listContainers: listContainers.length,
  figureContainers: figureContainers.length
}, null, 2));
