import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchActivePermissionGrants,
  resolveExplicitPermissionGrant,
  resolvePermissionGrantScopes,
  resolveRolePermissionAccess,
} from "../../api/permissions/context-helpers.mjs";
import { can, PERMISSIONS, getRolePermissionMap } from "../../api/permissions/policy.mjs";

function createSbFetchStub(handlers = {}) {
  const calls = [];

  async function sbFetch(table, options = {}) {
    calls.push({ table, options });
    const handler = handlers[table];
    if (!handler) return { data: null, error: null };
    return handler(options);
  }

  sbFetch.calls = calls;
  return sbFetch;
}

test("Unit: resolvePermissionGrantScopes includes platform, organization, and title scopes without duplicates", () => {
  const scopes = resolvePermissionGrantScopes({
    tenantId: "tenant-1",
    tenantContext: { tenantId: "tenant-1" },
    book: { id: "book-1", published_by_tenant_id: "tenant-1" },
    bookId: "book-1",
    job: { tenant_id: "tenant-1", book_id: "book-1" },
  });

  assert.deepEqual(scopes, [
    { scope_type: "platform", scope_id: null },
    { scope_type: "organization", scope_id: "tenant-1" },
    { scope_type: "title", scope_id: "book-1" },
  ]);
});

test("Unit: fetchActivePermissionGrants filters out expired grants", async () => {
  const sbFetch = createSbFetchStub({
    permission_grants: async () => ({
      data: [
        {
          id: "grant-active",
          scope_type: "organization",
          scope_id: "tenant-1",
          expires_at: "2099-01-01T00:00:00.000Z",
          granted_by: "admin-1",
          created_at: "2026-04-20T00:00:00.000Z",
        },
        {
          id: "grant-expired",
          scope_type: "organization",
          scope_id: "tenant-2",
          expires_at: "2000-01-01T00:00:00.000Z",
          granted_by: "admin-1",
          created_at: "2026-04-20T00:00:00.000Z",
        },
      ],
      error: null,
    }),
  });

  const grants = await fetchActivePermissionGrants(sbFetch, {
    userId: "user-1",
    permissionKey: PERMISSIONS.titlePublish,
  });

  assert.equal(grants.length, 1);
  assert.equal(grants[0].id, "grant-active");
  assert.match(
    sbFetch.calls[0].options.params,
    /user_id=eq\.user-1&permission_key=eq\.title\.publish/
  );
});

test("Unit: resolveExplicitPermissionGrant matches organization-scoped grants for title publishing", async () => {
  const sbFetch = createSbFetchStub({
    permission_grants: async () => ({
      data: [
        {
          id: "grant-1",
          scope_type: "organization",
          scope_id: "tenant-1",
          expires_at: null,
          granted_by: "admin-1",
          created_at: "2026-04-20T00:00:00.000Z",
        },
      ],
      error: null,
    }),
  });

  const decision = await resolveExplicitPermissionGrant(sbFetch, {
    userId: "user-1",
    permissionKey: PERMISSIONS.titlePublish,
    resourceContext: {
      book: { id: "book-1", published_by_tenant_id: "tenant-1" },
    },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.grant.id, "grant-1");
});

test("Unit: resolveRolePermissionAccess returns allowed role and organization scope", async () => {
  const sbFetch = createSbFetchStub({
    tenant_memberships: async () => ({
      data: { role: "publisher" },
      error: null,
    }),
  });

  const decision = await resolveRolePermissionAccess(sbFetch, {
    userId: "user-1",
    permissionKey: PERMISSIONS.titlePublish,
    resourceContext: {
      tenantContext: { tenantId: "tenant-1" },
    },
    rolePermissionMap: getRolePermissionMap(),
  });

  assert.deepEqual(decision, {
    allowed: true,
    role: "publisher",
    scope: { type: "organization", id: "tenant-1" },
  });
});

test("Unit: can evaluates permissions in superuser, grant, role, ownership order", async () => {
  const callOrder = [];

  const superuserDecision = await can(
    { userId: "user-1" },
    PERMISSIONS.titlePublish,
    {
      hasPlatformSuperuserAccess: async () => {
        callOrder.push("superuser");
        return true;
      },
      resolveExplicitPermissionAccess: async () => {
        callOrder.push("grant");
        return { allowed: true, grant: { id: "grant-1" } };
      },
      resolveRolePermissionAccess: async () => {
        callOrder.push("role");
        return { allowed: true, role: "admin" };
      },
      checkTitlePublishAccess: async () => {
        callOrder.push("ownership");
        return true;
      },
      book: { id: "book-1" },
    }
  );

  assert.deepEqual(superuserDecision, { allowed: true, source: "superuser" });
  assert.deepEqual(callOrder, ["superuser"]);

  callOrder.length = 0;
  const grantDecision = await can(
    { userId: "user-1" },
    PERMISSIONS.titlePublish,
    {
      hasPlatformSuperuserAccess: async () => {
        callOrder.push("superuser");
        return false;
      },
      resolveExplicitPermissionAccess: async () => {
        callOrder.push("grant");
        return { allowed: true, grant: { id: "grant-1" } };
      },
      resolveRolePermissionAccess: async () => {
        callOrder.push("role");
        return { allowed: true, role: "admin" };
      },
      checkTitlePublishAccess: async () => {
        callOrder.push("ownership");
        return true;
      },
      book: { id: "book-1" },
    }
  );

  assert.deepEqual(grantDecision, {
    allowed: true,
    source: "grant",
    grant: { id: "grant-1" },
  });
  assert.deepEqual(callOrder, ["superuser", "grant"]);

  callOrder.length = 0;
  const roleDecision = await can(
    { userId: "user-1" },
    PERMISSIONS.titlePublish,
    {
      hasPlatformSuperuserAccess: async () => {
        callOrder.push("superuser");
        return false;
      },
      resolveExplicitPermissionAccess: async () => {
        callOrder.push("grant");
        return { allowed: false };
      },
      resolveRolePermissionAccess: async () => {
        callOrder.push("role");
        return { allowed: true, role: "publisher", scope: { type: "organization", id: "tenant-1" } };
      },
      checkTitlePublishAccess: async () => {
        callOrder.push("ownership");
        return true;
      },
      book: { id: "book-1" },
    }
  );

  assert.deepEqual(roleDecision, {
    allowed: true,
    source: "role",
    role: "publisher",
    scope: { type: "organization", id: "tenant-1" },
  });
  assert.deepEqual(callOrder, ["superuser", "grant", "role"]);

  callOrder.length = 0;
  const ownershipDecision = await can(
    { userId: "user-1" },
    PERMISSIONS.titlePublish,
    {
      hasPlatformSuperuserAccess: async () => {
        callOrder.push("superuser");
        return false;
      },
      resolveExplicitPermissionAccess: async () => {
        callOrder.push("grant");
        return { allowed: false };
      },
      resolveRolePermissionAccess: async () => {
        callOrder.push("role");
        return { allowed: false };
      },
      checkTitlePublishAccess: async () => {
        callOrder.push("ownership");
        return true;
      },
      book: { id: "book-1" },
    }
  );

  assert.deepEqual(ownershipDecision, {
    allowed: true,
    source: "ownership",
  });
  assert.deepEqual(callOrder, ["superuser", "grant", "role", "ownership"]);
});

test("Unit: can preserves legacy publishing-tenant fallback when no direct book is present", async () => {
  const decision = await can(
    { userId: "user-1" },
    PERMISSIONS.titlePublish,
    {
      resolvePublishingTenantAccess: async () => ({
        allowed: true,
        tenantContext: { tenantId: "tenant-1", tenantSlug: "acme" },
      }),
      tenantId: "tenant-1",
    }
  );

  assert.deepEqual(decision, {
    allowed: true,
    source: "role",
    tenantContext: { tenantId: "tenant-1", tenantSlug: "acme" },
  });
});
