import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaginationModel,
  findPageIndexForOffset
} from "../../reader_render_v5/runtime/protected-pagination-model.js";

function createGlobalModel() {
  const chunk = {
    chunkId: "chunk-1",
    chunkOrder: 0,
    startOffset: 1000,
    endOffset: 1300,
    textLength: 300
  };
  return {
    bookId: "unit",
    chunks: [chunk],
    byChunkId: new Map([[chunk.chunkId, chunk]])
  };
}

test("slot pagination uses visible line offsets instead of spanning block offsets", () => {
  const pagination = buildPaginationModel({
    chunkModel: {
      chunk: {
        chunkId: "chunk-1",
        textLength: 300
      }
    },
    layout: {
      pageSlotCount: 2,
      width: 430,
      blocks: [
        {
          orderIndex: 0,
          pageSlotStart: 0,
          pageSlotEnd: 1,
          startOffset: 0,
          endOffset: 300
        }
      ],
      lines: [
        {
          lineIndex: 0,
          pageSlot: 0,
          startOffset: 0,
          endOffset: 50
        },
        {
          lineIndex: 1,
          pageSlot: 0,
          startOffset: 50,
          endOffset: 100
        },
        {
          lineIndex: 2,
          pageSlot: 1,
          startOffset: 100,
          endOffset: 150
        },
        {
          lineIndex: 3,
          pageSlot: 1,
          startOffset: 150,
          endOffset: 200
        }
      ]
    },
    viewportHeight: 640,
    globalModel: createGlobalModel()
  });

  assert.equal(pagination.pages[0].startOffset, 0);
  assert.equal(pagination.pages[0].endOffset, 100);
  assert.equal(pagination.pages[1].startOffset, 100);
  assert.equal(pagination.pages[1].endOffset, 200);
  assert.equal(findPageIndexForOffset(pagination, 125), 1);
});

test("offset lookup uses exact line ranges when page ranges overlap", () => {
  const pagination = {
    pages: [
      {
        pageIndex: 0,
        startOffset: 0,
        endOffset: 160,
        lineOffsetRanges: [
          { startOffset: 0, endOffset: 80 }
        ]
      },
      {
        pageIndex: 1,
        startOffset: 80,
        endOffset: 220,
        lineOffsetRanges: [
          { startOffset: 150, endOffset: 180 }
        ]
      }
    ]
  };

  assert.equal(findPageIndexForOffset(pagination, 155), 1);
});
