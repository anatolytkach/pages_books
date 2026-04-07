import { parseProductionShareState } from "../runtime/protected-share-state.js";

function isNumericId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function getStoredValue(key) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key) || "";
    }
  } catch (error) {}
  return "";
}

function normalizeBookId(url) {
  const params = url.searchParams;
  const rawHash = String(url.hash || "").replace(/^#/, "");
  const explicit =
    String(params.get("id") || "").trim() ||
    String(params.get("i") || "").trim() ||
    (isNumericId(rawHash) ? rawHash : "");
  if (isNumericId(explicit)) return explicit;
  const lastId = String(getStoredValue("readerpub:lastid") || "").trim();
  return isNumericId(lastId) ? lastId : "";
}

function normalizeSource(url, bookId) {
  const params = url.searchParams;
  let source = String(params.get("source") || "").trim();
  if (source === "gutenberg") source = "";
  if (source) return source;
  if (bookId) return "";
  const lastSource = String(getStoredValue("readerpub:lastsource") || "").trim();
  return lastSource && lastSource !== "gutenberg" ? lastSource : "";
}

function resolveReaderBasePath(url) {
  const hostname = String(url && url.hostname ? url.hostname : "").trim().toLowerCase();
  const pathname = String(url && url.pathname ? url.pathname : "").trim();
  if (pathname.startsWith("/reader/")) return "/reader/";
  if (hostname.endsWith(".pages.dev")) return "/reader/";
  return "/books/reader/";
}

function resolveProtectedArtifactRoot(url, bookId) {
  const artifactSource = String(
    url.searchParams.get("protectedArtifactSource") ||
      url.searchParams.get("artifactSource") ||
      ""
  )
    .trim()
    .toLowerCase();
  if (artifactSource === "r2" && bookId) {
    const hostname = String(url && url.hostname ? url.hostname : "").trim().toLowerCase();
    const baseOrigin = hostname.endsWith(".pages.dev") ? "https://reader.pub" : url.origin;
    return `${baseOrigin}/books/protected-content/${encodeURIComponent(bookId)}`;
  }
  return bookId
    ? `/reader_render_v3/artifacts/protected-books/${encodeURIComponent(bookId)}`
    : "/reader_render_v3/artifacts/protected-books/19686";
}

export function parseProtectedIntegrationRoute(input = window.location.href) {
  const baseOrigin =
    typeof window !== "undefined" && window.location && window.location.origin
      ? window.location.origin
      : "http://127.0.0.1";
  const url = input instanceof URL ? new URL(input.toString()) : new URL(String(input), baseOrigin);
  const bookId = normalizeBookId(url);
  const source = normalizeSource(url, bookId);
  const shareState = parseProductionShareState(url);
  const explicitRestoreToken =
    String(url.searchParams.get("restoreToken") || "").trim() ||
    String(url.searchParams.get("rt") || "").trim() ||
    "";
  const readerBasePath = resolveReaderBasePath(url);
  const artifactRoot = resolveProtectedArtifactRoot(url, bookId);

  const oldReaderUrl = new URL(readerBasePath, url.origin);
  const protectedUrl = new URL(readerBasePath, url.origin);

  if (bookId) {
    oldReaderUrl.searchParams.set("id", bookId);
    protectedUrl.searchParams.set("id", bookId);
  }
  if (source) {
    oldReaderUrl.searchParams.set("source", source);
    protectedUrl.searchParams.set("source", source);
  }
  for (const key of ["entry", "catalog_return", "autostart", "title", "slug", "renderMode", "metricsMode", "debugGeometry"]) {
    const value = String(url.searchParams.get(key) || "").trim();
    if (value) {
      oldReaderUrl.searchParams.set(key, value);
      protectedUrl.searchParams.set(key, value);
    }
  }
  for (const key of ["n", "notesShare", "notes", "notesz"]) {
    const value = String(url.searchParams.get(key) || "").trim();
    if (value) {
      oldReaderUrl.searchParams.set(key, value);
      protectedUrl.searchParams.set(key, value);
    }
  }
  protectedUrl.searchParams.set("reader", "protected");
  if (url.hash) {
    oldReaderUrl.hash = url.hash;
    protectedUrl.hash = url.hash;
  }

  const lastCfi = bookId ? String(getStoredValue(`readerpub:lastcfi:${bookId}`) || "").trim() : "";
  const uxValue = String(
    url.searchParams.get("protectedUx") ||
      url.searchParams.get("ux") ||
      url.searchParams.get("shell") ||
      ""
  )
    .trim()
    .toLowerCase();
  const driveValue = String(
    url.searchParams.get("protectedDrive") ||
      url.searchParams.get("driveMode") ||
      ""
  )
    .trim()
    .toLowerCase();
  const embeddedValue = String(
    url.searchParams.get("embedded") ||
      url.searchParams.get("embeddedMode") ||
      ""
  )
    .trim()
    .toLowerCase();
  const automationSafe =
    String(url.searchParams.get("protectedAutomation") || "").trim() === "1" ||
    String(url.searchParams.get("automationSafe") || "").trim() === "1";

  return {
    kind: "protected-reader-integration-route-v1",
    url: url.toString(),
    query: Object.fromEntries(url.searchParams.entries()),
    bookId,
    source,
    artifactRoot,
    shareState,
    lastCfi,
    readerBasePath,
    oldReaderUrl: `${oldReaderUrl.pathname}${oldReaderUrl.search}${oldReaderUrl.hash}`,
    protectedReaderUrl: `${protectedUrl.pathname}${protectedUrl.search}${protectedUrl.hash}`,
    explicitProtectedRequest: String(url.searchParams.get("reader") || "").trim() === "protected",
    uxShellMode: uxValue === "old-shell" ? "old-shell" : "standalone",
    embeddedMode: embeddedValue === "old-shell" ? "old-shell" : "none",
    driveMode:
      driveValue === "disabled" ? "disabled" : driveValue === "optional" ? "optional" : "full",
    automationSafe,
    explicitRestoreToken,
    forceWorkerUnavailable: ["disabled", "fail", "broken"].includes(
      String(url.searchParams.get("worker") || url.searchParams.get("protectedWorker") || "")
        .trim()
        .toLowerCase()
    ),
    renderMode: String(url.searchParams.get("renderMode") || "shape").trim() === "text" ? "text" : "shape",
    metricsMode: String(url.searchParams.get("metricsMode") || "shape").trim() === "text" ? "text" : "shape",
    debugGeometry: String(url.searchParams.get("debugGeometry") || "").trim() === "1"
  };
}

export function getProtectedShareMode(route) {
  const shareState = route && route.shareState ? route.shareState : {};
  if (shareState.compressedNotesToken) return "notesz-pending";
  if (shareState.legacyNotesToken) return "notes-pending";
  if (shareState.shareId) return "shareId-pending";
  return "none";
}

function fromBase64Url(token) {
  try {
    const normalized = String(token || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch (error) {
    return new Uint8Array(0);
  }
}

function normalizeImportedNotes(raw) {
  const notes = Array.isArray(raw) ? raw : [];
  return notes
    .map((note, index) => {
      if (!note || !note.cfi) return null;
      return {
        id: String(note.id || `shared-${index}`),
        cfi: String(note.cfi),
        href: note.href ? String(note.href) : null,
        quote: String(note.quote || "").trim(),
        comment: String(note.comment || "")
      };
    })
    .filter(Boolean);
}

export function decodeLegacyNotesToken(token) {
  if (!token) return [];
  const json = decodeURIComponent(escape(atob(String(token))));
  return normalizeImportedNotes(JSON.parse(json));
}

export async function decodeCompressedNotesToken(token) {
  if (!token) return [];
  if (typeof DecompressionStream === "undefined" || typeof Response === "undefined") {
    throw new Error("Compressed notes import is unavailable in this browser.");
  }
  const bytes = fromBase64Url(token);
  if (!bytes.length) throw new Error("Compressed notes token is invalid base64url.");
  const compressedResponse = new Response(bytes);
  if (!compressedResponse.body) throw new Error("Compressed notes token has no readable body.");
  const stream = compressedResponse.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return normalizeImportedNotes(JSON.parse(text));
}

function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
    })
  ]);
}

function getNotesShareReadEndpoints(shareId) {
  const encoded = encodeURIComponent(String(shareId || ""));
  return [
    `/books/reader/api/ns/${encoded}`,
    `/books/api/ns/${encoded}`,
    `/api/ns/${encoded}`,
    `/books/reader/api/notes-share/${encoded}`,
    `/books/api/notes-share/${encoded}`,
    `/api/notes-share/${encoded}`
  ];
}

export async function resolveProductionPayloadFromRoute(route, options = {}) {
  const shareState = route.shareState || {};
  const timeoutMs = Number(options.timeoutMs || 0) || 0;
  if (shareState.compressedNotesToken) {
    try {
      const notes = await withTimeout(
        decodeCompressedNotesToken(shareState.compressedNotesToken),
        timeoutMs,
        "Compressed notes decode"
      );
      return {
        mode: notes.length ? "notesz" : "notesz-empty",
        payload: notes.length
          ? { v: 2, bookId: route.bookId, createdAt: Date.now(), notes }
          : null,
        warnings: notes.length ? [] : ["Compressed notes token was present but did not contain importable notes."]
      };
    } catch (error) {
      return {
        mode: "notesz-error",
        payload: null,
        warnings: [error && error.message ? error.message : "Compressed notes token could not be decoded."]
      };
    }
  }
  if (shareState.legacyNotesToken) {
    try {
      const notes = decodeLegacyNotesToken(shareState.legacyNotesToken);
      return {
        mode: notes.length ? "notes" : "notes-empty",
        payload: notes.length
          ? { v: 2, bookId: route.bookId, createdAt: Date.now(), notes }
          : null,
        warnings: notes.length ? [] : ["Legacy notes token was present but did not contain importable notes."]
      };
    } catch (error) {
      return {
        mode: "notes-error",
        payload: null,
        warnings: [error && error.message ? error.message : "Legacy notes token could not be decoded."]
      };
    }
  }
  if (shareState.shareId) {
    const warnings = [];
    for (const endpoint of getNotesShareReadEndpoints(shareState.shareId)) {
      try {
        const response = await withTimeout(
          fetch(endpoint, { method: "GET", credentials: "same-origin" }),
          timeoutMs,
          `Share fetch ${endpoint}`
        );
        if (!response.ok) {
          warnings.push(`Share fetch failed at ${endpoint} (${response.status}).`);
          continue;
        }
        const payload = await response.json();
        const notes = normalizeImportedNotes(payload && payload.notes);
        if (!notes.length) {
          warnings.push(`Share endpoint ${endpoint} returned no notes.`);
          continue;
        }
        return {
          mode: "shareId",
          payload: {
            v: Number(payload && payload.v) || 2,
            bookId: String((payload && payload.bookId) || route.bookId || ""),
            createdAt: Number(payload && payload.createdAt) || Date.now(),
            notes
          },
          warnings
        };
      } catch (error) {
        warnings.push(`Share fetch failed at ${endpoint}.`);
      }
    }
    return {
      mode: "shareId-unresolved",
      payload: null,
      warnings
    };
  }
  return {
    mode: "none",
    payload: null,
    warnings: []
  };
}
