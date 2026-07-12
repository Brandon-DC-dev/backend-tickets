// filepath: src/server.js
// Vercel serverless entry point.
//
// Vercel's Node.js runtime auto-detects a file named `server.js` (or
// `src/server.js`) and captures the HTTP server it creates via `listen()`.
// All incoming requests are routed to that server. This is the recommended
// way to deploy an Express app to Vercel.
//
// On Vercel:
//   - Vercel imports this module, we call `server.listen()` here, and
//     Vercel hooks into that listener to route requests.
//   - The PORT arg is irrelevant on Vercel (it ignores the bound port and
//     uses an internal one); it only matters for `pnpm dev` locally.
//
// On local dev (pnpm dev / pnpm start):
//   - This module is also the entry. We boot an HTTP server and print the
//     usual logs. `src/index.js` is no longer required for local dev but is
//     kept as a thin shim for backward compatibility.

import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import router from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Orígenes permitidos para el frontend.
//   - Dev: lista blanca fija (Astro 4321, mismo puerto 3000) + dominio de
//     producción a modo de red de seguridad si CORS_ORIGINS no está seteado.
//   - Prod (recomendado): setear CORS_ORIGINS en Vercel con los dominios
//     exactos del front (CSV: https://a.com,https://b.com).
//   - El callback de `cors` REFLEJA el origen del request (no usamos '*'),
//     necesario porque credentials=true obliga a un origen explícito.
const defaultOrigins = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Dominio de producción conocido. Sobre-escribible vía env CORS_ORIGINS.
  'https://frontend-tickets.vercel.app',
];
const origins = [...defaultOrigins, ...env.corsOrigins];

const corsOptions = {
  origin(origin, cb) {
    // Requests sin Origin (curl, Postman, server-to-server) siempre pasan.
    if (!origin) return cb(null, true);
    // Normalizamos para tolerar trailing slashes / case differences.
    const normalized = origin.replace(/\/+$/, '').toLowerCase();
    const allowed = origins.some(
      (o) => o.replace(/\/+$/, '').toLowerCase() === normalized,
    );
    if (allowed) return cb(null, true);
    // No lanzar error: pasamos `false` y el paquete `cors` omite los
    // headers, devolviendo un 403 CORS nativo del navegador sin 500.
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // cache de preflight: 24h
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Preflight explícito para todas las rutas (algunos proxies lo necesitan).
app.options(/^\/.*/, cors(corsOptions));

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
// Vercel auto-detection: `server.listen()` during module startup is what
// signals Vercel's Node runtime to capture the server and route requests.
// On Vercel, the PORT argument is ignored — Vercel assigns an internal port.
const isVercel = !!process.env.VERCEL;

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