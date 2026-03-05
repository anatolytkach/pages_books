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

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "www-authenticate": 'Basic realm="ReaderPub Docs", charset="UTF-8"',
      "x-reader-route": "docs-auth",
      "x-reader-worker": "1",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = String(url.pathname || "");
    if (path === "/docs") {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/docs/",
          "cache-control": "no-store",
          "x-reader-route": "docs-slash-redirect",
          "x-reader-worker": "1",
        },
      });
    }
    if (!path.startsWith("/docs/")) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-reader-route": "docs-not-found",
          "x-reader-worker": "1",
        },
      });
    }

    const docsUser = String(env.DOCS_AUTH_USER || "").trim();
    const docsPass = String(env.DOCS_AUTH_PASS || "");
    if (!docsUser || !docsPass) {
      return new Response("Docs auth is not configured", {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-reader-route": "docs-auth-config",
          "x-reader-worker": "1",
        },
      });
    }

    const credentials = parseBasicAuthCredentials(
      request.headers.get("authorization")
    );
    if (
      !credentials ||
      credentials.user !== docsUser ||
      credentials.pass !== docsPass
    ) {
      return unauthorized();
    }

    const upstream = new URL(request.url);
    upstream.protocol = "https:";
    upstream.host = "master.reader-books.pages.dev";
    const upstreamRequest = new Request(upstream.toString(), request);
    const response = await fetch(upstreamRequest, { redirect: "follow" });
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("pragma", "no-cache");
    headers.set("expires", "0");
    headers.set("x-reader-route", "docs");
    headers.set("x-reader-worker", "1");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
