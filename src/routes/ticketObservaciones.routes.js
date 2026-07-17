// filepath: src/routes/ticketObservaciones.routes.js
// CRUD + helpers for ticket_observaciones
// (id, ticket_id, usuario_id, observacion, fecha).
//
// Extra endpoints:
//   GET    /ticket-observaciones/por-ticket/:ticketId
//          → historial completo de un ticket (más reciente primero).
//   POST   /ticket-observaciones/por-ticket/:ticketId
//          → atajo para registrar una observación vinculada al ticket
//            del path (el cliente sólo envía { observacion, usuario_id }).
//
// El resto de los endpoints REST estándar se generan con
// `createCrudRouter`, igual que en `ticketHistorial.routes.js`.

import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// --- GET /ticket-observaciones/por-ticket/:ticketId -----------------------
// Devuelve todas las observaciones del ticket, ordenadas por fecha
// descendente (más reciente primero).
router.get(
  '/por-ticket/:ticketId',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('ticket_observaciones')
        .select(
          '*, usuario:usuarios!ticket_observaciones_usuario_id_fkey(*)',
        )
        .eq('ticket_id', req.params.ticketId)
        .order('fecha', { ascending: false });

      if (error) {
        return res
          .status(error.code === 'PGRST116' ? 404 : 500)
          .json({ error: error.code, message: error.message });
      }

      res.json({ data, count: data?.length ?? 0 });
    } catch (err) {
      next(err);
    }
  },
);

// --- POST /ticket-observaciones/por-ticket/:ticketId ----------------------
// Body: { observacion: string, usuario_id?: string }
//
// Atajo para registrar una observación vinculada al ticket recibido
// en el path. Devuelve la fila recién creada con la forma completa
// (`*` + join a `usuarios`).
router.post(
  '/por-ticket/:ticketId',
  async (req, res, next) => {
    try {
      const { observacion, usuario_id } = req.body ?? {};

      if (typeof observacion !== 'string' || observacion.trim() === '') {
        return res.status(400).json({
          error: 'BadRequest',
          message: '`observacion` must be a non-empty string.',
        });
      }

      const { data, error } = await supabase
        .from('ticket_observaciones')
        .insert({
          ticket_id: req.params.ticketId,
          usuario_id: usuario_id ?? null,
          observacion: observacion.trim(),
        })
        .select(
          '*, usuario:usuarios!ticket_observaciones_usuario_id_fkey(*)',
        )
        .single();

      if (error) {
        const code = error.code;
        const status =
          code === '23505'
            ? 409
            : code === 'PGRST116'
              ? 404
              : code === '23503' || code === '23514' || code === '22P02'
                ? 400
                : 500;
        return res.status(status).json({ error: code, message: error.message });
      }

      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  },
);

// --- CRUD estándar (GET /, GET /:id, POST /, PUT /:id, PATCH /:id,
//     DELETE /:id) generado con la factory compartida.
router.use(
  '/',
  createCrudRouter({
    table: 'ticket_observaciones',
    client: supabase,
    defaultSelect: `
      *,
      usuario:usuarios!ticket_observaciones_usuario_id_fkey(*),
      ticket:tickets(numero_ticket, estado)
    `,
    allowedFilters: ['ticket_id', 'usuario_id'],
    searchable: ['observacion'],
  }),
);

export default router;
