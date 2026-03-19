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

function textResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(body, { status, headers });
}

function xmlResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/xml; charset=utf-8",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(body, { status, headers });
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    ...extraHeaders,
  });
  headers.set("x-reader-worker", "1");
  return new Response(body, { status, headers });
}

function stripTrailingSlash(path) {
  if (!path || path === "/") return "/";
  return path.replace(/\/+$/, "") || "/";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function sanitizeMetaDescription(value) {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  if (source.length <= 160) return source;
  const cut = source.slice(0, 157).replace(/\s+\S*$/, "");
  return `${cut || source.slice(0, 157)}...`;
}

function formatAuthorDisplayName(value) {
  const source = String(value || "").trim();
  if (!source.includes(",")) return source;
  const parts = source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < 2) return source;
  return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
}

function buildReaderFallbackDescription(title, authorName) {
  const author = formatAuthorDisplayName(authorName) || String(authorName || "").trim();
  return `Read "${String(title || "").trim()}" by ${author} on ReaderPub.`;
}

function getRenderableBookDescription(book) {
  const title = String(book?.title || "").trim();
  const authorName = String(book?.authorName || "").trim();
  const description = String(book?.description || "").trim();
  const metaDescription = String(book?.meta_description || "").trim();
  const fallback = buildReaderFallbackDescription(title, authorName);
  const selected = description || metaDescription;
  if (!selected) return fallback;
  if (String(book?.description_source || "").trim() === "fallback_title_author") {
    return fallback;
  }
  if (/^(Read|Explore)\s+"[^"]+"\s+by\s+.+\s+on ReaderPub\.$/i.test(selected)) {
    return fallback;
  }
  return selected;
}

function normalizeComparableTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim();
}

function serializeJsonForScript(value) {
  return JSON.stringify(value || {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizePosthogHost(host) {
  const value = String(host || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://${value.replace(/\/$/, "")}`;
}

function getPosthogPublicConfig(env) {
  const key = String(env.READERPUB_POSTHOG_KEY || env.POSTHOG_KEY || "").trim();
  const host = normalizePosthogHost(
    String(env.READERPUB_POSTHOG_HOST || env.POSTHOG_HOST || "").trim()
  );
  const rawEnabled = String(env.READERPUB_POSTHOG_ENABLED || env.POSTHOG_ENABLED || "").trim();
  const enabled = /^(1|true|yes|on)$/i.test(rawEnabled) && !!key && !!host;
  return { enabled, key, host };
}

function buildSeoAnalyticsHtml(posthogConfig, pageData) {
  const config = posthogConfig || {};
  const pagePayload = pageData || {};
  return `
    <meta name="posthog-enabled" content="${config.enabled ? "true" : "false"}" />
    <meta name="posthog-key" content="${escapeHtml(config.key || "")}" />
    <meta name="posthog-host" content="${escapeHtml(config.host || "")}" />
    <script src="/books/shared/posthog.js"></script>
    <script>
      (function () {
        if (window.__readerpubSeoAnalyticsBooted) return;
        window.__readerpubSeoAnalyticsBooted = true;
        var pageData = ${serializeJsonForScript(pagePayload)};

        function buildClickPayload(anchor) {
          var href = String(anchor.getAttribute("href") || "");
          var destinationPath = "";
          var destinationHash = "";
          try {
            var url = new URL(href, window.location.href);
            destinationPath = url.pathname || "";
            destinationHash = url.hash || "";
          } catch (error) {}
          return Object.assign({}, pageData, {
            destination_path: destinationPath,
            destination_hash: destinationHash,
            cta_type: String(anchor.getAttribute("data-seo-cta-type") || "").trim(),
            link_text: String(anchor.getAttribute("data-seo-link-text") || anchor.textContent || "").trim(),
          });
        }

        try {
          if (window.ReaderPubAnalytics && typeof window.ReaderPubAnalytics.boot === "function") {
            window.ReaderPubAnalytics.boot();
            if (typeof window.ReaderPubAnalytics.captureSeoPageview === "function") {
              window.ReaderPubAnalytics.captureSeoPageview(pageData);
            }
          }
        } catch (error) {}

        document.addEventListener("click", function (event) {
          var target = event.target;
          if (!target || typeof target.closest !== "function") return;
          var anchor = target.closest("a[data-seo-track]");
          if (!anchor) return;
          try {
            if (!window.ReaderPubAnalytics || typeof window.ReaderPubAnalytics.boot !== "function") return;
            window.ReaderPubAnalytics.boot();
            var mode = String(anchor.getAttribute("data-seo-track") || "").trim();
            var payload = buildClickPayload(anchor);
            if (mode === "catalog" && typeof window.ReaderPubAnalytics.captureSeoToCatalog === "function") {
              window.ReaderPubAnalytics.captureSeoToCatalog(payload);
            } else if (mode === "reader" && typeof window.ReaderPubAnalytics.captureSeoToReader === "function") {
              window.ReaderPubAnalytics.captureSeoToReader(payload);
            }
          } catch (error) {}
        }, { capture: true });
      })();
    </script>`;
}

async function readBucketObject(env, key) {
  if (!env.READER_BOOKS) return null;
  return await env.READER_BOOKS.get(key);
}

async function readBucketText(env, key) {
  const object = await readBucketObject(env, key);
  if (!object) return null;
  if (typeof object.text === "function") return await object.text();
  if (typeof object.body === "string") return object.body;
  if (object.body instanceof Uint8Array) return new TextDecoder().decode(object.body);
  if (object.body) return await new Response(object.body).text();
  return "";
}

async function readBucketJson(env, key) {
  const text = await readBucketText(env, key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function readSeoText(env, key) {
  return await readBucketText(env, `seo/${key}`);
}

async function readSeoJson(env, key) {
  const text = await readBucketText(env, `seo/${key}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

const SEO_SHARD_PREFIX_LENGTH = 2;
const SEO_SHARD_MAX_PREFIX_LENGTH = 8;

function seoShardPrefix(slug, prefixLength = SEO_SHARD_PREFIX_LENGTH) {
  const normalized = String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!normalized) return "_".repeat(prefixLength);
  if (normalized.length >= prefixLength) {
    return normalized.slice(0, prefixLength);
  }
  return normalized + "_".repeat(prefixLength - normalized.length);
}

async function readSeoShardedJson(env, folder, slug) {
  for (let prefixLength = SEO_SHARD_MAX_PREFIX_LENGTH; prefixLength >= SEO_SHARD_PREFIX_LENGTH; prefixLength -= 1) {
    const prefix = seoShardPrefix(String(slug || "").slice(0), prefixLength);
    const payload = await readSeoJson(env, `${folder}/${prefix}.json`);
    if (!payload || !payload.items || typeof payload.items !== "object") continue;
    if (payload.items[slug]) return payload.items[slug];
  }
  return null;
}

async function fetchTextAbsolute(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response || !response.ok) return null;
    return await response.text();
  } catch (e) {
    return null;
  }
}

function buildSeoCacheHeaders(version) {
  return {
    "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "x-reader-seo-version": String(version || ""),
    "x-reader-seo-render": "14",
  };
}

function buildSitemapCacheHeaders(version) {
  return {
    "cache-control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    "x-reader-seo-version": String(version || ""),
    "x-reader-seo-render": "14",
  };
}

function buildSeoCacheKey(url, version, variant = "") {
  const cacheUrl = new URL(url.toString());
  cacheUrl.hash = "";
  cacheUrl.search = "";
  cacheUrl.searchParams.set("__seo_v", String(version || "0"));
  cacheUrl.searchParams.set("__seo_render", "14");
  if (variant) cacheUrl.searchParams.set("__seo_variant", String(variant));
  return new Request(cacheUrl.toString(), { method: "GET" });
}

async function withSeoCache(request, version, variant, buildResponse) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const cacheKey = buildSeoCacheKey(request.url, version, variant);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch (e) {}
  }
  const response = await buildResponse();
  if (cache && response && response.ok && request.method === "GET") {
    try {
      await cache.put(cacheKey, response.clone());
    } catch (e) {}
  }
  return response;
}

function seoCanonical(origin, path) {
  return `${origin}${stripTrailingSlash(path)}`;
}

function renderSeoLayout({
  title,
  description,
  canonical,
  bodyHtml,
  structuredData,
  analyticsHtml,
}) {
  const metaDescription = sanitizeMetaDescription(description || "");
  const structuredDataHtml = structuredData
    ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="icon" type="image/svg+xml" href="/books/assets/logo.svg" />
    ${analyticsHtml || ""}
    ${structuredDataHtml}
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600&display=swap");

      :root {
        color-scheme: light;
        --bg: #ffffff;
        --ink: #1f1b16;
        --muted: #6c645a;
        --accent: #028f80;
        --accent-2: #016b61;
        --border: #d8dee8;
        --panel: #ffffff;
        --rect-bg: linear-gradient(90deg, #fcfaf8 0%, #ffffff 100%);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Source Sans 3", "Helvetica Neue", sans-serif;
        font-size: 16px;
        line-height: 1.5;
        color: var(--ink);
        background: var(--bg);
      }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: none; }
      .wrap {
        max-width: 1180px;
        margin: 0 auto;
        padding: 28px 24px 24px;
      }
      .crumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--muted);
        font-size: 14px;
        margin: 0 0 22px;
        align-items: center;
      }
      .crumbs a {
        color: var(--accent);
      }
      .crumbs a:hover {
        color: var(--accent-2);
      }
      .crumbs .sep {
        color: var(--muted);
        opacity: 0.7;
      }
      .panel {
        background: var(--rect-bg);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 18px;
      }
      .hero {
        display: grid;
        gap: 16px;
        margin-bottom: 6px;
      }
      .hero.withCover {
        grid-template-columns: minmax(0, 1fr);
      }
      .heroText {
        min-width: 0;
      }
      h1,h2,h3 { line-height: 1.15; margin: 0 0 12px; }
      h1,h2,h3 {
        font-family: "Playfair Display", "Times New Roman", serif;
        font-weight: 700;
      }
      h1 { font-size: 32px; letter-spacing: 0.2px; }
      h2 { font-size: 26px; margin-top: 28px; }
      h3 { font-size: 22px; }
      .meta {
        color: var(--muted);
        margin-bottom: 16px;
        font-size: 14px;
      }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 18px 0 24px; }
      .section {
        margin-top: 26px;
      }
      .sectionHead {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        flex-wrap: wrap;
      }
      .sectionTitle {
        font-family: "Playfair Display", "Times New Roman", serif;
        font-size: 26px;
        line-height: 1.1;
        color: var(--ink);
        margin: 0;
      }
      .sectionMeta {
        font-size: 13px;
        color: var(--muted);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        border-radius: 999px;
        padding: 10px 16px;
        font-weight: 600;
        font-size: 14px;
        transition: background-color 0.08s ease, border-color 0.08s ease, color 0.08s ease;
      }
      .btn:hover {
        background: var(--accent-2);
        border-color: var(--accent-2);
        color: #fff;
      }
      .btn.secondary {
        background: transparent;
        color: var(--accent);
      }
      .btn.secondary:hover {
        background: rgba(2, 143, 128, 0.08);
        border-color: var(--accent);
        color: var(--accent);
      }
      .list {
        display: grid;
        gap: 12px;
        margin: 18px 0 0;
        padding: 0;
        list-style: none;
      }
      .list li {
        border-top: 1px solid var(--border);
        padding: 12px 0 0;
        line-height: 1.45;
      }
      .list:first-child,
      .section > .list {
        margin-top: 0;
      }
      .list .submeta,
      .submeta {
        display: inline;
        color: var(--muted);
        font-size: 13px;
        font-weight: 400;
      }
      .excerpt, .chapterHtml {
        line-height: 1.62;
        font-size: 16px;
      }
      .excerpt p, .chapterHtml p { margin: 0 0 16px; }
      .cover {
        display: block;
        max-width: 200px;
        border: 1px solid var(--border);
        border-radius: 12px;
        margin: 0 0 20px;
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 16px 0 0;
      }
      .tag {
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 8px 12px;
        color: var(--muted);
        font-size: 14px;
        background: #fffdfa;
      }
      .tag:hover {
        background: rgba(2, 143, 128, 0.08);
        color: var(--ink);
      }
      .recGrid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
      }
      .recCard {
        display: grid;
        gap: 10px;
        align-content: start;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
        background: #fffdfa;
        color: var(--ink);
      }
      .recCard:hover {
        background: rgba(2, 143, 128, 0.06);
      }
      .recCover {
        width: 100%;
        aspect-ratio: 3 / 4;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #f8f5f1;
      }
      .recCoverPlaceholder {
        display: block;
      }
      .recBody {
        display: grid;
        gap: 4px;
      }
      .recTitle {
        font-weight: 600;
        line-height: 1.35;
        color: var(--accent-2);
      }
      .recMeta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.35;
      }
      .chapterNav {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        margin: 24px 0;
        padding: 12px 0;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
      }
      .chapterNav a {
        color: var(--accent-2);
        font-weight: 600;
      }
      .chapterHtml img,
      .chapterHtml svg,
      .chapterHtml canvas,
      .chapterHtml video,
      .chapterHtml iframe {
        display: block;
        max-width: 100% !important;
        width: auto !important;
        height: auto !important;
        max-height: none !important;
        object-fit: contain;
      }
      .chapterHtml figure,
      .chapterHtml .figure,
      .chapterHtml .image {
        max-width: 100%;
      }
      .chapterHtml h1,
      .chapterHtml h2,
      .chapterHtml h3,
      .chapterHtml h4,
      .chapterHtml h5,
      .chapterHtml h6 {
        font-family: "Playfair Display", "Times New Roman", serif;
        line-height: 1.2;
        margin: 24px 0 12px;
      }
      .list a {
        color: var(--accent-2);
        font-weight: 600;
      }
      @media (max-width: 720px) {
        .wrap {
          padding: 20px 16px 20px;
        }
        .panel {
          padding: 16px;
        }
        .hero {
          gap: 14px;
        }
        h1 {
          font-size: 28px;
        }
        h2 {
          font-size: 24px;
        }
        h3 {
          font-size: 20px;
        }
        .actions {
          gap: 10px;
          margin: 16px 0 20px;
        }
        .btn {
          width: 100%;
        }
        .chapterNav {
          flex-direction: column;
          align-items: flex-start;
        }
        .recGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .sectionTitle {
          font-size: 24px;
        }
        .excerpt,
        .chapterHtml {
          font-size: 15px;
          line-height: 1.58;
        }
        .chapterHtml p {
          margin: 0 0 14px;
        }
      }
      @media (pointer: coarse) and (orientation: portrait) {
        .chapterHtml img,
        .chapterHtml svg,
        .chapterHtml canvas,
        .chapterHtml video,
        .chapterHtml iframe {
          margin-left: auto;
          margin-right: auto;
          max-width: 100% !important;
          width: auto !important;
          height: auto !important;
          max-height: 78vh !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function buildBreadcrumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumbs">${items
    .map((item) =>
      item.href
        ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
        : `<span>${escapeHtml(item.label)}</span>`
    )
    .join('<span class="sep">›</span>')}</nav>`;
}

function buildBookJsonLd(origin, book) {
  const authorDisplayName = formatAuthorDisplayName(book.authorName);
  const description = sanitizeMetaDescription(getRenderableBookDescription(book));
  const data = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: `${origin}/book/${book.slug}`,
    author: {
      "@type": "Person",
      name: authorDisplayName,
      url: `${origin}/author/${book.authorSlug}`,
    },
    inLanguage: book.language || "und",
  };
  if (book.cover) data.image = `${origin}${book.cover}`;
  if (description) data.description = description;
  return data;
}

function contentDirForChapter(bookId, chapter) {
  const raw = String((chapter && chapter.sourcePath) || "").trim();
  const dir = raw.includes("/") ? raw.slice(0, raw.lastIndexOf("/") + 1) : "";
  return `/books/content/${bookId}/${dir}`;
}

function rewriteRelativeChapterHtml(html, assetBase) {
  return String(html || "").replace(
    /(src|href)=("|\')([^"\']+)("|\')/g,
    (match, attr, quote, value) => {
      if (!value || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("data:")) {
        return match;
      }
      const absolute = new URL(value, `https://reader.pub${assetBase}`).pathname;
      return `${attr}=${quote}${absolute}${quote}`;
    }
  );
}

function extractBodyInnerHtml(xhtmlText) {
  const match = String(xhtmlText || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : "";
}

function buildCatalogCategoryHref(slug) {
  const params = new URLSearchParams();
  params.set("view", "category");
  params.set("category", String(slug || ""));
  return `/books/#${params.toString()}`;
}

function buildPrimaryExploreHref(book) {
  const categories = Array.isArray(book?.categories) ? book.categories : [];
  const primaryCategory = categories.find((item) => item && item.slug);
  return primaryCategory ? buildCatalogCategoryHref(primaryCategory.slug) : "/books/";
}

function buildReaderHrefForRecommendation(item) {
  const explicit = String(item?.readerUrl || "").trim();
  if (explicit) return explicit;
  const id = String(item?.id || "").trim();
  if (id) return `/books/${encodeURIComponent(id)}/`;
  return "";
}

async function findSiblingEditionBook(env, book) {
  if (!book?.authorSlug || !book?.title) return null;
  const author = await readSeoShardedJson(env, "author-shards", book.authorSlug);
  const authorBooks = Array.isArray(author?.books) ? author.books : [];
  const targetTitle = normalizeComparableTitle(book.title);
  if (!targetTitle) return null;
  for (const item of authorBooks) {
    if (!item || !item.slug || item.slug === book.slug) continue;
    if (normalizeComparableTitle(item.title) !== targetTitle) continue;
    const sibling = await readSeoShardedJson(env, "book-shards", item.slug);
    if (!sibling) continue;
    if (sibling.cover || (Array.isArray(sibling.categories) && sibling.categories.length)) {
      return sibling;
    }
  }
  return null;
}

async function enrichBookForDisplay(env, book) {
  const enriched = { ...(book || {}) };
  const needsSibling = !enriched.cover || !Array.isArray(enriched.categories) || !enriched.categories.length;
  if (!needsSibling) return enriched;
  const sibling = await findSiblingEditionBook(env, enriched);
  if (!sibling) return enriched;
  if (!enriched.cover && sibling.cover) enriched.cover = sibling.cover;
  if ((!Array.isArray(enriched.categories) || !enriched.categories.length) && Array.isArray(sibling.categories) && sibling.categories.length) {
    enriched.categories = sibling.categories;
  }
  return enriched;
}

async function buildBookRecommendationSections(env, book) {
  const sections = [];
  const currentSlug = String(book?.slug || "");
  const categories = Array.isArray(book?.categories) ? book.categories : [];
  const primaryCategory = categories.find((item) => item && item.slug);
  if (primaryCategory) {
    const category = await readSeoJson(env, `category/${primaryCategory.slug}.json`);
    const categoryBooks = Array.isArray(category?.books) ? category.books : [];
    const items = categoryBooks
      .filter((item) => item && item.slug && item.slug !== currentSlug)
      .slice(0, 6)
      .map((item) => ({
        id: item.id || "",
        slug: item.slug,
        title: item.title,
        author: item.author || item.authorName || "",
        authorSlug: item.authorSlug || "",
        cover: item.cover || "",
        readerUrl: buildReaderHrefForRecommendation(item),
      }));
    if (items.length) {
      sections.push({ title: "You May Also Like", items, source: "category" });
    }
  }

  if (book?.authorSlug) {
    const author = await readSeoShardedJson(env, "author-shards", book.authorSlug);
    const authorBooks = Array.isArray(author?.books) ? author.books : [];
    const items = authorBooks
      .filter((item) => item && item.slug && item.slug !== currentSlug)
      .slice(0, 6)
      .map((item) => ({
        id: item.id || "",
        slug: item.slug,
        title: item.title,
        author: book.authorName || author.name || "",
        authorSlug: book.authorSlug || author.slug || "",
        cover: item.cover || "",
        readerUrl: buildReaderHrefForRecommendation(item),
      }));
    if (items.length) {
      sections.push({ title: "More Books by This Author", items, source: "author" });
    }
  }

  return sections;
}

function renderBookPage(origin, book, posthogConfig, recommendationSections) {
  const authorDisplayName = formatAuthorDisplayName(book.authorName);
  const aboutText = getRenderableBookDescription(book) || book.excerpt || "";
  const coverHtml = book.cover
    ? `<img class="cover" src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} cover" />`
    : "";
  const primaryExploreHref = buildPrimaryExploreHref(book);
  const categoryHtml = Array.isArray(book.categories) && book.categories.length
    ? `<div class="tags">${book.categories
        .map(
          (item) =>
            `<a class="tag" href="${escapeHtml(buildCatalogCategoryHref(item.slug))}" data-seo-track="catalog" data-seo-cta-type="category_tag" data-seo-link-text="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a>`
        )
        .join("")}</div>`
    : "";
  const sections = Array.isArray(recommendationSections) ? recommendationSections.filter((item) => item && Array.isArray(item.items) && item.items.length) : [];
  const recommendationsHtml = sections
    .map((section) => {
      const cardsHtml = section.items
        .filter((item) => item && item.readerUrl)
        .map(
          (item) => `
            <a class="recCard" href="${escapeHtml(item.readerUrl)}" data-seo-track="reader" data-seo-cta-type="recommendation_card" data-seo-link-text="${escapeHtml(item.title)}">
              ${item.cover ? `<img class="recCover" src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)} cover" />` : `<span class="recCover recCoverPlaceholder" aria-hidden="true"></span>`}
              <span class="recBody">
                <span class="recTitle">${escapeHtml(item.title)}</span>
                ${item.author ? `<span class="recMeta">by ${escapeHtml(formatAuthorDisplayName(item.author))}</span>` : ""}
              </span>
            </a>`
        )
        .join("");
      if (!cardsHtml) return "";
      return `
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">${escapeHtml(section.title)}</h2>
          <div class="sectionMeta">${section.items.length} picks</div>
        </div>
        <div class="recGrid">${cardsHtml}</div>
      </section>`;
    })
    .join("");
  const chaptersHtml = Array.isArray(book.chapters) && book.chapters.length
    ? `<ol class="list">${book.chapters
        .map(
          (chapter) =>
            `<li><a href="${escapeHtml(chapter.href)}">Chapter ${chapter.n}: ${escapeHtml(chapter.title)}</a></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No chapter map available.</div>`;
  const excerptHtml = aboutText
    ? `<div class="excerpt"><p>${escapeHtml(aboutText)}</p></div>`
    : `<div class="meta">Excerpt is not available.</div>`;
  const heroClass = coverHtml ? "hero withCover" : "hero";
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: authorDisplayName, href: `/author/${book.authorSlug}` },
      { label: book.title },
    ])}
    <main class="panel">
      <div class="${heroClass}">
        ${coverHtml}
        <div class="heroText">
          <h1>${escapeHtml(book.title)}</h1>
          <div class="meta">By <a href="/author/${encodeURIComponent(book.authorSlug)}">${escapeHtml(authorDisplayName)}</a></div>
          <div class="actions">
            <a class="btn secondary" href="${escapeHtml(book.readerUrl)}" data-seo-track="reader" data-seo-cta-type="open_in_weread" data-seo-link-text="Open in WeRead">Open in WeRead</a>
            <a class="btn" href="${escapeHtml(primaryExploreHref)}" data-seo-track="catalog" data-seo-cta-type="primary_explore_cta" data-seo-link-text="Explore More Books Like This">Explore More Books Like This</a>
          </div>
          ${categoryHtml}
        </div>
      </div>
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">About This Book</h2>
        </div>
        ${excerptHtml}
      </section>
      ${recommendationsHtml}
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Chapters</h2>
          <div class="sectionMeta">${Array.isArray(book.chapters) ? book.chapters.length : 0} chapters</div>
        </div>
        ${chaptersHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `${book.title} — ${authorDisplayName}`,
    description: sanitizeMetaDescription(aboutText),
    canonical: seoCanonical(origin, `/book/${book.slug}`),
    structuredData: buildBookJsonLd(origin, book),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "book",
      pathname: `/book/${book.slug}`,
      slug: book.slug,
      book_id: String(book.id || ""),
      book_slug: book.slug,
      author_slug: book.authorSlug || "",
      category_slug: "",
      language: book.language || "",
    }),
    bodyHtml,
  });
}

function renderChapterPage(origin, book, chapter, chapterHtml, posthogConfig) {
  const authorDisplayName = formatAuthorDisplayName(book.authorName);
  const idx = (book.chapters || []).findIndex((item) => item.n === chapter.n);
  const prev = idx > 0 ? book.chapters[idx - 1] : null;
  const next = idx >= 0 && idx < book.chapters.length - 1 ? book.chapters[idx + 1] : null;
  const navHtml = `<div class="chapterNav">
      <div>${prev ? `<a href="${escapeHtml(prev.href)}">← Previous chapter</a>` : ""}</div>
      <div>${next ? `<a href="${escapeHtml(next.href)}">Next chapter →</a>` : ""}</div>
    </div>`;
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: authorDisplayName, href: `/author/${book.authorSlug}` },
      { label: book.title, href: `/book/${book.slug}` },
      { label: chapter.title },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(book.title)}</h1>
          <div class="meta">Chapter ${chapter.n}: ${escapeHtml(chapter.title)}</div>
          <div class="actions">
            <a class="btn" href="${escapeHtml(book.readerUrl)}" data-seo-track="reader" data-seo-cta-type="open_in_weread" data-seo-link-text="Open in WeRead">Open in WeRead</a>
            <a class="btn secondary" href="/book/${encodeURIComponent(book.slug)}">Back to Book</a>
          </div>
        </div>
      </div>
      ${navHtml}
      <article class="chapterHtml">${chapterHtml}</article>
      ${navHtml}
    </main>`;
  return renderSeoLayout({
    title: `${book.title} — Chapter ${chapter.n}`,
    description: `${book.title}, chapter ${chapter.n}: ${chapter.title}`,
    canonical: seoCanonical(origin, chapter.href),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "chapter",
      pathname: chapter.href,
      slug: chapter.slug || `chapter-${chapter.n}`,
      book_id: String(book.id || ""),
      book_slug: book.slug,
      author_slug: book.authorSlug || "",
      category_slug: "",
      language: book.language || "",
    }),
    bodyHtml,
  });
}

function renderAuthorPage(origin, author, posthogConfig) {
  const authorDisplayName = formatAuthorDisplayName(author.name);
  const booksHtml = Array.isArray(author.books) && author.books.length
    ? `<ol class="list">${author.books
        .map(
          (book) =>
            `<li><a href="/book/${encodeURIComponent(book.slug)}">${escapeHtml(book.title)}</a></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No books are indexed for this author yet.</div>`;
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: authorDisplayName },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(authorDisplayName)}</h1>
          <div class="meta">${author.count || 0} books</div>
        </div>
      </div>
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Books by This Author</h2>
          <div class="sectionMeta">${author.count || 0} titles</div>
        </div>
        ${booksHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `Books by ${authorDisplayName}`,
    description: `${author.count || 0} books by ${authorDisplayName} on ReaderPub.`,
    canonical: seoCanonical(origin, `/author/${author.slug}`),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "author",
      pathname: `/author/${author.slug}`,
      slug: author.slug,
      book_id: "",
      book_slug: "",
      author_slug: author.slug,
      category_slug: "",
      language: "",
    }),
    bodyHtml,
  });
}

function renderCategoryPage(origin, category, posthogConfig) {
  const catalogHref = buildCatalogCategoryHref(category.slug);
  const booksHtml = Array.isArray(category.books) && category.books.length
    ? `<ol class="list">${category.books
        .map(
          (book) =>
            `<li><a href="/book/${encodeURIComponent(book.slug)}">${escapeHtml(book.title)}</a> <span class="submeta">by <a href="/author/${encodeURIComponent(book.authorSlug)}">${escapeHtml(formatAuthorDisplayName(book.author))}</a></span></li>`
        )
        .join("")}</ol>`
    : `<div class="meta">No books are indexed in this category yet.</div>`;
  const bodyHtml = `
    ${buildBreadcrumbs([
      { label: "Books", href: "/books/" },
      { label: "Categories", href: "/books/" },
      { label: category.title },
    ])}
    <main class="panel">
      <div class="hero">
        <div class="heroText">
          <h1>${escapeHtml(category.title)}</h1>
          <div class="meta">${category.count || 0} books</div>
          <div class="actions">
            <a class="btn" href="${escapeHtml(catalogHref)}" data-seo-track="catalog" data-seo-cta-type="open_in_catalog" data-seo-link-text="Open in Catalog">Open in Catalog</a>
            <a class="btn secondary" href="/books/" data-seo-track="catalog" data-seo-cta-type="all_books" data-seo-link-text="All Books">All Books</a>
          </div>
        </div>
      </div>
      <section class="section">
        <div class="sectionHead">
          <h2 class="sectionTitle">Books in This Category</h2>
          <div class="sectionMeta">${category.count || 0} titles</div>
        </div>
        ${booksHtml}
      </section>
    </main>`;
  return renderSeoLayout({
    title: `${category.title} Books`,
    description: `${category.count || 0} books in the ${category.title} category on ReaderPub.`,
    canonical: seoCanonical(origin, `/category/${category.slug}`),
    analyticsHtml: buildSeoAnalyticsHtml(posthogConfig, {
      page_type: "category",
      pathname: `/category/${category.slug}`,
      slug: category.slug,
      book_id: "",
      book_slug: "",
      author_slug: "",
      category_slug: category.slug,
      language: "",
    }),
    bodyHtml,
  });
}

function buildSitemapXml(origin, items) {
  const body = (items || [])
    .map(
      (item) =>
        `<url><loc>${escapeXml(`${origin}${item.loc}`)}</loc>${
          item.lastmod ? `<lastmod>${escapeXml(String(item.lastmod))}</lastmod>` : ""
        }</url>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

function buildSitemapIndexXml(origin, sitemaps) {
  const body = (sitemaps || [])
    .map(
      (item) =>
        `<sitemap><loc>${escapeXml(`${origin}${item.path}`)}</loc></sitemap>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

async function renderSeoRoute(request, env, url, path) {
  const assetOrigin = url.origin;
  const posthogConfig = getPosthogPublicConfig(env);
  const forwardedOrigin = String(request.headers.get("x-reader-canonical-origin") || "").trim();
  const canonicalOrigin =
    /^https?:\/\/[a-z0-9.-]+$/i.test(forwardedOrigin) ? forwardedOrigin.replace(/\/+$/, "") : assetOrigin;
  const cacheVariant = canonicalOrigin;
  const publicContentOrigin =
    canonicalOrigin.includes(".pages.dev") ? "https://reader.pub" : canonicalOrigin;
  const versionMeta = await readSeoJson(env, "version.json");
  const globalVersion = versionMeta && versionMeta.version ? String(versionMeta.version) : "0";

  if (path === "/robots.txt") {
    return await withSeoCache(request, globalVersion, cacheVariant, async () => {
      const body = [
        "User-agent: *",
        "Allow: /book/",
        "Allow: /author/",
        "Allow: /category/",
        "Allow: /sitemap.xml",
        "Allow: /sitemaps/",
        "Disallow: /books/reader/",
        "Disallow: /books/api/",
        "",
        `Sitemap: ${canonicalOrigin}/sitemap.xml`,
      ].join("\n");
      const response = textResponse(body, 200, {
        "cache-control": "public, max-age=3600, s-maxage=86400",
        "x-reader-route": "seo-robots",
        "x-reader-seo-version": globalVersion,
      });
      return response;
    });
  }

  if (path === "/sitemap.xml") {
    const sitemapIndex = await readSeoJson(env, "sitemaps/index.json");
    if (!sitemapIndex) {
      return textResponse("Sitemap index not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-sitemap-miss",
      });
    }
    return await withSeoCache(request, sitemapIndex.version || globalVersion, cacheVariant, async () => {
      const response = xmlResponse(buildSitemapIndexXml(canonicalOrigin, sitemapIndex.sitemaps || []), 200, {
        ...buildSitemapCacheHeaders(sitemapIndex.version || globalVersion),
        "x-reader-route": "seo-sitemap-index",
      });
      return response;
    });
  }

  const sitemapMatch = path.match(/^\/sitemaps\/(books-\d+|chapters-\d+|authors|categories)\.xml$/);
  if (sitemapMatch) {
    const slug = `${sitemapMatch[1]}.json`;
    const payload = await readSeoJson(env, `sitemaps/${slug}`);
    if (!payload) {
      return textResponse("Sitemap not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-sitemap-miss",
      });
    }
    return await withSeoCache(request, globalVersion, cacheVariant, async () => {
      const response = xmlResponse(buildSitemapXml(canonicalOrigin, payload.items || []), 200, {
        ...buildSitemapCacheHeaders(globalVersion),
        "x-reader-route": "seo-sitemap",
      });
      return response;
    });
  }

  const authorMatch = path.match(/^\/author\/([^/]+)\/?$/);
  if (authorMatch) {
    const slug = authorMatch[1];
    const author = await readSeoShardedJson(env, "author-shards", slug);
    if (!author) {
      return textResponse("Author not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-author-miss",
      });
    }
    const canonicalPath = `/author/${author.slug}`;
    if (stripTrailingSlash(path) !== canonicalPath) {
      const headers = new Headers({ location: canonicalPath });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "seo-author-canonical");
      return new Response(null, { status: 301, headers });
    }
    return await withSeoCache(request, author.version || globalVersion, cacheVariant, async () => {
      const response = htmlResponse(renderAuthorPage(canonicalOrigin, author, posthogConfig), 200, {
        ...buildSeoCacheHeaders(author.version || globalVersion),
        "x-reader-route": "seo-author",
      });
      return response;
    });
  }

  const categoryMatch = path.match(/^\/category\/([^/]+)\/?$/);
  if (categoryMatch) {
    const slug = categoryMatch[1];
    const category = await readSeoJson(env, `category/${slug}.json`);
    if (!category) {
      return textResponse("Category not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-category-miss",
      });
    }
    const canonicalPath = `/category/${category.slug}`;
    if (stripTrailingSlash(path) !== canonicalPath) {
      const headers = new Headers({ location: canonicalPath });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "seo-category-canonical");
      return new Response(null, { status: 301, headers });
    }
    return await withSeoCache(request, category.version || globalVersion, cacheVariant, async () => {
      const response = htmlResponse(renderCategoryPage(canonicalOrigin, category, posthogConfig), 200, {
        ...buildSeoCacheHeaders(category.version || globalVersion),
        "x-reader-route": "seo-category",
      });
      return response;
    });
  }

  const bookMatch = path.match(/^\/book\/([^/]+?)(?:\/chapter-(\d+)(?:-([^/]+))?)?\/?$/);
  if (bookMatch) {
    const slug = bookMatch[1];
    const chapterNumber = bookMatch[2] ? parseInt(bookMatch[2], 10) : 0;
    const chapterSlug = bookMatch[3] || "";
    const book = await readSeoShardedJson(env, "book-shards", slug);
    if (!book) {
      return textResponse("Book not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-book-miss",
      });
    }
    if (!chapterNumber) {
      const canonicalPath = `/book/${book.slug}`;
      if (stripTrailingSlash(path) !== canonicalPath) {
        const headers = new Headers({ location: canonicalPath });
        headers.set("x-reader-worker", "1");
        headers.set("x-reader-route", "seo-book-canonical");
        return new Response(null, { status: 301, headers });
      }
      const displayBook = await enrichBookForDisplay(env, book);
      const recommendations = await buildBookRecommendationSections(env, displayBook);
      return await withSeoCache(request, book.version || globalVersion, cacheVariant, async () => {
        const response = htmlResponse(renderBookPage(canonicalOrigin, displayBook, posthogConfig, recommendations), 200, {
          ...buildSeoCacheHeaders(book.version || globalVersion),
          "x-reader-route": "seo-book",
        });
        return response;
      });
    }

    const chapter = Array.isArray(book.chapters)
      ? book.chapters.find((item) => Number(item.n) === chapterNumber)
      : null;
    if (!chapter) {
      return textResponse("Chapter not found", 404, {
        "cache-control": "no-store",
        "x-reader-route": "seo-chapter-miss",
      });
    }
    const canonicalChapterPath = chapter.href || `/book/${book.slug}/chapter-${chapter.n}${chapter.slug ? `-${chapter.slug}` : ""}`;
    const requestedPath = stripTrailingSlash(path);
    if (requestedPath !== canonicalChapterPath || (chapter.slug && chapterSlug && chapterSlug !== chapter.slug)) {
      const headers = new Headers({ location: canonicalChapterPath });
      headers.set("x-reader-worker", "1");
      headers.set("x-reader-route", "seo-chapter-canonical");
      return new Response(null, { status: 301, headers });
    }
    return await withSeoCache(request, book.version || globalVersion, cacheVariant, async () => {
      const sourceKey = `content/${book.id}/${chapter.sourcePath}`;
      let xhtmlText = await readBucketText(env, sourceKey);
      if (!xhtmlText) {
        xhtmlText = await fetchTextAbsolute(
          `${publicContentOrigin}/books/content/${book.id}/${chapter.sourcePath}`
        );
      }
      if (!xhtmlText) {
        return textResponse("Chapter source not found", 404, {
          "cache-control": "no-store",
          "x-reader-route": "seo-chapter-source-miss",
        });
      }
      const assetBase = contentDirForChapter(book.id, chapter);
      const chapterInner = rewriteRelativeChapterHtml(extractBodyInnerHtml(xhtmlText), assetBase);
      const response = htmlResponse(renderChapterPage(canonicalOrigin, book, chapter, chapterInner, posthogConfig), 200, {
        ...buildSeoCacheHeaders(book.version || globalVersion),
        "x-reader-route": "seo-chapter",
      });
      return response;
    });
  }

  return null;
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
    const posthogKey = String(
      env.READERPUB_POSTHOG_KEY || env.POSTHOG_KEY || ""
    ).trim();
    const posthogHost = String(
      env.READERPUB_POSTHOG_HOST || env.POSTHOG_HOST || ""
    ).trim();
    const rawPosthogEnabled = String(
      env.READERPUB_POSTHOG_ENABLED || env.POSTHOG_ENABLED || ""
    ).trim();
    const posthogEnabled =
      /^(1|true|yes|on)$/i.test(rawPosthogEnabled) && !!posthogKey && !!posthogHost;
    const notesSharePrefix = "api/notes_shares/";

    if (
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      path.startsWith("/sitemaps/") ||
      path.startsWith("/book/") ||
      path.startsWith("/author/") ||
      path.startsWith("/category/")
    ) {
      if (!env.READER_BOOKS && !env.ASSETS) {
        return textResponse("SEO storage missing", 500, {
          "cache-control": "no-store",
          "x-reader-route": "seo-storage-missing",
        });
      }
      const seoResponse = await renderSeoRoute(request, env, url, stripTrailingSlash(path));
      if (seoResponse) return seoResponse;
    }

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

    if (isHtml && (driveClientId || posthogKey || posthogHost || rawPosthogEnabled)) {
      const rewritten = new HTMLRewriter()
        .on('meta[name="google-drive-client-id"]', {
          element(element) {
            element.setAttribute("content", driveClientId);
          },
        })
        .on('meta[name="posthog-enabled"]', {
          element(element) {
            element.setAttribute("content", posthogEnabled ? "true" : "false");
          },
        })
        .on('meta[name="posthog-key"]', {
          element(element) {
            element.setAttribute("content", posthogKey);
          },
        })
        .on('meta[name="posthog-host"]', {
          element(element) {
            element.setAttribute("content", posthogHost);
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
