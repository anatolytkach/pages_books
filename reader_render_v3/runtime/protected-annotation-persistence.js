function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function normalizePersistedAnnotations(annotations) {
  return Array.isArray(annotations) ? cloneJson(annotations) : [];
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
