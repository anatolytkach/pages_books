import worker from "../../_worker.js";

export function createAssetsMock({
  body = "asset-body",
  status = 200,
  headers = { "content-type": "text/plain; charset=utf-8" },
} = {}) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(request.url);
      return new Response(body, { status, headers });
    },
  };
}

export function createEnv(overrides = {}) {
  return {
    ASSETS: createAssetsMock(),
    ...overrides,
  };
}

export async function callWorker({
  url = "https://reader.pub/books/ping",
  method = "GET",
  headers = {},
  body,
  env = createEnv(),
} = {}) {
  const requestHeaders = new Headers(headers);
  let requestBody = undefined;

  if (body !== undefined) {
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  const request = new Request(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });
  return worker.fetch(request, env);
}

export async function readJson(response) {
  return JSON.parse(await response.text());
}

export function patchGlobal(name, value) {
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, name);
  const previous = globalThis[name];
  globalThis[name] = value;
  return () => {
    if (hadOwn) {
      globalThis[name] = previous;
      return;
    }
    delete globalThis[name];
  };
}

export function createFetchMockSequence(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) {
    throw new Error("createFetchMockSequence requires at least one item");
  }

  const calls = [];
  let index = 0;
  const mock = async (...args) => {
    calls.push(args);
    const item = sequence[Math.min(index, sequence.length - 1)];
    index += 1;

    if (item instanceof Error) {
      throw item;
    }
    if (typeof item === "function") {
      return item(...args);
    }
    return item;
  };

  mock.calls = calls;
  return mock;
}

export function createR2Object({
  body = "",
  httpEtag = '"mock-etag"',
  contentType = "application/json; charset=utf-8",
  extraHeaders = {},
} = {}) {
  return {
    body,
    httpEtag,
    async json() {
      return JSON.parse(typeof body === "string" ? body : String(body));
    },
    async text() {
      return typeof body === "string" ? body : String(body);
    },
    writeHttpMetadata(headers) {
      if (contentType) {
        headers.set("content-type", contentType);
      }
      for (const [header, value] of Object.entries(extraHeaders)) {
        headers.set(header, value);
      }
    },
  };
}

export function createR2Bucket({ objectsByKey = {} } = {}) {
  const calls = [];
  const putCalls = [];
  const stored = { ...objectsByKey };
  return {
    calls,
    putCalls,
    async get(key) {
      calls.push(key);
      return stored[key] ?? null;
    },
    async put(key, body, options = {}) {
      putCalls.push({ key, body, options });
      const contentType = options?.httpMetadata?.contentType || "application/octet-stream";
      stored[key] = createR2Object({
        body: typeof body === "string" ? body : String(body),
        contentType,
      });
    },
  };
}

export class HTMLRewriterMock {
  static instances = [];

  constructor() {
    this.rules = [];
    this.attributeCalls = [];
    HTMLRewriterMock.instances.push(this);
  }

  on(selector, handlers) {
    this.rules.push({ selector, handlers });
    return this;
  }

  transform(response) {
    for (const rule of this.rules) {
      if (typeof rule.handlers?.element === "function") {
        rule.handlers.element({
          setAttribute: (name, value) => {
            this.attributeCalls.push({
              selector: rule.selector,
              name,
              value,
            });
          },
        });
      }
    }
    return response;
  }

  static reset() {
    HTMLRewriterMock.instances = [];
  }

  static lastInstance() {
    return HTMLRewriterMock.instances[HTMLRewriterMock.instances.length - 1] ?? null;
  }
}
