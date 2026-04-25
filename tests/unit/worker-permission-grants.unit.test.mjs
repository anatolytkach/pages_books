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

test("Unit: organization admin can list explicit permission grants for a user", async (t) => {
  const jwt = makeJwt({ sub: "admin-1", email: "admin@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(JSON.stringify({ id: "admin-1", email: "admin@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ role: "admin", is_active: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "target-1", email: "publisher@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify([
      {
        id: "grant-1",
        user_id: "target-1",
        permission_key: "title.publish",
        scope_type: "organization",
        scope_id: "tenant-1",
        granted_by: "admin-1",
        created_at: "2026-04-22T00:00:00.000Z",
        expires_at: null,
      },
    ]), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/permission-grants?user_id=target-1",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.tenant.id, "tenant-1");
  assert.equal(payload.subject.user_id, "target-1");
  assert.equal(payload.subject.email, "publisher@example.com");
  assert.equal(payload.grants.length, 1);
  assert.equal(payload.grants[0].permission_key, "title.publish");
});

test("Unit: organization admin can create an explicit organization grant", async (t) => {
  const jwt = makeJwt({ sub: "admin-1", email: "admin@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(JSON.stringify({ id: "admin-1", email: "admin@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ role: "admin", is_active: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "target-1", email: "publisher@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({
      id: "grant-1",
      user_id: "target-1",
      permission_key: "artifact.reprocess",
      scope_type: "organization",
      scope_id: "tenant-1",
      granted_by: "admin-1",
      created_at: "2026-04-22T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/permission-grants",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: {
      user_id: "target-1",
      permission_key: "artifact.reprocess",
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.subject.user_id, "target-1");
  assert.equal(payload.grant.scope_type, "organization");
  assert.equal(payload.grant.scope_id, "tenant-1");
  assert.equal(payload.grant.permission_key, "artifact.reprocess");

  const createBody = JSON.parse(fetchMock.calls[7][1].body);
  assert.equal(createBody.user_id, "target-1");
  assert.equal(createBody.permission_key, "artifact.reprocess");
  assert.equal(createBody.scope_type, "organization");
  assert.equal(createBody.scope_id, "tenant-1");
  assert.equal(createBody.granted_by, "admin-1");
});

test("Unit: non-admin cannot create organization grants", async (t) => {
  const jwt = makeJwt({ sub: "user-1", email: "member@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(JSON.stringify({ id: "user-1", email: "member@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/permission-grants",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: {
      user_id: "target-1",
      permission_key: "artifact.reprocess",
    },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 403);
  assert.equal(payload.error, "Not authorized");
});

test("Unit: organization admin can revoke an explicit organization grant", async (t) => {
  const jwt = makeJwt({ sub: "admin-1", email: "admin@example.com" });
  const grantId = "a1b2c3d4-1111-2222-3333-444455556666";
  const fetchMock = createFetchMockSequence([
    new Response(JSON.stringify({ id: "admin-1", email: "admin@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ role: "admin", is_active: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({
      id: grantId,
      user_id: "target-1",
      permission_key: "offer.manage",
      scope_type: "organization",
      scope_id: "tenant-1",
      granted_by: "admin-1",
      created_at: "2026-04-22T00:00:00.000Z",
      expires_at: null,
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("[]", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: `https://reader.pub/books/api/v1/tenants/acme-publishing/permission-grants/${grantId}`,
    method: "DELETE",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.deleted, true);
  assert.equal(payload.grant_id, grantId);
  assert.equal(payload.scope_type, "organization");
});

test("Unit: superuser can create a platform grant", async (t) => {
  const jwt = makeJwt({ sub: "super-1", email: "yarane@gmail.com" });
  const fetchMock = createFetchMockSequence([
    new Response(JSON.stringify({ id: "super-1", email: "yarane@gmail.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({ id: "target-1", email: "operator@example.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({
      id: "grant-9",
      user_id: "target-1",
      permission_key: "tenant.manage_members",
      scope_type: "platform",
      scope_id: null,
      granted_by: "super-1",
      created_at: "2026-04-22T00:00:00.000Z",
      expires_at: null,
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/platform/permission-grants",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: {
      user_id: "target-1",
      permission_key: "tenant.manage_members",
    },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.subject.user_id, "target-1");
  assert.equal(payload.grant.scope_type, "platform");
  assert.equal(payload.grant.scope_id, null);
});

test("Unit: superuser can revoke a platform grant", async (t) => {
  const jwt = makeJwt({ sub: "super-1", email: "yarane@gmail.com" });
  const grantId = "0abc1234-1111-2222-3333-444455556666";
  const fetchMock = createFetchMockSequence([
    new Response(JSON.stringify({ id: "super-1", email: "yarane@gmail.com" }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(JSON.stringify({
      id: grantId,
      user_id: "target-1",
      permission_key: "tenant.manage_members",
      scope_type: "platform",
      scope_id: null,
      granted_by: "super-1",
      created_at: "2026-04-22T00:00:00.000Z",
      expires_at: null,
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response("[]", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: `https://reader.pub/books/api/v1/platform/permission-grants/${grantId}`,
    method: "DELETE",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.deleted, true);
  assert.equal(payload.grant_id, grantId);
  assert.equal(payload.scope_type, "platform");
  assert.equal(payload.scope_id, null);
});
