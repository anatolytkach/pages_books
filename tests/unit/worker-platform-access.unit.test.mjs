import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createFetchMockSequence,
  createR2Bucket,
  patchGlobal,
  readJson,
} from "../helpers/worker-test-utils.mjs";

test("Unit: platform access returns publishing_tenants and can_publish for publisher memberships", async (t) => {
  const tokenPayload = Buffer.from(JSON.stringify({ sub: "user-1", exp: 4102444800 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const jwt = `x.${tokenPayload}.y`;

  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "publisher@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("[]", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          role: "publisher",
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
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/me/platform-access",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      READER_BOOKS: { get: async () => null, put: async () => {}, delete: async () => {} },
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.is_superuser, false);
  assert.equal(payload.can_publish, true);
  assert.ok(Array.isArray(payload.admin_tenants));
  assert.ok(Array.isArray(payload.publishing_tenants));
  assert.equal(payload.publishing_tenants.length, 1);
  assert.equal(payload.publishing_tenants[0].role, "publisher");
  assert.equal(payload.publishing_tenants[0].tenant.slug, "acme-publishing");
});

test("Unit: protected-content route denies direct reads without entitlement", async (t) => {
  const bucket = createR2Bucket({
    objectsByKey: {
      "protected-content/200123/manifest.json": {
        body: "{\"ok\":true}",
        httpEtag: "\"etag-1\"",
        writeHttpMetadata(headers) {
          headers.set("content-type", "application/json; charset=utf-8");
        },
      },
    },
  });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({
        id: "book-1",
        title: "Protected Book",
        author: "Ada Lovelace",
        annotation: "",
        cover_url: "",
        status: "published",
        is_free: false,
        visibility: "private",
        published_by_tenant_id: "",
        published_by_user_id: "publisher-1",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([{ id: "offer-1", book_id: "book-1", is_active: true }]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/protected-content/200123/manifest.json",
    env: {
      READER_BOOKS: bucket,
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });

  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden");
  assert.equal(bucket.calls.length, 0);
});

test("Unit: protected-content route serves artifact with purchase entitlement", async (t) => {
  const tokenPayload = Buffer.from(JSON.stringify({ sub: "user-1", exp: 4102444800 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const jwt = `x.${tokenPayload}.y`;
  const bucket = createR2Bucket({
    objectsByKey: {
      "protected-content/200123/manifest.json": {
        body: "{\"ok\":true}",
        httpEtag: "\"etag-2\"",
        writeHttpMetadata(headers) {
          headers.set("content-type", "application/json; charset=utf-8");
        },
      },
    },
  });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "reader@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "book-1",
        title: "Protected Book",
        author: "Ada Lovelace",
        annotation: "",
        cover_url: "",
        status: "published",
        is_free: false,
        visibility: "private",
        published_by_tenant_id: "",
        published_by_user_id: "publisher-1",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([{ entitlement_type: "purchase", is_active: true }]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/protected-content/200123/manifest.json",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      READER_BOOKS: bucket,
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "{\"ok\":true}");
  assert.deepEqual(bucket.calls, ["protected-content/200123/manifest.json"]);
});
