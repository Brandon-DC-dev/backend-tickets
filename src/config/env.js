// filepath: src/config/env.js
// Centralized environment configuration with safe defaults.
// Loads .env automatically if dotenv is available.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv is optional — values may come from the OS environment (e.g. production).
}

// --- Supabase key resolution ------------------------------------------------
// Accept either SUPABASE_ANON_KEY (preferred) or SUPABASE_KEY (alias for compat).
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!process.env.SUPABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[env] SUPABASE_URL is not set. Supabase calls will fail.');
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api',

  // --- Supabase ---
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey,
  supabaseServiceRoleKey,

  // --- CORS ---
  // CSV en .env: CORS_ORIGINS=https://app.example.com,https://admin.example.com
  // Se acepta también CORS_ORIGIN (singular) por compatibilidad con despliegues
  // antiguos. Si está vacía, app.js usa defaults razonables para dev.
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

export default env;