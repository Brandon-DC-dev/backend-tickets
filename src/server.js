// filepath: src/server.js
// Application entry point. Used both as the local dev entry (`pnpm dev`,
// `pnpm start`) and as the Vercel serverless entry.
//
// Vercel's Node.js runtime auto-detects this file (via the `server.js`
// filename convention) and captures the HTTP server it creates via
// `listen()` during module load. To make that work, we always call
// `app.listen()` — even on Vercel, where the bound port is irrelevant
// because Vercel routes requests to the listener through an internal
// port.

import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import router from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// --- CORS ------------------------------------------------------------------
// Orígenes permitidos para el frontend.
//   - Dev: lista blanca fija (Astro 4321, mismo puerto 3000) + dominio de
//     producción como red de seguridad si CORS_ORIGINS no está seteado.
//   - Prod (recomendado): setear CORS_ORIGINS en Vercel con los dominios
//     exactos del front (CSV: https://a.com,https://b.com).
//   - Por seguridad, si la lista efectiva resultante termina vacía o con
//     menos de 2 entradas en producción, usamos `*` como fallback para
//     no bloquear al front mientras se diagnostica. NUNCA se combina '*'
//     con credentials:true (los browsers lo rechazan), así que en ese
//     caso pasamos credentials=false para que al menos la request simple
//     pase.
const defaultOrigins = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Dominio de producción conocido. Sobre-escribible vía env CORS_ORIGINS.
  'https://frontend-tickets.vercel.app',
];

const isVercel = !!process.env.VERCEL;
const envOrigins = [...new Set(env.corsOrigins)];
const effectiveOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const useWildcard = isVercel && effectiveOrigins.length < 2;
if (useWildcard) {
  console.warn(
    `[cors] effective origins list has < 2 entries (${JSON.stringify(
      effectiveOrigins,
    )}); falling back to wildcard origin '*' (credentials disabled).`,
  );
}

const corsOptions = useWildcard
  ? {
      // Wildcard fallback (no credentials).
      origin: '*',
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Content-Length', 'Content-Type'],
      maxAge: 86400,
      optionsSuccessStatus: 204,
    }
  : {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        const normalized = origin.replace(/\/+$/, '').toLowerCase();
        const allowed = effectiveOrigins.some(
          (o) => (o || '').replace(/\/+$/, '').toLowerCase() === normalized,
        );
        if (!allowed) {
          console.warn(`[cors] blocked origin: ${origin}`);
        }
        if (allowed) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Content-Length', 'Content-Type'],
      maxAge: 86400,
      optionsSuccessStatus: 204,
    };

app.use(cors(corsOptions));
// Preflight explícito para todas las rutas (algunos proxies lo necesitan).
app.options(/^\/.*/, cors(corsOptions));

// --- TEMPORARY DEBUG ENDPOINT — remove after diagnosis ----------------------
app.get('/_debug/cors', (req, res) => {
  res.json({
    requestOrigin: req.headers.origin || null,
    envCorsOrigins: env.corsOrigins,
    effectiveOrigins,
    useWildcard,
    isVercel,
    corsEnvVars: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => /CORS|ORIGIN/i.test(k)),
    ),
    nodeEnv: process.env.NODE_ENV,
  });
});
// ---------------------------------------------------------------------------

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes mounted under the configured prefix.
app.use(env.apiPrefix, router);

// Root fallback so `/` works without the prefix.
app.get('/', (req, res) => {
  res.json({
    name: 'backend-supabase API',
    version: '1.0.0',
    docs: `${env.apiPrefix}/health`,
  });
});

// 404 + error handlers (must be registered last).
app.use(notFoundHandler);
app.use(errorHandler);

// --- Bootstrap --------------------------------------------------------------
// Always call `app.listen()` — Vercel's Node runtime requires it during
// module load to capture the server, and it's a no-op-ish on Vercel where
// the bound port is ignored. Locally we attach friendly startup logs and
// signal handlers on top of the same listen call.
if (isVercel) {
  // Vercel: just listen so the runtime captures the server.
  app.listen(env.port);
} else {
  // Local dev: print friendly startup logs.
  const server = app.listen(env.port, () => {
    console.log(`🚀 Server running on http://localhost:${env.port}`);
    console.log(`📦 Environment: ${env.nodeEnv}`);
    console.log(
      `🩺 Health check: http://localhost:${env.port}${env.apiPrefix}/health`,
    );
  });

  function shutdown(signal) {
    console.log(`\n${signal} received. Closing HTTP server...`);
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forcing shutdown after timeout.');
      process.exit(1);
    }, 10_000).unref();
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export { app };
export default app;