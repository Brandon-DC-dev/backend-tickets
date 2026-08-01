// filepath: src/services/push.service.js
// Servicio de Web Push.
//
// Responsabilidades:
//   - Inicializar web-push con las VAPID keys.
//   - Enviar un push a una suscripción individual.
//   - Hacer broadcast a TODAS las suscripciones registradas.
//   - Limpiar suscripciones inválidas (404/410) para que no vuelvan a fallar.
//
// NO conoce HTTP — eso es trabajo del controller.

import { initWebPush } from '../config/vapid.js';
import * as pushRepo from '../repositories/pushSubscription.repository.js';
import { logger } from '../utils/logger.js';

const TERMINAL_STATUS_CODES = new Set([404, 410]); // suscripción vencida/cancelada

/**
 * Envía una notificación a una suscripción. Devuelve `{ ok, statusCode, shouldDelete }`.
 */
export async function sendToSubscription(subscription, payload) {
  const webpush = initWebPush();

  try {
    const result = await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: '60' }, // si el push service está offline, lo retiene 60s
    );
    return { ok: true, statusCode: result.statusCode, shouldDelete: false };
  } catch (err) {
    const statusCode = err.statusCode || 0;
    const shouldDelete = TERMINAL_STATUS_CODES.has(statusCode);

    logger.warn(
      `[push] send failed endpoint=${shorten(subscription.endpoint)} status=${statusCode} delete=${shouldDelete}`,
      err.body || err.message,
    );

    return { ok: false, statusCode, shouldDelete, error: err };
  }
}

/**
 * Broadcast: envía `payload` a TODAS las suscripciones registradas.
 * Limpia automáticamente las que retornen 404/410.
 *
 * @returns {Promise<{ sent: number, failed: number, deleted: number }>}
 */
export async function broadcast(payload) {
  const { data: subs, error } = await pushRepo.listAll();
  if (error) {
    logger.error('[push] failed to list subscriptions', error);
    throw error;
  }

  if (!subs || subs.length === 0) {
    logger.info('[push] no subscriptions registered, skipping broadcast');
    return { sent: 0, failed: 0, deleted: 0 };
  }

  let sent = 0;
  let failed = 0;
  let deleted = 0;

  // Paralelizamos con allSettled para no bloquear el tick del cron si una falla.
  const results = await Promise.allSettled(
    subs.map((s) =>
      sendToSubscription(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        payload,
      ),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      if (r.value.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (r.value.shouldDelete) {
          const endpoint = subs[i].endpoint;
          const { count } = await pushRepo.deleteByEndpoint(endpoint);
          deleted += count ?? 0;
        }
      }
    } else {
      failed += 1;
      logger.error('[push] unexpected rejection', r.reason);
    }
  }

  logger.info(`[push] broadcast sent=${sent} failed=${failed} deleted=${deleted}`);
  return { sent, failed, deleted };
}

/**
 * Trunca un endpoint para logs (suele ser URLs largas con tokens).
 */
function shorten(endpoint) {
  if (!endpoint || endpoint.length < 60) return endpoint;
  return `${endpoint.slice(0, 30)}…${endpoint.slice(-20)}`;
}
