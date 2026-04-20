import { PERMISSIONS } from "./vocabulary.mjs";

export { PERMISSIONS };

export async function can(actorContext = {}, permissionKey, resourceContext = {}) {
  switch (permissionKey) {
    case PERMISSIONS.platformManageSuperusers: {
      const allowed = await resourceContext.hasPlatformSuperuserAccess?.();
      return { allowed: !!allowed };
    }

    case PERMISSIONS.tenantManageMembers: {
      const allowed = await resourceContext.hasTenantUserManagementAccess?.(resourceContext.tenantId);
      return { allowed: !!allowed };
    }

    case PERMISSIONS.titlePublish: {
      const access = await resourceContext.resolvePublishingTenantAccess?.({
        tenantId: resourceContext.tenantId,
        tenantSlug: resourceContext.tenantSlug,
      });
      if (!access) return { allowed: false };
      if (!access.allowed) {
        return {
          allowed: false,
          status: access.status,
          error: access.error,
        };
      }
      return {
        allowed: true,
        tenantContext: access.tenantContext,
      };
    }

    case PERMISSIONS.artifactReprocess: {
      const allowed = await resourceContext.checkPublishingJobAccess?.({
        job: resourceContext.job,
        userId: actorContext.userId,
      });
      return { allowed: !!allowed };
    }

    case PERMISSIONS.titleView:
    case PERMISSIONS.titleEditMetadata:
    case PERMISSIONS.readerAccess:
    case PERMISSIONS.offerManage:
    default:
      return { allowed: false };
  }
}
