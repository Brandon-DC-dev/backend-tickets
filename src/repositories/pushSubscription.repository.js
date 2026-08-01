// filepath: src/repositories/pushSubscription.repository.js
// Capa de acceso a datos para `push_subscriptions`.

import { supabase } from '../config/supabase.js';

const TABLE = 'push_subscriptions';

/**
 * Crea o actualiza una suscripción (upsert por endpoint). El navegador
 * puede entregar el mismo endpoint varias veces (ej: re-subscribe), por
 * lo que upsert es idempotente.
 *
 * @param {{
 *   endpoint: string,
 *   p256dh: string,
 *   auth: string,
 *   user_agent?: string|null,
 *   user_id?: string|null,
 * }} sub
 */
export async function upsertSubscription(sub) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.user_agent ?? null,
        user_id: sub.user_id ?? null,
      },
      { onConflict: 'endpoint' },
    )
    .select('*')
    .single();

  return { data, error };
}

/**
 * Lista todas las suscripciones (broadcast: si hay varios devices del
 * mismo usuario, todos reciben). En el futuro se puede filtrar por user_id
 * para personalización.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*');

  return { data, error };
}

/**
 * Elimina una suscripción por endpoint.
 */
export async function deleteByEndpoint(endpoint) {
  const { data, error, count } = await supabase
    .from(TABLE)
    .delete()
    .eq('endpoint', endpoint)
    .select('id', { count: 'exact', head: false });

  return { data, error, count: count ?? 0 };
}
