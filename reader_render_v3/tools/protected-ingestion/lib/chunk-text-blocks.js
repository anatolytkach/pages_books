#!/usr/bin/env node
"use strict";

function chunkTextBlocks(blocks, config) {
  const chunks = [];
  const maxCharacters = config.maxCharacters || 1200;
  const maxBlocks = config.maxBlocks || 24;

  let pending = [];
  let pendingChars = 0;
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
    chunkIndex += 1;
  }

  for (const block of blocks) {
    const nextChars = pendingChars + block.text.length;
    if (pending.length && (pending.length >= maxBlocks || nextChars > maxCharacters)) {
      flush();
    }
    pending.push(block);
    pendingChars += block.text.length;
  }
  flush();

  return chunks;
}

module.exports = { chunkTextBlocks };
