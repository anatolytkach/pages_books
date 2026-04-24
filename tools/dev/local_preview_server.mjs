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
const PROTECTED_CONTENT_V4_DIR = path.join(ROOT, "books", "protected-content-v4");
const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const PROD_ORIGIN = process.env.READERPUB_PREVIEW_UPSTREAM || "https://reader.pub";
const DEFAULT_FRONTEND_SOURCE = String(process.env.READERPUB_PREVIEW_FRONTEND_SOURCE || "local").trim().toLowerCase();
const GOOGLE_DRIVE_CLIENT_ID = process.env.READERPUB_GOOGLE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || "";

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

async function serveFile(res, filePath, route, extraHeaders = {}) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
      return;
    }
    const contentType = mimeType(filePath);
    if (contentType.startsWith("text/html")) {
      let html = await fs.readFile(filePath, "utf-8");
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
    return { file: safeJoin(INDEX_DIR, urlPath.slice("/books/api".length)), route: "r2-api" };
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
  if (urlPath.startsWith("/books/protected-content-v4/")) {
    return {
      file: safeJoin(PROTECTED_CONTENT_V4_DIR, urlPath.slice("/books/protected-content-v4".length)),
      route: "r2-protected-content-v4"
    };
  }
  if (urlPath === "/books/reader/" || urlPath === "/books/reader/index.html") {
    return { file: path.join(READER_DIR, "index.html"), route: "reader" };
  }
  if (urlPath.startsWith("/books/reader/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/books/reader".length)), route: "reader" };
  }
  if (urlPath === "/books/reader_new/" || urlPath === "/books/reader_new/index.html") {
    return { file: path.join(READER_DIR, "reader_new.html"), route: "reader-new" };
  }
  if (urlPath.startsWith("/books/reader_new/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/books/reader_new".length)), route: "reader-new" };
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
  const remoteMode = String(url.searchParams.get("readerRemoteMode") || "").trim().toLowerCase();
  const requestedFrontendSource = String(
    url.searchParams.get("readerFrontendSource") || url.searchParams.get("readerCatalogFrontend") || ""
  )
    .trim()
    .toLowerCase();
  const requestedArtifactSource = String(url.searchParams.get("readerArtifactSource") || "").trim().toLowerCase();
  const requestedContentSource = String(url.searchParams.get("readerContentSource") || "").trim().toLowerCase();
  const cookies = parseCookies(req.headers.cookie || "");
  const cookieFrontendSource = String(
    cookies.readerpub_frontend_source || cookies.readerpub_catalog_frontend || ""
  )
    .trim()
    .toLowerCase();
  const cookieRemoteMode = String(cookies.readerpub_remote_mode || "").trim().toLowerCase();
  const cookieArtifactSource = String(cookies.readerpub_artifact_source || "").trim().toLowerCase();
  const cookieContentSource = String(cookies.readerpub_content_source || "").trim().toLowerCase();
  const frontendSource = requestedFrontendSource || cookieFrontendSource || DEFAULT_FRONTEND_SOURCE;

  if (pathname === "/books") return redirect(res, "/books/", "slash-redirect");
  if (pathname === "/books/protected") return redirect(res, `/books/protected/${url.search}`, "slash-redirect");
  if (pathname === "/books/reader") return redirect(res, "/books/reader/", "slash-redirect");
  if (pathname === "/books/reader_new") return redirect(res, "/books/reader_new/", "slash-redirect");
  if (pathname === "/books/reader1") return redirect(res, "/books/reader1/", "slash-redirect");
  if (pathname === "/books/reader_render_v3") return redirect(res, "/books/reader_render_v3/", "slash-redirect");
  if (pathname === "/books/ping") {
    return send(res, 200, "pong\n", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "ping" });
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
  if (
    pathname.startsWith("/books/content/") &&
    cookieRemoteMode === "strict" &&
    cookieContentSource === "r2"
  ) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-content-strict-remote", {
      "x-reader-book-source": "remote",
      "x-reader-book-origin": PROD_ORIGIN,
      "x-reader-book-fallback": "strict-remote-lock"
    });
  }
  if (pathname.startsWith("/books/content/") && !existsSync(routed.file)) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-content", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "proxy-miss-local"
    });
  }
  if (pathname.startsWith("/books/content/") && existsSync(routed.file)) {
    if (
      (remoteMode === "strict" && requestedContentSource === "r2") ||
      (cookieRemoteMode === "strict" && cookieContentSource === "r2")
    ) {
      return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-content-strict-remote", {
        "x-reader-book-source": "remote",
        "x-reader-book-origin": PROD_ORIGIN,
        "x-reader-book-fallback": "strict-remote-lock"
      });
    }
    return serveFile(res, routed.file, routed.route, {
      "x-reader-book-source": "local",
      "x-reader-book-origin": "localhost",
      "x-reader-book-fallback": "none"
    });
  }
  if (
    pathname.startsWith("/books/protected-content/") &&
    cookieRemoteMode === "strict" &&
    cookieArtifactSource === "r2"
  ) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-protected-content-strict-remote", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "strict-remote-lock"
    });
  }
  if (pathname.startsWith("/books/protected-content/") && !existsSync(routed.file)) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-protected-content", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "proxy-miss-local"
    });
  }
  if (pathname.startsWith("/books/protected-content-v4/") && !existsSync(routed.file)) {
    return send(res, 404, "Not found", {
      "content-type": "text/plain; charset=utf-8",
      "x-reader-route": "not-found-v4-artifact"
    });
  }
  if (
    (pathname.startsWith("/reader_render_v5/artifacts/protected-bootstrap-books/") ||
      pathname.startsWith("/reader_render_v5/artifacts/protected-books/")) &&
    !existsSync(routed.file)
  ) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-v5-artifact", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "proxy-miss-local"
    });
  }
    if (pathname.startsWith("/books/api/")) {
    return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-api", {
      "x-reader-artifact-source": "remote",
      "x-reader-artifact-origin": PROD_ORIGIN,
      "x-reader-artifact-fallback": "proxy-force-remote"
    });
  }
  if (pathname.startsWith("/books/protected-content/") && existsSync(routed.file)) {
    if (
      (remoteMode === "strict" && requestedArtifactSource === "r2") ||
      (cookieRemoteMode === "strict" && cookieArtifactSource === "r2")
    ) {
      return proxyUpstream(req, res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-protected-content-strict-remote", {
        "x-reader-artifact-source": "remote",
        "x-reader-artifact-origin": PROD_ORIGIN,
        "x-reader-artifact-fallback": "strict-remote-lock"
      });
    }
    return serveFile(res, routed.file, routed.route, {
      "x-reader-artifact-source": "local",
      "x-reader-artifact-origin": "localhost",
      "x-reader-artifact-fallback": "none"
    });
  }
  if (pathname.startsWith("/books/protected-content-v4/") && existsSync(routed.file)) {
    return serveFile(res, routed.file, routed.route, {
      "x-reader-artifact-source": "local",
      "x-reader-artifact-origin": "localhost",
      "x-reader-artifact-fallback": "none"
    });
  }
  return serveFile(res, routed.file, routed.route);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ReaderPub local preview: http://${HOST}:${PORT}/books/\n`);
});


