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

function codePointToChar(codePoint) {
  try {
    return String.fromCodePoint(codePoint);
  } catch (_) {
    return "";
  }
}

export function createReconstructionScope({ chunkModel, purpose = "window", startOffset = 0, endOffset = 0 } = {}) {
  return {
    purpose,
    chunkId: chunkModel ? chunkModel.chunk.chunkId : "",
    startOffset,
    endOffset,
    decodedRanges: new Map(),
    decodedChars: 0,
    cacheEntries: 0
  };
}

export function disposeReconstructionScope(scope) {
  if (!scope) return;
  if (scope.decodedRanges) scope.decodedRanges.clear();
  scope.cacheEntries = 0;
  scope.decodedChars = 0;
}

export function getReconstructionScopeDiagnostics(scope) {
  if (!scope) {
    return {
      mode: "none",
      cacheEntries: 0,
      decodedChars: 0,
      exposure: "sealed"
    };
  }
  return {
    mode: scope.purpose,
    cacheEntries: scope.cacheEntries || 0,
    decodedChars: scope.decodedChars || 0,
    exposure: "sealed"
  };
}

function getSubstrateLane(chunkModel, glyphToken) {
  if (!chunkModel || !chunkModel.substrate || !chunkModel.substrateLaneMap) return null;
  const slot = hashSlot(`${chunkModel.substrate.laneSeed}:${glyphToken}:lane-slot`);
  return chunkModel.substrateLaneMap.get(slot) || null;
}

function decodeScalar(chunkModel, glyphToken) {
  const lane = getSubstrateLane(chunkModel, glyphToken);
  if (!lane) return null;
  return lane.vector ^ scalarMask(chunkModel.substrate.laneSeed, glyphToken);
}

function decodeGlyphTokens(chunkModel, glyphTokens, scope) {
  return glyphTokens
    .map((glyphToken) => {
      const scalar = decodeScalar(chunkModel, glyphToken);
      if (scope) scope.decodedChars += 1;
      return scalar != null ? codePointToChar(scalar) : "";
    })
    .join("");
}

function appendSearchChar(state, char, offset) {
  if (!char) return;
  if (/\s/.test(char)) {
    if (!state.text || state.text.endsWith(" ")) return;
    state.text += " ";
    state.offsets.push(Number.isFinite(offset) ? offset : null);
    return;
  }
  for (let index = 0; index < char.length; index += 1) {
    state.text += char.charAt(index);
    state.offsets.push(Number.isFinite(offset) ? offset : null);
  }
}

function appendSearchGap(state) {
  appendSearchChar(state, " ", null);
}

export function reconstructRangeText(chunkModel, startOffset, endOffset, scope = null) {
  if (startOffset == null || endOffset == null || endOffset <= startOffset) return "";
  const cacheKey = scope ? `${startOffset}:${endOffset}` : "";
  if (scope && scope.decodedRanges.has(cacheKey)) {
    return scope.decodedRanges.get(cacheKey);
  }

  const segments = chunkModel.textSegments || [];
  let cursor = startOffset;
  let output = "";

  for (const segment of segments) {
    if (segment.end <= startOffset) continue;
    if (segment.start >= endOffset) break;

    if (segment.start > cursor) {
      output += "\n".repeat(Math.min(segment.start - cursor, 2));
      cursor = segment.start;
    }

    const run = chunkModel.runBySegmentKey.get(`${segment.blockId}:${segment.runIndex}`);
    if (!run) continue;
    const sliceStart = Math.max(startOffset, segment.start) - segment.start;
    const sliceEnd = Math.min(endOffset, segment.end) - segment.start;
    const glyphTokens = (run.glyphTokens || []).slice(sliceStart, sliceEnd);
    output += decodeGlyphTokens(chunkModel, glyphTokens, scope);
    cursor = Math.min(endOffset, segment.end);
  }

  if (scope) {
    scope.decodedRanges.set(cacheKey, output);
    scope.cacheEntries = scope.decodedRanges.size;
  }
  return output;
}

export function reconstructSearchTextWithOffsets(chunkModel, startOffset, endOffset, scope = null) {
  if (startOffset == null || endOffset == null || endOffset <= startOffset) {
    return { text: "", offsets: [] };
  }

  const segments = chunkModel.textSegments || [];
  let cursor = startOffset;
  const state = { text: "", offsets: [] };

  for (const segment of segments) {
    if (segment.end <= startOffset) continue;
    if (segment.start >= endOffset) break;

    if (segment.start > cursor) {
      appendSearchGap(state);
      cursor = segment.start;
    }

    const run = chunkModel.runBySegmentKey.get(`${segment.blockId}:${segment.runIndex}`);
    if (!run) continue;
    const sliceStart = Math.max(startOffset, segment.start) - segment.start;
    const sliceEnd = Math.min(endOffset, segment.end) - segment.start;
    const glyphTokens = (run.glyphTokens || []).slice(sliceStart, sliceEnd);
    for (let index = 0; index < glyphTokens.length; index += 1) {
      const scalar = decodeScalar(chunkModel, glyphTokens[index]);
      if (scope) scope.decodedChars += 1;
      appendSearchChar(state, scalar != null ? codePointToChar(scalar) : "", segment.start + sliceStart + index);
    }
    cursor = Math.min(endOffset, segment.end);
  }

  return state;
}

export function reconstructVisibleWindow(chunkModel, pageWindow, scope = null) {
  if (!pageWindow) return "";
  return reconstructRangeText(chunkModel, pageWindow.startOffset, pageWindow.endOffset, scope);
}

export function reconstructSelectionRange(chunkModel, selectionResult, scope = null) {
  if (!selectionResult || selectionResult.isCollapsed) return "";
  return reconstructRangeText(chunkModel, selectionResult.startOffset, selectionResult.endOffset, scope);
}
