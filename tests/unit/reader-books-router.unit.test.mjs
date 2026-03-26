import assert from "node:assert/strict";
import test from "node:test";

import routerWorker from "../../tools/runtime/reader-books-router.js";
import { createR2Bucket, createR2Object } from "../helpers/worker-test-utils.mjs";

async function callRouter({ url, env }) {
  const request = new Request(url);
  return routerWorker.fetch(request, env);
}

test("Unit: router /books/api decodes non-latin path before reading R2", async () => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/p/в.json": createR2Object({
        body: '{"prefixes":[{"prefix":"ВА","count":1}]}',
        contentType: "application/json; charset=utf-8",
      }),
    },
  });

  const response = await callRouter({
    url: "https://reader.pub/books/api/p/%D0%B2.json",
    env: { BOOKS: bucket },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "r2-api");
  assert.equal(await response.text(), '{"prefixes":[{"prefix":"ВА","count":1}]}');
  assert.deepEqual(bucket.calls, ["api/p/в.json"]);
});

test("Unit: router /books/api falls back to raw encoded key when decoded key misses", async () => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "api/p/%23.json": createR2Object({
        body: '{"authorCount":0}',
        contentType: "application/json; charset=utf-8",
      }),
    },
  });

  const response = await callRouter({
    url: "https://reader.pub/books/api/p/%23.json",
    env: { BOOKS: bucket },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-reader-route"), "r2-api");
  assert.equal(await response.text(), '{"authorCount":0}');
  assert.deepEqual(bucket.calls, ["api/p/#.json", "api/p/%23.json"]);
});
