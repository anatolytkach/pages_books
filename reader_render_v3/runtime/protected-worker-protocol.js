export const PROTECTED_WORKER_METHODS = {
  INIT_BOOK: "initBook",
  GO_TO_CHUNK: "goToChunk",
  GO_TO_TOC: "goToToc",
  GO_TO_NEXT_PAGE: "goToNextPage",
  GO_TO_PREV_PAGE: "goToPrevPage",
  UPDATE_RENDER_CONFIG: "updateRenderConfig",
  POINTER_DOWN: "pointerDown",
  POINTER_MOVE: "pointerMove",
  POINTER_UP: "pointerUp",
  CLEAR_SELECTION: "clearSelection",
  REQUEST_COPY_PAYLOAD: "requestCopyPayload",
  GET_RESTORE_TOKEN: "getRestoreToken",
  RESTORE_FROM_TOKEN: "restoreFromToken",
  GET_SELECTION_RANGE: "getSelectionRange",
  GO_TO_ANNOTATION: "goToAnnotation",
  GET_RUNTIME_STATUS: "getRuntimeStatus"
};

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

function assertNoForbiddenSnapshotKeys(value, path = "payload") {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenSnapshotKeys(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, next] of Object.entries(value)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) {
      throw new Error(`Forbidden text-like field in protected snapshot: ${path}.${key}`);
    }
    assertNoForbiddenSnapshotKeys(next, `${path}.${key}`);
  }
}

export function sanitizeProtectedWorkerPayload(method, payload = {}) {
  if (method === PROTECTED_WORKER_METHODS.REQUEST_COPY_PAYLOAD) {
    return payload;
  }
  assertNoForbiddenSnapshotKeys(payload, "payload");
  if (payload && payload.renderPacket) {
    if (payload.renderPacket.renderMode && payload.renderPacket.renderMode !== "shape") {
      throw new Error("Protected worker snapshot must not expose non-shape render packets.");
    }
  }
  return payload;
}

export function createWorkerRequest(id, method, payload = {}) {
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
