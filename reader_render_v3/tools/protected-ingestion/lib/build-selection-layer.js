#!/usr/bin/env node
"use strict";

function buildSelectionLayer(chunk, options = {}) {
  let cursor = 0;
  const runtimeTextSegments = [];
  const debugTextSegments = [];
  const runtimeRanges = [];
  const debugRanges = [];
  const blockAnchors = [];
  const noteAnchors = [];
  const copyRanges = [];
  const wordBoundaries = [];
  const parts = [];
  const chunkStart = options.globalStart || 0;

  function pushWordBoundaries(text, baseOffset) {
    const chars = Array.from(String(text || ""));
    function isCoreWordChar(char) {
      return /[\p{L}\p{N}]/u.test(char);
    }
    function isWordLike(char, index) {
      if (!char) return false;
      if (isCoreWordChar(char)) return true;
      if ((char === "'" || char === "-") && index > 0 && index < chars.length - 1) {
        return isCoreWordChar(chars[index - 1]) && isCoreWordChar(chars[index + 1]);
      }
      return false;
    }
    let index = 0;
    while (index < chars.length) {
      if (!isWordLike(chars[index], index)) {
        index += 1;
        continue;
      }
      const start = index;
      index += 1;
      while (index < chars.length && isWordLike(chars[index], index)) index += 1;
      wordBoundaries.push({
        start: baseOffset + start,
        end: baseOffset + index
      });
    }
  }

  chunk.blocks.forEach((block, blockIndex) => {
    if (parts.length) {
      parts.push("\n\n");
      cursor += 2;
    }
    const blockStart = cursor;
    block.runs.forEach((run, runIndex) => {
      if (run.hardBreak && !run.text) {
        return;
      }
      const start = cursor;
      const text = run.text;
      cursor += text.length;
      const end = cursor;
      parts.push(text);
      pushWordBoundaries(text, start);
      const segmentId = `${chunk.chunkId}-seg-${runtimeTextSegments.length + 1}`;
      runtimeTextSegments.push({
        segmentId,
        blockId: block.blockId,
        runIndex,
        start,
        end,
        textLength: text.length,
        styleToken: run.styleToken,
        linkTarget: run.linkTarget || "",
        sourceNodeId: run.sourceNodeId || "",
        sourceRef: block.sourceRef
      });
      debugTextSegments.push({
        segmentId,
        blockId: block.blockId,
        runIndex,
        start,
        end,
        text,
        textLength: text.length,
        styleToken: run.styleToken,
        linkTarget: run.linkTarget || "",
        sourceNodeId: run.sourceNodeId || "",
        sourceRef: block.sourceRef
      });
      const rangeId = `${chunk.chunkId}-range-${runtimeRanges.length + 1}`;
      runtimeRanges.push({
        rangeId,
        kind: "run",
        start,
        end,
        textLength: text.length,
        blockId: block.blockId
      });
      debugRanges.push({
        rangeId,
        kind: "run",
        start,
        end,
        text,
        textLength: text.length,
        blockId: block.blockId
      });
      if (run.linkTarget) {
        noteAnchors.push({
          anchorId: `${chunk.chunkId}-note-${noteAnchors.length + 1}`,
          blockId: block.blockId,
          start,
          end,
          href: run.linkTarget
        });
      }
    });
    const blockEnd = cursor;
    blockAnchors.push({
      anchorId: `${chunk.chunkId}-block-${blockIndex + 1}`,
      blockId: block.blockId,
      start: blockStart,
      end: blockEnd,
      sourceRef: block.sourceRef,
      inlineIds: block.inlineIds,
      linkTargets: block.linkTargets
    });
    copyRanges.push({
      rangeId: `${chunk.chunkId}-copy-${copyRanges.length + 1}`,
      blockId: block.blockId,
      start: blockStart,
      end: blockEnd
    });
  });

  const runtime = {
    textLength: cursor,
    textSegments: runtimeTextSegments,
    ranges: runtimeRanges,
    blockAnchors,
    noteAnchors,
    copyRanges,
    wordBoundaries,
    chunkRange: {
      start: chunkStart,
      end: chunkStart + cursor
    }
  };

  const debug = {
    fullText: parts.join(""),
    textSegments: debugTextSegments,
    ranges: debugRanges,
    blockAnchors,
    noteAnchors,
    copyRanges,
    wordBoundaries,
    chunkRange: runtime.chunkRange
  };

  return { runtime, debug };
}

module.exports = { buildSelectionLayer };
