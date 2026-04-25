import { api } from './core.js';

/** Check entitlement for a book. */
export async function checkEntitlement(bookId) {
  return api.get(`/books/${bookId}/entitlement`);
}

/** List current user's entitlements. */
export async function getMyEntitlements() {
  return api.get('/me/entitlements');
}

