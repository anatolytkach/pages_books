import { can, PERMISSIONS } from "../permissions/policy.mjs";
import {
  createPermissionGrant,
  deletePermissionGrant,
  listPermissionGrants,
  validateManagedGrantInput,
} from "../permissions/admin.mjs";

export async function handleIdentityApiRoute(context) {
  const {
    apiCorsHeaders,
    apiPath,
    applyInvitationTokenForUser,
    attachProfilesToMemberships,
    buildInviteUrl,
    createPasswordUser,
    getAuthUserById,
    getPlatformSuperuserStatus,
    hasTenantUserManagementAccess,
    getTenantAdminMemberships,
    getTenantPublishingMemberships,
    inspectInvitationToken,
    jsonResponse,
    listPlatformTenantsWithRoster,
    normalizeEmail,
    readJsonSafe,
    request,
    requireAuth,
    requireSuperuser,
    roleRank,
    sbFetch,
    sendSuperuserInviteNotification,
    sendTenantInviteNotification,
    user,
  } = context;

  const createTenantRecord = async ({ name, slug, tenantType }) => {
    const { data: tenant, error: tenantErr } = await sbFetch("tenants", {
      method: "POST",
      body: {
        name,
        slug,
        tenant_type: tenantType,
      },
      single: true,
    });
    if (tenantErr) return { error: tenantErr, status: 400, data: null };
    return { error: null, status: 201, data: tenant };
  };

  const createTenantOwnerMembership = async ({ tenantId, userId }) => {
    const { data: membership, error: membershipErr } = await sbFetch("tenant_memberships", {
      method: "POST",
      body: {
        tenant_id: tenantId,
        user_id: userId,
        role: "owner",
      },
      single: true,
    });
    if (membershipErr) return { error: membershipErr, status: 400, data: null };
    return { error: null, status: 201, data: membership };
  };

  const requireTenantGrantManagement = async (tenant) => {
    const authErr = requireAuth();
    if (authErr) return { errorResponse: authErr, tenant: null };
    if (!tenant) return { errorResponse: jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders), tenant: null };

    const decision = await can({ userId: user.sub, policyContext: context }, PERMISSIONS.tenantManageMembers, {
      tenantId: tenant.id,
      hasTenantUserManagementAccess,
    });
    if (!decision.allowed) {
      return { errorResponse: jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders), tenant: null };
    }
    return { errorResponse: null, tenant };
  };

  const requirePlatformGrantManagement = async () => {
    const superErr = await requireSuperuser();
    if (superErr) return { errorResponse: superErr };
    return { errorResponse: null };
  };

  const readTargetUser = async (userId) => {
    const result = await getAuthUserById(userId);
    if (result.error) {
      return {
        errorResponse: jsonResponse({ error: result.error }, result.status || 400, apiCorsHeaders),
        user: null,
      };
    }
    return {
      errorResponse: null,
      user: result.data,
    };
  };

  const buildGrantSubject = (targetUser) => ({
    user_id: String(targetUser?.id || "").trim(),
    email: String(targetUser?.email || "").trim() || null,
  });

  if (apiPath === "/auth/register" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");
    const displayName = String(body?.display_name || "").trim();
    const inviteToken = String(body?.invite_token || "").trim();

    if (!email || !password || !displayName) {
      return jsonResponse({ error: "email, password, and display_name are required" }, 400, apiCorsHeaders);
    }

    const createResult = await createPasswordUser({ email, password, displayName });
    if (createResult.error) {
      const message = String(createResult.error || "");
      const status = /already been registered|already exists|duplicate/i.test(message) ? 409 : 400;
      return jsonResponse({ error: message }, status, apiCorsHeaders);
    }

    let inviteAcceptance = null;
    if (inviteToken) {
      const acceptResult = await applyInvitationTokenForUser(inviteToken, {
        userId: createResult.data.id,
        email,
      });
      if (acceptResult.error) {
        return jsonResponse({ error: acceptResult.error }, 400, apiCorsHeaders);
      }
      inviteAcceptance = acceptResult.data;
    }

    return jsonResponse({
      registered: true,
      user: createResult.data,
      invite: inviteAcceptance,
    }, 201, apiCorsHeaders);
  }

  if (apiPath === "/invitations/inspect" && request.method === "GET") {
    const token = String(context.url.searchParams.get("token") || "").trim();
    if (!token) {
      return jsonResponse({ error: "token is required" }, 400, apiCorsHeaders);
    }
    const inspected = await inspectInvitationToken(token);
    if (inspected.error) {
      return jsonResponse({ error: inspected.error }, 404, apiCorsHeaders);
    }
    return jsonResponse(inspected.data, 200, apiCorsHeaders);
  }

  if (apiPath === "/me" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const { data, error } = await sbFetch("user_profiles", {
      params: `id=eq.${user.sub}&select=*`,
      single: true,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
    return jsonResponse(data || {}, 200, apiCorsHeaders);
  }

  if (apiPath === "/me/tenants" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const { data, error } = await sbFetch("tenant_memberships", {
      params: `user_id=eq.${user.sub}&is_active=eq.true&select=id,role,department,tenants:tenant_id(id,slug,name,tenant_type,logo_url)`,
    });
    if (error) return jsonResponse({ error }, 500, apiCorsHeaders);
    return jsonResponse(data || [], 200, apiCorsHeaders);
  }

  if (apiPath === "/me/platform-access" && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const [isSuperuser, adminTenants, publishingTenants] = await Promise.all([
      getPlatformSuperuserStatus(),
      getTenantAdminMemberships(),
      getTenantPublishingMemberships(),
    ]);
    return jsonResponse({
      is_superuser: !!isSuperuser,
      can_publish: !!isSuperuser || publishingTenants.length > 0,
      admin_tenants: adminTenants.map((item) => ({
        tenant_id: item.tenant_id,
        role: item.role,
        tenant: item.tenants || null,
      })),
      publishing_tenants: publishingTenants.map((item) => ({
        tenant_id: item.tenant_id,
        role: item.role,
        tenant: item.tenants || null,
      })),
    }, 200, apiCorsHeaders);
  }

  if (apiPath === "/platform/tenants" && request.method === "GET") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    return jsonResponse(await listPlatformTenantsWithRoster(), 200, apiCorsHeaders);
  }

  if (apiPath === "/platform/superusers" && request.method === "GET") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    const [{ data: superusers }, { data: invites }] = await Promise.all([
      sbFetch("platform_superusers", {
        params: "select=user_id,granted_by,created_at,user_profiles:user_id(display_name,avatar_url)&order=created_at.asc",
      }),
      sbFetch("platform_superuser_invitations", {
        params: "accepted_at=is.null&select=id,email,token,expires_at,created_at&order=created_at.desc",
      }),
    ]);
    return jsonResponse({
      superusers: Array.isArray(superusers) ? superusers : [],
      pending_invites: Array.isArray(invites) ? invites : [],
    }, 200, apiCorsHeaders);
  }

  const platformSuperuserInviteDeleteMatch = apiPath.match(/^\/platform\/superusers\/invitations\/([a-f0-9-]+)$/i);
  if (platformSuperuserInviteDeleteMatch && request.method === "DELETE") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    const invitationId = platformSuperuserInviteDeleteMatch[1];
    const { data: invite } = await sbFetch("platform_superuser_invitations", {
      params: `id=eq.${invitationId}&accepted_at=is.null&select=id,email,token,expires_at`,
      single: true,
    });
    if (!invite) {
      return jsonResponse({ error: "Invitation not found" }, 404, apiCorsHeaders);
    }
    const { error: deleteErr } = await sbFetch("platform_superuser_invitations", {
      method: "DELETE",
      params: `id=eq.${invitationId}`,
    });
    if (deleteErr) return jsonResponse({ error: deleteErr }, 400, apiCorsHeaders);
    return jsonResponse({ deleted: true, invite_id: invite.id, email: invite.email }, 200, apiCorsHeaders);
  }

  if (apiPath === "/platform/superusers/invite" && request.method === "POST") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    if (!email) {
      return jsonResponse({ error: "email is required" }, 400, apiCorsHeaders);
    }
    const { data: invite, error } = await sbFetch("platform_superuser_invitations", {
      method: "POST",
      body: {
        email,
        invited_by: user.sub,
      },
      single: true,
    });
    if (error) return jsonResponse({ error }, 400, apiCorsHeaders);
    let emailDelivery = { sent: false, skipped: true, reason: "not-attempted" };
    try {
      emailDelivery = await sendSuperuserInviteNotification({ invite });
    } catch (err) {
      emailDelivery = { sent: false, skipped: false, error: err.message };
    }
    return jsonResponse({
      ...invite,
      invite_url: buildInviteUrl(invite.token),
      email_delivery: emailDelivery,
    }, 201, apiCorsHeaders);
  }

  if (apiPath === "/invitations/accept" && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    const token = String(body?.token || "").trim();
    if (!token) {
      return jsonResponse({ error: "token is required" }, 400, apiCorsHeaders);
    }

    const { data: invite, error: inviteErr } = await sbFetch("tenant_invitations", {
      params: `token=eq.${token}&select=*`,
      single: true,
    });
    if (!inviteErr && invite) {
      if (invite.accepted_at) return jsonResponse({ error: "Invitation already accepted" }, 400, apiCorsHeaders);
      if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
        return jsonResponse({ error: "Invitation has expired" }, 400, apiCorsHeaders);
      }
      if (normalizeEmail(invite.email) !== normalizeEmail(user.email)) {
        return jsonResponse({ error: "Invitation email does not match authenticated user" }, 403, apiCorsHeaders);
      }

      const grantedRole = invite.invite_type === "self_publisher" ? "owner" : invite.role;

      const { data: existingMembership } = await sbFetch("tenant_memberships", {
        params: `tenant_id=eq.${invite.tenant_id}&user_id=eq.${user.sub}&select=id,role,is_active`,
        single: true,
      });
      if (existingMembership) {
        const nextRole = roleRank(existingMembership.role) >= roleRank(grantedRole)
          ? existingMembership.role
          : grantedRole;
        await sbFetch("tenant_memberships", {
          method: "PATCH",
          params: `id=eq.${existingMembership.id}`,
          body: { role: nextRole, is_active: true },
        });
      } else {
        const { error: membershipErr } = await sbFetch("tenant_memberships", {
          method: "POST",
          body: {
            tenant_id: invite.tenant_id,
            user_id: user.sub,
            role: grantedRole,
          },
          single: true,
        });
        if (membershipErr) return jsonResponse({ error: membershipErr }, 400, apiCorsHeaders);
      }

      await sbFetch("tenant_invitations", {
        method: "PATCH",
        params: `id=eq.${invite.id}&select=*`,
        body: { accepted_at: new Date().toISOString() },
      });

      const { data: tenant } = await sbFetch("tenants", {
        params: `id=eq.${invite.tenant_id}&select=id,slug,name,tenant_type`,
        single: true,
      });
      return jsonResponse({
        accepted: true,
        invite_type: invite.invite_type || "tenant_reader",
        role: grantedRole,
        tenant,
      }, 200, apiCorsHeaders);
    }

    const { data: superInvite, error: superInviteErr } = await sbFetch("platform_superuser_invitations", {
      params: `token=eq.${token}&select=*`,
      single: true,
    });
    if (superInviteErr || !superInvite) {
      return jsonResponse({ error: "Invitation not found" }, 404, apiCorsHeaders);
    }
    if (superInvite.accepted_at) {
      return jsonResponse({ error: "Invitation already accepted" }, 400, apiCorsHeaders);
    }
    if (superInvite.expires_at && new Date(superInvite.expires_at) <= new Date()) {
      return jsonResponse({ error: "Invitation has expired" }, 400, apiCorsHeaders);
    }
    if (normalizeEmail(superInvite.email) !== normalizeEmail(user.email)) {
      return jsonResponse({ error: "Invitation email does not match authenticated user" }, 403, apiCorsHeaders);
    }

    const { data: existingSuperuser } = await sbFetch("platform_superusers", {
      params: `user_id=eq.${user.sub}&select=user_id`,
      single: true,
    });
    if (!existingSuperuser) {
      const { error: grantErr } = await sbFetch("platform_superusers", {
        method: "POST",
        body: {
          user_id: user.sub,
          granted_by: superInvite.invited_by || null,
        },
        single: true,
      });
      if (grantErr) return jsonResponse({ error: grantErr }, 400, apiCorsHeaders);
    }

    await sbFetch("platform_superuser_invitations", {
      method: "PATCH",
      params: `id=eq.${superInvite.id}&select=*`,
      body: {
        accepted_at: new Date().toISOString(),
        accepted_by: user.sub,
      },
    });

    return jsonResponse({
      accepted: true,
      invite_type: "platform_superuser",
      role: "superuser",
    }, 200, apiCorsHeaders);
  }

  const tenantSlugMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])$/);
  if (tenantSlugMatch && request.method === "GET") {
    const slug = tenantSlugMatch[1];
    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&is_active=eq.true&select=*`,
      single: true,
    });
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);
    return jsonResponse(tenant, 200, apiCorsHeaders);
  }

  const tenantMembersMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/members$/);
  if (tenantMembersMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const slug = tenantMembersMatch[1];
    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type`,
      single: true,
    });
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);

    const decision = await can({ userId: user.sub, policyContext: context }, PERMISSIONS.tenantManageMembers, {
      tenantId: tenant.id,
      hasTenantUserManagementAccess,
    });
    if (!decision.allowed) {
      return jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders);
    }

    const { data: members } = await sbFetch("tenant_memberships", {
      params: `tenant_id=eq.${tenant.id}&is_active=eq.true&select=id,role,department,user_id,created_at,user_profiles:user_id(display_name,avatar_url)&order=created_at.asc`,
    });
    return jsonResponse(members || [], 200, apiCorsHeaders);
  }

  const tenantRosterMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/roster$/);
  if (tenantRosterMatch && request.method === "GET") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const slug = tenantRosterMatch[1];
    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type,created_at`,
      single: true,
    });
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);
    const decision = await can({ userId: user.sub, policyContext: context }, PERMISSIONS.tenantManageMembers, {
      tenantId: tenant.id,
      hasTenantUserManagementAccess,
    });
    if (!decision.allowed) {
      return jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders);
    }

    const [membersRes, invitesRes] = await Promise.all([
      sbFetch("tenant_memberships", {
        params: `tenant_id=eq.${tenant.id}&is_active=eq.true&select=id,role,department,user_id,created_at&order=created_at.asc`,
      }),
      sbFetch("tenant_invitations", {
        params: `tenant_id=eq.${tenant.id}&accepted_at=is.null&select=id,email,role,invite_type,token,created_at,expires_at&order=created_at.desc`,
      }),
    ]);

    const members = await attachProfilesToMemberships(Array.isArray(membersRes.data) ? membersRes.data : []);

    return jsonResponse({
      tenant,
      members,
      pending_invites: Array.isArray(invitesRes.data) ? invitesRes.data : [],
    }, 200, apiCorsHeaders);
  }

  const tenantInviteDeleteMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/invitations\/([a-f0-9-]+)$/i);
  if (tenantInviteDeleteMatch && request.method === "DELETE") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const slug = tenantInviteDeleteMatch[1];
    const invitationId = tenantInviteDeleteMatch[2];
    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name`,
      single: true,
    });
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);
    const decision = await can({ userId: user.sub, policyContext: context }, PERMISSIONS.tenantManageMembers, {
      tenantId: tenant.id,
      hasTenantUserManagementAccess,
    });
    if (!decision.allowed) {
      return jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders);
    }

    const { data: invite } = await sbFetch("tenant_invitations", {
      params: `id=eq.${invitationId}&tenant_id=eq.${tenant.id}&accepted_at=is.null&select=id,email,role,token,expires_at`,
      single: true,
    });
    if (!invite) {
      return jsonResponse({ error: "Invitation not found" }, 404, apiCorsHeaders);
    }

    const { error: deleteErr } = await sbFetch("tenant_invitations", {
      method: "DELETE",
      params: `id=eq.${invitationId}&tenant_id=eq.${tenant.id}`,
    });
    if (deleteErr) return jsonResponse({ error: deleteErr }, 400, apiCorsHeaders);
    return jsonResponse({ deleted: true, invite_id: invite.id, email: invite.email }, 200, apiCorsHeaders);
  }

  const tenantInviteMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/invite$/);
  if (tenantInviteMatch && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const slug = tenantInviteMatch[1];
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const role = String(body?.role || "member").trim().toLowerCase();
    if (!email) {
      return jsonResponse({ error: "email is required" }, 400, apiCorsHeaders);
    }
    if (!["member", "publisher"].includes(role)) {
      return jsonResponse({ error: "role must be member or publisher" }, 400, apiCorsHeaders);
    }

    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type`,
      single: true,
    });
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);

    const decision = await can({ userId: user.sub, policyContext: context }, PERMISSIONS.tenantManageMembers, {
      tenantId: tenant.id,
      hasTenantUserManagementAccess,
    });
    if (!decision.allowed) {
      return jsonResponse({ error: "Not authorized" }, 403, apiCorsHeaders);
    }

    const { data: invite, error: invErr } = await sbFetch("tenant_invitations", {
      method: "POST",
      body: {
        tenant_id: tenant.id,
        email,
        role,
        invite_type: "tenant_reader",
        invited_by: user.sub,
      },
      single: true,
    });
    if (invErr) return jsonResponse({ error: invErr }, 400, apiCorsHeaders);
    let emailDelivery = { sent: false, skipped: true, reason: "not-attempted" };
    try {
      emailDelivery = await sendTenantInviteNotification({
        invite,
        tenant,
        audienceLabel: role,
      });
    } catch (err) {
      emailDelivery = { sent: false, skipped: false, error: err.message };
    }
    return jsonResponse({
      ...invite,
      invite_url: buildInviteUrl(invite.token),
      email_delivery: emailDelivery,
    }, 201, apiCorsHeaders);
  }

  const tenantGrantDeleteMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/permission-grants\/([a-f0-9-]+)$/i);
  if (tenantGrantDeleteMatch && request.method === "DELETE") {
    const slug = tenantGrantDeleteMatch[1];
    const grantId = tenantGrantDeleteMatch[2];
    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type`,
      single: true,
    });
    const access = await requireTenantGrantManagement(tenant);
    if (access.errorResponse) return access.errorResponse;

    const deleted = await deletePermissionGrant({
      sbFetch,
      grantId,
      scopeType: "organization",
      scopeId: tenant.id,
    });
    if (deleted.error) return jsonResponse({ error: deleted.error }, deleted.status || 400, apiCorsHeaders);
    return jsonResponse(deleted.data, deleted.status || 200, apiCorsHeaders);
  }

  const tenantGrantMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/permission-grants$/);
  if (tenantGrantMatch && request.method === "GET") {
    const slug = tenantGrantMatch[1];
    const targetUserId = String(context.url.searchParams.get("user_id") || "").trim();
    if (!targetUserId) {
      return jsonResponse({ error: "user_id is required" }, 400, apiCorsHeaders);
    }

    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type`,
      single: true,
    });
    const access = await requireTenantGrantManagement(tenant);
    if (access.errorResponse) return access.errorResponse;

    const targetUser = await readTargetUser(targetUserId);
    if (targetUser.errorResponse) return targetUser.errorResponse;

    return jsonResponse({
      tenant,
      subject: buildGrantSubject(targetUser.user),
      grants: await listPermissionGrants({
        sbFetch,
        userId: targetUserId,
        scopeType: "organization",
        scopeId: tenant.id,
      }),
    }, 200, apiCorsHeaders);
  }

  if (tenantGrantMatch && request.method === "POST") {
    const slug = tenantGrantMatch[1];
    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);

    const targetUserId = String(body.user_id || "").trim();
    if (!targetUserId) {
      return jsonResponse({ error: "user_id is required" }, 400, apiCorsHeaders);
    }

    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type`,
      single: true,
    });
    const access = await requireTenantGrantManagement(tenant);
    if (access.errorResponse) return access.errorResponse;

    const targetUser = await readTargetUser(targetUserId);
    if (targetUser.errorResponse) return targetUser.errorResponse;

    const validation = validateManagedGrantInput({
      permissionKey: body.permission_key,
      scopeType: "organization",
      scopeId: tenant.id,
      expiresAt: body.expires_at,
    });
    if (!validation.ok) {
      return jsonResponse({ error: validation.error }, 400, apiCorsHeaders);
    }

    const created = await createPermissionGrant({
      sbFetch,
      userId: targetUserId,
      permissionKey: validation.permissionKey,
      scopeType: validation.scopeType,
      scopeId: validation.scopeId,
      grantedBy: user.sub,
      expiresAt: validation.expiresAt,
    });
    if (created.error) return jsonResponse({ error: created.error }, created.status || 400, apiCorsHeaders);

    return jsonResponse({
      subject: buildGrantSubject(targetUser.user),
      grant: created.data,
    }, created.status || 201, apiCorsHeaders);
  }

  const platformGrantDeleteMatch = apiPath.match(/^\/platform\/permission-grants\/([a-f0-9-]+)$/i);
  if (platformGrantDeleteMatch && request.method === "DELETE") {
    const access = await requirePlatformGrantManagement();
    if (access.errorResponse) return access.errorResponse;

    const deleted = await deletePermissionGrant({
      sbFetch,
      grantId: platformGrantDeleteMatch[1],
      scopeType: "platform",
      scopeId: null,
    });
    if (deleted.error) return jsonResponse({ error: deleted.error }, deleted.status || 400, apiCorsHeaders);
    return jsonResponse(deleted.data, deleted.status || 200, apiCorsHeaders);
  }

  if (apiPath === "/platform/permission-grants" && request.method === "GET") {
    const access = await requirePlatformGrantManagement();
    if (access.errorResponse) return access.errorResponse;

    const targetUserId = String(context.url.searchParams.get("user_id") || "").trim();
    if (!targetUserId) {
      return jsonResponse({ error: "user_id is required" }, 400, apiCorsHeaders);
    }

    const targetUser = await readTargetUser(targetUserId);
    if (targetUser.errorResponse) return targetUser.errorResponse;

    return jsonResponse({
      subject: buildGrantSubject(targetUser.user),
      grants: await listPermissionGrants({
        sbFetch,
        userId: targetUserId,
        scopeType: "platform",
        scopeId: null,
      }),
    }, 200, apiCorsHeaders);
  }

  if (apiPath === "/platform/permission-grants" && request.method === "POST") {
    const access = await requirePlatformGrantManagement();
    if (access.errorResponse) return access.errorResponse;

    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, apiCorsHeaders);

    const targetUserId = String(body.user_id || "").trim();
    if (!targetUserId) {
      return jsonResponse({ error: "user_id is required" }, 400, apiCorsHeaders);
    }
    const validation = validateManagedGrantInput({
      permissionKey: body.permission_key,
      scopeType: "platform",
      scopeId: null,
      expiresAt: body.expires_at,
    });
    if (!validation.ok) {
      return jsonResponse({ error: validation.error }, 400, apiCorsHeaders);
    }

    const targetUser = await readTargetUser(targetUserId);
    if (targetUser.errorResponse) return targetUser.errorResponse;

    const created = await createPermissionGrant({
      sbFetch,
      userId: targetUserId,
      permissionKey: validation.permissionKey,
      scopeType: validation.scopeType,
      scopeId: validation.scopeId,
      grantedBy: user.sub,
      expiresAt: validation.expiresAt,
    });
    if (created.error) return jsonResponse({ error: created.error }, created.status || 400, apiCorsHeaders);

    return jsonResponse({
      subject: buildGrantSubject(targetUser.user),
      grant: created.data,
    }, created.status || 201, apiCorsHeaders);
  }

  const tenantAdminInviteMatch = apiPath.match(/^\/tenants\/([a-z0-9][a-z0-9-]+[a-z0-9])\/admin-invite$/);
  if (tenantAdminInviteMatch && request.method === "POST") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    const slug = tenantAdminInviteMatch[1];
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const role = String(body?.role || "admin").trim().toLowerCase();
    if (!email) {
      return jsonResponse({ error: "email is required" }, 400, apiCorsHeaders);
    }
    if (!["owner", "admin"].includes(role)) {
      return jsonResponse({ error: "role must be owner or admin" }, 400, apiCorsHeaders);
    }

    const { data: tenant } = await sbFetch("tenants", {
      params: `slug=eq.${slug}&select=id,slug,name,tenant_type`,
      single: true,
    });
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404, apiCorsHeaders);

    const { data: invite, error } = await sbFetch("tenant_invitations", {
      method: "POST",
      body: {
        tenant_id: tenant.id,
        email,
        role,
        invite_type: "tenant_admin",
        invited_by: user.sub,
      },
      single: true,
    });
    if (error) return jsonResponse({ error }, 400, apiCorsHeaders);
    let emailDelivery = { sent: false, skipped: true, reason: "not-attempted" };
    try {
      emailDelivery = await sendTenantInviteNotification({
        invite,
        tenant,
        audienceLabel: "organization admin",
      });
    } catch (err) {
      emailDelivery = { sent: false, skipped: false, error: err.message };
    }
    return jsonResponse({
      invite,
      tenant,
      invite_url: buildInviteUrl(invite.token),
      email_delivery: emailDelivery,
    }, 201, apiCorsHeaders);
  }

  if (apiPath === "/tenants" && request.method === "POST") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.slug || !body.tenant_type) {
      return jsonResponse({ error: "name, slug, and tenant_type are required" }, 400, apiCorsHeaders);
    }
    const createdTenant = await createTenantRecord({
      name: body.name,
      slug: body.slug,
      tenantType: body.tenant_type,
    });
    if (createdTenant.error) return jsonResponse({ error: createdTenant.error }, createdTenant.status || 400, apiCorsHeaders);

    const ownerMembership = await createTenantOwnerMembership({
      tenantId: createdTenant.data.id,
      userId: user.sub,
    });
    if (ownerMembership.error) {
      return jsonResponse({ error: ownerMembership.error }, ownerMembership.status || 400, apiCorsHeaders);
    }

    const tenant = createdTenant.data;
    return jsonResponse(tenant, 201, apiCorsHeaders);
  }

  if (apiPath === "/onboarding/self-publisher" && request.method === "POST") {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.slug) {
      return jsonResponse({ error: "name and slug are required" }, 400, apiCorsHeaders);
    }

    const tenantName = String(body.name || "").trim();
    const tenantSlug = String(body.slug || "").trim().toLowerCase();
    if (!tenantName) return jsonResponse({ error: "name is required" }, 400, apiCorsHeaders);
    if (!tenantSlug) return jsonResponse({ error: "slug is required" }, 400, apiCorsHeaders);

    const createdTenant = await createTenantRecord({
      name: tenantName,
      slug: tenantSlug,
      tenantType: "individual_author",
    });
    if (createdTenant.error) return jsonResponse({ error: createdTenant.error }, createdTenant.status || 400, apiCorsHeaders);

    const ownerMembership = await createTenantOwnerMembership({
      tenantId: createdTenant.data.id,
      userId: user.sub,
    });
    if (ownerMembership.error) {
      return jsonResponse({ error: ownerMembership.error }, ownerMembership.status || 400, apiCorsHeaders);
    }

    return jsonResponse({
      tenant: createdTenant.data,
      membership: ownerMembership.data,
    }, 201, apiCorsHeaders);
  }

  if (apiPath === "/onboarding/self-publisher/invite" && request.method === "POST") {
    const superErr = await requireSuperuser();
    if (superErr) return superErr;
    const body = await request.json().catch(() => null);
    if (!body || !body.email || !body.name || !body.slug) {
      return jsonResponse({ error: "email, name, and slug are required" }, 400, apiCorsHeaders);
    }

    const tenantSlug = String(body.slug || "").trim().toLowerCase();
    const email = normalizeEmail(body.email);
    if (!tenantSlug) return jsonResponse({ error: "slug is required" }, 400, apiCorsHeaders);
    if (!email) return jsonResponse({ error: "email is required" }, 400, apiCorsHeaders);

    const createdTenant = await createTenantRecord({
      name: body.name,
      slug: tenantSlug,
      tenantType: "individual_author",
    });
    if (createdTenant.error) return jsonResponse({ error: createdTenant.error }, createdTenant.status || 400, apiCorsHeaders);
    const tenant = createdTenant.data;

    const { data: invite, error: inviteErr } = await sbFetch("tenant_invitations", {
      method: "POST",
      body: {
        tenant_id: tenant.id,
        email,
        role: "publisher",
        invite_type: "self_publisher",
        invited_by: user.sub,
      },
      single: true,
    });
    if (inviteErr) return jsonResponse({ error: inviteErr }, 400, apiCorsHeaders);
    let emailDelivery = { sent: false, skipped: true, reason: "not-attempted" };
    try {
      emailDelivery = await sendTenantInviteNotification({
        invite,
        tenant,
        audienceLabel: "self-publisher",
      });
    } catch (err) {
      emailDelivery = { sent: false, skipped: false, error: err.message };
    }

    return jsonResponse({
      invite,
      tenant,
      invite_url: buildInviteUrl(invite.token),
      email_delivery: emailDelivery,
    }, 201, apiCorsHeaders);
  }

  return null;
}
