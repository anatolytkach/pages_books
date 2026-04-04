function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function normalizeProtectedFileState(payload = {}) {
  return {
    readingState: payload && payload.readingState ? cloneJson(payload.readingState) : null,
    annotations: Array.isArray(payload && payload.annotations) ? cloneJson(payload.annotations) : []
  };
}

export function buildProtectedFileState({ readingState = null, annotations = [] } = {}) {
  return normalizeProtectedFileState({
    readingState,
    annotations
  });
}
