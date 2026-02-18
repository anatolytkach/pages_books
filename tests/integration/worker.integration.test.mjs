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
