// filepath: src/app.js
// Re-export shim. The real Express app lives in `src/server.js` because
// Vercel's Node.js runtime auto-detects a file named `server.js` at the
// project root or under `src/`. Keeping the app there lets Vercel capture
// it via `server.listen()` without any extra vercel.json routing magic.
//
// This file is preserved so existing imports (`import app from './app.js'`)
// keep working — it just forwards to the canonical module.

export { default } from './server.js';
export * from './server.js';