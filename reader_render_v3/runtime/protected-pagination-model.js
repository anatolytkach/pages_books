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

export function buildPaginationModel({ chunkModel, layout, viewportHeight, globalModel }) {
  const lines = layout.lines || [];
  const pages = [];
  const effectiveHeight = Math.max(260, viewportHeight || 640);
  if (layout && layout.pageSlotCount && lines.some((line) => Number.isInteger(line.pageSlot))) {
    const grouped = new Map();
    for (const line of lines) {
      const slot = Number.isInteger(line.pageSlot) ? line.pageSlot : 0;
      if (!grouped.has(slot)) grouped.set(slot, []);
      grouped.get(slot).push(line);
    }
    const orderedSlots = [...grouped.keys()].sort((a, b) => a - b);
    orderedSlots.forEach((slot, index) => {
      const page = ensurePage(grouped.get(slot) || [], index, effectiveHeight, chunkModel, globalModel);
      page.top = slot * effectiveHeight;
      page.pageSlot = slot;
      pages.push(page);
    });
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
