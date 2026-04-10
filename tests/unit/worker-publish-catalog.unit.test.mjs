import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createFetchMockSequence,
  createR2Bucket,
  patchGlobal,
  readJson,
} from "../helpers/worker-test-utils.mjs";

test("Unit: publish writes tenant-source public catalog and book-location entries", async (t) => {
  const bookId = "123e4567-e89b-12d3-a456-426614174000";
  const tokenPayload = Buffer.from(JSON.stringify({ sub: "user-1", exp: 4102444800 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const jwt = `x.${tokenPayload}.y`;
  const bucket = createR2Bucket();
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "user@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          role: "admin",
          tenant_id: "tenant-1",
          tenants: {
            id: "tenant-1",
            slug: "acme-publishing",
            name: "Acme Publishing",
            tenant_type: "publisher",
          },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: bookId,
        title: "Platform Book",
        author: "Ada Lovelace",
        genre_id: "fiction",
        annotation: "Notes",
        language: "en",
        content_id: "200123",
        cover_url: "/books/content/200123/cover.jpg",
        published_by_tenant_id: "tenant-1",
        published_by_user_id: "user-1",
        status: "ready",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: bookId,
        title: "Platform Book",
        author: "Ada Lovelace",
        genre_id: "fiction",
        annotation: "Notes",
        language: "en",
        content_id: "200123",
        cover_url: "/books/content/200123/cover.jpg",
        published_by_tenant_id: "tenant-1",
        published_by_user_id: "user-1",
        status: "published",
        visibility: "public",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "tenant-1",
        slug: "acme-publishing",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: `https://reader.pub/books/api/v1/publish/books/${bookId}/publish`,
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { visibility: "public" },
    env: {
      READER_BOOKS: bucket,
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.status, "published");

  const authorWrite = bucket.putCalls.find((entry) => entry.key === "api/a/adalovelace.json");
  assert.ok(authorWrite, "expected author file write");
  const authorPayload = JSON.parse(authorWrite.body);
  assert.equal(authorPayload.books[0].id, "200123");
  assert.equal(authorPayload.books[0].source, "acme-publishing");
  assert.equal(authorPayload.books[0].sourceBookId, "200123");
  assert.equal(authorPayload.books[0].legacyId, "200123");

  const searchWrite = bucket.putCalls.find((entry) => entry.key === "api/search/pla.json");
  assert.ok(searchWrite, "expected title search token write");
  const searchPayload = JSON.parse(searchWrite.body);
  const bookItem = searchPayload.items.find((item) => item.id === "200123");
  assert.equal(bookItem.source, "acme-publishing");
  assert.equal(bookItem.sourceBookId, "200123");
  assert.equal(bookItem.legacyId, "200123");

  const locationWrite = bucket.putCalls.find((entry) => entry.key === "api/book-locations/acme-publishing/23.json");
  assert.ok(locationWrite, "expected tenant shard write");
  const locationPayload = JSON.parse(locationWrite.body);
  assert.equal(locationPayload.source, "acme-publishing");
  assert.equal(locationPayload.items["200123"].contentPath, "/books/content/200123/");
  assert.equal(locationPayload.items["200123"].sourceBookId, "200123");
});

test("Unit: tenant-only publish skips public catalog and book-location writes", async (t) => {
  const bookId = "223e4567-e89b-12d3-a456-426614174000";
  const tokenPayload = Buffer.from(JSON.stringify({ sub: "user-1", exp: 4102444800 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const jwt = `x.${tokenPayload}.y`;
  const bucket = createR2Bucket();
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "user@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          role: "admin",
          tenant_id: "tenant-1",
          tenants: {
            id: "tenant-1",
            slug: "acme-publishing",
            name: "Acme Publishing",
            tenant_type: "publisher",
          },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: bookId,
        title: "Private Platform Book",
        author: "Ada Lovelace",
        genre_id: "fiction",
        annotation: "Notes",
        language: "en",
        content_id: "200223",
        cover_url: "/books/content/200223/cover.jpg",
        published_by_tenant_id: "tenant-1",
        published_by_user_id: "user-1",
        status: "ready",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: bookId,
        title: "Private Platform Book",
        author: "Ada Lovelace",
        genre_id: "fiction",
        annotation: "Notes",
        language: "en",
        content_id: "200223",
        cover_url: "/books/content/200223/cover.jpg",
        published_by_tenant_id: "tenant-1",
        published_by_user_id: "user-1",
        status: "published",
        visibility: "tenant_only",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: `https://reader.pub/books/api/v1/publish/books/${bookId}/publish`,
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { visibility: "tenant_only" },
    env: {
      READER_BOOKS: bucket,
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.visibility, "tenant_only");
  assert.equal(bucket.putCalls.length, 0);
});
