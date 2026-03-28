import assert from "node:assert/strict";
import test from "node:test";

import {
  callWorker,
  createFetchMockSequence,
  patchGlobal,
  readJson,
} from "../helpers/worker-test-utils.mjs";

function makeJwt({ sub = "user-1", email = "user@example.com", exp = 4102444800 } = {}) {
  const payload = Buffer.from(JSON.stringify({ sub, email, exp }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `x.${payload}.y`;
}

test("Unit: tenant creation requires superuser", async (t) => {
  const jwt = makeJwt({ email: "ordinary@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "ordinary@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { name: "Acme Publishing", slug: "acme-publishing", tenant_type: "publisher" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 403);
  assert.equal(payload.error, "Superuser access required");
});

test("Unit: tenant admin invites are forced to reader role", async (t) => {
  const jwt = makeJwt({ email: "admin@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "admin@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "tenant-1" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ role: "admin" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "invite-1", tenant_id: "tenant-1", email: "reader@example.com", role: "member" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/invite",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { email: "reader@example.com", role: "admin" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.role, "member");

  const inviteCall = fetchMock.calls[3];
  const inviteBody = JSON.parse(inviteCall[1].body);
  assert.equal(inviteBody.email, "reader@example.com");
  assert.equal(inviteBody.role, "member");
});
