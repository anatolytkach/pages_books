import { api } from './core.js';

/** Accept a tenant or self-publisher invite by token. */
export async function acceptInvitation(token) {
  return api.post('/invitations/accept', { body: { token } });
}

/** Register a password-based account without relying on Supabase email delivery. */
export async function registerAccount({ email, password, display_name, invite_token }) {
  return api.post('/auth/register', { body: { email, password, display_name, invite_token } });
}

/** Inspect an invitation token before authentication. */
export async function inspectInvitation(token) {
  return api.get(`/invitations/inspect?token=${encodeURIComponent(token)}`);
}

