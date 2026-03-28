/**
 * Platform API client.
 *
 * Wraps fetch() with automatic JWT injection and JSON handling.
 * All Worker API calls should go through this module.
 */

import config from './config.js';
import { getAccessToken } from './supabase-client.js';

async function request(method, path, { body, headers: extra } = {}) {
  const token = await getAccessToken();
  const headers = { ...extra };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${config.apiBase}${path}`;
  const opts = { method, headers };

  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
      // Let the browser set Content-Type with boundary for multipart
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, opts);

  if (!res.ok) {
    let detail;
    try { detail = await res.json(); } catch { detail = { message: res.statusText }; }
    const err = new Error(detail.message || detail.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

// ── Convenience methods ─────────────────────────────────────

export const api = {
  get:    (path, opts) => request('GET',    path, opts),
  post:   (path, opts) => request('POST',   path, opts),
  patch:  (path, opts) => request('PATCH',  path, opts),
  put:    (path, opts) => request('PUT',    path, opts),
  delete: (path, opts) => request('DELETE', path, opts),
};

// ── Typed helpers ───────────────────────────────────────────

/** Upload a file (EPUB, DOCX, or ZIP) for publishing. */
export async function uploadBook(file) {
  return uploadBookForTenant(file, {});
}

/** Upload a file for publishing under a tenant context. */
export async function uploadBookForTenant(file, { tenant_id, tenant_slug } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (tenant_id) form.append('tenant_id', tenant_id);
  if (tenant_slug) form.append('tenant_slug', tenant_slug);
  return api.post('/publish/upload', { body: form });
}

/** Fetch a book draft's current metadata. */
export async function getBookDraft(bookId) {
  return api.get(`/publish/books/${bookId}`);
}

/** Update metadata fields on a book draft. */
export async function updateBookMetadata(bookId, metadata) {
  return api.patch(`/publish/books/${bookId}/metadata`, { body: metadata });
}

/** Publish a book (transition from ready → published). */
export async function publishBook(bookId, { visibility } = {}) {
  return publishBookForTenant(bookId, { visibility });
}

/** Publish a book under a tenant context. */
export async function publishBookForTenant(bookId, { visibility, tenant_id, tenant_slug } = {}) {
  return api.post(`/publish/books/${bookId}/publish`, { body: { visibility, tenant_id, tenant_slug } });
}

/** Fetch genres list. */
export async function getGenres() {
  return api.get('/genres');
}

/** Check entitlement for a book. */
export async function checkEntitlement(bookId) {
  return api.get(`/books/${bookId}/entitlement`);
}

/** Get active offers for a book. */
export async function getBookOffers(bookId) {
  return api.get(`/books/${bookId}/offers`);
}

/** Create a Stripe checkout session for an offer. */
export async function createCheckout(bookId, offerId) {
  return api.post(`/books/${bookId}/checkout`, { body: { offer_id: offerId } });
}

/** List current user's entitlements. */
export async function getMyEntitlements() {
  return api.get('/me/entitlements');
}

/** List current user's tenant memberships. */
export async function getMyTenants() {
  return api.get('/me/tenants');
}

/** Get platform-wide access flags and admin-tenant context for current user. */
export async function getPlatformAccess() {
  return api.get('/me/platform-access');
}

/** Create a new tenant. */
export async function createTenant({ name, slug, tenant_type }) {
  return api.post('/tenants', { body: { name, slug, tenant_type } });
}

/** Invite a reader into an existing tenant. */
export async function inviteTenantReader(slug, { email }) {
  return api.post(`/tenants/${slug}/invite`, { body: { email } });
}

/** Superuser-only self-publisher onboarding invite. */
export async function createSelfPublisherInvite({ email, name, slug }) {
  return api.post('/onboarding/self-publisher/invite', { body: { email, name, slug } });
}

/** Accept a tenant or self-publisher invite by token. */
export async function acceptInvitation(token) {
  return api.post('/invitations/accept', { body: { token } });
}
