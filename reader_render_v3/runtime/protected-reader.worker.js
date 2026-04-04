import { ProtectedReaderRuntimeCore } from "./protected-worker-core.js";
import { createWorkerResponse } from "./protected-worker-protocol.js";

const core = new ProtectedReaderRuntimeCore();

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.channel !== "protected-reader-v1") return;
  const { id, method, payload } = message;
  try {
    if (typeof core[method] !== "function") {
      throw new Error(`Unsupported worker method: ${method}`);
    }
    const result = await core[method](payload || {});
    self.postMessage(createWorkerResponse(id, true, result, null));
  } catch (error) {
    self.postMessage(createWorkerResponse(id, false, {}, {
      message: error && error.message ? error.message : String(error)
    }));
  }
});
