import { ProtectedReaderRuntimeCore } from "./protected-worker-core.js";
import {
  PROTECTED_WORKER_METHODS,
  createWorkerRequest,
  sanitizeProtectedWorkerPayload
} from "./protected-worker-protocol.js";

class WorkerTransport {
  constructor() {
    this.worker = new Worker(new URL("./protected-reader.worker.js", import.meta.url), { type: "module" });
    this.pending = new Map();
    this.requestId = 0;
    this.worker.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.channel !== "protected-reader-v1") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.payload);
      else pending.reject(new Error((message.error && message.error.message) || "Worker request failed."));
    });
  }

  async call(method, payload = {}) {
    const id = ++this.requestId;
    const request = createWorkerRequest(id, method, payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }
}

export function createProtectedWorkerClient(options = {}) {
  const offscreenAvailable = typeof OffscreenCanvas !== "undefined";
  let transport = null;
  let mode = "unavailable";
  let unavailableReason = "Protected mode is unavailable in this environment.";
  try {
    if (options.forceUnavailable) {
      unavailableReason = "Protected mode is unavailable in this environment.";
    } else if (typeof Worker !== "undefined") {
      transport = new WorkerTransport();
      mode = "worker";
    } else {
      unavailableReason = "Protected mode requires a secure worker host.";
    }
  } catch (error) {
    unavailableReason =
      (error && error.message) || "Protected mode requires a secure worker host.";
  }

  function ensureSecureWorker() {
    if (mode !== "worker" || !transport) {
      throw new Error(unavailableReason);
    }
  }

  function decorateResult(method, result) {
    if (!result) return result;
    return sanitizeProtectedWorkerPayload(method, result);
  }

  return {
    mode,
    unavailableReason,
    offscreenCanvas: offscreenAvailable ? "available" : "not-available",
    async initBook(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.INIT_BOOK, await transport.call(PROTECTED_WORKER_METHODS.INIT_BOOK, payload));
    },
    async goToChunk(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GO_TO_CHUNK, await transport.call(PROTECTED_WORKER_METHODS.GO_TO_CHUNK, payload));
    },
    async goToToc(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GO_TO_TOC, await transport.call(PROTECTED_WORKER_METHODS.GO_TO_TOC, payload));
    },
    async goToNextPage(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GO_TO_NEXT_PAGE, await transport.call(PROTECTED_WORKER_METHODS.GO_TO_NEXT_PAGE, payload));
    },
    async goToPrevPage(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GO_TO_PREV_PAGE, await transport.call(PROTECTED_WORKER_METHODS.GO_TO_PREV_PAGE, payload));
    },
    async previewNeighborPage(payload) {
      ensureSecureWorker();
      return decorateResult(
        PROTECTED_WORKER_METHODS.PREVIEW_NEIGHBOR_PAGE,
        await transport.call(PROTECTED_WORKER_METHODS.PREVIEW_NEIGHBOR_PAGE, payload)
      );
    },
    async selectAutomationSample(payload) {
      ensureSecureWorker();
      return decorateResult(
        PROTECTED_WORKER_METHODS.SELECT_AUTOMATION_SAMPLE,
        await transport.call(PROTECTED_WORKER_METHODS.SELECT_AUTOMATION_SAMPLE, payload)
      );
    },
    async setFontScale(payload) {
      ensureSecureWorker();
      return decorateResult(
        PROTECTED_WORKER_METHODS.SET_FONT_SCALE,
        await transport.call(PROTECTED_WORKER_METHODS.SET_FONT_SCALE, payload)
      );
    },
    async searchBook(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.SEARCH_BOOK, await transport.call(PROTECTED_WORKER_METHODS.SEARCH_BOOK, payload));
    },
    async getSearchResults(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GET_SEARCH_RESULTS, await transport.call(PROTECTED_WORKER_METHODS.GET_SEARCH_RESULTS, payload));
    },
    async goToSearchResult(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GO_TO_SEARCH_RESULT, await transport.call(PROTECTED_WORKER_METHODS.GO_TO_SEARCH_RESULT, payload));
    },
    async searchNextResult(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.SEARCH_NEXT_RESULT, await transport.call(PROTECTED_WORKER_METHODS.SEARCH_NEXT_RESULT, payload));
    },
    async searchPrevResult(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.SEARCH_PREV_RESULT, await transport.call(PROTECTED_WORKER_METHODS.SEARCH_PREV_RESULT, payload));
    },
    async clearSearch(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.CLEAR_SEARCH, await transport.call(PROTECTED_WORKER_METHODS.CLEAR_SEARCH, payload));
    },
    async updateRenderConfig(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.UPDATE_RENDER_CONFIG, await transport.call(PROTECTED_WORKER_METHODS.UPDATE_RENDER_CONFIG, payload));
    },
    async pointerDown(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.POINTER_DOWN, await transport.call(PROTECTED_WORKER_METHODS.POINTER_DOWN, payload));
    },
    async selectWordAtPoint(payload) {
      ensureSecureWorker();
      return decorateResult(
        PROTECTED_WORKER_METHODS.SELECT_WORD_AT_POINT,
        await transport.call(PROTECTED_WORKER_METHODS.SELECT_WORD_AT_POINT, payload)
      );
    },
    async pointerMove(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.POINTER_MOVE, await transport.call(PROTECTED_WORKER_METHODS.POINTER_MOVE, payload));
    },
    async pointerUp(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.POINTER_UP, await transport.call(PROTECTED_WORKER_METHODS.POINTER_UP, payload));
    },
    async clearSelection(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.CLEAR_SELECTION, await transport.call(PROTECTED_WORKER_METHODS.CLEAR_SELECTION, payload));
    },
    async copyCurrentSelection(payload) {
      ensureSecureWorker();
      return transport.call(PROTECTED_WORKER_METHODS.COPY_CURRENT_SELECTION, payload);
    },
    async createAnnotationFromCurrentSelection(payload) {
      ensureSecureWorker();
      return transport.call(PROTECTED_WORKER_METHODS.CREATE_ANNOTATION_FROM_CURRENT_SELECTION, payload);
    },
    async getRestoreToken(payload) {
      ensureSecureWorker();
      return transport.call(PROTECTED_WORKER_METHODS.GET_RESTORE_TOKEN, payload);
    },
    async restoreFromToken(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.RESTORE_FROM_TOKEN, await transport.call(PROTECTED_WORKER_METHODS.RESTORE_FROM_TOKEN, payload));
    },
    async getSelectionRange(payload) {
      ensureSecureWorker();
      return transport.call(PROTECTED_WORKER_METHODS.GET_SELECTION_RANGE, payload);
    },
    async goToAnnotation(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GO_TO_ANNOTATION, await transport.call(PROTECTED_WORKER_METHODS.GO_TO_ANNOTATION, payload));
    },
    async getRuntimeStatus(payload) {
      ensureSecureWorker();
      return decorateResult(PROTECTED_WORKER_METHODS.GET_RUNTIME_STATUS, await transport.call(PROTECTED_WORKER_METHODS.GET_RUNTIME_STATUS, payload));
    }
  };
}
