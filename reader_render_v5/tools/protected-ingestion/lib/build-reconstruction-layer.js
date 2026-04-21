#!/usr/bin/env node
"use strict";

function hashSlot(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return `slot-${Math.abs(hash).toString(36)}`;
}

function scalarMask(seed, glyphToken) {
  const input = `${seed}:${glyphToken}:scalar-mask`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) & 0x10ffff;
}

function buildReconstructionLayer({ chunkId, seed, internalGlyphs }) {
  const lanes = [];

  for (const glyph of internalGlyphs) {
    const mask = scalarMask(seed, glyph.glyphToken);
    lanes.push({
      slot: hashSlot(`${seed}:${glyph.glyphToken}:lane-slot`),
      vector: glyph.scalar ^ mask
    });
  }

  return {
    version: 1,
    mode: "sealed-window-substrate-v1",
    laneSeed: seed,
    lanes: lanes.sort((a, b) => a.slot.localeCompare(b.slot))
  };
}

module.exports = { buildReconstructionLayer, scalarMask, hashSlot };
