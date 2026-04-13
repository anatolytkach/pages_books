import assert from "node:assert/strict";
import test from "node:test";

import {
  HTMLRewriterMock,
  callWorker,
  createAssetsMock,
  createEnv,
  createR2Bucket,
  createR2Object,
  patchGlobal,
} from "../helpers/worker-test-utils.mjs";

test("Integration: /books/api returns 500 when R2 binding is missing", async () => {
  // Arrange
  const env = createEnv({ READER_BOOKS: undefined });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/search/a.json",
    env,
  });

  // Assert
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-reader-route"), "r2-missing");
  assert.equal(await response.text(), "R2 binding missing");
});

test("Integration: /books/api serves object from R2 with metadata and etag", async () => {
  // Arrange
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/search/a.json": createR2Object({
        body: '{"items":[]}',
        httpEtag: '"etag-a"',
        contentType: "application/json; charset=utf-8",
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/search/a.json",
    env,
  });

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "r2");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("etag"), '"etag-a"');
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), '{"items":[]}');
  assert.deepEqual(bucket.calls, ["api/search/a.json"]);
});

test("Integration: /books/api falls back to raw encoded key when decoded key misses", async () => {
  // Arrange
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/p/%23.json": createR2Object({
        body: '{"authorCount":0}',
        httpEtag: '"etag-raw"',
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/p/%23.json",
    env,
  });

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "r2");
  assert.equal(await response.text(), '{"authorCount":0}');
  assert.deepEqual(bucket.calls, ["api/p/#.json", "api/p/%23.json"]);
});

test("Integration: /books/api returns 404 when object does not exist", async () => {
  // Arrange
  const bucket = createR2Bucket();
  const env = createEnv({ READER_BOOKS: bucket });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/api/search/missing.json",
    env,
  });

  // Assert
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-reader-route"), "r2-miss");
  assert.equal(await response.text(), "Not found");
});

test("Integration: non-catalog path proxies through ASSETS with route marker", async () => {
  // Arrange
  const assets = createAssetsMock({
    body: "asset-content",
    status: 201,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-upstream-header": "1",
    },
  });
  const env = createEnv({ ASSETS: assets });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/reader/index.html",
    env,
  });

  // Assert
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-reader-route"), "assets");
  assert.equal(response.headers.get("x-upstream-header"), "1");
  assert.equal(await response.text(), "asset-content");
  assert.equal(assets.calls.length, 1);
  assert.equal(assets.calls[0], "https://reader.pub/reader/index.html");
});

test("Integration: catalog html path forces no-store cache control", async () => {
  // Arrange
  const assets = createAssetsMock({
    body: "<html><head></head><body>catalog</body></html>",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=31536000",
    },
  });
  const env = createEnv({ ASSETS: assets });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/",
    env,
  });

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "catalog");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("Integration: html response uses HTMLRewriter when drive client id is configured", async (t) => {
  // Arrange
  HTMLRewriterMock.reset();
  const restoreRewriter = patchGlobal("HTMLRewriter", HTMLRewriterMock);
  t.after(restoreRewriter);

  const assets = createAssetsMock({
    body: '<html><head><meta name="google-drive-client-id" content=""></head></html>',
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const env = createEnv({
    ASSETS: assets,
    READERPUB_GOOGLE_CLIENT_ID: "client-id-123",
  });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/reader/index.html",
    env,
  });
  const rewriter = HTMLRewriterMock.lastInstance();

  // Assert
  assert.equal(response.status, 200);
  assert.ok(rewriter);
  assert.deepEqual(rewriter.attributeCalls, [
    {
      selector: 'meta[name="google-drive-client-id"]',
      name: "content",
      value: "client-id-123",
    },
    {
      selector: 'meta[name="posthog-enabled"]',
      name: "content",
      value: "false",
    },
    {
      selector: 'meta[name="posthog-key"]',
      name: "content",
      value: "",
    },
    {
      selector: 'meta[name="posthog-host"]',
      name: "content",
      value: "",
    },
  ]);
});

test("Integration: html response skips HTMLRewriter when drive client id is empty", async (t) => {
  // Arrange
  HTMLRewriterMock.reset();
  const restoreRewriter = patchGlobal("HTMLRewriter", HTMLRewriterMock);
  t.after(restoreRewriter);

  const assets = createAssetsMock({
    body: "<html><head></head><body>plain</body></html>",
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const env = createEnv({ ASSETS: assets });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/books/reader/index.html",
    env,
  });

  // Assert
  assert.equal(response.status, 200);
  assert.equal(HTMLRewriterMock.lastInstance(), null);
});

test("Integration: /book/<slug> renders SSR HTML from seo manifest", async () => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "seo/version.json": createR2Object({
        body: JSON.stringify({ version: "seo-v1" }),
      }),
      "seo/book-shards/test.json": createR2Object({
        body: JSON.stringify({
          version: "seo-v1",
          items: {
            "test-book": {
              id: "123",
              slug: "test-book",
              title: "Test Book",
              authorName: "Doe, Jane",
              authorSlug: "doe-jane",
              authorKey: "doejane",
              cover: "/books/content/123/OEBPS/cover.jpg",
              language: "en",
              description: "A test description.",
              excerpt: "This is a long enough excerpt for the SEO layer.",
              categories: [{ slug: "fiction", title: "Fiction" }],
              readerUrl: "/books/123/",
              chapters: [
                {
                  n: 1,
                  title: "Opening",
                  slug: "opening",
                  href: "/book/test-book/chapter-1-opening",
                  sourcePath: "OEBPS/text/ch001.xhtml",
                  fragment: "opening",
                },
              ],
              version: "seo-v1",
            },
          },
        }),
      }),
      "seo/category/fiction.json": createR2Object({
        body: JSON.stringify({
          slug: "fiction",
          title: "Fiction",
          count: 2,
          books: [
            {
              id: "999",
              slug: "other-book",
              title: "Other Book",
              author: "Roe, John",
              authorSlug: "roe-john",
              cover: "/books/content/999/OEBPS/cover.jpg",
            },
            {
              id: "123",
              slug: "test-book",
              title: "Test Book",
              author: "Doe, Jane",
              authorSlug: "doe-jane",
              cover: "/books/content/123/OEBPS/cover.jpg",
            },
          ],
        }),
      }),
      "seo/author-shards/doej.json": createR2Object({
        body: JSON.stringify({
          version: "seo-v1",
          items: {
            "doe-jane": {
              slug: "doe-jane",
              name: "Doe, Jane",
              count: 2,
              books: [
                {
                  id: "777",
                  slug: "author-book",
                  title: "Author Book",
                  author: "Doe, Jane",
                  authorSlug: "doe-jane",
                  cover: "/books/content/777/OEBPS/cover.jpg",
                },
                {
                  id: "123",
                  slug: "test-book",
                  title: "Test Book",
                  author: "Doe, Jane",
                  authorSlug: "doe-jane",
                  cover: "/books/content/123/OEBPS/cover.jpg",
                },
              ],
            },
          },
        }),
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  const response = await callWorker({
    url: "https://reader.pub/book/test-book",
    env,
  });

  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "seo-book");
  assert.equal(response.headers.get("x-reader-seo-version"), "seo-v1");
  assert.match(body, /<title>Test Book — Jane Doe<\/title>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/reader\.pub\/book\/test-book"/);
  assert.match(body, /Open in WeRead/);
  assert.match(body, /Explore More Books Like This/);
  assert.match(body, /data-seo-cta-type="primary_explore_cta"/);
  assert.match(body, /href="\/books\/#view=category&amp;category=fiction"/);
  assert.match(body, /You May Also Like/);
  assert.match(body, /More Books by This Author/);
  assert.match(body, /class="recCard" href="\/books\/999\/"/);
  assert.match(body, /data-seo-cta-type="recommendation_card"/);
  assert.doesNotMatch(body, /Explore the catalog to discover more books like this/);
  assert.doesNotMatch(body, />Catalog</);
  assert.match(body, /Chapter 1: Opening/);
});

test("Integration: /book/<slug>/chapter-<n>-<chapter-slug> renders full chapter HTML", async () => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "seo/version.json": createR2Object({
        body: JSON.stringify({ version: "seo-v2" }),
      }),
      "seo/book-shards/test.json": createR2Object({
        body: JSON.stringify({
          version: "seo-v2",
          items: {
            "test-book": {
              id: "123",
              slug: "test-book",
              title: "Test Book",
              authorName: "Doe, Jane",
              authorSlug: "doe-jane",
              authorKey: "doejane",
              readerUrl: "/books/123/",
              chapters: [
                {
                  n: 1,
                  title: "Opening",
                  slug: "opening",
                  href: "/book/test-book/chapter-1-opening",
                  sourcePath: "OEBPS/text/ch001.xhtml",
                  fragment: "opening",
                },
                {
                  n: 2,
                  title: "Second",
                  slug: "second",
                  href: "/book/test-book/chapter-2-second",
                  sourcePath: "OEBPS/text/ch002.xhtml",
                  fragment: "second",
                },
              ],
              version: "seo-v2",
            },
          },
        }),
      }),
      "content/123/OEBPS/text/ch001.xhtml": createR2Object({
        body:
          '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><section><h1>Opening</h1><p>Paragraph one.</p><p><img src="../media/pic.jpg" alt="pic" /></p></section></body></html>',
        contentType: "application/xhtml+xml; charset=utf-8",
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  const response = await callWorker({
    url: "https://reader.pub/book/test-book/chapter-1-opening",
    env,
  });

  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "seo-chapter");
  assert.match(body, /<article class="chapterHtml">[\s\S]*Paragraph one\./);
  assert.match(body, /\/books\/content\/123\/OEBPS\/media\/pic\.jpg/);
  assert.match(body, /\.chapterHtml img,[\s\S]*height: auto !important;/);
  assert.match(body, /@media \(pointer: coarse\) and \(orientation: portrait\)/);
  assert.match(body, /Back to Book/);
  assert.match(body, /Next chapter/);
});

test("Integration: chapter route redirects to canonical chapter slug", async () => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "seo/version.json": createR2Object({
        body: JSON.stringify({ version: "seo-v3" }),
      }),
      "seo/book-shards/test.json": createR2Object({
        body: JSON.stringify({
          version: "seo-v3",
          items: {
            "test-book": {
              id: "123",
              slug: "test-book",
              title: "Test Book",
              authorName: "Doe, Jane",
              authorSlug: "doe-jane",
              authorKey: "doejane",
              readerUrl: "/books/123/",
              chapters: [
                {
                  n: 1,
                  title: "Opening",
                  slug: "opening",
                  href: "/book/test-book/chapter-1-opening",
                  sourcePath: "OEBPS/text/ch001.xhtml",
                  fragment: "opening",
                },
              ],
              version: "seo-v3",
            },
          },
        }),
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  const response = await callWorker({
    url: "https://reader.pub/book/test-book/chapter-1-wrong",
    env,
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/book/test-book/chapter-1-opening");
  assert.equal(response.headers.get("x-reader-route"), "seo-chapter-canonical");
});

test("Integration: author, category, sitemap and robots routes render seo layer", async () => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "seo/version.json": createR2Object({
        body: JSON.stringify({ version: "seo-v4" }),
      }),
      "seo/author-shards/doej.json": createR2Object({
        body: JSON.stringify({
          version: "seo-v4",
          items: {
            "doe-jane": {
              slug: "doe-jane",
              name: "Doe, Jane",
              count: 1,
              books: [{ id: "123", slug: "test-book", title: "Test Book", cover: "" }],
              version: "seo-v4",
            },
          },
        }),
      }),
      "seo/category/fiction.json": createR2Object({
        body: JSON.stringify({
          slug: "fiction",
          title: "Fiction",
          count: 1,
          books: [
            {
              id: "123",
              slug: "test-book",
              title: "Test Book",
              author: "Doe, Jane",
              authorSlug: "doe-jane",
              cover: "",
            },
          ],
          version: "seo-v4",
        }),
      }),
      "seo/sitemaps/index.json": createR2Object({
        body: JSON.stringify({
          version: "seo-v4",
          sitemaps: [
            { path: "/sitemaps/books-1.xml", count: 1 },
            { path: "/sitemaps/authors.xml", count: 1 },
          ],
        }),
      }),
      "seo/sitemaps/books-1.json": createR2Object({
        body: JSON.stringify({
          items: [{ loc: "/book/test-book", lastmod: "seo-v4" }],
        }),
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  const authorResponse = await callWorker({
    url: "https://reader.pub/author/doe-jane",
    env,
  });
  assert.equal(authorResponse.status, 200);
  assert.equal(authorResponse.headers.get("x-reader-route"), "seo-author");
  assert.match(await authorResponse.text(), /Books by Jane Doe/);

  const categoryResponse = await callWorker({
    url: "https://reader.pub/category/fiction",
    env,
  });
  assert.equal(categoryResponse.status, 200);
  assert.equal(categoryResponse.headers.get("x-reader-route"), "seo-category");
  assert.match(await categoryResponse.text(), /Fiction/);

  const sitemapResponse = await callWorker({
    url: "https://reader.pub/sitemap.xml",
    env,
  });
  assert.equal(sitemapResponse.status, 200);
  assert.equal(sitemapResponse.headers.get("x-reader-route"), "seo-sitemap-index");
  assert.match(await sitemapResponse.text(), /sitemapindex/);

  const sitemapChunkResponse = await callWorker({
    url: "https://reader.pub/sitemaps/books-1.xml",
    env,
  });
  assert.equal(sitemapChunkResponse.status, 200);
  assert.equal(sitemapChunkResponse.headers.get("x-reader-route"), "seo-sitemap");
  assert.match(await sitemapChunkResponse.text(), /https:\/\/reader\.pub\/book\/test-book/);

  const robotsResponse = await callWorker({
    url: "https://reader.pub/robots.txt",
    env,
  });
  assert.equal(robotsResponse.status, 200);
  assert.equal(robotsResponse.headers.get("x-reader-route"), "seo-robots");
  assert.match(await robotsResponse.text(), /Disallow: \/books\/reader\//);
});

test("Integration: /docs requires auth and returns 401 without credentials", async () => {
  // Arrange
  const assets = createAssetsMock({
    body: "<html><body>docs</body></html>",
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const env = createEnv({
    ASSETS: assets,
    DOCS_AUTH_USER: "docs",
    DOCS_AUTH_PASS: "secret",
  });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/docs/",
    env,
  });

  // Assert
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-reader-route"), "docs-auth");
  assert.match(String(response.headers.get("www-authenticate") || ""), /Basic/i);
  assert.equal(assets.calls.length, 0);
});

test("Integration: /docs returns 503 when auth is not configured", async () => {
  // Arrange
  const assets = createAssetsMock({
    body: "<html><body>docs</body></html>",
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const env = createEnv({ ASSETS: assets });

  // Act
  const response = await callWorker({
    url: "https://reader.pub/docs/",
    env,
  });

  // Assert
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-reader-route"), "docs-auth-config");
  assert.equal(assets.calls.length, 0);
});

test("Integration: /docs passes through when valid basic auth is provided", async () => {
  // Arrange
  const assets = createAssetsMock({
    body: "<html><body>docs</body></html>",
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const env = createEnv({
    ASSETS: assets,
    DOCS_AUTH_USER: "docs",
    DOCS_AUTH_PASS: "secret",
  });
  const auth = `Basic ${Buffer.from("docs:secret", "utf8").toString("base64")}`;

  // Act
  const response = await callWorker({
    url: "https://reader.pub/docs/",
    env,
    headers: { authorization: auth },
  });

  // Assert
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "docs");
  assert.equal(assets.calls.length, 1);
});
