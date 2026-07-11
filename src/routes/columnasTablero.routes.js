// filepath: src/routes/columnasTablero.routes.js
// CRUD for columnas_tablero (id, nombre, posicion, activo, created_at).
import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// Helper: list only active columns ordered by `posicion` (asc).
router.get(
  '/activas/listado',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('columnas_tablero')
        .select('*')
        .eq('activo', true)
        .order('posicion', { ascending: true });
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

// Helper: list tickets belonging to a given column, ordered by `posicion`.
router.get(
  '/:id/tickets',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          usuario:usuarios!tickets_usuario_asignado_id_fkey(*),
          gestor:gestores!tickets_gestor_id_fkey(*)
        `)
        .eq('columna_id', req.params.id)
        .order('posicion', { ascending: true });
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

router.use(
  '/',
  createCrudRouter({
    table: 'columnas_tablero',
    client: supabase,
    defaultSelect: '*',
    allowedFilters: ['activo'],
    searchable: ['nombre'],
  }),
);

export default router;
