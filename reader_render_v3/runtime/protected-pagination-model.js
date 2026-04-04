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
