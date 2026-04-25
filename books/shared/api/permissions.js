import { api } from './core.js';

/** List current user's tenant memberships. */
export async function getMyTenants() {
  return api.get('/me/tenants');
}

/** Get platform-wide access flags and admin-tenant context for current user. */
export async function getPlatformAccess() {
  return api.get('/me/platform-access');
}

/** List all tenants for superuser admin. */
export async function getPlatformTenants() {
  return api.get('/platform/tenants');
}

/** List superusers and pending superuser invites. */
export async function getPlatformSuperusers() {
  return api.get('/platform/superusers');
}

/** Create a new tenant. */
export async function createTenant({ name, slug, tenant_type }) {
  return api.post('/tenants', { body: { name, slug, tenant_type } });
}

/** Invite a reader into an existing tenant. */
export async function inviteTenantReader(slug, { email }) {
  return api.post(`/tenants/${slug}/invite`, { body: { email } });
}

/** Superuser-only organization admin invite. */
export async function inviteTenantAdmin(slug, { email, role = 'admin' }) {
  return api.post(`/tenants/${slug}/admin-invite`, { body: { email, role } });
}

/** Superuser-only self-publisher onboarding invite. */
export async function createSelfPublisherInvite({ email, name, slug }) {
  return api.post('/onboarding/self-publisher/invite', { body: { email, name, slug } });
}

/** Signed-in self-serve onboarding for an individual publisher account. */
export async function onboardSelfPublisher({ name, slug }) {
  return api.post('/onboarding/self-publisher', { body: { name, slug } });
}

/** Superuser-only invite for another platform superuser. */
export async function createSuperuserInvite({ email }) {
  return api.post('/platform/superusers/invite', { body: { email } });
}
