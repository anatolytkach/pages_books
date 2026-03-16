export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = String(url.hostname || "").toLowerCase();
    const path = String(url.pathname || "");
    const isPrimaryHost = host === "reader.pub" || host === "www.reader.pub";
    const isStagingHost = host === "staging.reader.pub";
    if (path === "/docs") {
      if (isPrimaryHost) {
        return new Response(null, {
          status: 302,
          headers: {
            location: "https://staging.reader.pub/docs/",
            "cache-control": "no-store",
            "x-reader-route": "docs-staging-redirect",
            "x-reader-worker": "1",
          },
        });
      }
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

    if (!isPrimaryHost && !isStagingHost) {
      return new Response("Docs host is not configured", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-reader-route": "docs-host-not-found",
          "x-reader-worker": "1",
        },
      });
    }

    if (isPrimaryHost) {
      const redirect = new URL("https://staging.reader.pub/docs/");
      redirect.search = url.search;
      redirect.hash = url.hash;
      return new Response(null, {
        status: 302,
        headers: {
          location: redirect.toString(),
          "cache-control": "no-store",
          "x-reader-route": "docs-staging-redirect",
          "x-reader-worker": "1",
        },
      });
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
