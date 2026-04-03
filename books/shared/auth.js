/**
 * Authentication helpers built on top of the shared Supabase client.
 *
 * All methods return { data, error } to stay consistent with the Supabase
 * convention — callers should always check error before using data.
 */

import { getClient, getSession } from './supabase-client.js';

function getAuthCallbackUrl() {
  return new URL('/books/auth/callback', window.location.origin).toString();
}

// ── Sign-up / Sign-in ──────────────────────────────────────

export async function signUp(email, password, displayName) {
  const sb = getClient();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });
  return { data, error };
}

export async function signIn(email, password) {
  const sb = getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signInWithGoogle() {
  const sb = getClient();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthCallbackUrl(),
    },
  });
  return { data, error };
}

export async function signInWithMagicLink(email) {
  const sb = getClient();
  const { data, error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAuthCallbackUrl(),
    },
  });
  return { data, error };
}

export async function signOut() {
  const sb = getClient();
  const { error } = await sb.auth.signOut();
  return { error };
}

// ── Session ─────────────────────────────────────────────────

export { getSession };

export function onAuthStateChange(callback) {
  const sb = getClient();
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return subscription; // call subscription.unsubscribe() to stop
}

/**
 * Return the currently signed-in user object, or null.
 */
export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

// ── Profile ─────────────────────────────────────────────────

export async function getProfile() {
  const user = await getUser();
  if (!user) return { data: null, error: { message: 'Not signed in' } };

  const sb = getClient();
  const { data, error } = await sb
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return { data, error };
}

export async function updateProfile({ display_name, avatar_url }) {
  const user = await getUser();
  if (!user) return { data: null, error: { message: 'Not signed in' } };

  const sb = getClient();
  const updates = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('user_profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();
  return { data, error };
}

// ── Tenant memberships ──────────────────────────────────────

/**
 * Return all active tenant memberships for the current user.
 * Each entry includes the tenant details and the user's role.
 */
export async function getTenantMemberships() {
  const user = await getUser();
  if (!user) return { data: [], error: { message: 'Not signed in' } };

  const sb = getClient();
  const { data, error } = await sb
    .from('tenant_memberships')
    .select('id, role, department, tenant:tenants(id, slug, name, tenant_type, logo_url)')
    .eq('user_id', user.id)
    .eq('is_active', true);
  return { data: data ?? [], error };
}

/**
 * Check whether the current user has a specific role (or higher) in a tenant.
 */
const ROLE_HIERARCHY = ['member', 'course_admin', 'acquisitions_manager', 'librarian', 'editor', 'publisher', 'admin', 'owner'];

export async function hasRole(tenantId, minimumRole) {
  const { data: memberships } = await getTenantMemberships();
  const membership = memberships.find((m) => m.tenant?.id === tenantId);
  if (!membership) return false;
  const userLevel = ROLE_HIERARCHY.indexOf(membership.role);
  const requiredLevel = ROLE_HIERARCHY.indexOf(minimumRole);
  return userLevel >= requiredLevel;
}
