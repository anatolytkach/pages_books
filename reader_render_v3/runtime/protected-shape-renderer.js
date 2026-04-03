import { codePointToChar } from "./protected-text-reconstruction.js";

export function renderGlyphOps(ctx, glyphOps, shapeRegistry) {
  for (const op of glyphOps) {
    const shapeRecord = shapeRegistry.records.get(op.shapeRef) || null;
    const extractedPath = shapeRecord && shapeRecord.source === "extracted"
      ? shapeRegistry.getPath2D(shapeRecord)
      : null;
    ctx.save();
    ctx.fillStyle = "#18212f";
    if (shapeRecord && shapeRecord.primitiveType === "space") {
      ctx.restore();
      continue;
    }
    if (extractedPath && shapeRecord.unitsPerEm) {
      const scale = op.fontSize / shapeRecord.unitsPerEm;
      ctx.translate(op.x, op.baselineY);
      ctx.scale(scale, scale);
      ctx.fill(extractedPath);
    } else if (shapeRecord && shapeRecord.primitiveType !== "space") {
      ctx.font = `${op.fontSize}px ${op.fontFamilyCandidate || "Georgia, serif"}`;
      ctx.fillText(codePointToChar(op.codePoint), op.x, op.baselineY);
    }
    ctx.restore();
  }
}
