// filepath: src/routes/categoriasUsuario.routes.js
// CRUD for categorias_usuario (id, nombre, created_at).
import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// Nested helper: list usuarios that belong to a given categoria.
router.get(
  '/:id/usuarios',
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('categoria_id', req.params.id);
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
    table: 'categorias_usuario',
    client: supabase,
    defaultSelect: '*',
    searchable: ['nombre'],
  }),
);

export default router;
