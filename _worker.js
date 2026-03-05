function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(JSON.stringify(payload), { status, headers });
}

function notesShareCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };
}

function randomShareId() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function buildNotesShareCacheKey(shareId) {
  return new Request(`https://notes-share.reader.pub/${encodeURIComponent(String(shareId || ""))}`);
}

async function cachePutNotesShare(shareId, payload) {
  try {
    const cache = caches && caches.default ? caches.default : null;
    if (!cache) return false;
    const key = buildNotesShareCacheKey(shareId);
    const body = JSON.stringify(payload || {});
    const resp = new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=31536000",
      },
    });
    await cache.put(key, resp);
    return true;
  } catch (e) {}
  return false;
}

async function cacheGetNotesShare(shareId) {
  try {
    const cache = caches && caches.default ? caches.default : null;
    if (!cache) return null;
    const key = buildNotesShareCacheKey(shareId);
    const hit = await cache.match(key);
    if (!hit) return null;
    return await hit.json();
  } catch (e) {}
  return null;
}

function normalizeNotes(raw) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of src) {
    if (!item || typeof item !== "object") continue;
    const cfi = String(item.cfi || "").trim();
    if (!cfi) continue;
    out.push({
      id: String(item.id || "").trim() || undefined,
      cfi,
      href: item.href == null ? null : String(item.href),
      quote: String(item.quote || "").slice(0, 2000),
      comment: String(item.comment || "").slice(0, 8000),
    });
    if (out.length >= 500) break;
  }
  return out;
}

function decodeBase64Utf8(value) {
  const source = String(value || "");
  try {
    if (typeof atob === "function") {
      const binary = atob(source);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
  } catch (e) {}
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(source, "base64").toString("utf8");
    }
  } catch (e2) {}
  return "";
}

function parseBasicAuthCredentials(authorizationHeader) {
  const header = String(authorizationHeader || "").trim();
  const match = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const decoded = decodeBase64Utf8(match[1]);
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  return {
    user: decoded.slice(0, idx),
    pass: decoded.slice(idx + 1),
  };
}

function docsAuthUnauthorizedResponse(route) {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": 'Basic realm="ReaderPub Docs", charset="UTF-8"',
  });
  headers.set("x-reader-worker", "1");
  headers.set("x-reader-route", route || "docs-auth");
  return new Response("Authentication required", { status: 401, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const decodedPath = decodeURIComponent(path);
    const normalizedPath = decodedPath.replace(/\/+$/, "") || "/";
    const isPagesDevHost = url.hostname.endsWith(".pages.dev");
    const driveClientId = String(
      env.READERPUB_GOOGLE_CLIENT_ID || env.GOOGLE_DRIVE_CLIENT_ID || ""
    ).trim();
    const notesSharePrefix = "api/notes_shares/";

    if (
      normalizedPath === "/books/api/notes-share" ||
      normalizedPath === "/api/notes-share" ||
      normalizedPath === "/books/reader/api/notes-share" ||
      normalizedPath === "/books/api/ns" ||
      normalizedPath === "/api/ns" ||
      normalizedPath === "/books/reader/api/ns" ||
      normalizedPath.startsWith("/books/api/notes-share/") ||
      normalizedPath.startsWith("/api/notes-share/") ||
      normalizedPath.startsWith("/books/reader/api/notes-share/") ||
      normalizedPath.startsWith("/books/api/ns/") ||
      normalizedPath.startsWith("/api/ns/") ||
      normalizedPath.startsWith("/books/reader/api/ns/")
    ) {
      if (request.method === "OPTIONS") {
        const headers = new Headers(notesShareCorsHeaders());
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "notes-share-options");
        return new Response(null, { status: 204, headers });
      }
      if (
        normalizedPath === "/books/api/notes-share" ||
        normalizedPath === "/api/notes-share" ||
        normalizedPath === "/books/reader/api/notes-share" ||
        normalizedPath === "/books/api/ns" ||
        normalizedPath === "/api/ns" ||
        normalizedPath === "/books/reader/api/ns"
      ) {
        if (request.method !== "POST") {
          const headers = new Headers(notesShareCorsHeaders());
          headers.set("content-type", "application/json; charset=utf-8");
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "notes-share-method");
          return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers,
          });
        }
        try {
          const body = await request.json();
          const notes = normalizeNotes(body?.notes);
          if (!notes.length) {
            return jsonResponse(
              { error: "No notes to share" },
              400,
              notesShareCorsHeaders()
            );
          }
          const bookId = String(body?.bookId || "").trim().slice(0, 200);
          const createdAt = Date.now();
          let shareId = "";
          let key = "";
          for (let i = 0; i < 5; i++) {
            shareId = randomShareId();
            key = `${notesSharePrefix}${shareId}.json`;
            if (env.READER_BOOKS) {
              const existing = await env.READER_BOOKS.get(key);
              if (!existing) break;
            } else {
              const existing = await cacheGetNotesShare(shareId);
              if (!existing) break;
            }
            shareId = "";
          }
          if (!shareId) {
            return jsonResponse(
              { error: "Failed to create share id" },
              500,
              notesShareCorsHeaders()
            );
          }
          const payload = {
            v: 1,
            bookId,
            createdAt,
            notes,
          };
          if (env.READER_BOOKS) {
            await env.READER_BOOKS.put(key, JSON.stringify(payload), {
              httpMetadata: { contentType: "application/json; charset=utf-8" },
            });
          } else {
            const cached = await cachePutNotesShare(shareId, payload);
            if (!cached) {
              return jsonResponse(
                { error: "Notes share storage unavailable" },
                500,
                notesShareCorsHeaders()
              );
            }
          }
          return jsonResponse(
            { shareId, count: notes.length },
            200,
            notesShareCorsHeaders()
          );
        } catch (error) {
          return jsonResponse(
            {
              error: "Failed to create notes share",
              detail: error && error.message ? error.message : String(error || ""),
            },
            500,
            notesShareCorsHeaders()
          );
        }
      }

      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, notesShareCorsHeaders());
      }
      try {
        const idMatch = normalizedPath.match(/\/(?:notes-share|ns)\/([A-Za-z0-9_-]+)$/);
        const shareId = idMatch ? String(idMatch[1]) : "";
        if (!shareId) {
          return jsonResponse({ error: "Missing share id" }, 400, notesShareCorsHeaders());
        }
        let data = null;
        if (env.READER_BOOKS) {
          const key = `${notesSharePrefix}${shareId}.json`;
          const obj = await env.READER_BOOKS.get(key);
          if (obj) data = await obj.json();
        } else {
          data = await cacheGetNotesShare(shareId);
        }
        if (!data) return jsonResponse({ error: "Not found" }, 404, notesShareCorsHeaders());
        const notes = normalizeNotes(data?.notes);
        return jsonResponse(
          { shareId, bookId: String(data?.bookId || ""), notes },
          200,
          notesShareCorsHeaders()
        );
      } catch (error) {
        return jsonResponse(
          {
            error: "Failed to load notes share",
            detail: error && error.message ? error.message : String(error || ""),
          },
          500,
          notesShareCorsHeaders()
        );
      }
    }

    if (
      normalizedPath === "/books/api/translate" ||
      normalizedPath === "/api/translate"
    ) {
      if (request.method === "OPTIONS") {
        const headers = new Headers({
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate-options");
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "POST") {
        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate-method");
        return new Response(
          JSON.stringify({ error: "Method not allowed. Use POST." }),
          { status: 405, headers }
        );
      }
      try {
        const body = await request.json();
        const text = String(body?.text || "").trim();
        const source = String(body?.source || "auto").trim() || "auto";
        const target = String(body?.target || "en").trim() || "en";
        const translateApiKey = String(
          env.READERPUB_GOOGLE_TRANSLATE_API_KEY ||
            env.GOOGLE_TRANSLATE_API_KEY ||
            ""
        ).trim();
        if (!text) {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          });
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "translate-empty");
          return new Response(
            JSON.stringify({ error: "Empty text." }),
            { status: 400, headers }
          );
        }
        if (!translateApiKey) {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          });
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "translate-config");
          return new Response(
            JSON.stringify({ error: "Translate API key is not configured." }),
            { status: 503, headers }
          );
        }

        const queryText = text.slice(0, 5000);
        const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
          translateApiKey
        )}`;
        const decodeHtmlEntities = (input) =>
          String(input || "")
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
              String.fromCodePoint(parseInt(hex, 16))
            )
            .replace(/&#(\d+);/g, (_, dec) =>
              String.fromCodePoint(parseInt(dec, 10))
            )
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
        const payload = {
          q: queryText,
          target,
          format: "text",
        };
        if (source && source !== "auto") payload.source = source;
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let translatedText = "";
        let detectedSource = source;
        let lastFailure = {
          status: 0,
          detail: "",
        };
        let attempts = 0;

        for (let attempt = 1; attempt <= 3 && !translatedText; attempt++) {
          attempts = attempt;
          let controller = null;
          let timeoutId = null;
          try {
            if (typeof AbortController !== "undefined") {
              controller = new AbortController();
              timeoutId = setTimeout(() => {
                try {
                  controller.abort();
                } catch (e0) {}
              }, 9000);
            }
            const upstream = await fetch(endpoint, {
              method: "POST",
              headers: {
                accept: "application/json,text/plain,*/*",
                "content-type": "application/json; charset=utf-8",
              },
              body: JSON.stringify(payload),
              signal: controller ? controller.signal : undefined,
            });
            const raw = await upstream.text();
            let data = null;
            try {
              data = raw ? JSON.parse(raw) : null;
            } catch (e0) {
              data = null;
            }
            if (!upstream.ok) {
              const errorDetail =
                (data &&
                  data.error &&
                  (data.error.message || data.error.status || data.error.code)) ||
                raw ||
                "";
              lastFailure = {
                status: upstream.status || 0,
                detail: String(errorDetail).slice(0, 300),
              };
              if (attempt < 3 && (upstream.status === 429 || upstream.status >= 500)) {
                await sleep(220 * attempt);
                continue;
              }
              break;
            }
            const first =
              data &&
              data.data &&
              Array.isArray(data.data.translations) &&
              data.data.translations.length
                ? data.data.translations[0]
                : null;
            if (!first || !first.translatedText) {
              lastFailure = {
                status: 502,
                detail: "Official API returned empty translation.",
              };
              if (attempt < 3) {
                await sleep(220 * attempt);
                continue;
              }
              break;
            }
            translatedText = decodeHtmlEntities(first.translatedText);
            detectedSource =
              (first.detectedSourceLanguage &&
                String(first.detectedSourceLanguage).trim()) ||
              source;
          } catch (e) {
            lastFailure = {
              status: 0,
              detail: e && e.message ? String(e.message).slice(0, 300) : "network error",
            };
            if (attempt < 3) {
              await sleep(220 * attempt);
              continue;
            }
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        if (!translatedText) {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          });
          headers.set("x-reader-worker", "1");
          headers.set("x-reader-route", "translate-upstream");
          return new Response(
            JSON.stringify({
              error: "Translate upstream failed.",
              status: lastFailure.status,
              detail: lastFailure.detail,
              attempts,
            }),
            { status: 502, headers }
          );
        }

        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate");
        return new Response(
          JSON.stringify({ translatedText, detectedSource, target }),
          { status: 200, headers }
        );
      } catch (error) {
        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "translate-error");
        return new Response(
          JSON.stringify({
            error: "Translate request failed.",
            detail: error && error.message ? error.message : String(error || ""),
          }),
          { status: 500, headers }
        );
      }
    }

    if (decodedPath.startsWith("/books/api/")) {
      const decodedKey = `api/${decodedPath.slice("/books/api/".length)}`;
      const rawKey = `api/${path.slice("/books/api/".length)}`;
      if (!env.READER_BOOKS) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-missing");
        return new Response("R2 binding missing", { status: 500, headers });
      }
      let object = await env.READER_BOOKS.get(decodedKey);
      if (!object && rawKey !== decodedKey) {
        object = await env.READER_BOOKS.get(rawKey);
      }
      if (!object) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "r2-miss");
        return new Response("Not found", { status: 404, headers });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "no-store");
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "r2");
      return new Response(object.body, { headers });
    }

    if (path === "/books/ping") {
      const headers = new Headers({
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-reader-ping": "1",
      });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "ping");
      return new Response("pong\n", { status: 200, headers });
    }

    if (path === "/docs") {
      const headers = new Headers({ location: "/docs/" });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "docs-slash-redirect");
      return new Response(null, { status: 302, headers });
    }

    if (decodedPath.startsWith("/docs/") && !isPagesDevHost) {
      const docsUser = String(env.DOCS_AUTH_USER || "").trim();
      const docsPass = String(env.DOCS_AUTH_PASS || "");
      if (!docsUser || !docsPass) {
        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "docs-auth-config");
        return new Response("Docs auth is not configured", { status: 503, headers });
      }
      const credentials = parseBasicAuthCredentials(
        request.headers.get("authorization")
      );
      if (
        !credentials ||
        credentials.user !== docsUser ||
        credentials.pass !== docsPass
      ) {
        return docsAuthUnauthorizedResponse("docs-auth");
      }
    }

    // Normalize reader/catalog roots to trailing-slash form to avoid 404 on some routes.
    if (path === "/books/reader" || path === "/books/catalog") {
      const headers = new Headers({ location: `${path}/` });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "slash-redirect");
      return new Response(null, { status: 302, headers });
    }

    const idMatch = path.match(/^\/books\/(\d+)(\/)?$/);
    if (idMatch) {
      const id = idMatch[1];
      const isPagesDev = url.hostname.endsWith(".pages.dev");
      const location = isPagesDev ? `/reader/#${id}` : `/books/reader/#${id}`;
      const headers = new Headers({ location });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "redirect");
      return new Response(null, { status: 302, headers });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const isCatalogHtml =
      path === "/books" || path === "/books/" || path === "/books/index.html";
    const isReaderPath =
      path === "/books/reader/" ||
      path === "/books/reader/index.html" ||
      path.startsWith("/books/reader/css/") ||
      path.startsWith("/books/reader/js/") ||
      path.startsWith("/books/reader/icons/") ||
      path.startsWith("/books/reader/fonts/");
    const isDocsPath = path === "/docs/" || path.startsWith("/docs/");
    const contentType = String(headers.get("content-type") || "").toLowerCase();
    const isHtml = contentType.includes("text/html");

    headers.set("x-reader-worker", "1");
    if (isCatalogHtml) {
      headers.set("x-reader-route", "catalog");
    } else if (isDocsPath) {
      headers.set("x-reader-route", "docs");
    } else {
      headers.set("x-reader-route", "assets");
    }
    if (isCatalogHtml) {
      headers.set("cache-control", "no-store");
    }
    if (isDocsPath) {
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("cdn-cache-control", "no-store");
      headers.set("cloudflare-cdn-cache-control", "no-store");
    }
    if (isReaderPath) {
      headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      headers.set("cdn-cache-control", "no-store");
      headers.set("cloudflare-cdn-cache-control", "no-store");
    }

    if (isHtml && driveClientId) {
      const rewritten = new HTMLRewriter()
        .on('meta[name="google-drive-client-id"]', {
          element(element) {
            element.setAttribute("content", driveClientId);
          },
        })
        .transform(
          new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        );
      return rewritten;
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
