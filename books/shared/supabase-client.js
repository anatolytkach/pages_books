/**
 * Shared Supabase client singleton.
 *
 * Uses the Supabase JS v2 client loaded from CDN (no build step required).
 * The client is initialised lazily on first call to getClient().
 */

import config from './config.js';

let _client = null;

/**
 * Return the shared Supabase client.  The underlying import of the Supabase
 * library happens once and is cached by the browser module loader.
 */
export function getClient() {
  if (_client) return _client;

  // supabase-js is loaded via <script> tag in HTML pages that need it,
  // which exposes window.supabase.  If using ES modules / importmap in
  // the future, swap this for a direct import.
  if (typeof window !== 'undefined' && window.supabase) {
    _client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return _client;
  }

  throw new Error(
    'Supabase JS library not loaded. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> to the page.'
  );
}

/**
 * Convenience: return the current Supabase session (or null).
 */
export async function getSession() {
  const { data: { session } } = await getClient().auth.getSession();
  return session;
}

/**
 * Return the JWT access token for the current session, or null.
 * Used for Authorization headers when calling the Worker API.
 */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}
