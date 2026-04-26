import assert from "node:assert/strict";
import test from "node:test";

import {
  createReconstructionScope,
  disposeReconstructionScope,
  reconstructRangeText,
  reconstructSearchTextWithOffsets,
} from "../../reader_render_v5/runtime/protected-text-reconstruction.js";

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

function buildSyntheticChunkModel() {
  const laneSeed = "search-offset-test";
  const runs = [
    { blockId: "b1", start: 0, text: "alpha" },
    { blockId: "b2", start: 20, text: "fainter howl from" },
    { blockId: "b3", start: 60, text: "single" },
  ];
  const lanes = [];
  const runBySegmentKey = new Map();
  const textSegments = [];

  runs.forEach((run, runIndex) => {
    const glyphTokens = Array.from(run.text).map((char, charIndex) => {
      const glyphToken = `g-${runIndex}-${charIndex}`;
      lanes.push({
        slot: hashSlot(`${laneSeed}:${glyphToken}:lane-slot`),
        vector: char.codePointAt(0) ^ scalarMask(laneSeed, glyphToken),
      });
      return glyphToken;
    });
    runBySegmentKey.set(`${run.blockId}:0`, { blockId: run.blockId, glyphTokens });
    textSegments.push({
      blockId: run.blockId,
      runIndex: 0,
      start: run.start,
      end: run.start + glyphTokens.length,
    });
  });

  return {
    chunk: { chunkId: "synthetic-search-offsets" },
    substrate: { laneSeed, lanes },
    substrateLaneMap: new Map(lanes.map((lane) => [lane.slot, lane])),
    runBySegmentKey,
    textSegments,
  };
}

function firstFinite(offsets, startIndex, endIndex) {
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (Number.isFinite(offsets[index])) return offsets[index];
  }
  return null;
}

function lastFinite(offsets, startIndex, endIndex) {
  for (let index = endIndex; index >= startIndex; index -= 1) {
    if (Number.isFinite(offsets[index])) return offsets[index];
  }
  return null;
}

function mapMatch(search, query) {
  const normalizedQuery = String(query || "").replace(/\s+/g, " ").trim().toLowerCase();
  const foundAt = search.text.toLowerCase().indexOf(normalizedQuery);
  assert.notEqual(foundAt, -1);
  const endIndex = foundAt + normalizedQuery.length - 1;
  const startOffset = firstFinite(search.offsets, foundAt, endIndex);
  const endOffset = lastFinite(search.offsets, foundAt, endIndex) + 1;
  return { startOffset, endOffset };
}

test("Unit: protected search maps reconstructed string matches back to real text offsets", () => {
  const chunkModel = buildSyntheticChunkModel();
  const scope = createReconstructionScope({
    chunkModel,
    purpose: "unit-search-offsets",
    startOffset: 0,
    endOffset: 66,
  });

  try {
    const search = reconstructSearchTextWithOffsets(chunkModel, 0, 66, scope);

    const phrase = mapMatch(search, "fainter howl from");
    assert.deepEqual(phrase, { startOffset: 20, endOffset: 37 });
    assert.equal(reconstructRangeText(chunkModel, phrase.startOffset, phrase.endOffset, scope), "fainter howl from");

    const single = mapMatch(search, "single");
    assert.deepEqual(single, { startOffset: 60, endOffset: 66 });
    assert.equal(reconstructRangeText(chunkModel, single.startOffset, single.endOffset, scope), "single");
  } finally {
    disposeReconstructionScope(scope);
  }
});
