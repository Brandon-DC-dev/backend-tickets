// filepath: src/routes/ticketHistorial.routes.js
// CRUD for ticket_historial (id, ticket_id, usuario_cambio_id, cambio, fecha).
import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// Helper: list the full history for one ticket (newest first).
router.get(
  '/por-ticket/:ticketId',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('ticket_historial')
        .select('*, usuario:usuarios!ticket_historial_usuario_cambio_id_fkey(*)')
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

// Helper: list the full history from one usuario.
router.get(
  '/por-usuario/:usuarioId',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('ticket_historial')
        .select('*, ticket:tickets(numero_ticket, estado)')
        .eq('usuario_cambio_id', req.params.usuarioId)
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

// Main CRUD endpoints.
router.use(
  '/',
  createCrudRouter({
    table: 'ticket_historial',
    client: supabase,
    defaultSelect: `
      *,
      usuario:usuarios!ticket_historial_usuario_cambio_id_fkey(*),
      ticket:tickets(numero_ticket, estado)
    `,
    allowedFilters: ['ticket_id', 'usuario_cambio_id'],
  }),
);

export default router;
