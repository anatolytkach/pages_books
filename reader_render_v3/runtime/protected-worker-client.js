import { ProtectedReaderRuntimeCore } from "./protected-worker-core.js";
import { PROTECTED_WORKER_METHODS, createWorkerRequest } from "./protected-worker-protocol.js";

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

class FallbackTransport {
  constructor() {
    this.core = new ProtectedReaderRuntimeCore();
  }

  async call(method, payload = {}) {
    if (typeof this.core[method] !== "function") {
      throw new Error(`Unsupported fallback method: ${method}`);
    }
    return this.core[method](payload);
  }
}

export function createProtectedWorkerClient() {
  const offscreenAvailable = typeof OffscreenCanvas !== "undefined";
  let transport = null;
  let mode = "fallback-main-thread";
  try {
    if (typeof Worker !== "undefined") {
      transport = new WorkerTransport();
      mode = "worker";
    } else {
      transport = new FallbackTransport();
    }
  } catch {
    transport = new FallbackTransport();
  }

  function decorateResult(result) {
    if (!result || mode === "worker") return result;
    if (result.runtimeMeta) {
      result.runtimeMeta = {
        ...result.runtimeMeta,
        workerMode: "fallback-main-thread",
        reconstructionHost: "main-thread-fallback",
        layoutHost: "main-thread-fallback",
        copyHost: "main-thread-fallback",
        renderPreparationHost: "main-thread-fallback"
      };
    }
    if (result.renderPacket && result.renderPacket.diagnostics) {
      result.renderPacket.diagnostics = {
        ...result.renderPacket.diagnostics,
        reconstructionHost: "main-thread-fallback",
        layoutHost: "main-thread-fallback",
        copyHost: "main-thread-fallback",
        renderPreparationHost: "main-thread-fallback"
      };
    }
    return result;
  }

  return {
    mode,
    offscreenCanvas: offscreenAvailable ? "available" : "not-available",
    async initBook(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.INIT_BOOK, payload));
    },
    async goToChunk(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.GO_TO_CHUNK, payload));
    },
    async goToToc(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.GO_TO_TOC, payload));
    },
    async goToNextPage(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.GO_TO_NEXT_PAGE, payload));
    },
    async goToPrevPage(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.GO_TO_PREV_PAGE, payload));
    },
    async updateRenderConfig(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.UPDATE_RENDER_CONFIG, payload));
    },
    async pointerDown(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.POINTER_DOWN, payload));
    },
    async pointerMove(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.POINTER_MOVE, payload));
    },
    async pointerUp(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.POINTER_UP, payload));
    },
    async clearSelection(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.CLEAR_SELECTION, payload));
    },
    async requestCopyPayload(payload) {
      return transport.call(PROTECTED_WORKER_METHODS.REQUEST_COPY_PAYLOAD, payload);
    },
    async getRestoreToken(payload) {
      return transport.call(PROTECTED_WORKER_METHODS.GET_RESTORE_TOKEN, payload);
    },
    async restoreFromToken(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.RESTORE_FROM_TOKEN, payload));
    },
    async getSelectionRange(payload) {
      return transport.call(PROTECTED_WORKER_METHODS.GET_SELECTION_RANGE, payload);
    },
    async goToAnnotation(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.GO_TO_ANNOTATION, payload));
    },
    async getRuntimeStatus(payload) {
      return decorateResult(await transport.call(PROTECTED_WORKER_METHODS.GET_RUNTIME_STATUS, payload));
    }
  };
}
