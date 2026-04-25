function normalizeId(value) {
  return String(value || "").trim();
}

export function resolvePermissionGrantScopes(resourceContext = {}) {
  const scopes = [{ scope_type: "platform", scope_id: null }];
  const seen = new Set(["platform:"]);

  const pushScope = (scopeType, scopeId) => {
    const normalizedScopeId = normalizeId(scopeId);
    const dedupeKey = `${scopeType}:${normalizedScopeId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    scopes.push({ scope_type: scopeType, scope_id: normalizedScopeId || null });
  };

  const tenantId =
    resourceContext.tenantId ||
    resourceContext.tenantContext?.tenantId ||
    resourceContext.book?.published_by_tenant_id ||
    resourceContext.job?.tenant_id;
  if (tenantId) pushScope("organization", tenantId);

  const titleId =
    resourceContext.book?.id ||
    resourceContext.bookId ||
    resourceContext.job?.book_id;
  if (titleId) pushScope("title", titleId);

  return scopes;
}

export async function fetchActivePermissionGrants(sbFetch, { userId, permissionKey }) {
  const normalizedUserId = normalizeId(userId);
  const normalizedPermissionKey = String(permissionKey || "").trim();
  if (!normalizedUserId || !normalizedPermissionKey) return [];

  const { data, error } = await sbFetch("permission_grants", {
    params: `user_id=eq.${normalizedUserId}&permission_key=eq.${encodeURIComponent(normalizedPermissionKey)}&select=id,scope_type,scope_id,expires_at,granted_by,created_at`,
  });
  if (error || !Array.isArray(data)) return [];

  const now = Date.now();
  return data.filter((grant) => !grant.expires_at || new Date(grant.expires_at).getTime() > now);
}

export async function resolveExplicitPermissionGrant(sbFetch, { userId, permissionKey, resourceContext }) {
  const grants = await fetchActivePermissionGrants(sbFetch, { userId, permissionKey });
  if (!grants.length) return { allowed: false };

  const candidateScopes = resolvePermissionGrantScopes(resourceContext);
  const match = grants.find((grant) =>
    candidateScopes.some((scope) =>
      scope.scope_type === grant.scope_type &&
      normalizeId(scope.scope_id) === normalizeId(grant.scope_id)
    )
  );

  if (!match) return { allowed: false };
  return { allowed: true, grant: match };
}

export async function fetchTenantMembershipRole(sbFetch, { userId, tenantId }) {
  const normalizedUserId = normalizeId(userId);
  const normalizedTenantId = normalizeId(tenantId);
  if (!normalizedUserId || !normalizedTenantId) return "";

  const { data: membership } = await sbFetch("tenant_memberships", {
    params: `tenant_id=eq.${normalizedTenantId}&user_id=eq.${normalizedUserId}&is_active=eq.true&select=role`,
    single: true,
  });
  return String(membership?.role || "").trim().toLowerCase();
}

export async function resolveRolePermissionAccess(sbFetch, { userId, permissionKey, resourceContext, rolePermissionMap }) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId || !permissionKey) return { allowed: false };

  const matchesPermission = (role) => {
    const normalizedRole = String(role || "").trim().toLowerCase();
    if (!normalizedRole) return "";
    return rolePermissionMap[normalizedRole]?.has(permissionKey) ? normalizedRole : "";
  };

  if (permissionKey === "tenant.manage_members") {
    const tenantId = normalizeId(resourceContext.tenantId);
    const role = matchesPermission(await fetchTenantMembershipRole(sbFetch, {
      userId: normalizedUserId,
      tenantId,
    }));
    if (!role) return { allowed: false };
    return { allowed: true, role, scope: { type: "organization", id: tenantId } };
  }

  if (permissionKey === "title.publish") {
    const tenantId = normalizeId(
      resourceContext.tenantContext?.tenantId ||
      resourceContext.tenantId ||
      resourceContext.book?.published_by_tenant_id
    );
    const role = matchesPermission(await fetchTenantMembershipRole(sbFetch, {
      userId: normalizedUserId,
      tenantId,
    }));
    if (!role) return { allowed: false };
    return { allowed: true, role, scope: { type: "organization", id: tenantId } };
  }

  if (permissionKey === "artifact.reprocess") {
    const tenantId = normalizeId(resourceContext.job?.tenant_id);
    const role = matchesPermission(await fetchTenantMembershipRole(sbFetch, {
      userId: normalizedUserId,
      tenantId,
    }));
    if (!role) return { allowed: false };
    return { allowed: true, role, scope: { type: "organization", id: tenantId } };
  }

  if (permissionKey === "offer.manage") {
    const tenantId = normalizeId(
      resourceContext.book?.published_by_tenant_id ||
      resourceContext.tenantId
    );
    const role = matchesPermission(await fetchTenantMembershipRole(sbFetch, {
      userId: normalizedUserId,
      tenantId,
    }));
    if (!role) return { allowed: false };
    return { allowed: true, role, scope: { type: "organization", id: tenantId } };
  }

  return { allowed: false };
}
