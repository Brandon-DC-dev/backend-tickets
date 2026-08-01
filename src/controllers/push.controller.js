// filepath: src/controllers/push.controller.js
// Controladores HTTP para suscripciones Web Push.
//
// Endpoints:
//   POST   /api/push/subscribe
//   DELETE /api/push/unsubscribe
//   GET    /api/push/public-key      ← expone la VAPID public key al front

import { asyncHandler } from '../middleware/asyncHandler.js';
import * as pushRepo from '../repositories/pushSubscription.repository.js';
import { getPublicVapidKey } from '../config/vapid.js';
import {
  ValidationError,
  NotFoundError,
} from '../utils/errors.js';

/**
 * POST /api/push/subscribe
 * Body: { subscription: { endpoint, keys: { p256dh, auth } }, userId? }
 */
export const subscribe = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const sub = body.subscription;

  if (
    !sub ||
    typeof sub.endpoint !== 'string' ||
    !sub.keys ||
    typeof sub.keys.p256dh !== 'string' ||
    typeof sub.keys.auth !== 'string'
  ) {
    throw new ValidationError(
      'subscription must be { endpoint: string, keys: { p256dh: string, auth: string } }.',
    );
  }

  const userAgent = req.get('user-agent') ?? null;

  const { data, error } = await pushRepo.upsertSubscription({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent,
    user_id: body.userId ?? null,
  });

  if (error) throw error;
  res.status(201).json({ data });
});

/**
 * DELETE /api/push/unsubscribe
 * Body: { endpoint: string }
 */
export const unsubscribe = asyncHandler(async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new ValidationError('endpoint is required.');
  }

  const { count, error } = await pushRepo.deleteByEndpoint(endpoint);
  if (error) throw error;

  if ((count ?? 0) === 0) {
    throw new NotFoundError('Subscription not found.');
  }

  res.json({ deleted: true, count });
});

/**
 * GET /api/push/public-key
 * Devuelve la VAPID public key (la única pieza de config de push que el
 * front necesita para subscribirse).
 */
export const getPublicKey = asyncHandler(async (_req, res) => {
  res.json({ data: { publicKey: getPublicVapidKey() } });
});
