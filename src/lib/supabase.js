// filepath: src/lib/supabase.js
// Re-exports the Supabase clients so route files have a single, stable import path:
//
//   import { supabase, supabaseAdmin, userClient } from '../lib/supabase.js';
//
export {
  supabase,
  supabaseAdmin,
  pingSupabase,
  userClient,
} from '../config/supabase.js';

export { env } from '../config/env.js';