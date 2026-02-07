export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

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

    headers.set("x-reader-worker", "1");
    headers.set("x-reader-route", isCatalogHtml ? "catalog" : "assets");
    if (isCatalogHtml) {
      headers.set("cache-control", "no-store");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
