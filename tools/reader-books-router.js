function withTraceHeaders(headers, route) {
  headers.set("x-reader-worker", "1");
  if (route) headers.set("x-reader-route", route);
  return headers;
}

function redirect(location, route, status = 302) {
  const headers = withTraceHeaders(new Headers({ location }), route);
  return new Response(null, { status, headers });
}

function proxyRequest(request, upstreamUrl, route) {
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  return fetch(upstreamRequest).then((response) => {
    const headers = withTraceHeaders(new Headers(response.headers), route);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

function contentTypeFromKey(key) {
  const normalized = String(key || "").toLowerCase();
  if (normalized.endsWith(".json")) return "application/json; charset=utf-8";
  if (normalized.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (normalized.endsWith(".html")) return "text/html; charset=utf-8";
  if (normalized.endsWith(".css")) return "text/css; charset=utf-8";
  if (normalized.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".woff")) return "font/woff";
  if (normalized.endsWith(".woff2")) return "font/woff2";
  if (normalized.endsWith(".ttf")) return "font/ttf";
  if (normalized.endsWith(".otf")) return "font/otf";
  if (normalized.endsWith(".ncx")) return "application/x-dtbncx+xml";
  if (normalized.endsWith(".opf")) return "application/oebps-package+xml";
  if (normalized.endsWith(".xhtml")) return "application/xhtml+xml; charset=utf-8";
  return "application/octet-stream";
}

async function serveR2Object(env, key, route) {
  if (!env.BOOKS) {
    return new Response("R2 binding missing", {
      status: 500,
      headers: withTraceHeaders(new Headers({ "cache-control": "no-store" }), "r2-missing"),
    });
  }

  const object = await env.BOOKS.get(key);
  if (!object) {
    return new Response("Not found", {
      status: 404,
      headers: withTraceHeaders(new Headers({ "cache-control": "no-store" }), "r2-miss"),
    });
  }

  const headers = new Headers();
  headers.set("cache-control", key.startsWith("api/") ? "no-store" : "public, max-age=3600");
  headers.set("content-type", contentTypeFromKey(key));
  try {
    object.writeHttpMetadata(headers);
  } catch (error) {}

  return new Response(object.body, {
    status: 200,
    headers: withTraceHeaders(headers, route),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const host = "https://reader-books.pages.dev";

    if (path === "/books") {
      return redirect("/books/", "slash-redirect");
    }

    if (path === "/books/reader") {
      return redirect("/books/reader/", "slash-redirect");
    }

    if (path === "/books/ping") {
      return new Response("pong\n", {
        status: 200,
        headers: withTraceHeaders(new Headers({ "cache-control": "no-store" }), "ping"),
      });
    }

    const idMatch = path.match(/^\/books\/(\d+)(\/)?$/);
    if (idMatch) {
      return redirect(`/books/reader/#${idMatch[1]}`, "redirect");
    }

    if (path.startsWith("/books/api/")) {
      const key = `api/${path.slice("/books/api/".length)}`;
      return serveR2Object(env, key, "r2-api");
    }

    if (path.startsWith("/books/content/")) {
      const key = `content/${path.slice("/books/content/".length)}`;
      return serveR2Object(env, key, "r2-content");
    }

    if (path.startsWith("/books/reader/api/")) {
      const upstreamUrl = new URL(`${host}${path}`);
      upstreamUrl.search = url.search;
      return proxyRequest(request, upstreamUrl, "proxy-reader-api");
    }

    if (
      path === "/books/" ||
      path === "/books/index.html" ||
      path === "/books/catalog.config.json" ||
      path.startsWith("/books/assets/") ||
      path.startsWith("/books/shared/")
    ) {
      const upstreamUrl = new URL(`${host}${path}`);
      upstreamUrl.search = url.search;
      return proxyRequest(request, upstreamUrl, "proxy-index");
    }

    if (path === "/books/reader/" || path.startsWith("/books/reader/")) {
      const rewrittenPath = path.replace(/^\/books\/reader/, "/reader");
      const upstreamUrl = new URL(`${host}${rewrittenPath}`);
      upstreamUrl.search = url.search;
      return proxyRequest(request, upstreamUrl, "proxy-reader");
    }

    return new Response("Not found", {
      status: 404,
      headers: withTraceHeaders(new Headers({ "cache-control": "no-store" }), "not-found"),
    });
  },
};
