// filepath: src/index.js
// Application entry point.
// - Local dev (pnpm dev / pnpm start): boots an HTTP server on PORT.
// - Vercel: this file is NOT used as the serverless entry; vercel.json points
//   to src/app.js directly. Keeping app.listen() here would crash the lambda
//   runtime because there is no port to bind.
import { app } from './app.js';
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