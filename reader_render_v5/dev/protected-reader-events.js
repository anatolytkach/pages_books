export const PROTECTED_READER_CANONICAL_EVENT_NAMES = Object.freeze([
  "pageChanged",
  "selectionChanged",
  "searchStateChanged",
  "annotationsChanged",
  "themeChanged",
  "readingPositionChanged",
  "toolbarStateChanged"
]);

export const PROTECTED_READER_FORBIDDEN_INTERNAL_EVENT_NAMES = Object.freeze([
  "glyphLayoutUpdated",
  "chunkReflow",
  "protectedSelectionResolved",
  "internalRenderStateChanged",
  "workerStateChanged",
  "layoutInternalChanged"
]);

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeSelection(summary = {}) {
  return {
    active: !!summary.selectionActive,
    selectedChars: Number(summary.selectedChars || 0),
    focusedAnnotationId: summary.focusedAnnotationId ? String(summary.focusedAnnotationId) : "",
    selectionBounds: summary.selectionBounds ? cloneJson(summary.selectionBounds) : null
  };
}

function normalizeSearch(summary = {}) {
  const search = summary && summary.searchSummary ? summary.searchSummary : null;
  const rawMatches = Array.isArray(search && search.matches) ? search.matches : [];
  return {
    active: !!(search && search.active),
    query: search && search.query ? String(search.query) : "",
    totalMatches: Number(search && (search.totalMatches ?? search.matchCount) || 0),
    currentMatch: Number(search && search.currentMatch || 0),
    matchCount: Number(search && search.matchCount || rawMatches.length || 0),
    results: cloneJson(rawMatches)
  };
}

function normalizeAnnotations(summary = {}) {
  const annotations = Array.isArray(summary && summary.annotations) ? summary.annotations : [];
  return {
    annotationCount: Number(summary && summary.annotationCount || annotations.length || 0),
    focusedAnnotationId: summary && summary.focusedAnnotationId ? String(summary.focusedAnnotationId) : "",
    annotations: cloneJson(annotations)
  };
}

function normalizePage(summary = {}) {
  return {
    pageLabel: summary && summary.pageLabel ? String(summary.pageLabel) : "",
    globalPageLabel: summary && summary.globalPageLabel ? String(summary.globalPageLabel) : "",
    chapterLabel: summary && summary.chapterLabel ? String(summary.chapterLabel) : "",
    canGoPrev: !!(summary && summary.canGoPrev),
    canGoNext: !!(summary && summary.canGoNext),
    statusText: summary && summary.statusText ? String(summary.statusText) : ""
  };
}

function normalizeReadingPosition(summary = {}) {
  return {
    restoreToken: summary && summary.restoreToken ? String(summary.restoreToken) : "",
    globalStartOffset: Number(summary && summary.globalStartOffset || 0),
    pageGlobalStartOffset: Number(summary && summary.pageGlobalStartOffset || 0),
    pageLabel: summary && summary.pageLabel ? String(summary.pageLabel) : "",
    globalPageLabel: summary && summary.globalPageLabel ? String(summary.globalPageLabel) : ""
  };
}

function normalizeTheme(summary = {}) {
  return {
    theme: summary && summary.theme === "dark" ? "dark" : "light",
    fontScale: Number(summary && summary.fontScale || 1) || 1,
    fontMode: String(summary && (summary.runtimeFontMode || summary.fontMode) || "sans"),
    supportedFontModes: Array.isArray(summary && summary.supportedFontModes)
      ? summary.supportedFontModes.map((item) => String(item || ""))
      : []
  };
}

function normalizeToolbar(summary = {}) {
  const selection = normalizeSelection(summary);
  return {
    visible: !!(selection.active && selection.selectedChars > 0),
    source: selection.active ? "selection" : "none"
  };
}

export function buildProtectedReaderCanonicalEventPayloads(summary = {}) {
  return {
    pageChanged: normalizePage(summary),
    selectionChanged: normalizeSelection(summary),
    searchStateChanged: normalizeSearch(summary),
    annotationsChanged: normalizeAnnotations(summary),
    themeChanged: normalizeTheme(summary),
    readingPositionChanged: normalizeReadingPosition(summary),
    toolbarStateChanged: normalizeToolbar(summary)
  };
}

function createListenerRegistry() {
  const listeners = new Map();
  return {
    add(eventName, listener) {
      if (typeof listener !== "function") return () => {};
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
      return () => {
        const current = listeners.get(eventName);
        if (!current) return;
        current.delete(listener);
        if (!current.size) listeners.delete(eventName);
      };
    },
    remove(eventName, listener) {
      const current = listeners.get(eventName);
      if (!current) return;
      current.delete(listener);
      if (!current.size) listeners.delete(eventName);
    },
    emit(eventName, payload) {
      const deliver = (name, value) => {
        const bucket = listeners.get(name);
        if (!bucket || !bucket.size) return;
        for (const listener of [...bucket]) {
          try {
            listener(value, eventName);
          } catch (_error) {}
        }
      };
      deliver(eventName, payload);
      deliver("*", { type: eventName, payload });
    }
  };
}

export function createProtectedReaderEventChannel(options = {}) {
  const registry = createListenerRegistry();
  const history = [];
  const lastSerializedPayloads = new Map();
  const lastPayloads = new Map();

  function emit(eventName, payload, emitOptions = {}) {
    if (!PROTECTED_READER_CANONICAL_EVENT_NAMES.includes(eventName)) {
      throw new Error(`Unsupported protected reader contract event: ${eventName}`);
    }
    const serialized = JSON.stringify(payload == null ? null : payload);
    if (!emitOptions.force && lastSerializedPayloads.get(eventName) === serialized) return false;
    lastSerializedPayloads.set(eventName, serialized);
    const cloned = cloneJson(payload);
    lastPayloads.set(eventName, cloned);
    history.push({
      type: eventName,
      payload: cloned,
      at: Date.now()
    });
    while (history.length > 160) history.shift();
    registry.emit(eventName, cloned);
    if (typeof options.onEmit === "function") {
      try {
        options.onEmit(eventName, cloned);
      } catch (_error) {}
    }
    return true;
  }

  function emitFromSummary(summary, emitOptions = {}) {
    const payloads = buildProtectedReaderCanonicalEventPayloads(summary || {});
    for (const eventName of PROTECTED_READER_CANONICAL_EVENT_NAMES) {
      emit(eventName, payloads[eventName], emitOptions);
    }
  }

  return {
    channel: "protected-reader-events-v1",
    supportedEvents: PROTECTED_READER_CANONICAL_EVENT_NAMES.slice(),
    forbiddenInternalEvents: PROTECTED_READER_FORBIDDEN_INTERNAL_EVENT_NAMES.slice(),
    subscribe(eventName, listener) {
      return registry.add(eventName, listener);
    },
    unsubscribe(eventName, listener) {
      registry.remove(eventName, listener);
    },
    emit,
    emitFromSummary,
    getHistory() {
      return cloneJson(history);
    },
    getLastPayload(eventName) {
      return cloneJson(lastPayloads.get(eventName) || null);
    }
  };
}
