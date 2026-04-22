import { PERMISSIONS } from "./vocabulary.mjs";

export { PERMISSIONS };

const ROLE_PERMISSION_MAP = Object.freeze({
  owner: new Set([
    PERMISSIONS.titlePublish,
    PERMISSIONS.artifactReprocess,
    PERMISSIONS.offerManage,
    PERMISSIONS.tenantManageMembers,
  ]),
  admin: new Set([
    PERMISSIONS.titlePublish,
    PERMISSIONS.artifactReprocess,
    PERMISSIONS.offerManage,
    PERMISSIONS.tenantManageMembers,
  ]),
  publisher: new Set([
    PERMISSIONS.titlePublish,
    PERMISSIONS.artifactReprocess,
    PERMISSIONS.offerManage,
  ]),
  editor: new Set([
    PERMISSIONS.artifactReprocess,
  ]),
});

export function getRolePermissionMap() {
  return ROLE_PERMISSION_MAP;
}

function buildDecision(allowed, extra = {}) {
  return { allowed, ...extra };
}

function getPolicyContext(actorContext = {}, resourceContext = {}) {
  return actorContext.policyContext || resourceContext.policyContext || null;
}

async function resolveSuperuserDecision(actorContext, resourceContext) {
  const hasPlatformSuperuserAccess =
    resourceContext.hasPlatformSuperuserAccess ||
    getPolicyContext(actorContext, resourceContext)?.hasPlatformSuperuserAccess;

  if (!hasPlatformSuperuserAccess) return null;
  const allowed = await hasPlatformSuperuserAccess();
  if (!allowed) return null;
  return buildDecision(true, { source: "superuser" });
}

async function resolveExplicitGrantDecision(actorContext, permissionKey, resourceContext) {
  const resolver =
    resourceContext.resolveExplicitPermissionAccess ||
    getPolicyContext(actorContext, resourceContext)?.resolveExplicitPermissionAccess;

  if (!resolver) return null;
  const decision = await resolver({ actorContext, permissionKey, resourceContext });
  if (!decision?.allowed) return null;
  return buildDecision(true, {
    source: "grant",
    grant: decision.grant || null,
  });
}

async function resolveRoleDecision(actorContext, permissionKey, resourceContext) {
  const resolver =
    resourceContext.resolveRolePermissionAccess ||
    getPolicyContext(actorContext, resourceContext)?.resolveRolePermissionAccess;

  if (!resolver) return null;
  const decision = await resolver({
    actorContext,
    permissionKey,
    resourceContext,
    rolePermissionMap: ROLE_PERMISSION_MAP,
  });
  if (!decision?.allowed) return null;
  return buildDecision(true, {
    source: "role",
    role: decision.role || null,
    scope: decision.scope || null,
  });
}

export async function can(actorContext = {}, permissionKey, resourceContext = {}) {
  const superuserDecision = await resolveSuperuserDecision(actorContext, resourceContext);
  if (superuserDecision) return superuserDecision;

  const explicitGrantDecision = await resolveExplicitGrantDecision(actorContext, permissionKey, resourceContext);
  if (explicitGrantDecision) return explicitGrantDecision;

  const roleDecision = await resolveRoleDecision(actorContext, permissionKey, resourceContext);
  if (roleDecision) return roleDecision;

  switch (permissionKey) {
    case PERMISSIONS.titleView:
    case PERMISSIONS.titleEditMetadata: {
      const allowed = await resourceContext.checkTitleAccess?.({
        book: resourceContext.book,
        userId: actorContext.userId,
        tenantContext: resourceContext.tenantContext || null,
      });
      return buildDecision(!!allowed, { source: allowed ? "ownership" : "deny" });
    }

    case PERMISSIONS.platformManageSuperusers: {
      const allowed = await resourceContext.hasPlatformSuperuserAccess?.();
      return buildDecision(!!allowed, { source: allowed ? "superuser" : "deny" });
    }

    case PERMISSIONS.tenantManageMembers: {
      const allowed = await resourceContext.hasTenantUserManagementAccess?.(resourceContext.tenantId);
      return buildDecision(!!allowed, { source: allowed ? "role" : "deny" });
    }

    case PERMISSIONS.titlePublish: {
      if (resourceContext.book && resourceContext.checkTitlePublishAccess) {
        const allowed = await resourceContext.checkTitlePublishAccess({
          book: resourceContext.book,
          userId: actorContext.userId,
          tenantContext: resourceContext.tenantContext || null,
        });
        return buildDecision(!!allowed, { source: allowed ? "ownership" : "deny" });
      }
      const access = await resourceContext.resolvePublishingTenantAccess?.({
        tenantId: resourceContext.tenantId,
        tenantSlug: resourceContext.tenantSlug,
      });
      if (!access) return buildDecision(false, { source: "deny" });
      if (!access.allowed) {
        return buildDecision(false, {
          source: "deny",
          status: access.status,
          error: access.error,
        });
      }
      return buildDecision(true, {
        source: "role",
        tenantContext: access.tenantContext,
      });
    }

    case PERMISSIONS.offerManage: {
      const allowed = await resourceContext.checkOfferManagementAccess?.({
        bookId: resourceContext.bookId,
        userId: actorContext.userId,
      });
      return buildDecision(!!allowed, { source: allowed ? "ownership" : "deny" });
    }

    case PERMISSIONS.artifactReprocess: {
      const allowed = await resourceContext.checkPublishingJobAccess?.({
        job: resourceContext.job,
        userId: actorContext.userId,
      });
      return buildDecision(!!allowed, { source: allowed ? "ownership" : "deny" });
    }

    case PERMISSIONS.readerAccess:
    default:
      return buildDecision(false, { source: "deny" });
  }
}
