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
