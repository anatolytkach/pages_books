/**
 * Compatibility facade for frontend API helpers.
 *
 * Callers should continue importing from this file during the refactor while
 * implementation details move into domain-oriented modules.
 */

export { api } from './api/core.js';

export {
  getGenres,
} from './api/catalog.js';

export {
  getBookOffers,
  createCheckout,
} from './api/commerce.js';

export {
  checkEntitlement,
  getMyEntitlements,
} from './api/entitlements.js';

export {
  acceptInvitation,
  registerAccount,
  inspectInvitation,
} from './api/identity.js';

export {
  getMyTenants,
  getPlatformAccess,
  getPlatformTenants,
  getPlatformSuperusers,
  createTenant,
  onboardSelfPublisher,
  inviteTenantReader,
  inviteTenantAdmin,
  createSelfPublisherInvite,
  createSuperuserInvite,
} from './api/permissions.js';

export {
  uploadBook,
  uploadBookForTenant,
  getBookDraft,
  updateBookMetadata,
  publishBook,
  publishBookForTenant,
} from './api/publishing.js';
