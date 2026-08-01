// filepath: api/cron/process-followups.js
// ============================================================================
// Vercel Cron handler — se ejecuta cada minuto (ver `vercel.json` → `crons`).
//
// Es una función serverless STANDALONE (no usa el Express de `src/server.js`)
// para que cada tick:
//   - tenga su propio cold-start aislado (no carga todo Express);
//   - corra con timeout corto de Vercel (60s hobby / 300s pro);
//   - se pueda gatillar manualmente para debugging.
//
// Seguridad: Vercel añade automáticamente `Authorization: Bearer $CRON_SECRET`
// si la variable está configurada. Si no, cualquiera podría gatillar el cron.
// ============================================================================

import { processDueFollowups } from '../../src/services/cronFollowup.service.js';
import { logger } from '../../src/utils/logger.js';
import { env } from '../../src/config/env.js';

export default async function handler(req, res) {
  // 1. Auth: Vercel Cron envía Bearer $CRON_SECRET.
  //    Aceptamos GET (cron real) y POST (manual desde CLI/Postman).
  const authHeader = req.headers.authorization || '';
  const expected = env.cronSecret ? `Bearer ${env.cronSecret}` : null;

  if (expected && authHeader !== expected) {
    logger.warn('[cron] unauthorized invocation attempt', {
      ip: req.headers['x-forwarded-for'],
      ua: req.headers['user-agent'],
    });
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  // 2. Sólo GET (Vercel Cron usa GET) y POST (testing manual).
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 3. Ejecutar el tick.
  const startedAt = Date.now();
  try {
    const summary = await processDueFollowups();
    return res.status(200).json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...summary,
    });
  } catch (err) {
    logger.error('[cron] tick failed', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      durationMs: Date.now() - startedAt,
    });
  }
}
