// filepath: src/config/supabase.js
// Supabase client configuration.
//
//   - supabase        → anon / publishable key, respects Row Level Security.
//                       Use this for normal user requests.
//   - supabaseAdmin  → service role key, bypasses RLS.
//                       Server-side only — NEVER expose to the browser.
//
// IMPORTANT: Fail fast at import time if the URL or anon key is missing so the
// app crashes loudly instead of producing silent errors on every request.

import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

function failFast(message) {
  // eslint-disable-next-line no-console
  console.error(`[supabase] ${message}`);
  throw new Error(message);
}

if (!env.supabaseUrl) {
  failFast(
    'SUPABASE_URL is not set. Copy .env.example to .env and fill in your values.',
  );
}
if (!env.supabaseAnonKey) {
  failFast(
    'SUPABASE_ANON_KEY (or SUPABASE_KEY) is not set. Copy .env.example to .env.',
  );
}

const baseOptions = {
  auth: {
    persistSession: false, // server-side: no session persistence
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

// --- Public client (anon / publishable) -------------------------------------
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  ...baseOptions,
  global: {
    headers: { 'x-application-name': 'backend-supabase' },
  },
});

// --- Admin client (service role) --------------------------------------------
// Only created when the service role key is provided.
export const supabaseAdmin = env.supabaseServiceRoleKey
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      ...baseOptions,
      global: {
        headers: { 'x-application-name': 'backend-supabase-admin' },
      },
    })
  : null;

/**
 * Real connectivity check: queries the Supabase Auth endpoint, which exists
 * on every project regardless of which tables you've created.
 * Returns the latency in ms or throws on failure.
 */
export async function pingSupabase() {
  const start = Date.now();
  const { error } = await supabase.auth.getSession();
  if (error) throw error;
  return Date.now() - start;
}

/**
 * Convenience helper for routes that want to forward the caller's JWT so
 * Row Level Security policies can identify the user.
 *
 *   const client = userClient(req.headers.authorization);
 */
export function userClient(authHeader) {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return supabase;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    ...baseOptions,
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-application-name': 'backend-supabase-user',
      },
    },
  });
}

export default supabase;