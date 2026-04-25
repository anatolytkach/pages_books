import { localOffsetToGlobal } from "./protected-global-location.js";

function ensurePage(lines, pageIndex, viewportHeight, chunkModel, globalModel) {
  if (!lines.length) {
    const startOffset = 0;
    const endOffset = Math.min(1, chunkModel.chunk.textLength || 0);
    return {
      pageIndex,
      pageCount: 1,
      lineStartIndex: 0,
      lineEndIndex: -1,
      top: 0,
      height: viewportHeight,
      startOffset,
      endOffset,
      globalStartOffset: localOffsetToGlobal(globalModel, chunkModel.chunk.chunkId, startOffset),
      globalEndOffset: localOffsetToGlobal(globalModel, chunkModel.chunk.chunkId, endOffset)
    };
  }

  const startLine = lines[0];
  const endLine = lines[lines.length - 1];
  const startOffset = startLine.startOffset;
  const endOffset = endLine.endOffset;
  return {
    pageIndex,
    lineStartIndex: startLine.lineIndex,
    lineEndIndex: endLine.lineIndex,
    top: Math.max(0, startLine.y),
    height: viewportHeight,
    startOffset,
    endOffset,
    globalStartOffset: localOffsetToGlobal(globalModel, chunkModel.chunk.chunkId, startOffset),
    globalEndOffset: localOffsetToGlobal(globalModel, chunkModel.chunk.chunkId, endOffset)
  };
}

function buildPageFromSlot({
  slot,
  pageIndex,
  viewportHeight,
  layout,
  globalModel,
  chunkModel
}) {
  const slotLines = Array.isArray(layout && layout.lines)
    ? layout.lines.filter((line) => Number(line && line.pageSlot || 0) === slot)
    : [];
  const slotBlocks = Array.isArray(layout && layout.blocks)
    ? layout.blocks
        .filter((block) => Number(block && block.pageSlotStart || 0) <= slot && Number(block && block.pageSlotEnd || 0) >= slot)
        .sort((left, right) => Number(left && left.orderIndex || 0) - Number(right && right.orderIndex || 0))
    : [];
  const firstTextBlock = slotBlocks.find((block) => block && Number(block.endOffset || 0) > Number(block.startOffset || 0)) || null;
  const lastTextBlock = slotBlocks
    .slice()
    .reverse()
    .find((block) => block && Number(block.endOffset || 0) > Number(block.startOffset || 0)) || null;
  const startOffset = firstTextBlock
    ? Math.max(0, Number(firstTextBlock.startOffset || 0))
    : 0;
  const endOffset = lastTextBlock
    ? Math.max(startOffset, Number(lastTextBlock.endOffset || startOffset))
    : startOffset;
  const lineStartIndex = slotLines.length ? Number(slotLines[0].lineIndex || 0) : 0;
  const lineEndIndex = slotLines.length ? Number(slotLines[slotLines.length - 1].lineIndex || 0) : -1;
  return {
    pageIndex,
    pageCount: 1,
    pageSlot: slot,
    top: slot * viewportHeight,
    left: 0,
    width: Number(layout && layout.width || 0),
    height: viewportHeight,
    lineStartIndex,
    lineEndIndex,
    startOffset,
    endOffset,
    globalStartOffset: localOffsetToGlobal(globalModel, chunkModel.chunk.chunkId, startOffset),
    globalEndOffset: localOffsetToGlobal(globalModel, chunkModel.chunk.chunkId, endOffset),
    hasTextContent: !!firstTextBlock,
    blockStartIndex: slotBlocks.length ? Number(slotBlocks[0].orderIndex || 0) : -1,
    blockEndIndex: slotBlocks.length ? Number(slotBlocks[slotBlocks.length - 1].orderIndex || 0) : -1
  };
}

export function buildPaginationModel({ chunkModel, layout, viewportHeight, globalModel }) {
  const lines = layout.lines || [];
  const pages = [];
  const effectiveHeight = Math.max(260, viewportHeight || 640);
  if (layout && layout.pageSlotCount) {
    for (let slot = 0; slot < Number(layout.pageSlotCount || 0); slot += 1) {
      pages.push(buildPageFromSlot({
        slot,
        pageIndex: pages.length,
        viewportHeight: effectiveHeight,
        layout,
        globalModel,
        chunkModel
      }));
    }
    const pageCount = Math.max(1, pages.length);
    for (const page of pages) page.pageCount = pageCount;
    return {
      viewportHeight: effectiveHeight,
      pages
    };
  }
  let current = [];
  let currentTop = lines.length ? lines[0].y : 0;

  for (const line of lines) {
    const lineBottom = line.y + line.height;
    const overflow = lineBottom - currentTop > effectiveHeight;
    if (current.length && overflow) {
      pages.push(ensurePage(current, pages.length, effectiveHeight, chunkModel, globalModel));
      current = [];
      currentTop = line.y;
    }
    if (!current.length) currentTop = line.y;
    current.push(line);
  }

  pages.push(ensurePage(current, pages.length, effectiveHeight, chunkModel, globalModel));
  const pageCount = pages.length;
  for (const page of pages) page.pageCount = pageCount;

  return {
    viewportHeight: effectiveHeight,
    pages
  };
}

export function findPageIndexForOffset(paginationModel, localOffset) {
  const pages = paginationModel.pages || [];
  const page =
    pages.find((item) => localOffset >= item.startOffset && localOffset < item.endOffset) ||
    pages[pages.length - 1] ||
    null;
  return page ? page.pageIndex : 0;
}

export function findBestPageIndexForVisibleRange(
  paginationModel,
  globalStartOffset,
  globalEndOffset,
  fallbackPageIndex = 0
) {
  const pages = paginationModel && Array.isArray(paginationModel.pages) ? paginationModel.pages : [];
  const targetStart = Number(globalStartOffset);
  const targetEnd = Number(globalEndOffset);
  if (!pages.length) return Math.max(0, Number(fallbackPageIndex || 0));
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) {
    return Math.max(0, Math.min(Number(fallbackPageIndex || 0), pages.length - 1));
  }

  const targetCenter = targetStart + ((targetEnd - targetStart) / 2);
  let bestPage = null;

  for (const page of pages) {
    const pageStart = Number(page && page.globalStartOffset);
    const pageEnd = Number(page && page.globalEndOffset);
    if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd) || pageEnd <= pageStart) continue;
    const overlap = Math.max(0, Math.min(pageEnd, targetEnd) - Math.max(pageStart, targetStart));
    if (overlap <= 0) continue;
    const pageCenter = pageStart + ((pageEnd - pageStart) / 2);
    const candidate = {
      pageIndex: Number(page.pageIndex || 0),
      overlap,
      startDistance: Math.abs(pageStart - targetStart),
      centerDistance: Math.abs(pageCenter - targetCenter)
    };
    if (
      !bestPage ||
      candidate.overlap > bestPage.overlap ||
      (candidate.overlap === bestPage.overlap && candidate.startDistance < bestPage.startDistance) ||
      (
        candidate.overlap === bestPage.overlap &&
        candidate.startDistance === bestPage.startDistance &&
        candidate.centerDistance < bestPage.centerDistance
      )
    ) {
      bestPage = candidate;
    }
  }

  return bestPage
    ? bestPage.pageIndex
    : Math.max(0, Math.min(Number(fallbackPageIndex || 0), pages.length - 1));
}
