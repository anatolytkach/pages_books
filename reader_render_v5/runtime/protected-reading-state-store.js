function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function normalizePersistedReadingState(state) {
  if (!state || typeof state !== "object") return null;
  const normalized = cloneJson(state);
  delete normalized.compat;
  return normalized;
}

export function extractReadingStateFromBundle(bundle) {
  return normalizePersistedReadingState(bundle && bundle.readingState);
}

export function assignReadingStateToBundle(bundle, readingState) {
  return {
    ...bundle,
    readingState: normalizePersistedReadingState(readingState)
  };
}
