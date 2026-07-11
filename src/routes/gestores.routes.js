// filepath: src/routes/gestores.routes.js
// CRUD for gestores (id, nombre, activo, created_at).
import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// Nested helper: list tickets managed by a given gestor.
router.get(
  '/:id/tickets',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('gestor_id', req.params.id);
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
    table: 'gestores',
    client: supabase,
    defaultSelect: '*',
    allowedFilters: ['activo'],
    searchable: ['nombre'],
  }),
);

export default router;
