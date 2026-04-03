function findLine(layout, x, y) {
  return layout.lines.find((line) =>
    y >= line.y &&
    y <= line.y + line.height &&
    x >= line.x &&
    x <= line.x + line.width + 12
  ) || null;
}

function nearestOffsetInFragment(fragment, x) {
  if (!fragment.charPositions || !fragment.charPositions.length) {
    return fragment.startOffset;
  }
  const localX = Math.max(0, x - fragment.x);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < fragment.charPositions.length; index += 1) {
    const distance = Math.abs(fragment.charPositions[index] - localX);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return fragment.startOffset + bestIndex;
}

export function hitTestPosition(layout, x, y) {
  const line = findLine(layout, x, y);
  if (!line) return null;

  let target = line.fragments.find((fragment) => x >= fragment.x && x <= fragment.x + fragment.width) || null;
  if (!target) {
    if (x <= line.x) {
      target = line.fragments[0] || null;
      if (!target) return null;
      return {
        blockId: target.blockId,
        lineIndex: line.lineIndex,
        fragmentIndex: target.fragmentIndex,
        segmentId: target.segmentId,
        offset: target.startOffset
      };
    }
    target = line.fragments[line.fragments.length - 1] || null;
    if (!target) return null;
    return {
      blockId: target.blockId,
      lineIndex: line.lineIndex,
      fragmentIndex: target.fragmentIndex,
      segmentId: target.segmentId,
      offset: target.endOffset
    };
  }

  return {
    blockId: target.blockId,
    lineIndex: line.lineIndex,
    fragmentIndex: target.fragmentIndex,
    segmentId: target.segmentId,
    offset: nearestOffsetInFragment(target, x)
  };
}
