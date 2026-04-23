function isCoreWordChar(char) {
  return /[\p{L}\p{N}\p{M}]/u.test(char);
}

function isAdjacent(prev, next) {
  return !!prev && !!next && next.offset === prev.offset + 1;
}

function isWordLike(entry, entries, index) {
  if (!entry || !entry.char) return false;
  if (isCoreWordChar(entry.char)) return true;
  if ((entry.char === "'" || entry.char === "-") && index > 0 && index < entries.length - 1) {
    const prev = entries[index - 1];
    const next = entries[index + 1];
    return (
      isAdjacent(prev, entry) &&
      isAdjacent(entry, next) &&
      isCoreWordChar(prev.char) &&
      isCoreWordChar(next.char)
    );
  }
  return false;
}

function compareEntries(a, b) {
  return a.offset - b.offset;
}

export function buildWordBoundaryModel(source) {
  if (source && Array.isArray(source.wordBoundaries)) {
    return {
      words: source.wordBoundaries.map((item) => ({
        startOffset: item.start,
        endOffset: item.end
      })),
      charCount: typeof source.textLength === "number" ? source.textLength : 0
    };
  }

  const entries = [];

  for (const segment of source || []) {
    const text = String(segment.text || "");
    const chars = Array.from(text);
    for (let index = 0; index < chars.length; index += 1) {
      entries.push({
        offset: segment.start + index,
        char: chars[index],
        blockId: segment.blockId,
        segmentId: segment.segmentId
      });
    }
  }

  entries.sort(compareEntries);
  const words = [];
  let index = 0;

  while (index < entries.length) {
    if (!isWordLike(entries[index], entries, index)) {
      index += 1;
      continue;
    }

    const first = entries[index];
    let endEntry = first;
    index += 1;

    while (
      index < entries.length &&
      isAdjacent(endEntry, entries[index]) &&
      isWordLike(entries[index], entries, index)
    ) {
      endEntry = entries[index];
      index += 1;
    }

    words.push({
      startOffset: first.offset,
      endOffset: endEntry.offset + 1,
      blockId: first.blockId,
      segmentId: first.segmentId
    });
  }

  return {
    words,
    charCount: entries.length
  };
}

export function findWordRangeAtOffset(wordBoundaryModel, offset) {
  const words = (wordBoundaryModel && wordBoundaryModel.words) || [];
  return words.find((word) => offset >= word.startOffset && offset < word.endOffset) || null;
}

function nearestWordBefore(words, offset) {
  let match = null;
  for (const word of words) {
    if (word.endOffset <= offset) match = word;
    else break;
  }
  return match;
}

function nearestWordAfter(words, offset) {
  return words.find((word) => word.startOffset >= offset) || null;
}

function nearestWord(words, offset) {
  const before = nearestWordBefore(words, offset);
  const after = nearestWordAfter(words, offset);
  if (!before) return after;
  if (!after) return before;
  const beforeDistance = Math.abs(offset - before.endOffset);
  const afterDistance = Math.abs(after.startOffset - offset);
  return beforeDistance <= afterDistance ? before : after;
}

export function snapSelectionOffsets(wordBoundaryModel, rawStartOffset, rawEndOffset) {
  const words = (wordBoundaryModel && wordBoundaryModel.words) || [];
  if (!words.length || rawStartOffset == null || rawEndOffset == null) {
    return {
      startOffset: rawStartOffset,
      endOffset: rawEndOffset,
      rawStartOffset,
      rawEndOffset,
      wordBoundaryHits: 0,
      selectionMode: "raw"
    };
  }

  if (rawEndOffset <= rawStartOffset) {
    const singleWord = findWordRangeAtOffset(wordBoundaryModel, rawStartOffset) || nearestWord(words, rawStartOffset);
    if (!singleWord) {
      return {
        startOffset: rawStartOffset,
        endOffset: rawEndOffset,
        rawStartOffset,
        rawEndOffset,
        wordBoundaryHits: 0,
        selectionMode: "raw"
      };
    }
    return {
      startOffset: singleWord.startOffset,
      endOffset: singleWord.endOffset,
      rawStartOffset,
      rawEndOffset,
      wordBoundaryHits:
        Number(singleWord.startOffset !== rawStartOffset) +
        Number(singleWord.endOffset !== rawEndOffset),
      selectionMode: "word-snapped"
    };
  }

  const containingStart = findWordRangeAtOffset(wordBoundaryModel, rawStartOffset);
  const containingEnd = findWordRangeAtOffset(wordBoundaryModel, Math.max(rawStartOffset, rawEndOffset - 1));
  const leftWord = containingStart || nearestWordAfter(words, rawStartOffset) || nearestWord(words, rawStartOffset);
  const rightWord = containingEnd || nearestWordBefore(words, rawEndOffset) || nearestWord(words, rawEndOffset);

  if (!leftWord || !rightWord) {
    return {
      startOffset: rawStartOffset,
      endOffset: rawEndOffset,
      rawStartOffset,
      rawEndOffset,
      wordBoundaryHits: 0,
      selectionMode: "raw"
    };
  }

  const startOffset = Math.min(leftWord.startOffset, rightWord.startOffset);
  const endOffset = Math.max(leftWord.endOffset, rightWord.endOffset);
  return {
    startOffset,
    endOffset,
    rawStartOffset,
    rawEndOffset,
    wordBoundaryHits:
      Number(startOffset !== rawStartOffset) +
      Number(endOffset !== rawEndOffset),
    selectionMode: "word-snapped"
  };
}
