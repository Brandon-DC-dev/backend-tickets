// filepath: src/config/vapid.js
// Wrapper de web-push con inicialización idempotente de las VAPID keys.
//
// Vercel mantiene las funciones serverless "warm" entre invocaciones del
// cron, pero igual llamamos setVapidDetails en cada invocación porque el
// módulo puede venir de una nueva instancia. Es barato y garantiza
// consistencia.

import webpush from 'web-push';
import { env } from './env.js';

let initialized = false;

/**
 * Inicializa web-push con las VAPID keys. Idempotente.
 * Lanza si las keys no están configuradas.
 */
export function initWebPush() {
  if (initialized) return webpush;

  const { publicKey, privateKey, subject } = env.vapid;

  if (!publicKey || !privateKey) {
    throw new Error(
      '[vapid] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in env.',
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
  return webpush;
}

/**
 * Devuelve la VAPID public key (segura de exponer al cliente para que el
 * service worker la use al subscribirse).
 */
export function getPublicVapidKey() {
  return env.vapid.publicKey;
}

export { webpush };
