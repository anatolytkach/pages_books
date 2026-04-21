#!/usr/bin/env node
"use strict";

function chunkTextBlocks(blocks, config) {
  const chunks = [];
  const maxCharacters = config.maxCharacters || 64000;
  const maxBlocks = config.maxBlocks || 900;

  const chapterUnits = [];
  let unitBlocks = [];
  let unitChars = 0;

  function flushUnit() {
    if (!unitBlocks.length) return;
    chapterUnits.push({
      blocks: unitBlocks,
      totalCharacters: unitChars
    });
    unitBlocks = [];
    unitChars = 0;
  }

  for (const block of blocks) {
    const isHeading = /^heading-\d+$/.test(String(block.blockType || ""));
    if (isHeading && unitBlocks.length) flushUnit();
    unitBlocks.push(block);
    unitChars += block.text.length;
  }
  flushUnit();

  let pending = [];
  let pendingChars = 0;
  let pendingBlocks = 0;
  let pendingUnits = 0;
  let chunkIndex = 1;

  function flush() {
    if (!pending.length) return;
    const chunkId = `chunk-${String(chunkIndex).padStart(6, "0")}`;
    chunks.push({
      chunkId,
      blocks: pending,
      sourceRefs: pending.map((block) => block.sourceRef),
      totalCharacters: pendingChars
    });
    pending = [];
    pendingChars = 0;
    pendingBlocks = 0;
    pendingUnits = 0;
    chunkIndex += 1;
  }

  for (const unit of chapterUnits) {
    const nextChars = pendingChars + unit.totalCharacters;
    const nextBlocks = pendingBlocks + unit.blocks.length;
    const nextUnits = pendingUnits + 1;
    if (
      pending.length &&
      pendingUnits >= 2 &&
      (nextBlocks > maxBlocks || nextChars > maxCharacters)
    ) {
      flush();
    }
    pending.push(...unit.blocks);
    pendingChars += unit.totalCharacters;
    pendingBlocks += unit.blocks.length;
    pendingUnits = nextUnits;
  }
  flush();

  return chunks;
}

module.exports = { chunkTextBlocks };
