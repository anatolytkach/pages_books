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

test("Unit: tenant admins can invite publishers without role downgrading", async (t) => {
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
    new Response("{}", { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }),
    new Response(
      JSON.stringify([]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ role: "admin", is_active: true }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "invite-1", tenant_id: "tenant-1", email: "publisher@example.com", role: "publisher" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/invite",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { email: "publisher@example.com", role: "publisher" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.role, "publisher");

  const inviteCall = fetchMock.calls[5];
  const inviteBody = JSON.parse(inviteCall[1].body);
  assert.equal(inviteBody.email, "publisher@example.com");
  assert.equal(inviteBody.role, "publisher");
});

test("Unit: explicit tenant manage-members grant allows roster reads without admin membership", async (t) => {
  const jwt = makeJwt({ sub: "user-1", email: "grantee@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "grantee@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({}),
      { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([
        {
          id: "grant-1",
          scope_type: "organization",
          scope_id: "tenant-1",
          expires_at: null,
          granted_by: "admin-1",
          created_at: "2026-04-22T00:00:00.000Z",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          role: "publisher",
          department: null,
          user_id: "member-1",
          created_at: "2026-04-21T00:00:00.000Z",
          user_profiles: { display_name: "Member One", avatar_url: null },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/members",
    method: "GET",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].role, "publisher");
  assert.equal(payload[0].user_profiles.display_name, "Member One");

  assert.match(fetchMock.calls[3][0], /\/rest\/v1\/permission_grants\?/);
  assert.match(fetchMock.calls[3][0], /user_id=eq\.user-1/);
  assert.match(fetchMock.calls[3][0], /permission_key=eq\.tenant\.manage_members/);
  assert.equal(fetchMock.calls.length, 5);
});

test("Unit: superuser can invite an organization admin", async (t) => {
  const jwt = makeJwt({ sub: "super-1", email: "yarane@gmail.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "super-1", email: "yarane@gmail.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "invite-2", email: "admin@example.com", role: "admin", invite_type: "tenant_admin" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/tenants/acme-publishing/admin-invite",
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: { email: "admin@example.com", role: "admin" },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(payload.invite.role, "admin");
  assert.equal(payload.invite.invite_type, "tenant_admin");

  const inviteBody = JSON.parse(fetchMock.calls[2][1].body);
  assert.equal(inviteBody.role, "admin");
  assert.equal(inviteBody.invite_type, "tenant_admin");
});

test("Unit: platform tenants includes active members and pending invites", async (t) => {
  const jwt = makeJwt({ sub: "super-1", email: "yarane@gmail.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "super-1", email: "yarane@gmail.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([
        { id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher", created_at: "2026-03-01T00:00:00.000Z" },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([
        {
          id: "membership-1",
          tenant_id: "tenant-1",
          user_id: "user-1",
          role: "admin",
          department: null,
          created_at: "2026-03-02T00:00:00.000Z",
          user_profiles: { display_name: "Ada Admin", avatar_url: null },
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify([
        {
          id: "invite-1",
          tenant_id: "tenant-1",
          email: "pending@example.com",
          role: "publisher",
          invite_type: "tenant_reader",
          token: "invite-token-1",
          created_at: "2026-03-03T00:00:00.000Z",
          expires_at: "2026-03-10T00:00:00.000Z",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
  ]);
  const restoreFetch = patchGlobal("fetch", fetchMock);
  t.after(restoreFetch);

  const response = await callWorker({
    url: "https://reader.pub/books/api/v1/platform/tenants",
    method: "GET",
    headers: { authorization: `Bearer ${jwt}` },
    env: {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    },
  });
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].slug, "acme-publishing");
  assert.equal(payload[0].members.length, 1);
  assert.equal(payload[0].members[0].role, "admin");
  assert.equal(payload[0].pending_invites.length, 1);
  assert.equal(payload[0].pending_invites[0].email, "pending@example.com");
  assert.equal(payload[0].pending_invites[0].status, "pending");
});

test("Unit: accepting tenant reader invite does not downgrade existing admin", async (t) => {
  const jwt = makeJwt({ sub: "user-1", email: "admin@example.com" });
  const fetchMock = createFetchMockSequence([
    new Response(
      JSON.stringify({ id: "user-1", email: "admin@example.com" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "invite-1",
        tenant_id: "tenant-1",
        email: "admin@example.com",
        role: "member",
        invite_type: "tenant_reader",
        token: "invite-token-1",
        accepted_at: null,
        expires_at: "2099-01-01T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "membership-1",
        role: "admin",
        is_active: true,
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({
        id: "membership-1",
        role: "admin",
        is_active: true,
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "invite-1", accepted_at: "2026-03-28T00:00:00.000Z" }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
    ),
    new Response(
      JSON.stringify({ id: "tenant-1", slug: "acme-publishing", name: "Acme Publishing", tenant_type: "publisher" }),
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
  assert.equal(payload.role, "member");

  const membershipPatchBody = JSON.parse(fetchMock.calls[3][1].body);
  assert.equal(membershipPatchBody.role, "admin");
  assert.equal(membershipPatchBody.is_active, true);
});
