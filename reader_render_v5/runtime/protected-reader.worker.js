import { ProtectedReaderRuntimeCore } from "./protected-worker-core.js?v=20260425-v5-fast-font-mode";
import { createWorkerResponse, sanitizeProtectedWorkerPayload } from "./protected-worker-protocol.js";

const core = new ProtectedReaderRuntimeCore();

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.channel !== "protected-reader-v1") return;
  const { id, method, payload } = message;
  try {
    if (method === "requestCopyPayload") {
      throw new Error("Forbidden protected worker method: requestCopyPayload");
    }
    if (typeof core[method] !== "function") {
      throw new Error(`Unsupported worker method: ${method}`);
    }
    const result = await core[method](payload || {});
    self.postMessage(createWorkerResponse(id, true, sanitizeProtectedWorkerPayload(method, result), null));
  } catch (error) {
    self.postMessage(createWorkerResponse(id, false, {}, {
      message: error && error.message ? error.message : String(error)
    }));
  }
});
