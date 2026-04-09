export function createGlyphShapeRegistry(shapeBundle, glyphMap) {
  const records = new Map();
  const pathCache = new Map();
  const runtimeFontMode = shapeBundle && shapeBundle.runtimeFontMode ? shapeBundle.runtimeFontMode : "sans";
  const sourceCounts = { synthetic: 0, placeholder: 0, extracted: 0, missing: 0 };

  for (const record of (shapeBundle && shapeBundle.shapeRecords) || []) {
    records.set(record.shapeRef, record);
    sourceCounts[record.source] = (sourceCounts[record.source] || 0) + 1;
  }

  let covered = 0;
  let extractedGlyphs = 0;
  let syntheticGlyphs = 0;
  let placeholderGlyphs = 0;
  for (const glyph of glyphMap.values()) {
    if (glyph.shapeRef && records.has(glyph.shapeRef)) {
      covered += 1;
      const shape = records.get(glyph.shapeRef);
      if (shape.source === "extracted") extractedGlyphs += 1;
      else if (shape.source === "synthetic") syntheticGlyphs += 1;
      else if (shape.source === "placeholder") placeholderGlyphs += 1;
    } else {
      sourceCounts.missing += 1;
    }
  }

  const totalGlyphs = glyphMap.size;
  const coveragePercent = totalGlyphs ? Math.round((covered / totalGlyphs) * 100) : 0;
  const extractedCoveragePercent = totalGlyphs ? Math.round((extractedGlyphs / totalGlyphs) * 100) : 0;

  return {
    shapeBundle,
    runtimeFontMode,
    records,
    pathCache,
    sourceCounts,
    totalGlyphs,
    coveredGlyphs: covered,
    extractedGlyphs,
    syntheticGlyphs,
    placeholderGlyphs,
    coveragePercent,
    extractedCoveragePercent,
    getByGlyph(glyph) {
      if (!glyph || !glyph.shapeRef) return null;
      return records.get(glyph.shapeRef) || null;
    },
    getPath2D(shapeRecord) {
      if (!shapeRecord || !shapeRecord.pathData || typeof Path2D === "undefined") return null;
      const pathKey = `${runtimeFontMode}:${shapeRecord.shapeRef}`;
      if (!pathCache.has(pathKey)) {
        pathCache.set(pathKey, new Path2D(shapeRecord.pathData));
      }
      return pathCache.get(pathKey);
    }
  };
}
