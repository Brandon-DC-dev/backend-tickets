// filepath: src/controllers/ticketFollowup.controller.js
// Controladores HTTP para el módulo de seguimiento de tickets.
//
// Endpoints:
//   POST   /api/ticket-followup            Crear seguimiento.
//   GET    /api/ticket-followup            Listar todos los activos.
//   GET    /api/ticket-followup/:ticketId  Obtener uno.
//   DELETE /api/ticket-followup/:ticketId  Cancelar seguimiento.

import { asyncHandler } from '../middleware/asyncHandler.js';
import * as followupService from '../services/ticketFollowup.service.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * POST /api/ticket-followup
 * Body: { ticketId, durationMinutes, notifications, message? }
 */
export const create = asyncHandler(async (req, res) => {
  const data = await followupService.createFollowup(req.body);
  res.status(201).json({ data });
});

/**
 * GET /api/ticket-followup
 */
export const list = asyncHandler(async (_req, res) => {
  const data = await followupService.listFollowups();
  res.json({ data, count: data.length });
});

/**
 * GET /api/ticket-followup/:ticketId
 */
export const getOne = asyncHandler(async (req, res) => {
  const data = await followupService.getFollowup(req.params.ticketId);
  if (!data) throw new NotFoundError('No active follow-up for this ticket.');
  res.json({ data });
});

/**
 * DELETE /api/ticket-followup/:ticketId
 */
export const cancel = asyncHandler(async (req, res) => {
  const result = await followupService.cancelFollowup(req.params.ticketId);
  res.json(result);
});

/**
 * POST /api/ticket-followup/:ticketId/tick
 *
 * El Service Worker del navegador llama este endpoint cada vez que dispara
 * una notificación local, para mantener Supabase sincronizado (contador y
 * próxima fecha). Reemplaza la lógica que antes vivía en el cron.
 *
 * Respuestas posibles:
 *   200 { done: false, nextAt, sent }   — todavía faltan notificaciones
 *   200 { done: true, reason, ticketId } — terminó o no existe
 */
export const tick = asyncHandler(async (req, res) => {
  const result = await followupService.tickFollowup(req.params.ticketId);
  res.json(result);
});
