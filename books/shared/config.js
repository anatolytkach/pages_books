/**
 * Platform configuration.
 *
 * In production the values come from the served HTML (injected by the Worker
 * via HTMLRewriter).  During local development they fall back to the local
 * Supabase instance that `supabase start` spins up.
 */

const _meta = (name) => {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el ? el.getAttribute('content') : null;
};

const config = Object.freeze({
  // Supabase
  supabaseUrl:  _meta('supabase-url')  || 'https://kalbegycglkhxulhatpx.supabase.co',
  supabaseAnonKey: _meta('supabase-anon-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthbGJlZ3ljZ2xraHh1bGhhdHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzkyODIsImV4cCI6MjA4OTM1NTI4Mn0.T1VqDg2ZK87RfnABKMHUwDLpT7bVOckr40Pv-aIppKs',

  // Stripe (publishable key — safe to expose in browser)
  stripePublishableKey: _meta('stripe-publishable-key') || '',

  // API base (Worker) — platform API lives under /v1/
  apiBase: _meta('api-base') || '/books/api/v1',
});

export default config;
