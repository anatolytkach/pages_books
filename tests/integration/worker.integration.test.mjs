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

test("Integration: /reader1 selection links inject reader OG preview metadata", async (t) => {
  HTMLRewriterMock.reset();
  const restoreRewriter = patchGlobal("HTMLRewriter", HTMLRewriterMock);
  t.after(restoreRewriter);

  const assets = createAssetsMock({
    body: "<html><head></head><body>reader</body></html>",
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/book-locations/99.json": createR2Object({
        body: JSON.stringify({
          items: {
            "1399": {
              title: "Anna Karenina",
              author: "Tolstoy, Leo graf",
              cover: "/books/content/1399/OEBPS/cover.jpg",
            },
          },
        }),
      }),
    },
  });
  const env = createEnv({ ASSETS: assets, READER_BOOKS: bucket });

  const response = await callWorker({
    url: "https://books-staging.reader.pub/reader1/?id=1399&selectionText=Everything+was+in+confusion",
    env,
  });
  const rewriter = HTMLRewriterMock.lastInstance();

  assert.equal(response.status, 200);
  assert.ok(rewriter);
  assert.equal(assets.calls[0], "https://books-staging.reader.pub/reader1/?id=1399&selectionText=Everything+was+in+confusion");
  assert.deepEqual(bucket.calls, [
    "api/book-locations/99.json",
    "api/book-locations/gutenberg/99.json",
  ]);
  assert.equal(rewriter.appendCalls.length, 1);
  assert.equal(rewriter.appendCalls[0].selector, "head");
  assert.equal(rewriter.appendCalls[0].options.html, true);
  assert.match(rewriter.appendCalls[0].html, /property="og:title" content="Anna Karenina"/);
  assert.match(rewriter.appendCalls[0].html, /property="og:description" content="by Leo graf Tolstoy\. &quot;Everything was in confusion&quot;"/);
  assert.match(rewriter.appendCalls[0].html, /property="og:image" content="https:\/\/books-staging\.reader\.pub\/books\/content\/1399\/OEBPS\/cover\.jpg"/);
  assert.match(rewriter.appendCalls[0].html, /name="twitter:card" content="summary"/);
});

test("Integration: selection share API stores payload and returns short url", async () => {
  const bucket = createR2Bucket();
  const env = createEnv({ READER_BOOKS: bucket });

  const response = await callWorker({
    url: "https://books-staging.reader.pub/books/api/ss",
    method: "POST",
    body: {
      bookId: "1399",
      selectionCfi: "epubcfi(/6/6[item3]!/4/2[pgepubid00003]/4[chap01]/6,/1:0,/8/1:10)",
      selectionText: "Everything was in confusion",
    },
    env,
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.match(data.shareId, /^[A-Za-z0-9_-]{9}$/);
  assert.equal(data.url, `https://books-staging.reader.pub/s/${data.shareId}`);
  assert.equal(bucket.putCalls.length, 1);
  assert.equal(bucket.putCalls[0].key, `api/selection_shares/${data.shareId}.json`);
  assert.deepEqual(JSON.parse(bucket.putCalls[0].body), {
    v: 1,
    type: "reader-selection",
    bookId: "1399",
    source: "",
    selectionCfi: "epubcfi(/6/6[item3]!/4/2[pgepubid00003]/4[chap01]/6,/1:0,/8/1:10)",
    selectionText: "Everything was in confusion",
    createdAt: JSON.parse(bucket.putCalls[0].body).createdAt,
  });
});

test("Integration: /s/<id> renders preview tags and redirects to reader selection", async () => {
  const selectionCfi = "epubcfi(/6/6[item3]!/4/2[pgepubid00003]/4[chap01]/6,/1:0,/8/1:10)";
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/selection_shares/abc123XYZ.json": createR2Object({
        body: JSON.stringify({
          v: 1,
          type: "reader-selection",
          bookId: "1399",
          selectionCfi,
          selectionText: "Everything was in confusion",
          createdAt: 1,
        }),
      }),
      "api/book-locations/99.json": createR2Object({
        body: JSON.stringify({
          items: {
            "1399": {
              title: "Anna Karenina",
              author: "Tolstoy, Leo graf",
              cover: "/books/content/1399/OEBPS/cover.jpg",
            },
          },
        }),
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  const response = await callWorker({
    url: "https://books-staging.reader.pub/s/abc123XYZ",
    env,
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "selection-share-page");
  assert.match(body, /property="og:site_name" content="ReaderPub"/);
  assert.match(body, /property="og:title" content="Anna Karenina"/);
  assert.match(body, /property="og:url" content="https:\/\/books-staging\.reader\.pub\/s\/abc123XYZ"/);
  assert.match(body, /property="og:image:secure_url" content="https:\/\/books-staging\.reader\.pub\/books\/content\/1399\/OEBPS\/cover\.jpg"/);
  assert.match(body, /property="og:image:width" content="600"/);
  assert.match(body, /property="og:image:height" content="900"/);
  assert.match(body, /name="twitter:description" content="by Leo graf Tolstoy\. &quot;Everything was in confusion&quot;"/);
  assert.match(body, /window\.location\.replace\("https:\/\/books-staging\.reader\.pub\/reader1\/\?id=1399&selectionCfi=/);
  assert.match(body, /#epubcfi\(\/6\/6\[item3\]/);
});

test("Integration: protected selection share API stores payload and redirects to protected reader", async () => {
  const protectedAnchor = {
    kind: "protected-range-v1",
    bookId: "90025344",
    start: { bookId: "90025344", chunkId: "chunk-000001", chunkOrder: 1, localOffset: 10, globalOffset: 10 },
    end: { bookId: "90025344", chunkId: "chunk-000001", chunkOrder: 1, localOffset: 42, globalOffset: 42 },
  };
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/book-locations/44.json": createR2Object({
        body: JSON.stringify({
          items: {
            "25344": {
              title: "The Protected Book",
              author: "Example, Ada",
              cover: "/books/content/25344/cover.jpg",
              readerType: "protected",
            },
          },
        }),
      }),
    },
  });
  const env = createEnv({ READER_BOOKS: bucket });

  const createResponse = await callWorker({
    url: "https://books-staging.reader.pub/books/api/ss",
    method: "POST",
    body: {
      readerType: "protected",
      bookId: "90025344",
      artifactBookId: "90025344",
      protectedArtifactSource: "r2",
      protectedAllowAll: "1",
      protectedAnchor,
      selectionText: "Protected quoted text",
    },
    env,
  });
  const data = await createResponse.json();

  assert.equal(createResponse.status, 200);
  const stored = JSON.parse(bucket.putCalls[0].body);
  assert.equal(stored.readerType, "protected");
  assert.equal(stored.protectedAllowAll, "1");
  assert.deepEqual(stored.protectedAnchor, protectedAnchor);
  assert.equal(stored.selectionText, "Protected quoted text");

  const shareResponse = await callWorker({
    url: data.url,
    env,
  });
  const body = await shareResponse.text();

  assert.equal(shareResponse.status, 200);
  assert.match(body, /property="og:title" content="The Protected Book"/);
  assert.match(body, /property="og:image:secure_url" content="https:\/\/books-staging\.reader\.pub\/books\/content\/25344\/cover\.jpg"/);
  assert.match(body, /name="twitter:description" content="by Ada Example\. &quot;Protected quoted text&quot;"/);
  assert.match(body, /window\.location\.replace\("https:\/\/books-staging\.reader\.pub\/books\/protected\/\?id=90025344&reader=protected/);
  assert.match(body, new RegExp(`selectionShareId=${data.shareId}`));
  assert.doesNotMatch(body, /protectedSelectionAnchor=/);
  assert.match(body, /protectedArtifactSource=r2/);
  assert.match(body, /protectedAllowAll=1/);

  const readResponse = await callWorker({
    url: `https://books-staging.reader.pub/books/api/ss/${data.shareId}`,
    env,
  });
  const readBody = await readResponse.json();

  assert.equal(readResponse.status, 200);
  assert.equal(readBody.shareId, data.shareId);
  assert.equal(readBody.payload.readerType, "protected");
  assert.deepEqual(readBody.payload.protectedAnchor, protectedAnchor);
  assert.equal(readBody.payload.selectionText, "Protected quoted text");
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
