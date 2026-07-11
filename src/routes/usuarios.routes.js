// filepath: src/routes/usuarios.routes.js
// CRUD for usuarios (id, nombre, categoria_id, activo, created_at).
import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// Nested helper: list tickets assigned to a given usuario.
router.get(
  '/:id/tickets',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('usuario_asignado_id', req.params.id);
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
    table: 'usuarios',
    client: supabase,
    defaultSelect: '*, categoria:categorias_usuario(*)',
    allowedFilters: ['categoria_id', 'activo'],
    searchable: ['nombre'],
  }),
);

export default router;
