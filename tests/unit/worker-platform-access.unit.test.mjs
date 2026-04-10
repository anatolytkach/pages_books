import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createFetchMockSequence,
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
