export const PROTECTED_WORKER_METHODS = {
  INIT_BOOK: "initBook",
  GO_TO_CHUNK: "goToChunk",
  GO_TO_TOC: "goToToc",
  GO_TO_NEXT_PAGE: "goToNextPage",
  GO_TO_PREV_PAGE: "goToPrevPage",
  PREVIEW_NEIGHBOR_PAGE: "previewNeighborPage",
  SELECT_AUTOMATION_SAMPLE: "selectAutomationSample",
  SET_FONT_SCALE: "setFontScale",
  SEARCH_BOOK: "searchBook",
  GET_SEARCH_RESULTS: "getSearchResults",
  GO_TO_SEARCH_RESULT: "goToSearchResult",
  SEARCH_NEXT_RESULT: "searchNextResult",
  SEARCH_PREV_RESULT: "searchPrevResult",
  CLEAR_SEARCH: "clearSearch",
  UPDATE_RENDER_CONFIG: "updateRenderConfig",
  POINTER_DOWN: "pointerDown",
  SELECT_WORD_AT_POINT: "selectWordAtPoint",
  POINTER_MOVE: "pointerMove",
  POINTER_UP: "pointerUp",
  CLEAR_SELECTION: "clearSelection",
  COPY_CURRENT_SELECTION: "copyCurrentSelection",
  CREATE_ANNOTATION_FROM_CURRENT_SELECTION: "createAnnotationFromCurrentSelection",
  GET_RESTORE_TOKEN: "getRestoreToken",
  RESTORE_FROM_TOKEN: "restoreFromToken",
  GET_SELECTION_RANGE: "getSelectionRange",
  GO_TO_ANNOTATION: "goToAnnotation",
  GET_RUNTIME_STATUS: "getRuntimeStatus"
};

const FORBIDDEN_GENERIC_TEXT_METHODS = new Set([
  "requestCopyPayload",
  "requestRangeText",
  "getPageText",
  "getChunkText",
  "getVisibleText"
]);

const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "text",
  "textFragments",
  "fragmentText",
  "fragmentsText",
  "pageText",
  "pageTexts",
  "lineText",
  "lineTexts",
  "segmentText",
  "segmentTexts",
  "visibleText",
  "selectionText",
  "excerpt",
  "excerptText",
  "quote",
  "quoteText",
  "previewText",
  "copyTextPreview",
  "fullText"
]);

export function assertNoForbiddenTextLikeFields(value, path = "payload") {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenTextLikeFields(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, next] of Object.entries(value)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) {
      throw new Error(`Forbidden text-like field in protected snapshot: ${path}.${key}`);
    }
    assertNoForbiddenTextLikeFields(next, `${path}.${key}`);
  }
}

function assertAllowedObjectKeys(value, allowedKeys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Protected worker payload must be an object: ${path}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field in protected worker payload: ${path}.${key}`);
    }
  }
}

function sanitizeCopyCurrentSelectionPayload(payload = {}) {
  assertAllowedObjectKeys(
    payload,
    new Set(["success", "clipboardText", "selectedChars", "selectedBlocks", "selectedLines"]),
    "payload"
  );
  if (payload.success !== true) {
    throw new Error("COPY_CURRENT_SELECTION must succeed with a narrow payload.");
  }
  if (typeof payload.clipboardText !== "string") {
    throw new Error("COPY_CURRENT_SELECTION must return clipboardText.");
  }
  return {
    success: true,
    clipboardText: payload.clipboardText,
    selectedChars: Number(payload.selectedChars || 0),
    selectedBlocks: Number(payload.selectedBlocks || 0),
    selectedLines: Number(payload.selectedLines || 0)
  };
}

function sanitizeAnnotationAnchor(anchor) {
  assertAllowedObjectKeys(
    anchor,
    new Set(["chunkId", "startOffset", "endOffset", "restoreToken"]),
    "payload.anchor"
  );
  return {
    chunkId: String(anchor.chunkId || ""),
    startOffset: Number(anchor.startOffset || 0),
    endOffset: Number(anchor.endOffset || 0),
    restoreToken: String(anchor.restoreToken || "")
  };
}

function sanitizeCreateAnnotationPayload(payload = {}) {
  const allowedKeys = new Set([
    "annotationId",
    "type",
    "bookId",
    "rangeDescriptor",
    "color",
    "createdAt",
    "updatedAt",
    "metadata",
    "highlightId",
    "noteText",
    "anchor",
    "quoteHash",
    "selectedChars",
    "selectedBlocks",
    "selectedLines"
  ]);
  assertAllowedObjectKeys(payload, allowedKeys, "payload");
  if (payload.type !== "highlight" && payload.type !== "note") {
    throw new Error("CREATE_ANNOTATION_FROM_CURRENT_SELECTION returned invalid annotation type.");
  }
  assertNoForbiddenTextLikeFields(payload.metadata || {}, "payload.metadata");
  return {
    ...payload,
    anchor: sanitizeAnnotationAnchor(payload.anchor || {}),
    quoteHash: String(payload.quoteHash || ""),
    selectedChars: Number(payload.selectedChars || 0),
    selectedBlocks: Number(payload.selectedBlocks || 0),
    selectedLines: Number(payload.selectedLines || 0),
    noteText: payload.type === "note" ? String(payload.noteText || "") : undefined
  };
}

function sanitizeSearchResultsPayload(payload = {}) {
  assertAllowedObjectKeys(
    payload,
    new Set(["active", "query", "totalMatches", "currentMatch", "matches"]),
    "payload"
  );
  const matches = Array.isArray(payload.matches)
    ? payload.matches.map((match, index) => {
        assertAllowedObjectKeys(
          match || {},
          new Set(["chunkIndex", "chunkId", "globalStartOffset", "globalEndOffset", "excerpt", "globalPageLabel", "current"]),
          `payload.matches[${index}]`
        );
        return {
          chunkIndex: Number(match.chunkIndex || 0),
          chunkId: String(match.chunkId || ""),
          globalStartOffset: Number(match.globalStartOffset || 0),
          globalEndOffset: Number(match.globalEndOffset || 0),
          excerpt: String(match.excerpt || ""),
          globalPageLabel: String(match.globalPageLabel || ""),
          current: !!match.current
        };
      })
    : [];
  return {
    active: !!payload.active,
    query: String(payload.query || ""),
    totalMatches: Number(payload.totalMatches || matches.length || 0),
    currentMatch: Number(payload.currentMatch || 0),
    matches
  };
}

export function sanitizeProtectedWorkerPayload(method, payload = {}) {
  if (FORBIDDEN_GENERIC_TEXT_METHODS.has(method)) {
    throw new Error(`Forbidden protected worker method: ${method}`);
  }
  if (method === PROTECTED_WORKER_METHODS.GET_SEARCH_RESULTS) {
    return sanitizeSearchResultsPayload(payload);
  }
  if (method === PROTECTED_WORKER_METHODS.COPY_CURRENT_SELECTION) {
    return sanitizeCopyCurrentSelectionPayload(payload);
  }
  if (method === PROTECTED_WORKER_METHODS.CREATE_ANNOTATION_FROM_CURRENT_SELECTION) {
    return sanitizeCreateAnnotationPayload(payload);
  }
  assertNoForbiddenTextLikeFields(payload, "payload");
  if (payload && payload.renderPacket) {
    if (payload.renderPacket.renderMode && payload.renderPacket.renderMode !== "shape") {
      throw new Error("Protected worker snapshot must not expose non-shape render packets.");
    }
  }
  return payload;
}

export function createWorkerRequest(id, method, payload = {}) {
  if (FORBIDDEN_GENERIC_TEXT_METHODS.has(method)) {
    throw new Error(`Forbidden protected worker method: ${method}`);
  }
  return {
    channel: "protected-reader-v1",
    id,
    method,
    payload
  };
}

export function createWorkerResponse(id, ok, payload = {}, error = null) {
  return {
    channel: "protected-reader-v1",
    id,
    ok,
    payload,
    error
  };
}
