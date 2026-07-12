// filepath: src/index.js
// Local-only entry point. Boots an HTTP server for `pnpm dev` / `pnpm start`.
// Vercel does NOT use this file — its Node runtime imports `src/server.js`
// directly (auto-detected via the `server.js` filename convention), where
// the bootstrap also runs. Kept as a shim for backward compatibility.
import { app } from './server.js';
import { env } from './config/env.js';

// Vercel sets this env var automatically on every deploy.
const isVercel = !!process.env.VERCEL;

if (!isVercel) {
  const server = app.listen(env.port, () => {
    console.log(`🚀 Server running on http://localhost:${env.port}`);
    console.log(`📦 Environment: ${env.nodeEnv}`);
    console.log(
      `🩺 Health check: http://localhost:${env.port}${env.apiPrefix}/health`,
    );
  });

  // Graceful shutdown: close the server cleanly on SIGINT/SIGTERM.
  function shutdown(signal) {
    console.log(`\n${signal} received. Closing HTTP server...`);
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });

    // Force exit if shutdown takes too long.
    setTimeout(() => {
      console.error('Forcing shutdown after timeout.');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Re-export app so it can also be used as a serverless handler if needed.
export default app;