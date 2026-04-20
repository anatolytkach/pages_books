import {
  createApiCorsHeaders,
  getSupabaseAdminConfig,
  jsonResponse,
  normalizeEmail,
  readJsonSafe,
  resolveBookContentAccessForRequest,
  roleRank,
  sbFetchWithEnv,
  sbRpcWithEnv,
  userCanAccessTenantBookForAccess,
  verifySupabaseJwt,
} from "./worker-helpers.mjs";
import { can, PERMISSIONS } from "../permissions/policy.mjs";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function createApiContext({ request, env, url }) {
  const apiCorsHeaders = createApiCorsHeaders();

  let user = null;
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    user = await verifySupabaseJwt(token, env);
  }

  const requireAuth = () => {
    if (!user) {
      return jsonResponse({ error: "Authentication required" }, 401, apiCorsHeaders);
    }
    return null;
  };

  const requireInternalTaskAuth = () => {
    const provided = String(request.headers.get("x-reader-internal-key") || "").trim();
    const acceptedSecrets = [
      String(env.PROTECTED_JOB_CALLBACK_SECRET || "").trim(),
      String(env.INTERNAL_TASK_SECRET || "").trim(),
      String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    ].filter(Boolean);
    if (!provided || acceptedSecrets.length === 0 || !acceptedSecrets.includes(provided)) {
      return jsonResponse({ error: "Forbidden" }, 403, apiCorsHeaders);
    }
    return null;
  };

  const bootstrapSuperuserEmails = new Set(
    String(env.PLATFORM_BOOTSTRAP_SUPERUSER_EMAILS || "yarane@gmail.com")
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter(Boolean)
  );

  const sbFetch = async (table, options = {}) => sbFetchWithEnv(env, table, options, fetch);
  const sbRpc = async (fn, args = {}) => sbRpcWithEnv(env, fn, args, fetch);

  const buildInviteUrl = (token) => {
    const baseUrl = String(env.PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
    const origin = baseUrl || url.origin;
    const inviteUrl = new URL("/books/auth/", origin);
    inviteUrl.searchParams.set("invite", String(token || "").trim());
    return inviteUrl.toString();
  };

  const sendInviteEmail = async ({ email, subject, html, text, trackingId = "" }) => {
    const apiKey = String(env.PINGRAM_API_KEY || "").trim();
    const clientId = String(env.PINGRAM_CLIENT_ID || "").trim();
    const clientSecret = String(env.PINGRAM_CLIENT_SECRET || "").trim();
    const baseUrl = String(env.PINGRAM_API_BASE_URL || env.NOTIFICATIONAPI_BASE_URL || "https://api.notificationapi.com").trim().replace(/\/+$/, "");
    const senderName = String(env.PINGRAM_SENDER_NAME || "reader.pub").trim();
    const senderEmail = String(env.PINGRAM_SENDER_EMAIL || "").trim();
    if (!email) return { sent: false, skipped: true, reason: "missing-email" };
    if (!apiKey && !(clientId && clientSecret)) {
      return { sent: false, skipped: true, reason: "missing-pingram-config" };
    }
    if (!senderEmail) {
      return { sent: false, skipped: true, reason: "missing-pingram-sender-email" };
    }

    const payload = {
      type: "readerpub_invite",
      to: {
        id: normalizeEmail(email) || String(email).trim(),
        email: normalizeEmail(email),
      },
      email: {
        subject,
        html,
        senderName,
        senderEmail,
      },
    };
    if (text) payload.email.previewText = text.slice(0, 200);

    let endpoint = `${baseUrl}/send`;
    const headers = {
      "content-type": "application/json",
    };

    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
      headers["x-api-key"] = apiKey;
    } else {
      endpoint = `${baseUrl}/${encodeURIComponent(clientId)}/sender`;
      headers.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    }
    if (trackingId) headers["x-reader-tracking-id"] = trackingId;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `Pingram request failed with HTTP ${response.status}`);
    }
    return {
      sent: true,
      skipped: false,
      detail: await readJsonSafe(response),
    };
  };

  const sbAuthAdmin = async (path, { method = "GET", body } = {}) => {
    const sb = getSupabaseAdminConfig(env);
    if (!sb) return { data: null, error: "Supabase not configured", detail: null };
    const response = await fetch(`${sb.url}/auth/v1/admin${path}`, {
      method,
      headers: {
        apikey: sb.key,
        authorization: `Bearer ${sb.key}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await readJsonSafe(response);
    if (!response.ok) {
      const errorMessage = data?.msg || data?.message || data?.error || `HTTP ${response.status}`;
      return { data: null, error: errorMessage, detail: data };
    }
    return { data, error: null, detail: data };
  };

  const createPasswordUser = async ({ email, password, displayName }) => {
    const normalizedUserEmail = normalizeEmail(email);
    const normalizedPassword = String(password || "");
    const normalizedDisplayName = String(displayName || "").trim();
    if (!normalizedUserEmail) return { data: null, error: "email is required", detail: null };
    if (normalizedPassword.length < 6) {
      return { data: null, error: "password must be at least 6 characters", detail: null };
    }

    const result = await sbAuthAdmin("/users", {
      method: "POST",
      body: {
        email: normalizedUserEmail,
        password: normalizedPassword,
        email_confirm: true,
        user_metadata: normalizedDisplayName ? { display_name: normalizedDisplayName } : {},
      },
    });
    if (result.error) return result;
    return {
      data: {
        id: result.data?.id,
        email: result.data?.email || normalizedUserEmail,
      },
      error: null,
      detail: result.detail,
    };
  };

  const applyTenantInviteForUser = async (invite, { userId, email }) => {
    if (!invite) return { data: null, error: "Invitation not found" };
    if (invite.accepted_at) return { data: null, error: "Invitation already accepted" };
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      return { data: null, error: "Invitation has expired" };
    }
    if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
      return { data: null, error: "Invitation email does not match authenticated user" };
    }

    const grantedRole = invite.invite_type === "self_publisher" ? "owner" : invite.role;

    const { data: existingMembership } = await sbFetch("tenant_memberships", {
      params: `tenant_id=eq.${invite.tenant_id}&user_id=eq.${userId}&select=id,role,is_active`,
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
          user_id: userId,
          role: grantedRole,
        },
        single: true,
      });
      if (membershipErr) return { data: null, error: membershipErr };
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
    return {
      data: {
        accepted: true,
        invite_type: invite.invite_type || "tenant_reader",
        role: grantedRole,
        tenant,
      },
      error: null,
    };
  };

  const applySuperuserInviteForUser = async (invite, { userId, email }) => {
    if (!invite) return { data: null, error: "Invitation not found" };
    if (invite.accepted_at) return { data: null, error: "Invitation already accepted" };
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      return { data: null, error: "Invitation has expired" };
    }
    if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
      return { data: null, error: "Invitation email does not match authenticated user" };
    }

    const { data: existingSuperuser } = await sbFetch("platform_superusers", {
      params: `user_id=eq.${userId}&select=user_id`,
      single: true,
    });
    if (!existingSuperuser) {
      const { error: grantErr } = await sbFetch("platform_superusers", {
        method: "POST",
        body: {
          user_id: userId,
          granted_by: invite.invited_by || userId,
        },
        single: true,
      });
      if (grantErr) return { data: null, error: grantErr };
    }

    await sbFetch("platform_superuser_invitations", {
      method: "PATCH",
      params: `id=eq.${invite.id}&select=*`,
      body: {
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
      },
    });

    return {
      data: {
        accepted: true,
        invite_type: "platform_superuser",
        role: "superuser",
      },
      error: null,
    };
  };

  const applyInvitationTokenForUser = async (token, { userId, email }) => {
    const { data: invite, error: inviteErr } = await sbFetch("tenant_invitations", {
      params: `token=eq.${token}&select=*`,
      single: true,
    });
    if (!inviteErr && invite) {
      return applyTenantInviteForUser(invite, { userId, email });
    }

    const { data: superInvite, error: superInviteErr } = await sbFetch("platform_superuser_invitations", {
      params: `token=eq.${token}&select=*`,
      single: true,
    });
    if (superInviteErr || !superInvite) {
      return { data: null, error: "Invitation not found" };
    }
    return applySuperuserInviteForUser(superInvite, { userId, email });
  };

  const inspectInvitationToken = async (token) => {
    const { data: invite, error: inviteErr } = await sbFetch("tenant_invitations", {
      params: `token=eq.${token}&select=*`,
      single: true,
    });
    if (!inviteErr && invite) {
      const { data: tenant } = await sbFetch("tenants", {
        params: `id=eq.${invite.tenant_id}&select=id,slug,name,tenant_type`,
        single: true,
      });
      return {
        data: {
          token,
          email: invite.email,
          role: invite.role,
          invite_type: invite.invite_type || "tenant_reader",
          accepted_at: invite.accepted_at || null,
          expires_at: invite.expires_at || null,
          tenant,
        },
        error: null,
      };
    }

    const { data: superInvite, error: superInviteErr } = await sbFetch("platform_superuser_invitations", {
      params: `token=eq.${token}&select=*`,
      single: true,
    });
    if (superInviteErr || !superInvite) {
      return { data: null, error: "Invitation not found" };
    }
    return {
      data: {
        token,
        email: superInvite.email,
        role: "superuser",
        invite_type: "platform_superuser",
        accepted_at: superInvite.accepted_at || null,
        expires_at: superInvite.expires_at || null,
        tenant: null,
      },
      error: null,
    };
  };

  const sendTenantInviteNotification = async ({ invite, tenant, audienceLabel }) => {
    if (!invite?.token || !invite?.email || !tenant?.name) {
      return { sent: false, skipped: true, reason: "missing-invite-data" };
    }
    const inviteUrl = buildInviteUrl(invite.token);
    const roleLabel = String(invite.role || "member").replace(/_/g, " ");
    return sendInviteEmail({
      email: invite.email,
      subject: `You were invited to join ${tenant.name} on reader.pub`,
      html: `
            <p>You were invited to join <strong>${escapeHtml(tenant.name)}</strong> on reader.pub.</p>
            <p>Access level: <strong>${escapeHtml(roleLabel)}</strong>${audienceLabel ? ` (${escapeHtml(audienceLabel)})` : ""}</p>
            <p><a href="${escapeHtml(inviteUrl)}">Accept your invitation</a></p>
            <p>If you do not have an account yet, the link will let you set a password directly without waiting for a confirmation email.</p>
          `,
      text:
        `You were invited to join ${tenant.name} on reader.pub as ${roleLabel}. ` +
        `Open this link to accept your invitation: ${inviteUrl}`,
      trackingId: `tenant-invite:${invite.id || invite.token}`,
    });
  };

  const sendSuperuserInviteNotification = async ({ invite }) => {
    if (!invite?.token || !invite?.email) {
      return { sent: false, skipped: true, reason: "missing-invite-data" };
    }
    const inviteUrl = buildInviteUrl(invite.token);
    return sendInviteEmail({
      email: invite.email,
      subject: "You were invited to become a reader.pub superuser",
      html: `
            <p>You were invited to become a <strong>reader.pub superuser</strong>.</p>
            <p><a href="${escapeHtml(inviteUrl)}">Accept your invitation</a></p>
            <p>The link will let you create an account or sign in without relying on Supabase email delivery.</p>
          `,
      text:
        `You were invited to become a reader.pub superuser. ` +
        `Open this link to accept your invitation: ${inviteUrl}`,
      trackingId: `superuser-invite:${invite.id || invite.token}`,
    });
  };

  const hasPlatformSuperuserAccess = async () => {
    if (!user) return false;
    if (bootstrapSuperuserEmails.has(normalizeEmail(user.email))) return true;
    const { data, error } = await sbFetch("platform_superusers", {
      params: `user_id=eq.${user.sub}&select=user_id`,
      single: true,
    });
    return !error && !!data;
  };

  const requireSuperuser = async () => {
    const authErr = requireAuth();
    if (authErr) return authErr;
    const decision = await can({ user }, PERMISSIONS.platformManageSuperusers, {
      hasPlatformSuperuserAccess,
    });
    if (decision.allowed) return null;
    return jsonResponse({ error: "Superuser access required" }, 403, apiCorsHeaders);
  };

  const getPlatformSuperuserStatus = async () => hasPlatformSuperuserAccess();

  const getTenantAdminMemberships = async () => {
    if (!user) return [];
    const { data, error } = await sbFetch("tenant_memberships", {
      params: `user_id=eq.${user.sub}&is_active=eq.true&role=in.(owner,admin)&select=id,role,tenant_id,tenants:tenant_id(id,slug,name,tenant_type)`,
    });
    if (error || !Array.isArray(data)) return [];
    return data;
  };

  const getTenantPublishingMemberships = async () => {
    if (!user) return [];
    const { data, error } = await sbFetch("tenant_memberships", {
      params: `user_id=eq.${user.sub}&is_active=eq.true&role=in.(owner,admin,publisher)&select=id,role,tenant_id,tenants:tenant_id(id,slug,name,tenant_type)`,
    });
    if (error || !Array.isArray(data)) return [];
    return data;
  };

  const listPlatformTenants = async () => {
    const { data, error } = await sbFetch("tenants", {
      params: "select=id,slug,name,tenant_type,is_active,created_at&order=name.asc",
    });
    if (error || !Array.isArray(data)) return [];
    return data;
  };

  const attachProfilesToMemberships = async (memberships) => {
    const rows = Array.isArray(memberships) ? memberships : [];
    const userIds = [...new Set(rows.map((row) => String(row.user_id || "").trim()).filter(Boolean))];
    if (!userIds.length) return rows.map((row) => ({ ...row, profile: null }));

    const encodedIds = userIds.map((id) => `"${id}"`).join(",");
    const { data: profiles } = await sbFetch("user_profiles", {
      params: `id=in.(${encodedIds})&select=id,display_name,avatar_url`,
    });
    const byId = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [String(profile.id), profile]));

    return rows.map((row) => ({
      ...row,
      profile: byId.get(String(row.user_id || "")) || null,
    }));
  };

  const hasTenantUserManagementAccess = async (tenantId) => {
    const normalizedTenantId = String(tenantId || "").trim();
    if (!normalizedTenantId || !user) return false;
    if (await hasPlatformSuperuserAccess()) return true;
    const { data: membership } = await sbFetch("tenant_memberships", {
      params: `tenant_id=eq.${normalizedTenantId}&user_id=eq.${user.sub}&is_active=eq.true&select=role`,
      single: true,
    });
    return !!membership && ["owner", "admin"].includes(String(membership.role || ""));
  };

  const canManageTenantUsers = async (tenantId) => {
    const decision = await can({ user }, PERMISSIONS.tenantManageMembers, {
      tenantId,
      hasTenantUserManagementAccess,
    });
    return decision.allowed;
  };

  const listPlatformTenantsWithRoster = async () => {
    const [tenants, membershipsRes, invitesRes] = await Promise.all([
      listPlatformTenants(),
      sbFetch("tenant_memberships", {
        params: "is_active=eq.true&select=id,tenant_id,user_id,role,department,created_at&order=created_at.asc",
      }),
      sbFetch("tenant_invitations", {
        params: "accepted_at=is.null&select=id,tenant_id,email,role,invite_type,token,created_at,expires_at&order=created_at.desc",
      }),
    ]);

    const memberships = await attachProfilesToMemberships(Array.isArray(membershipsRes?.data) ? membershipsRes.data : []);
    const pendingInvites = Array.isArray(invitesRes?.data) ? invitesRes.data : [];

    return tenants.map((tenant) => ({
      ...tenant,
      members: memberships
        .filter((row) => String(row.tenant_id || "") === String(tenant.id))
        .map((row) => ({
          id: row.id,
          user_id: row.user_id,
          role: row.role,
          department: row.department,
          created_at: row.created_at,
          status: "active",
          profile: row.profile || null,
        })),
      pending_invites: pendingInvites
        .filter((row) => String(row.tenant_id || "") === String(tenant.id))
        .map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          invite_type: row.invite_type,
          token: row.token,
          created_at: row.created_at,
          expires_at: row.expires_at,
          status: "pending",
        })),
    }));
  };

  const getActiveUserTenantIds = async (userId) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return [];
    const { data, error } = await sbFetch("tenant_memberships", {
      params: `user_id=eq.${normalizedUserId}&is_active=eq.true&select=tenant_id`,
    });
    if (error || !Array.isArray(data)) return [];
    return [...new Set(data.map((row) => String(row.tenant_id || "").trim()).filter(Boolean))];
  };

  const userCanAccessTenantBook = async (book, userId) => {
    if (!book || !userId) return false;
    return userCanAccessTenantBookForAccess(env, book, userId, fetch);
  };

  const resolvePublishingTenantAccess = async ({ tenantId = "", tenantSlug = "" } = {}) => {
    const [isSuperuser, memberships] = await Promise.all([
      getPlatformSuperuserStatus(),
      getTenantPublishingMemberships(),
    ]);

    const normalizedTenantId = String(tenantId || "").trim();
    const normalizedTenantSlug = String(tenantSlug || "").trim().toLowerCase();

    if (!normalizedTenantId && !normalizedTenantSlug && isSuperuser) {
      return {
        allowed: true,
        tenantContext: {
          tenantId: "",
          tenantSlug: "",
          membership: null,
          personal: true,
        },
      };
    }

    if (!memberships.length) {
      return { allowed: false, error: "Publishing access required", status: 403 };
    }

    let match = null;
    if (normalizedTenantId) {
      match = memberships.find((item) => String(item.tenant_id || "") === normalizedTenantId) || null;
      if (!match) {
        return { allowed: false, error: "Not authorized for requested tenant", status: 403 };
      }
    } else if (normalizedTenantSlug) {
      match = memberships.find((item) => String(item?.tenants?.slug || "").toLowerCase() === normalizedTenantSlug) || null;
      if (!match) {
        return { allowed: false, error: "Not authorized for requested tenant", status: 403 };
      }
    } else if (memberships.length === 1) {
      match = memberships[0];
    } else {
      return {
        allowed: false,
        error: "tenant_id or tenant_slug is required when you administer multiple tenants",
        status: 400,
      };
    }

    return {
      allowed: true,
      tenantContext: {
        tenantId: String(match.tenant_id || ""),
        tenantSlug: String(match?.tenants?.slug || ""),
        membership: match,
        personal: false,
      },
    };
  };

  const resolvePublishingTenant = async ({ tenantId = "", tenantSlug = "" } = {}) => {
    const decision = await can({ user }, PERMISSIONS.titlePublish, {
      tenantId,
      tenantSlug,
      resolvePublishingTenantAccess,
    });
    if (!decision.allowed) {
      return {
        error: jsonResponse({ error: decision.error || "Publishing access required" }, decision.status || 403, apiCorsHeaders),
      };
    }
    return decision.tenantContext;
  };

  const getTenantSourceSlug = async (tenantId) => {
    const normalizedTenantId = String(tenantId || "").trim();
    if (!normalizedTenantId) return "";
    const { data: tenant } = await sbFetch("tenants", {
      params: `id=eq.${normalizedTenantId}&select=slug`,
      single: true,
    });
    return String(tenant?.slug || "").trim().toLowerCase();
  };

  return {
    attachProfilesToMemberships,
    apiCorsHeaders,
    buildInviteUrl,
    canManageTenantUsers,
    createPasswordUser,
    env,
    getActiveUserTenantIds,
    getPlatformSuperuserStatus,
    hasPlatformSuperuserAccess,
    hasTenantUserManagementAccess,
    getTenantAdminMemberships,
    getTenantPublishingMemberships,
    getTenantSourceSlug,
    inspectInvitationToken,
    jsonResponse,
    listPlatformTenantsWithRoster,
    normalizeEmail,
    readJsonSafe,
    request,
    requireAuth,
    requireInternalTaskAuth,
    requireSuperuser,
    resolvePublishingTenantAccess,
    resolveBookContentAccessForRequest: (args) => resolveBookContentAccessForRequest({ ...args, fetchImpl: fetch }),
    resolvePublishingTenant,
    roleRank,
    sbFetch,
    sbRpc,
    sendSuperuserInviteNotification,
    sendTenantInviteNotification,
    applyInvitationTokenForUser,
    user,
    userCanAccessTenantBook,
    url,
  };
}
