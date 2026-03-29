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
const INDEX_DIR = path.join(ROOT, "reader_lang_indexes");
const CONTENT_DIR = path.join(ROOT, "books", "content");
const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const PROD_ORIGIN = process.env.READERPUB_PREVIEW_UPSTREAM || "https://reader.pub";

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

function mimeType(filePath) {
  return MIME.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function safeJoin(base, relPath) {
  const abs = path.resolve(base, "." + relPath);
  if (!abs.startsWith(base)) return null;
  return abs;
}

async function serveFile(res, filePath, route) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
      return;
    }
    res.writeHead(200, {
      "content-type": mimeType(filePath),
      "cache-control": "no-store",
      "x-reader-worker": "1",
      "x-reader-route": route,
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "not-found" });
  }
}

async function proxyUpstream(res, upstreamUrl, route) {
  try {
    const response = await fetch(upstreamUrl);
    const headers = {
      "cache-control": "no-store",
      "x-reader-worker": "1",
      "x-reader-route": route,
      "content-type": response.headers.get("content-type") || "application/octet-stream",
    };
    res.writeHead(response.status, headers);
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
  if (urlPath === "/books/reader/" || urlPath === "/books/reader/index.html") {
    return { file: path.join(READER_DIR, "index.html"), route: "reader" };
  }
  if (urlPath.startsWith("/books/reader/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/books/reader".length)), route: "reader" };
  }
  if (urlPath === "/reader/" || urlPath === "/reader/index.html") {
    return { file: path.join(READER_DIR, "index.html"), route: "reader" };
  }
  if (urlPath.startsWith("/reader/")) {
    return { file: safeJoin(READER_DIR, urlPath.slice("/reader".length)), route: "reader" };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/books") return redirect(res, "/books/", "slash-redirect");
  if (pathname === "/books/reader") return redirect(res, "/books/reader/", "slash-redirect");
  if (pathname === "/books/ping") {
    return send(res, 200, "pong\n", { "content-type": "text/plain; charset=utf-8", "x-reader-route": "ping" });
  }

  const idMatch = pathname.match(/^\/books\/(\d+)(\/)?$/);
  if (idMatch) {
    return redirect(res, `/books/reader/#${idMatch[1]}`, "redirect");
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
  if (pathname.startsWith("/books/content/") && !existsSync(routed.file)) {
    return proxyUpstream(res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-content");
  }
  if (pathname.startsWith("/books/api/") && !existsSync(routed.file)) {
    return proxyUpstream(res, `${PROD_ORIGIN}${pathname}${url.search}`, "proxy-api");
  }
  return serveFile(res, routed.file, routed.route);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ReaderPub local preview: http://${HOST}:${PORT}/books/\n`);
});
