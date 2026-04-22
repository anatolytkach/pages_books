import { PERMISSIONS } from "./vocabulary.mjs";

const MANAGEABLE_PERMISSION_KEYS = new Set(
  Object.values(PERMISSIONS).filter((permissionKey) => permissionKey !== PERMISSIONS.readerAccess)
);

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

export function isManageablePermissionKey(permissionKey) {
  return MANAGEABLE_PERMISSION_KEYS.has(String(permissionKey || "").trim());
}

export function validateManagedGrantScope({ scopeType, scopeId }) {
  const normalizedScopeType = String(scopeType || "").trim();
  const normalizedScopeId = normalizeId(scopeId);

  if (normalizedScopeType === "platform") {
    if (normalizedScopeId) {
      return { ok: false, error: "platform grants must not include scope_id" };
    }
    return { ok: true, scopeType: "platform", scopeId: null };
  }

  if (normalizedScopeType === "organization") {
    if (!normalizedScopeId) {
      return { ok: false, error: "organization grants require scope_id" };
    }
    return { ok: true, scopeType: "organization", scopeId: normalizedScopeId };
  }

  if (normalizedScopeType === "title") {
    return { ok: false, error: "title-scoped grant management is not yet supported" };
  }

  return { ok: false, error: "scope_type is invalid" };
}

export function validateManagedGrantInput({ permissionKey, scopeType, scopeId, expiresAt = "" }) {
  const normalizedPermissionKey = String(permissionKey || "").trim();
  if (!isManageablePermissionKey(normalizedPermissionKey)) {
    return { ok: false, error: "permission_key is invalid" };
  }

  const scope = validateManagedGrantScope({ scopeType, scopeId });
  if (!scope.ok) return scope;

  const normalizedExpiresAt = normalizeTimestamp(expiresAt);
  if (String(expiresAt || "").trim() && !normalizedExpiresAt) {
    return { ok: false, error: "expires_at must be a valid timestamp" };
  }
  if (normalizedExpiresAt && new Date(normalizedExpiresAt).getTime() <= Date.now()) {
    return { ok: false, error: "expires_at must be in the future" };
  }

  return {
    ok: true,
    permissionKey: normalizedPermissionKey,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    expiresAt: normalizedExpiresAt || null,
  };
}

export async function listPermissionGrants({ sbFetch, userId, scopeType, scopeId }) {
  const normalizedUserId = normalizeId(userId);
  const validation = validateManagedGrantScope({ scopeType, scopeId });
  if (!normalizedUserId || !validation.ok) return [];

  const scopeIdParam = validation.scopeId ? `&scope_id=eq.${validation.scopeId}` : "&scope_id=is.null";
  const { data, error } = await sbFetch("permission_grants", {
    params:
      `user_id=eq.${normalizedUserId}` +
      `&scope_type=eq.${validation.scopeType}` +
      `${scopeIdParam}` +
      "&select=id,user_id,permission_key,scope_type,scope_id,granted_by,created_at,expires_at" +
      "&order=created_at.desc",
  });
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function findPermissionGrant({ sbFetch, grantId, scopeType, scopeId }) {
  const normalizedGrantId = normalizeId(grantId);
  const validation = validateManagedGrantScope({ scopeType, scopeId });
  if (!normalizedGrantId || !validation.ok) return null;

  const scopeIdParam = validation.scopeId ? `&scope_id=eq.${validation.scopeId}` : "&scope_id=is.null";
  const { data } = await sbFetch("permission_grants", {
    params:
      `id=eq.${normalizedGrantId}` +
      `&scope_type=eq.${validation.scopeType}` +
      `${scopeIdParam}` +
      "&select=id,user_id,permission_key,scope_type,scope_id,granted_by,created_at,expires_at",
    single: true,
  });
  return data || null;
}

export async function findExistingPermissionGrant({ sbFetch, userId, permissionKey, scopeType, scopeId }) {
  const normalizedUserId = normalizeId(userId);
  const normalizedPermissionKey = String(permissionKey || "").trim();
  const validation = validateManagedGrantScope({ scopeType, scopeId });
  if (!normalizedUserId || !normalizedPermissionKey || !validation.ok) return null;

  const scopeIdParam = validation.scopeId ? `&scope_id=eq.${validation.scopeId}` : "&scope_id=is.null";
  const { data } = await sbFetch("permission_grants", {
    params:
      `user_id=eq.${normalizedUserId}` +
      `&permission_key=eq.${encodeURIComponent(normalizedPermissionKey)}` +
      `&scope_type=eq.${validation.scopeType}` +
      `${scopeIdParam}` +
      "&select=id,user_id,permission_key,scope_type,scope_id,granted_by,created_at,expires_at",
    single: true,
  });
  return data || null;
}

export async function createPermissionGrant({
  sbFetch,
  userId,
  permissionKey,
  scopeType,
  scopeId,
  grantedBy,
  expiresAt = null,
}) {
  const validation = validateManagedGrantInput({ permissionKey, scopeType, scopeId, expiresAt });
  if (!validation.ok) return { error: validation.error, status: 400, data: null };

  const existingGrant = await findExistingPermissionGrant({
    sbFetch,
    userId,
    permissionKey: validation.permissionKey,
    scopeType: validation.scopeType,
    scopeId: validation.scopeId,
  });
  if (existingGrant) {
    return { error: "Grant already exists", status: 409, data: existingGrant };
  }

  const { data, error } = await sbFetch("permission_grants", {
    method: "POST",
    body: {
      user_id: normalizeId(userId),
      permission_key: validation.permissionKey,
      scope_type: validation.scopeType,
      scope_id: validation.scopeId,
      granted_by: normalizeId(grantedBy) || null,
      expires_at: validation.expiresAt,
    },
    single: true,
  });
  if (error) return { error, status: 400, data: null };
  return { error: null, status: 201, data };
}

export async function deletePermissionGrant({ sbFetch, grantId, scopeType, scopeId }) {
  const grant = await findPermissionGrant({ sbFetch, grantId, scopeType, scopeId });
  if (!grant) return { error: "Grant not found", status: 404, data: null };

  const { error } = await sbFetch("permission_grants", {
    method: "DELETE",
    params: `id=eq.${grant.id}`,
  });
  if (error) return { error, status: 400, data: null };
  return {
    error: null,
    status: 200,
    data: {
      deleted: true,
      grant_id: grant.id,
      user_id: grant.user_id,
      permission_key: grant.permission_key,
      scope_type: grant.scope_type,
      scope_id: grant.scope_id,
    },
  };
}
