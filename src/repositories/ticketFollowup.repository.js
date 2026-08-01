// filepath: src/repositories/ticketFollowup.repository.js
// Capa de acceso a datos para `ticket_followups`.
//
// Sigue el patrón del crudRouter existente: usa el cliente anon de Supabase
// (sin service-role) y mapea errores comunes a códigos HTTP-friendly. Los
// métodos devuelven shapes consistentes ({ data, error }) para que la capa
// de servicio decida cómo presentarlos.

import { supabase } from '../config/supabase.js';

const TABLE = 'ticket_followups';

/**
 * Crea un seguimiento. Si ya existe uno activo para el ticket, Supabase
 * retornará 23505 (unique_violation) → el servicio lo traduce a 409.
 *
 * @param {{
 *   ticket_id: string,
 *   duration_minutes: number,
 *   total_notifications: number,
 *   interval_minutes: number,
 *   next_notification_at: string,
 *   message?: string,
 * }} row
 */
export async function createFollowup(row) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ticket_id: row.ticket_id,
      duration_minutes: row.duration_minutes,
      total_notifications: row.total_notifications,
      interval_minutes: row.interval_minutes,
      next_notification_at: row.next_notification_at,
      message: row.message ?? '',
    })
    .select('*')
    .single();

  return { data, error };
}

/**
 * Busca el seguimiento activo de un ticket.
 */
export async function findByTicketId(ticketId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  return { data, error };
}

/**
 * Devuelve todos los seguimientos activos (sin filtro de estado, ya que
 * la tabla sólo contiene activos).
 */
export async function listAll() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('next_notification_at', { ascending: true });

  return { data, error };
}

/**
 * Devuelve los seguimientos pendientes cuyo `next_notification_at` ya
 * venció. Es el query principal del cron.
 *
 * Limitamos a `limit` filas por tick para no acumular latencia si hay un
 * backlog (el siguiente tick procesa el resto).
 */
export async function findDue(nowIso, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .lte('next_notification_at', nowIso)
    .lt('notifications_sent', 'total_notifications') // comparación columna-columna
    .order('next_notification_at', { ascending: true })
    .limit(limit);

  return { data, error };
}

/**
 * Marca que se envió una notificación: incrementa el contador y avanza
 * `next_notification_at` por `interval_minutes`. Se hace en una sola
 * operación para minimizar round-trips.
 *
 * Si `notifications_sent + 1 >= total_notifications`, esta función
 * devuelve `delete_followup: true` para que el caller elimine la fila
 * en vez de actualizarla (más limpio).
 */
export async function markSentAndAdvance(id) {
  // Leemos el row actual primero para calcular el nuevo timestamp.
  const { data: current, error: readErr } = await supabase
    .from(TABLE)
    .select('notifications_sent, total_notifications, interval_minutes')
    .eq('id', id)
    .single();

  if (readErr) return { data: null, error: readErr, deleteFollowup: false };

  const nextSent = (current.notifications_sent ?? 0) + 1;
  const isLast = nextSent >= current.total_notifications;

  if (isLast) {
    return { data: current, error: null, deleteFollowup: true };
  }

  // Calculamos next_notification_at en JS (no se puede sumar minutos a
  // un timestamptz directo desde PostgREST sin RPC).
  const nextAt = new Date(
    Date.now() + current.interval_minutes * 60_000,
  ).toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      notifications_sent: nextSent,
      next_notification_at: nextAt,
    })
    .eq('id', id)
    .select('*')
    .single();

  return { data, error, deleteFollowup: false };
}

/**
 * Elimina el seguimiento de un ticket. Devuelve cuántas filas se afectaron.
 */
export async function deleteByTicketId(ticketId) {
  const { data, error, count } = await supabase
    .from(TABLE)
    .delete()
    .eq('ticket_id', ticketId)
    .select('id', { count: 'exact', head: false });

  return { data, error, count: count ?? 0 };
}
