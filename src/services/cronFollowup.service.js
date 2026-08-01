// filepath: src/services/cronFollowup.service.js
// Lógica del tick de cron: busca seguimientos vencidos y dispara push.
//
// No usa setTimeout — corre cada minuto como función serverless disparada
// por Vercel Cron (ver `vercel.json` y `api/cron/process-followups.js`).
//
// Estrategia:
//   1. Buscar hasta N seguimientos con next_notification_at <= now()
//      y notifications_sent < total_notifications.
//   2. Por cada uno:
//        - Enviar push con el mensaje.
//        - Si fue la última notificación → DELETE.
//        - Si no → incrementar sent + avanzar next_notification_at.
//   3. Devolver un resumen { processed, sent, deleted, errors }.

import * as followupRepo from '../repositories/ticketFollowup.repository.js';
import * as pushService from './push.service.js';
import { logger } from '../utils/logger.js';

const DEFAULT_BATCH_LIMIT = 100;

/**
 * Ejecuta un tick del cron.
 *
 * @param {{ limit?: number, now?: Date }} [opts]
 */
export async function processDueFollowups(opts = {}) {
  const limit = opts.limit ?? DEFAULT_BATCH_LIMIT;
  const nowIso = (opts.now ?? new Date()).toISOString();

  logger.info(`[cron] tick start now=${nowIso} limit=${limit}`);

  const { data: due, error } = await followupRepo.findDue(nowIso, { limit });
  if (error) {
    logger.error('[cron] failed to fetch due followups', error);
    throw error;
  }

  if (!due || due.length === 0) {
    logger.info('[cron] tick done nothing-to-process');
    return { processed: 0, sent: 0, deleted: 0, errors: 0 };
  }

  let sent = 0;
  let deleted = 0;
  let errors = 0;

  for (const row of due) {
    try {
      const payload = {
        title: 'Seguimiento de ticket',
        body:
          row.message?.trim() ||
          `Recordatorio ${row.notifications_sent + 1} de ${row.total_notifications}`,
        data: {
          ticketId: row.ticket_id,
          followupId: row.id,
          sent: row.notifications_sent + 1,
          total: row.total_notifications,
        },
      };

      const result = await pushService.broadcast(payload);
      sent += result.sent;

      const { data: updated, error: updateErr, deleteFollowup } =
        await followupRepo.markSentAndAdvance(row.id);

      if (updateErr) {
        errors += 1;
        logger.error(`[cron] failed to update followup ${row.id}`, updateErr);
        continue;
      }

      if (deleteFollowup) {
        const { count } = await followupRepo.deleteByTicketId(row.ticket_id);
        deleted += count ?? 0;
        logger.info(
          `[cron] followup ${row.id} completed (${row.total_notifications}/${row.total_notifications}), deleted rows=${count ?? 0}`,
        );
      } else {
        logger.debug(`[cron] followup ${row.id} advanced`, updated);
      }
    } catch (err) {
      errors += 1;
      logger.error(`[cron] unexpected error processing followup ${row.id}`, err);
    }
  }

  const summary = { processed: due.length, sent, deleted, errors };
  logger.info('[cron] tick done', summary);
  return summary;
}
