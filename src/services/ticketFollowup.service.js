// filepath: src/services/ticketFollowup.service.js
// Lógica de negocio del módulo de seguimiento de tickets.
//
// Responsabilidades:
//   - Validar inputs (regla "no permitir crear si ya existe").
//   - Calcular interval_minutes y la primera fecha de notificación.
//   - Verificar que el ticket exista y no esté en estado terminal.
//   - Cancelar un seguimiento (con borrado completo de la fila).
//   - Exponer el estado "vivo" del seguimiento para GETs.
//
// NO toca HTTP ni Supabase directamente — solo repositories + utils.

import * as followupRepo from '../repositories/ticketFollowup.repository.js';
import * as ticketRepo from '../repositories/ticket.repository.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Estados terminales del ticket (deben coincidir con el trigger SQL).
const TERMINAL_STATUSES = new Set(['Entregado', 'Finalizado', 'Cancelado']);

/**
 * Crea un seguimiento nuevo.
 *
 * @param {{
 *   ticketId: string,
 *   durationMinutes: number,
 *   notifications: number,
 *   message?: string,
 * }} input
 */
export async function createFollowup(input) {
  const ticketId = input.ticketId;
  const durationMinutes = Number(input.durationMinutes);
  const notifications = Number(input.notifications);
  const message = input.message ?? '';

  // --- Validaciones de negocio (el middleware ya validó tipos y presencia) ---
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new ValidationError('durationMinutes must be greater than 0.');
  }
  if (!Number.isFinite(notifications) || notifications <= 0) {
    throw new ValidationError('notifications must be greater than 0.');
  }
  // Nota: se permite notifications > durationMinutes; el cálculo de
  // effectiveNotifications más abajo recorta al máximo posible (1 aviso/min).

  // --- Validaciones de dominio ---
  const { data: ticket, error: ticketErr } = await ticketRepo.getStatus(ticketId);
  if (ticketErr) throw ticketErr;
  if (!ticket) {
    throw new NotFoundError(`Ticket ${ticketId} does not exist.`);
  }
  if (TERMINAL_STATUSES.has(ticket.estado)) {
    throw new ValidationError(
      `Ticket is in terminal status "${ticket.estado}". Cannot start follow-up.`,
    );
  }

  // --- Regla: un único seguimiento activo por ticket ---
  const { data: existing, error: existingErr } =
    await followupRepo.findByTicketId(ticketId);
  if (existingErr) throw existingErr;
  if (existing) {
    throw new ConflictError(
      `Ticket ${ticketId} already has an active follow-up.`,
    );
  }

  // --- Cálculos ---
  // Si el cliente pide más notificaciones que minutos (caso típico: 1 aviso
  // por minuto), recortamos al máximo posible: 1 minuto entre avisos.
  const effectiveNotifications = Math.min(notifications, durationMinutes);
  const intervalMinutes = Math.max(1, Math.floor(durationMinutes / effectiveNotifications));

  // La primera notificación se programa para dentro de `intervalMinutes`.
  const nextNotificationAt = new Date(
    Date.now() + intervalMinutes * 60_000,
  ).toISOString();

  const { data, error } = await followupRepo.createFollowup({
    ticket_id: ticketId,
    duration_minutes: durationMinutes,
    total_notifications: effectiveNotifications,
    interval_minutes: intervalMinutes,
    next_notification_at: nextNotificationAt,
    message,
  });

  if (error) {
    // 23505 = unique_violation → carrera con otro POST concurrente.
    if (error.code === '23505') {
      throw new ConflictError(
        `Ticket ${ticketId} already has an active follow-up.`,
      );
    }
    throw error;
  }

  logger.info(
    `[followup] created ticket=${ticketId} duration=${durationMinutes}m ` +
      `total=${notifications} interval=${intervalMinutes}m`,
  );

  return enrich(data);
}

/**
 * Obtiene el seguimiento activo de un ticket. Devuelve null si no existe.
 */
export async function getFollowup(ticketId) {
  const { data, error } = await followupRepo.findByTicketId(ticketId);
  if (error) throw error;
  return data ? enrich(data) : null;
}

/**
 * Lista todos los seguimientos activos.
 */
export async function listFollowups() {
  const { data, error } = await followupRepo.listAll();
  if (error) throw error;
  return (data ?? []).map(enrich);
}

/**
 * Cancela (elimina) el seguimiento de un ticket. Idempotente.
 *
 * @returns {Promise<{ deleted: boolean, ticketId: string }>}
 */
export async function cancelFollowup(ticketId) {
  const { count, error } = await followupRepo.deleteByTicketId(ticketId);
  if (error) throw error;
  const deleted = (count ?? 0) > 0;
  logger.info(
    `[followup] cancel ticket=${ticketId} deleted=${deleted} rows=${count ?? 0}`,
  );
  return { deleted, ticketId };
}

/**
 * Marca que se envió una notificación. Llamado por el Service Worker del
 * navegador cada vez que dispara una notificación local (reemplaza al
 * antiguo cron del backend).
 *
 * Comportamiento:
 *   - Si la fila ya no existe → { done: true, reason: 'not_found' }.
 *   - Si todavía no vence la próxima fecha → noop (el SW verá el mismo
 *     nextAt y volverá a llamar más tarde).
 *   - Si era la última notificación → DELETE fila + { done: true }.
 *   - Si quedan más → +1 a notifications_sent, avanza next_notification_at.
 *
 * @returns {Promise<{
 *   done: boolean,
 *   reason?: 'completed' | 'not_found',
 *   ticketId: string,
 *   nextAt?: string,
 *   sent?: number,
 *   deleted?: number,
 * }>}
 */
export async function tickFollowup(ticketId) {
  const { data: row, error } = await followupRepo.findByTicketId(ticketId);
  if (error) throw error;
  if (!row) {
    return { done: true, reason: 'not_found', ticketId };
  }

  const now = Date.now();
  const nextAtMs = new Date(row.next_notification_at).getTime();

  // Si todavía no vence, devolvemos la misma nextAt para que el SW sepa
  // que no debe disparar todavía (defensa contra llamadas duplicadas).
  if (nextAtMs > now) {
    return {
      done: false,
      ticketId,
      nextAt: row.next_notification_at,
      sent: row.notifications_sent ?? 0,
    };
  }

  const sentSoFar = row.notifications_sent ?? 0;
  const isLast = sentSoFar + 1 >= row.total_notifications;

  if (isLast) {
    const { count } = await followupRepo.deleteByTicketId(ticketId);
    return {
      done: true,
      reason: 'completed',
      ticketId,
      deleted: count ?? 0,
    };
  }

  const newNextAt = new Date(
    now + row.interval_minutes * 60_000,
  ).toISOString();
  const nextSent = sentSoFar + 1;

  // Update directo via cliente admin (bypassa RLS). Si en el futuro quieres
  // abstraerlo, agregamos `followupRepo.advance(id, sent, nextAt)`.
  const { supabaseAdmin, supabase } = await import('../config/supabase.js');
  const db = supabaseAdmin ?? supabase;
  const { error: updateErr } = await db
    .from('ticket_followups')
    .update({
      notifications_sent: nextSent,
      next_notification_at: newNextAt,
    })
    .eq('id', row.id);

  if (updateErr) throw updateErr;

  return { done: false, ticketId, nextAt: newNextAt, sent: nextSent };
}

// --- helpers ----------------------------------------------------------------

/**
 * Enriquece la fila cruda con campos derivados que consume la API.
 */
function enrich(row) {
  const now = Date.now();
  const nextAt = new Date(row.next_notification_at).getTime();
  const startedAt = new Date(row.started_at).getTime();
  const endAt = startedAt + row.duration_minutes * 60_000;

  return {
    ...row,
    activo: row.notifications_sent < row.total_notifications,
    enviados: row.notifications_sent,
    total: row.total_notifications,
    restantes: Math.max(0, row.total_notifications - row.notifications_sent),
    tiempo_restante_minutos: Math.max(
      0,
      Math.floor((endAt - now) / 60_000),
    ),
    proximo_recordatorio: row.next_notification_at,
  };
}
