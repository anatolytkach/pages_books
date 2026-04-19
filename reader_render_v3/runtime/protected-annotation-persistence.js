function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeAnnotation(annotation) {
  if (!annotation || typeof annotation !== "object") return annotation;
  const normalized = cloneJson(annotation);
  if (normalized.metadata && typeof normalized.metadata === "object") {
    delete normalized.metadata.compatQuote;
    delete normalized.metadata.productionCompat;
  }
  return normalized;
}

export function normalizePersistedAnnotations(annotations) {
  return Array.isArray(annotations) ? annotations.map(normalizeAnnotation).filter(Boolean) : [];
}

export function extractAnnotationsFromBundle(bundle) {
  return normalizePersistedAnnotations(bundle && bundle.annotations);
}

export function assignAnnotationsToBundle(bundle, annotations) {
  return {
    ...bundle,
    annotations: normalizePersistedAnnotations(annotations)
  };
}
