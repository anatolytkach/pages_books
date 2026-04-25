function buildGlyphBoxes(charPositions, lineHeight, baselineOffset = 0) {
  const boxes = [];
  for (let index = 0; index < charPositions.length - 1; index += 1) {
    const start = charPositions[index];
    const end = charPositions[index + 1];
    boxes.push({
      index,
      x: start,
      width: Math.max(0, end - start),
      top: baselineOffset - lineHeight,
      bottom: baselineOffset
    });
  }
  return boxes;
}

function nearestOffsetFromGlyphBoxes(fragment, x) {
  const boxes = fragment.glyphBoxes || [];
  if (!boxes.length) return fragment.startOffset;
  const localX = Math.max(0, x - fragment.x);
  for (const box of boxes) {
    if (localX >= box.x && localX <= box.x + box.width) {
      const midpoint = box.x + box.width / 2;
      return fragment.startOffset + (localX < midpoint ? box.index : box.index + 1);
    }
  }
  if (localX <= boxes[0].x) return fragment.startOffset;
  const last = boxes[boxes.length - 1];
  if (localX >= last.x + last.width) return fragment.endOffset;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    const midpoint = box.x + box.width / 2;
    const distance = Math.abs(localX - midpoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = localX < midpoint ? box.index : box.index + 1;
    }
  }
  return fragment.startOffset + bestIndex;
}

export {
  buildGlyphBoxes,
  nearestOffsetFromGlyphBoxes
};
