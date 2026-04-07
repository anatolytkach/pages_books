export function renderGlyphOps(ctx, glyphOps, shapeRegistry, options = {}) {
  const defaultFillStyle = options.defaultFillStyle || "#18212f";
  for (const op of glyphOps) {
    const shapeRecord = shapeRegistry.records.get(op.shapeRef) || null;
    const extractedPath = shapeRecord && shapeRecord.source === "extracted"
      ? shapeRegistry.getPath2D(shapeRecord)
      : null;
    ctx.save();
    ctx.fillStyle = op.fillStyle || defaultFillStyle;
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
      const height = Math.max(2, op.height * 0.72);
      const y = op.baselineY - height;
      ctx.fillRect(op.x, y, Math.max(1.2, op.advance * 0.82), height);
    }
    ctx.restore();
  }
}
