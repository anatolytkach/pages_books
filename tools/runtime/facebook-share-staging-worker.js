const SOURCE_ORIGIN = "https://books-staging.reader.pub";
const API_SOURCE_ORIGIN = "https://readerpub-books-staging.pages.dev";
const SHARE_ORIGIN = "https://fb-books-staging.reader.pub";

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-reader-route": "facebook-share-staging",
      ...headers,
    },
  });
}

function isPreviewBot(request) {
  const userAgent = String(request.headers.get("user-agent") || "");
  return /\b(?:facebookexternalhit|facebot|twitterbot|telegrambot|whatsapp|linkedinbot|slackbot)\b/i.test(userAgent);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteShareHtml(html, sharePath) {
  const sourceShareUrl = `${SOURCE_ORIGIN}${sharePath}`;
  const publicShareUrl = `${SHARE_ORIGIN}${sharePath}`;
  return String(html || "")
    .replace(new RegExp(escapeRegExp(sourceShareUrl), "g"), publicShareUrl)
    .replace(/<meta\s+http-equiv=["']refresh["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?window\.location\.replace[\s\S]*?<\/script>/gi, "");
}

async function handleShortShareApi(request, url) {
  const upstreamUrl = new URL(url.pathname + url.search, API_SOURCE_ORIGIN);
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("host", new URL(API_SOURCE_ORIGIN).host);
  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const headers = new Headers(upstream.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("x-reader-route", "facebook-share-staging-api");
  const contentType = String(headers.get("content-type") || "");
  if (!contentType.includes("application/json")) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  let data = null;
  try {
    data = await upstream.clone().json();
  } catch (_error) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  if (data && data.shareId && data.url) {
    data.url = `${SHARE_ORIGIN}/s/${encodeURIComponent(String(data.shareId))}`;
  }
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify(data), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (
      url.hostname === "books-staging.reader.pub" &&
      (
        url.pathname === "/books/api/ss" ||
        url.pathname === "/api/ss" ||
        url.pathname === "/books/reader/api/ss" ||
        url.pathname === "/books/reader1/api/ss" ||
        url.pathname === "/books/api/selection-share" ||
        url.pathname === "/api/selection-share" ||
        url.pathname === "/books/reader/api/selection-share" ||
        url.pathname === "/books/reader1/api/selection-share"
      )
    ) {
      return handleShortShareApi(request, url);
    }

    if (url.pathname === "/robots.txt") {
      return textResponse(
        [
          "User-agent: facebookexternalhit",
          "Disallow:",
          "Allow: /",
          "",
          "User-agent: Facebot",
          "Disallow:",
          "Allow: /",
          "",
          "User-agent: *",
          "Disallow:",
          "Allow: /",
          "",
        ].join("\n")
      );
    }

    if (!/^\/s\/[A-Za-z0-9_-]{4,64}$/.test(url.pathname)) {
      return textResponse("Not found", 404, { "cache-control": "no-store" });
    }

    const sourceUrl = `${SOURCE_ORIGIN}${url.pathname}`;
    if (!isPreviewBot(request)) {
      return Response.redirect(sourceUrl, 302);
    }

    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.set("user-agent", request.headers.get("user-agent") || "facebookexternalhit/1.1");
    const upstream = await fetch(sourceUrl, {
      headers: upstreamHeaders,
      redirect: "manual",
    });
    const contentType = String(upstream.headers.get("content-type") || "");
    if (!upstream.ok || !contentType.includes("text/html")) {
      return textResponse("Not found", upstream.status || 404, { "cache-control": "no-store" });
    }

    const html = rewriteShareHtml(await upstream.text(), url.pathname);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=600",
        "x-reader-route": "facebook-share-staging",
        "x-robots-tag": "all",
      },
    });
  },
};
