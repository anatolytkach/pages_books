import readerBooksPagesWorker from "../../_worker.js";
import { runScheduledPublisherTaskGeneration } from "../../publisher_tasks/service.mjs";

function withTraceHeaders(headers, route) {
  headers.set("x-reader-worker", "1");
  if (route) headers.set("x-reader-route", route);
  return headers;
}

const ROOT_ROBOTS_TXT = `User-agent: *
Allow: /book/
Allow: /author/
Allow: /category/
Allow: /sitemap.xml
Allow: /sitemaps/
Disallow: /books/reader/
Disallow: /books/reader_new/
Disallow: /books/reader1/
Disallow: /books/api/

Sitemap: https://reader.pub/sitemap.xml
`;

function redirect(location, route, status = 302) {
  const headers = withTraceHeaders(new Headers({ location }), route);
  return new Response(null, { status, headers });
}

function proxyRequest(request, upstreamUrl, route, extraHeaders = null) {
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  if (extraHeaders) {
    const headers = new Headers(upstreamRequest.headers);
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (value !== undefined && value !== null && value !== "") {
        headers.set(name, String(value));
      }
    }
    return fetch(new Request(upstreamUrl.toString(), { method: upstreamRequest.method, headers, body: upstreamRequest.body, redirect: "manual" })).then((response) => {
      const responseHeaders = withTraceHeaders(new Headers(response.headers), route);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    });
  }
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

async function serveProtectedArtifactObject(env, key, route) {
  const response = await serveR2Object(env, key, route);
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (error) {
    return String(value || "");
  }
}

function stripTrailingSlash(path) {
  if (!path || path === "/") return "/";
  return path.replace(/\/+$/, "") || "/";
}

async function serveR2ObjectWithFallback(env, primaryKey, fallbackKey, route) {
  const primary = await serveR2Object(env, primaryKey, route);
  if (primary.status !== 404 || !fallbackKey || fallbackKey === primaryKey) {
    return primary;
  }
  return serveR2Object(env, fallbackKey, route);
}

async function fetchPosthogPublicConfig(host) {
  try {
    const response = await fetch(`${host}/books/`, { method: "GET" });
    if (!response || !response.ok) return null;
    const html = await response.text();
    const readMeta = (name) => {
      const match = html.match(
        new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, "i")
      );
      return match ? String(match[1] || "").trim() : "";
    };
    const enabled = readMeta("posthog-enabled");
    const key = readMeta("posthog-key");
    const hostValue = readMeta("posthog-host");
    if (!enabled && !key && !hostValue) return null;
    return {
      READERPUB_POSTHOG_ENABLED: enabled,
      READERPUB_POSTHOG_KEY: key,
      READERPUB_POSTHOG_HOST: hostValue,
    };
  } catch (error) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const normalizedPath = stripTrailingSlash(path);
    const host = "https://reader-books.pages.dev";

    if (path === "/books") {
      return redirect("/books/", "slash-redirect");
    }

    if (path === "/books/reader") {
      return redirect("/books/reader/", "slash-redirect");
    }

    if (path === "/books/reader_new") {
      return redirect("/books/reader_new/", "slash-redirect");
    }

    if (path === "/books/reader1") {
      return redirect("/books/reader1/", "slash-redirect");
    }

    if (path === "/books/ping") {
      return new Response("pong\n", {
        status: 200,
        headers: withTraceHeaders(new Headers({ "cache-control": "no-store" }), "ping"),
      });
    }

    if (
      normalizedPath === "/get-tasks" ||
      normalizedPath === "/run-daily" ||
      normalizedPath === "/report-outcome" ||
      normalizedPath.startsWith("/api/")
    ) {
      const response = await readerBooksPagesWorker.fetch(request, env);
      const headers = withTraceHeaders(new Headers(response.headers), "publisher-tasks-direct");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const idMatch = path.match(/^\/books\/(\d+)(\/)?$/);
    if (idMatch) {
      return redirect(`/books/reader/#${idMatch[1]}`, "redirect");
    }

    if (normalizedPath.startsWith("/books/api/")) {
      if (
        normalizedPath === "/books/api/get-tasks" ||
        normalizedPath === "/books/api/run-daily" ||
        normalizedPath === "/books/api/report-outcome"
      ) {
        const response = await readerBooksPagesWorker.fetch(request, env);
        const headers = withTraceHeaders(new Headers(response.headers), "publisher-books-api-direct");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      const rawSuffix = normalizedPath.slice("/books/api/".length);
      const decodedSuffix = decodePathSegment(rawSuffix);
      return serveR2ObjectWithFallback(
        env,
        `api/${decodedSuffix}`,
        `api/${rawSuffix}`,
        "r2-api",
      );
    }

    if (path.startsWith("/books/content/")) {
      const rawSuffix = path.slice("/books/content/".length);
      const decodedSuffix = decodePathSegment(rawSuffix);
      return serveR2ObjectWithFallback(
        env,
        `content/${decodedSuffix}`,
        `content/${rawSuffix}`,
        "r2-content",
      );
    }

    if (path.startsWith("/books/protected-content/")) {
      const rawSuffix = path.slice("/books/protected-content/".length);
      const decodedSuffix = decodePathSegment(rawSuffix);
      const primaryKey = `protected-content/${decodedSuffix}`;
      const fallbackKey = `protected-content/${rawSuffix}`;
      const primary = await serveProtectedArtifactObject(env, primaryKey, "r2-protected-content");
      if (primary.status !== 404 || !fallbackKey || fallbackKey === primaryKey) {
        return primary;
      }
      return serveProtectedArtifactObject(env, fallbackKey, "r2-protected-content");
    }

    if (path.startsWith("/books/reader/api/")) {
      const upstreamUrl = new URL(`${host}${path}`);
      upstreamUrl.search = url.search;
      return proxyRequest(request, upstreamUrl, "proxy-reader-api");
    }

    if (
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      path.startsWith("/sitemaps/") ||
      path.startsWith("/book/") ||
      path.startsWith("/author/") ||
      path.startsWith("/category/")
    ) {
      if (path === "/robots.txt") {
        return new Response(ROOT_ROBOTS_TXT, {
          status: 200,
          headers: withTraceHeaders(
            new Headers({
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "public, max-age=900",
            }),
            "proxy-root-robots",
          ),
        });
      }
      const headers = new Headers(request.headers);
      headers.set("x-reader-canonical-origin", `${url.protocol}//${url.host}`);
      const posthogConfig = await fetchPosthogPublicConfig(host);
      return readerBooksPagesWorker.fetch(
        new Request(request.url, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        }),
        {
          ...env,
          ...(posthogConfig || {}),
          READER_BOOKS: env.BOOKS,
        },
      );
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

    if (path === "/books/reader_new/" || path.startsWith("/books/reader_new/")) {
      const rewrittenPath =
        path === "/books/reader_new/" || path === "/books/reader_new/index.html"
          ? "/reader/reader_new.html"
          : path.replace(/^\/books\/reader_new/, "/reader");
      const upstreamUrl = new URL(`${host}${rewrittenPath}`);
      upstreamUrl.search = url.search;
      return proxyRequest(request, upstreamUrl, "proxy-reader-new");
    }

    if (path === "/books/reader1/" || path.startsWith("/books/reader1/")) {
      const rewrittenPath = path.replace(/^\/books\/reader1/, "/reader1");
      const upstreamUrl = new URL(`${host}${rewrittenPath}`);
      upstreamUrl.search = url.search;
      return proxyRequest(request, upstreamUrl, "proxy-reader1");
    }

    return new Response("Not found", {
      status: 404,
      headers: withTraceHeaders(new Headers({ "cache-control": "no-store" }), "not-found"),
    });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledPublisherTaskGeneration(env, new Date(controller.scheduledTime)));
  },
};
