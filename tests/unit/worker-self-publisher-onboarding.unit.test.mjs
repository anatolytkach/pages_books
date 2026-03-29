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

test("Unit: superuser can create self-publisher onboarding invite", async (t) => {
  const jwt = makeJwt({ email: "yarane@gmail.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "super-1", email: "yarane@gmail.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "tenant-1",
        slug: "ada-lovelace",
        name: "Ada Lovelace",
        tenant_type: "individual_author",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "invite-1",
        tenant_id: "tenant-1",
        email: "ada@example.com",
        role: "owner",
        invite_type: "self_publisher",
        token: "invite-token-1",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/onboarding/self-publisher/invite",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: {
      email: "ada@example.com",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.tenant.tenant_type, "individual_author");
  assert.equal(payload.invite.invite_type, "self_publisher");
  assert.equal(payload.invite.role, "owner");

  const tenantCreateBody = JSON.parse(fetchMock.calls[1][1].body);
  assert.equal(tenantCreateBody.tenant_type, "individual_author");

  const inviteCreateBody = JSON.parse(fetchMock.calls[2][1].body);
  assert.equal(inviteCreateBody.role, "owner");
  assert.equal(inviteCreateBody.invite_type, "self_publisher");
});

test("Unit: accepting self-publisher invite creates owner membership", async (t) => {
  const jwt = makeJwt({ sub: "author-1", email: "ada@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "author-1", email: "ada@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "invite-1",
        tenant_id: "tenant-1",
        email: "ada@example.com",
        role: "owner",
        invite_type: "self_publisher",
        token: "invite-token-1",
        accepted_at: null,
        expires_at: "2099-01-01T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify({
        id: "membership-1",
        tenant_id: "tenant-1",
        user_id: "author-1",
        role: "owner",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "invite-1",
        accepted_at: "2026-03-27T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "tenant-1",
        slug: "ada-lovelace",
        name: "Ada Lovelace",
        tenant_type: "individual_author",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/invitations/accept",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { token: "invite-token-1" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.accepted, true);
  assert.equal(payload.invite_type, "self_publisher");
  assert.equal(payload.role, "owner");
  assert.equal(payload.tenant.slug, "ada-lovelace");

  const membershipCreateBody = JSON.parse(fetchMock.calls[3][1].body);
  assert.equal(membershipCreateBody.role, "owner");
  assert.equal(membershipCreateBody.tenant_id, "tenant-1");
  assert.equal(membershipCreateBody.user_id, "author-1");
});

test("Unit: superuser can invite another superuser and acceptance grants access", async (t) => {
  const createJwt = makeJwt({ sub: "super-1", email: "yarane@gmail.com" });
  const createFetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "super-1", email: "yarane@gmail.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "superinvite-1",
        email: "new-super@example.com",
        token: "super-token-1",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreCreateFetch = patchGlobal("fetch", createFetchMock);

  const createResponse = await callWorker({
    url: "https://reader.pub/books/api/v1/platform/superusers/invite",
    method: "POST",
    headers: { authorization: `Bearer ${createJwt}` },
    body: { email: "new-super@example.com" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const createPayload = await readJson(createResponse);
  restoreCreateFetch();

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.email, "new-super@example.com");

  const acceptJwt = makeJwt({ sub: "super-2", email: "new-super@example.com" });
  const acceptFetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "super-2", email: "new-super@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify({
        id: "superinvite-1",
        email: "new-super@example.com",
        invited_by: "super-1",
        accepted_at: null,
        expires_at: "2099-01-01T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify({ user_id: "super-2", granted_by: "super-1" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "superinvite-1", accepted_at: "2026-03-28T00:00:00.000Z", accepted_by: "super-2" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreAcceptFetch = patchGlobal("fetch", acceptFetchMock);
  t.after(restoreAcceptFetch);

  const acceptResponse = await callWorker({
    url: "https://reader.pub/books/api/v1/invitations/accept",
    method: "POST",
    headers: { authorization: `Bearer ${acceptJwt}` },
    body: { token: "super-token-1" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const acceptPayload = await readJson(acceptResponse);

  assert.equal(acceptResponse.status, 200);
  assert.equal(acceptPayload.invite_type, "platform_superuser");
  assert.equal(acceptPayload.role, "superuser");

  const grantBody = JSON.parse(acceptFetchMock.calls[4][1].body);
  assert.equal(grantBody.user_id, "super-2");
  assert.equal(grantBody.granted_by, "super-1");
});
