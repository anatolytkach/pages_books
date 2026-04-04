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

const ANNOTATION_CONTEXT_LIMIT = 48;

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
    "quote",
    "quoteHash",
    "contextBefore",
    "contextAfter",
    "selectedChars",
    "selectedBlocks",
    "selectedLines"
  ]);
  assertAllowedObjectKeys(payload, allowedKeys, "payload");
  if (payload.type !== "highlight" && payload.type !== "note") {
    throw new Error("CREATE_ANNOTATION_FROM_CURRENT_SELECTION returned invalid annotation type.");
  }
  const contextBefore = String(payload.contextBefore || "");
  const contextAfter = String(payload.contextAfter || "");
  if (contextBefore.length > ANNOTATION_CONTEXT_LIMIT || contextAfter.length > ANNOTATION_CONTEXT_LIMIT) {
    throw new Error("CREATE_ANNOTATION_FROM_CURRENT_SELECTION exceeded context limits.");
  }
  return {
    ...payload,
    anchor: sanitizeAnnotationAnchor(payload.anchor || {}),
    quote: String(payload.quote || ""),
    quoteHash: String(payload.quoteHash || ""),
    contextBefore,
    contextAfter,
    selectedChars: Number(payload.selectedChars || 0),
    selectedBlocks: Number(payload.selectedBlocks || 0),
    selectedLines: Number(payload.selectedLines || 0),
    noteText: payload.type === "note" ? String(payload.noteText || "") : undefined
  };
}

export function sanitizeProtectedWorkerPayload(method, payload = {}) {
  if (FORBIDDEN_GENERIC_TEXT_METHODS.has(method)) {
    throw new Error(`Forbidden protected worker method: ${method}`);
  }
  if (method === PROTECTED_WORKER_METHODS.COPY_CURRENT_SELECTION) {
    return sanitizeCopyCurrentSelectionPayload(payload);
  }
  if (method === PROTECTED_WORKER_METHODS.CREATE_ANNOTATION_FROM_CURRENT_SELECTION) {
    return sanitizeCreateAnnotationPayload(payload);
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
