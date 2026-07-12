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
import { env } from './config/env.js';
import router from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// CORS is configured at the Vercel edge via the `headers` block in
// vercel.json. This guarantees CORS headers on every response —
// including preflight OPTIONS that Vercel intercepts before any lambda
// runs. Keeping it out of Express means there is no risk of the lambda
// and the CDN emitting conflicting headers.
//
// For local dev, the Vite proxy in the Astro frontend already forwards
// /api → this server, so the browser never makes a true cross-origin
// request and CORS is not exercised in dev.

// --- TEMPORARY DEBUG ENDPOINT — remove after diagnosis ----------------------
app.get('/_debug/cors', (req, res) => {
  const envOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  res.json({
    requestOrigin: req.headers.origin || null,
    processEnvCorsOrigins: envOrigins,
    allCorsEnvVars: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => /CORS|ORIGIN/i.test(k)),
    ),
    vercel: !!process.env.VERCEL,
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