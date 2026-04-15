import { nearestOffsetFromGlyphBoxes } from "./protected-shape-offset-map.js";

function findLine(layout, x, y) {
  return layout.lines.find((line) => {
    const withinY = y >= line.y && y <= line.y + line.height;
    if (!withinY) return false;
    const maxRight = line.x + Math.max(line.width, line.maxWidth || line.width) + 12;
    return x >= line.x && x <= maxRight;
  }) || null;
}

function nearestOffsetInFragment(fragment, x) {
  if (fragment.glyphBoxes && fragment.glyphBoxes.length) {
    return nearestOffsetFromGlyphBoxes(fragment, x);
  }
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
  const projectionMeta = layout && layout.projectionMeta ? { ...layout.projectionMeta } : null;

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
        offset: target.startOffset,
        projectionMeta,
        hitTestingBackend: layout.hitTestingBackend || "text-geometry",
        precisionMode: layout.selectionPrecisionMode || "text-metrics-approx"
      };
    }
    target = line.fragments[line.fragments.length - 1] || null;
    if (!target) return null;
    return {
      blockId: target.blockId,
      lineIndex: line.lineIndex,
      fragmentIndex: target.fragmentIndex,
      segmentId: target.segmentId,
      offset: target.endOffset,
      projectionMeta,
      hitTestingBackend: layout.hitTestingBackend || "text-geometry",
      precisionMode: layout.selectionPrecisionMode || "text-metrics-approx"
    };
  }

  return {
    blockId: target.blockId,
    lineIndex: line.lineIndex,
    fragmentIndex: target.fragmentIndex,
    segmentId: target.segmentId,
    offset: nearestOffsetInFragment(target, x),
    projectionMeta,
    hitTestingBackend: layout.hitTestingBackend || "text-geometry",
    precisionMode: layout.selectionPrecisionMode || "text-metrics-approx"
  };
}
