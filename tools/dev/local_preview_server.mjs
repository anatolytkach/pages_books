import { createReadStream, existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const BOOKS_DIR = path.join(ROOT, "books");
const READER_DIR = path.join(ROOT, "reader");
const READER1_DIR = path.join(ROOT, "reader1");
const READER_RENDER_V3_DIR = path.join(ROOT, "reader_render_v3");
const READER_RENDER_V4_DIR = path.join(ROOT, "reader_render_v4");
const READER_RENDER_V5_DIR = path.join(ROOT, "reader_render_v5");
const INDEX_DIR = path.join(ROOT, "reader_lang_indexes");
const CONTENT_DIR = path.join(ROOT, "books", "content");
const PROTECTED_CONTENT_DIR = path.join(ROOT, "reader_render_v3", "artifacts", "protected-books");
const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const PROD_ORIGIN = process.env.READERPUB_PREVIEW_UPSTREAM || "https://reader.pub";
const DEFAULT_FRONTEND_SOURCE = String(process.env.READERPUB_PREVIEW_FRONTEND_SOURCE || "local").trim().toLowerCase();
const DEFAULT_GOOGLE_DRIVE_CLIENT_ID =
  "495098660383-9us35c8ap8c4tulnmjclv2jp9hear9pt.apps.googleusercontent.com";
const GOOGLE_DRIVE_CLIENT_ID =
  process.env.READERPUB_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_DRIVE_CLIENT_ID ||
  DEFAULT_GOOGLE_DRIVE_CLIENT_ID;
const selectionShares = new Map();

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".xhtml", "application/xhtml+xml; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".opf", "application/oebps-package+xml"],
  [".ncx", "application/x-dtbncx+xml"],
]);

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const eqIndex = item.indexOf("=");
        if (eqIndex < 0) return [item, ""];
        return [item.slice(0, eqIndex), decodeURIComponent(item.slice(eqIndex + 1))];
      })
  );
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    "x-reader-worker": "1",
    ...headers,
  });
  res.end(body);
}

function redirect(res, location, route = "redirect") {
  send(res, 302, "", { location, "x-reader-route": route });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function normalizePreviewText(value, maxLength = 220) {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  if (source.length <= maxLength) return source;
  const cut = source.slice(0, Math.max(0, maxLength - 1)).replace(/\s+\S*$/, "");
  return `${cut || source.slice(0, Math.max(0, maxLength - 1))}...`;
}

function bookLocationShard(id) {
  const raw = String(id || "").trim();
  if (/^\d+$/.test(raw)) return String(Number(raw) % 100).padStart(2, "0");
  let total = 0;
  for (let i = 0; i < raw.length; i++) total = (total + raw.charCodeAt(i)) % 100;
  return String(total).padStart(2, "0");
}

async function readBookLocationShard(source, shard) {
  const relPath = source
    ? `/book-locations/${source}/${shard}.json`
    : `/book-locations/${shard}.json`;
  const filePath = safeJoin(INDEX_DIR, relPath);
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

async function resolveReaderPreviewMeta(url) {
  const id = String(url.searchParams.get("id") || url.searchParams.get("i") || "").trim();
  if (!id) return null;
  const shard = bookLocationShard(id);
  const source = String(url.searchParams.get("source") || "").trim();
  const candidates = [];
  if (source) candidates.push(await readBookLocationShard(source, shard));
  candidates.push(await readBookLocationShard("", shard));
  if (source !== "gutenberg") candidates.push(await readBookLocationShard("gutenberg", shard));

  let item = null;
  for (const payload of candidates) {
    const found = payload && payload.items && payload.items[id] ? payload.items[id] : null;
    if (found) {
      item = found;
      break;
    }
  }
  if (!item) return null;

  const title = String(item.title || "ReaderPub").trim();
  const author = formatAuthorDisplayName(item.author || item.creator || "");
  const quote = normalizePreviewText(url.searchParams.get("selectionText") || "", 240);
  const description = quote
    ? `${author ? `by ${author}. ` : ""}"${quote}"`
    : `${author ? `by ${author}. ` : ""}Read on ReaderPub.`;
  let image = String(item.cover || item.coverUrl || item.cover_url || "").trim();
  if (image && !/^https?:\/\//i.test(image)) {
    image = `${url.origin}${image.startsWith("/") ? "" : "/"}${image}`;
  }
  return {
    title,
    author,
    quote,
    description: normalizePreviewText(description, 300),
    image,
    url: url.toString(),
  };
}

function injectReaderPreviewMeta(html, meta) {
  if (!meta) return html;
  const tags = [
    `<meta property="og:site_name" content="ReaderPub" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : "",
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : "",
    meta.author ? `<meta name="author" content="${escapeHtml(meta.author)}" />` : "",
  ].filter(Boolean).join("\n");
  return html.replace(/<\/head>/i, `${tags}\n</head>`);
}

function randomShareId() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 9; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function normalizeSelectionSharePayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bookId = String(raw.bookId || raw.id || raw.i || "").trim().slice(0, 200);
  const selectionCfi = String(raw.selectionCfi || raw.cfi || "").trim().slice(0, 2000);
  if (!bookId || !/^epubcfi\(/i.test(selectionCfi)) return null;
  return {
    v: 1,
    type: "reader-selection",
    bookId,
    source: String(raw.source || "").trim().slice(0, 200),
    selectionCfi,
    selectionText: String(raw.selectionText || raw.text || "").replace(/\s+/g, " ").trim().slice(0, 500),
    createdAt: Date.now(),
  };
}

function buildSelectionReaderUrl(origin, payload) {
  const safePayload = normalizeSelectionSharePayload(payload);
  if (!safePayload) return "";
  const u = new URL("/reader1/", origin);
  u.searchParams.set("id", safePayload.bookId);
  if (safePayload.source) u.searchParams.set("source", safePayload.source);
  u.searchParams.set("selectionCfi", safePayload.selectionCfi);
  if (safePayload.selectionText) u.searchParams.set("selectionText", safePayload.selectionText);
  u.hash = safePayload.selectionCfi;
  return u.toString();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body, headers = {}) {
  return send(res, status, JSON.stringify(body), {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    ...headers,
  });
}

async function handleSelectionShareCreate(req, res, url) {
  if (req.method === "OPTIONS") {
    return send(res, 204, "", {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "x-reader-route": "selection-share-options",
    });
  }
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" }, { "x-reader-route": "selection-share-method" });
  }
  try {
    const payload = normalizeSelectionSharePayload(await readJsonBody(req));
    if (!payload) return sendJson(res, 400, { error: "Invalid selection share payload" });
    let shareId = "";
    for (let i = 0; i < 5; i++) {
      shareId = randomShareId();
      if (!selectionShares.has(shareId)) break;
      shareId = "";
    }
    if (!shareId) return sendJson(res, 500, { error: "Failed to create share id" });
    selectionShares.set(shareId, payload);
    return sendJson(res, 200, {
      shareId,
      url: new URL(`/s/${encodeURIComponent(shareId)}`, url.origin).toString(),
    }, { "x-reader-route": "selection-share-create" });
  } catch (error) {
    return sendJson(res, 500, { error: "Failed to create selection share" });
  }
}

async function handleSelectionSharePage(res, url, shareId) {
  const payload = selectionShares.get(shareId);
  if (!payload) return send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "selection-share-miss" });
  const targetUrl = buildSelectionReaderUrl(url.origin, payload);
  const previewUrl = new URL(targetUrl);
  const meta = await resolveReaderPreviewMeta(previewUrl);
  if (meta) meta.url = new URL(`/s/${encodeURIComponent(shareId)}`, url.origin).toString();
  const tags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml((meta && meta.title) || "ReaderPub")}</title>`,
    meta ? injectReaderPreviewMeta("<head></head>", meta).replace(/^<head>|<\/head>$/g, "") : "",
    `<link rel="canonical" href="${escapeHtml(targetUrl)}" />`,
    `<meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}" />`,
    `<script>window.location.replace(${JSON.stringify(targetUrl)});</script>`,
  ].filter(Boolean).join("\n");
  return send(res, 200, `<!doctype html><html lang="en"><head>${tags}</head><body><a href="${escapeHtml(targetUrl)}">Open in ReaderPub</a></body></html>`, {
    "content-type": "text/html; charset=utf-8",
    "x-reader-route": "selection-share-page",
  });
}

function buildProtectedReaderRedirect(url) {
  const params = new URLSearchParams(url.search || "");
  const id = String(
    params.get("id") || params.get("protectedArtifactBookId") || params.get("artifactBookId") || ""
  ).trim();
  if (params.get("reader") !== "protected") {
    params.set("reader", "protected");
  }
  if (id && params.get("artifactBookId") !== id) {
    params.set("artifactBookId", id);
  }
  if (id && params.get("protectedArtifactBookId") !== id) {
    params.set("protectedArtifactBookId", id);
  }
  if (!params.get("protectedUx")) {
    params.set("protectedUx", "protected-shell");
  }
  if (!params.get("renderMode")) {
    params.set("renderMode", "shape");
  }
  if (!params.get("metricsMode")) {
    params.set("metricsMode", "shape");
  }
  const hasRemoteHint =
    params.get("protectedArtifactSource") === "r2" ||
    params.get("readerContentSource") === "r2" ||
    params.get("readerRemoteMode") === "strict";
  if (!params.get("protectedArtifactSource") && (hasRemoteHint || id)) {
    params.set("protectedArtifactSource", "r2");
  }
  if (!params.get("readerRemoteMode")) {
    params.set("readerRemoteMode", "strict");
  }
  if (!params.get("protectedAllowAll")) {
    params.set("protectedAllowAll", "1");
  }
  return `/reader/reader_new_v5.html?${params.toString()}`;
}

function mimeType(filePath) {
  return MIME.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function safeJoin(base, relPath) {
  const abs = path.resolve(base, "." + relPath);
  if (!abs.startsWith(base)) return null;
  return abs;
}

function isRemoteFrontendPath(urlPath) {
  return (
    urlPath === "/books/" ||
    urlPath === "/books/index.html" ||
    urlPath === "/books/catalog.config.json" ||
    urlPath.startsWith("/books/assets/") ||
    urlPath.startsWith("/books/shared/")
  );
}

async function serveFile(res, filePath, route, extraHeaders = {}, options = {}) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
      return;
    }
    const contentType = mimeType(filePath);
    if (contentType.startsWith("text/html")) {
      let html = await fs.readFile(filePath, "utf-8");
      if (options.readerPreviewMeta) {
        html = injectReaderPreviewMeta(html, options.readerPreviewMeta);
      }
      if (GOOGLE_DRIVE_CLIENT_ID) {
        html = html.replace(
          /<meta\s+name="google-drive-client-id"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="google-drive-client-id" content="${GOOGLE_DRIVE_CLIENT_ID}" />`
        );
      }
      send(res, 200, html, {
        "content-type": contentType,
        "x-reader-route": route,
        ...extraHeaders,
      });
      return;
    }
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-reader-worker": "1",
      "x-reader-route": route,
      ...extraHeaders,
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

async function proxyUpstream(req, res, upstreamUrl, route, extraHeaders = {}) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    const upstreamHeaders = {};
    const contentType = req.headers["content-type"];
    const accept = req.headers.accept;
    const cookie = req.headers.cookie;
    if (contentType) upstreamHeaders["content-type"] = contentType;
    if (accept) upstreamHeaders.accept = accept;
    if (cookie) upstreamHeaders.cookie = cookie;
    const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
    const response = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body
    });
    const responseHeaders = {
      "cache-control": "no-store",
      "x-reader-worker": "1",
      "x-reader-route": route,
      "content-type": response.headers.get("content-type") || "application/octet-stream",
      ...extraHeaders,
    };
    res.writeHead(response.status, responseHeaders);
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    send(res, 502, "Upstream fetch failed", {
      "content-type": "text/plain; charset=utf-8",
      "x-reader-route": "upstream-error",
    });
  }
}

async function serveCatalogConfig(res) {
  const source = path.join(BOOKS_DIR, "catalog.config.json");
  const raw = JSON.parse(await fs.readFile(source, "utf-8"));
  const origin = `http://${HOST}:${PORT}`;
  raw.baseUrl = `${origin}/books/api`;
  raw.assetBaseUrl = origin;
  send(res, 200, JSON.stringify(raw), {
    "content-type": "application/json; charset=utf-8",
    "x-reader-route": "catalog-config",
  });
}

function routeLocalPath(urlPath) {
  if (urlPath === "/books/" || urlPath === "/books/index.html") {
    return { file: path.join(BOOKS_DIR, "index.html"), route: "catalog" };
  }
  if (urlPath === "/books/auth/" || urlPath === "/books/auth/index.html") {
    return { file: path.join(BOOKS_DIR, "auth", "index.html"), route: "books-auth" };
  }
  if (urlPath.startsWith("/books/auth/")) {
    return { file: safeJoin(path.join(BOOKS_DIR, "auth"), urlPath.slice("/books/auth".length)), route: "books-auth" };
  }
  if (urlPath === "/books/account/" || urlPath === "/books/account/index.html") {
    return { file: path.join(BOOKS_DIR, "account", "index.html"), route: "books-account" };
  }
  if (urlPath.startsWith("/books/account/")) {
    return { file: safeJoin(path.join(BOOKS_DIR, "account"), urlPath.slice("/books/account".length)), route: "books-account" };
  }
  if (urlPath === "/books/publish/" || urlPath === "/books/publish/index.html") {
    return { file: path.join(BOOKS_DIR, "publish", "index.html"), route: "books-publish" };
  }
  if (urlPath.startsWith("/books/publish/")) {
    return { file: safeJoin(path.join(BOOKS_DIR, "publish"), urlPath.slice("/books/publish".length)), route: "books-publish" };
  }
  if (urlPath === "/books/catalog.config.json") {
    return { dynamic: "catalog-config" };
  }
  if (urlPath.startsWith("/books/assets/")) {
    return { file: safeJoin(path.join(BOOKS_DIR, "assets"), urlPath.slice("/books/assets".length)), route: "assets" };
  }
  if (urlPath.startsWith("/books/shared/")) {
    return { file: safeJoin(path.join(BOOKS_DIR, "shared"), urlPath.slice("/books/shared".length)), route: "shared" };
  }
  if (urlPath.startsWith("/books/api/")) {
    const relPath = urlPath.slice("/books/api".length);
    const localFile = safeJoin(INDEX_DIR, relPath);
    if (localFile && existsSync(localFile)) {
      return { file: localFile, route: "r2-api" };
    }
    const lowerFile = safeJoin(INDEX_DIR, relPath.toLocaleLowerCase());
    if (lowerFile && lowerFile !== localFile && existsSync(lowerFile)) {
      return { file: lowerFile, route: "r2-api-lowercase-fallback" };
    }
    return { file: localFile, route: "r2-api" };
  }
  if (urlPath.startsWith("/books/content/")) {
    return { file: safeJoin(CONTENT_DIR, urlPath.slice("/books/content".length)), route: "r2-content" };
  }
  if (urlPath.startsWith("/books/protected-content/")) {
    return {
      file: safeJoin(PROTECTED_CONTENT_DIR, urlPath.slice("/books/protected-content".length)),
      route: "r2-protected-content"
    };
  }
  if (urlPath === "/books/reader/" || urlPath === "/books/reader/index.html") {
    return { file: path.join(READER1_DIR, "index.html"), route: "reader1-legacy-alias" };
  }
  if (urlPath.startsWith("/books/reader/")) {
    return { file: safeJoin(READER1_DIR, urlPath.slice("/books/reader".length)), route: "reader1-legacy-alias" };
  }
  if (urlPath === "/books/reader_new/" || urlPath === "/books/reader_new/index.html") {
    return { file: path.join(READER_DIR, "reader_new.html"), route: "reader-new" };
  }
  if (urlPath.startsWith("/books/reader_new/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/books/reader_new".length)), route: "reader-new" };
  }
  if (
    urlPath === "/books/reader_new_v5/" ||
    urlPath === "/books/reader_new_v5/index.html" ||
    urlPath === "/books/protected/" ||
    urlPath === "/books/protected/index.html"
  ) {
    return { file: path.join(READER_DIR, "reader_new_v5.html"), route: "reader-new-v5" };
  }
  if (
    urlPath.startsWith("/books/protected/css/") ||
    urlPath.startsWith("/books/protected/js/") ||
    urlPath.startsWith("/books/protected/icons/") ||
    urlPath.startsWith("/books/protected/font/") ||
    urlPath.startsWith("/books/protected/fonts/") ||
    urlPath.startsWith("/books/protected/img/")
  ) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/books/protected".length)), route: "reader-new-v5-assets" };
  }
  if (urlPath === "/books/reader1/" || urlPath === "/books/reader1/index.html") {
    return { file: path.join(READER1_DIR, "index.html"), route: "reader1" };
  }
  if (urlPath.startsWith("/books/reader1/")) {
    return { file: safeJoin(READER1_DIR, urlPath.slice("/books/reader1".length)), route: "reader1" };
  }
  if (urlPath === "/books/reader_render_v3/" || urlPath === "/books/reader_render_v3/index.html") {
    return { file: path.join(READER_RENDER_V3_DIR, "index.html"), route: "reader-render-v3" };
  }
  if (urlPath.startsWith("/books/reader_render_v3/")) {
    return { file: safeJoin(READER_RENDER_V3_DIR, urlPath.slice("/books/reader_render_v3".length)), route: "reader-render-v3" };
  }
  if (urlPath === "/reader/" || urlPath === "/reader/index.html") {
    return { file: path.join(READER_DIR, "index.html"), route: "reader" };
  }
  if (urlPath.startsWith("/reader/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/reader".length)), route: "reader" };
  }
  if (urlPath === "/reader_new/" || urlPath === "/reader_new/index.html") {
    return { file: path.join(READER_DIR, "reader_new.html"), route: "reader-new" };
  }
  if (urlPath.startsWith("/reader_new/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/reader_new".length)), route: "reader-new" };
  }
  if (urlPath === "/reader1/" || urlPath === "/reader1/index.html") {
    return { file: path.join(READER1_DIR, "index.html"), route: "reader1" };
  }
  if (urlPath.startsWith("/reader1/")) {
    return { file: safeJoin(READER1_DIR, urlPath.slice("/reader1".length)), route: "reader1" };
  }
  if (urlPath === "/reader_render_v3/" || urlPath === "/reader_render_v3/index.html") {
    return { file: path.join(READER_RENDER_V3_DIR, "index.html"), route: "reader-render-v3" };
  }
  if (urlPath.startsWith("/reader_render_v3/")) {
    return { file: safeJoin(READER_RENDER_V3_DIR, urlPath.slice("/reader_render_v3".length)), route: "reader-render-v3" };
  }
  if (urlPath === "/reader_render_v4/" || urlPath === "/reader_render_v4/index.html") {
    return { file: path.join(READER_RENDER_V4_DIR, "index.html"), route: "reader-render-v4" };
  }
  if (urlPath.startsWith("/reader_render_v4/")) {
    return { file: safeJoin(READER_RENDER_V4_DIR, urlPath.slice("/reader_render_v4".length)), route: "reader-render-v4" };
  }
  if (urlPath === "/reader_render_v5/" || urlPath === "/reader_render_v5/index.html") {
    return { file: path.join(READER_RENDER_V5_DIR, "index.html"), route: "reader-render-v5" };
  }
  if (urlPath.startsWith("/reader_render_v5/")) {
    return { file: safeJoin(READER_RENDER_V5_DIR, urlPath.slice("/reader_render_v5".length)), route: "reader-render-v5" };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);
  const requestedFrontendSource = String(
    url.searchParams.get("readerFrontendSource") || url.searchParams.get("readerCatalogFrontend") || ""
  )
    .trim()
    .toLowerCase();
  const cookies = parseCookies(req.headers.cookie || "");
  const cookieFrontendSource = String(
    cookies.readerpub_frontend_source || cookies.readerpub_catalog_frontend || ""
  )
    .trim()
    .toLowerCase();
  const frontendSource = requestedFrontendSource || cookieFrontendSource || DEFAULT_FRONTEND_SOURCE;

  if (pathname === "/books") return redirect(res, "/books/", "slash-redirect");
  if (pathname === "/books/auth") return redirect(res, "/books/auth/", "slash-redirect");
  if (pathname === "/books/account") return redirect(res, "/books/account/", "slash-redirect");
  if (pathname === "/books/publish") return redirect(res, "/books/publish/", "slash-redirect");
  if (pathname === "/books/protected") return redirect(res, `/books/protected/${url.search}`, "slash-redirect");
  if (pathname === "/books/reader") return redirect(res, "/books/reader/", "slash-redirect");
  if (pathname === "/books/reader_new") return redirect(res, "/books/reader_new/", "slash-redirect");
  if (pathname === "/books/reader_new_v5") return redirect(res, "/books/reader_new_v5/", "slash-redirect");
  if (pathname === "/books/protected") return redirect(res, `/books/protected/${url.search || ""}`, "slash-redirect");
  if (pathname === "/books/reader1") return redirect(res, "/books/reader1/", "slash-redirect");
  if (pathname === "/books/reader_render_v3") return redirect(res, "/books/reader_render_v3/", "slash-redirect");
  if (pathname === "/books/ping") {
    return send(res, 200, "pong\n", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "ping" });
  }

  if (
    pathname === "/books/api/ss" ||
    pathname === "/api/ss" ||
    pathname === "/books/api/selection-share" ||
    pathname === "/api/selection-share"
  ) {
    return handleSelectionShareCreate(req, res, url);
  }

  const shortShareMatch = pathname.match(/^\/s\/([A-Za-z0-9_-]{4,64})$/);
  if (shortShareMatch) {
    return handleSelectionSharePage(res, url, shortShareMatch[1]);
  }

  if (pathname === "/books/protected/" || pathname.startsWith("/books/protected/")) {
    return redirect(res, buildProtectedReaderRedirect(url), "protected-reader-redirect");
  }

  const idMatch = pathname.match(/^\/books\/(\d+)(\/)?$/);
  if (idMatch) {
    return redirect(res, `/books/reader/#${idMatch[1]}`, "redirect");
  }

  if (frontendSource === "remote" && isRemoteFrontendPath(pathname)) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-frontend", {
      "x-reader-frontend-source": "remote",
      "x-reader-frontend-origin": PROD_ORIGIN,
    });
  }

  const routed = routeLocalPath(pathname);
  if (!routed) {
    return send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
  }
  if (routed.dynamic === "catalog-config") {
    return serveCatalogConfig(res);
  }
  if (!routed.file) {
    return send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
  }
  if (pathname.startsWith("/books/content/")) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-content-force-remote", {
      "x-reader-book-source": "remote",
      "x-reader-book-origin": PROD_ORIGIN,
      "x-reader-book-fallback": "force-remote"
    });
  }
  if (pathname.startsWith("/books/protected-content/")) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-protected-content-force-remote", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "force-remote"
    });
  }
  if (
    pathname.startsWith("/reader_render_v5/artifacts/protected-bootstrap-books/") ||
    pathname.startsWith("/reader_render_v5/artifacts/protected-books/")
  ) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-v5-artifact-force-remote", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "force-remote"
    });
  }
  if (pathname.startsWith("/books/api/")) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-api", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "proxy-force-remote"
    });
  }
  const readerPreviewMeta =
    (
      pathname === "/books/reader/" ||
      pathname === "/books/reader/index.html" ||
      pathname === "/reader1/" ||
      pathname === "/reader1/index.html"
    )
      ? await resolveReaderPreviewMeta(url)
      : null;
  return serveFile(res, routed.file, routed.route, {}, { readerPreviewMeta });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ReaderPub local preview: http://${HOST}:${PORT}/books/\n`);
});
