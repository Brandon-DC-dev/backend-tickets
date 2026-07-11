// filepath: src/routes/tablero.routes.js
// GET /tablero — devuelve el tablero completo: columnas con sus tickets
// ordenados por `posicion` ascendente.
//
// Se usa un único query a `tickets` (con join a columna) para evitar N+1.
// Luego se agrupa y se ordenan las columnas por su `posicion`.

import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    // 1. Traer todas las columnas activas (ordenadas por posicion).
    const { data: columnas, error: columnasErr } = await supabase
      .from('columnas_tablero')
      .select('*')
      .eq('activo', true)
      .order('posicion', { ascending: true });

    if (columnasErr) {
      return res
        .status(columnasErr.code === 'PGRST116' ? 404 : 500)
        .json({ error: columnasErr.code, message: columnasErr.message });
    }

    // 2. Traer todos los tickets con sus joins, ordenados por columna + posicion.
    const { data: tickets, error: ticketsErr } = await supabase
      .from('tickets')
      .select(`
        *,
        usuario:usuarios!tickets_usuario_asignado_id_fkey(*),
        gestor:gestores!tickets_gestor_id_fkey(*)
      `)
      .order('posicion', { ascending: true });

    if (ticketsErr) {
      return res
        .status(ticketsErr.code === 'PGRST116' ? 404 : 500)
        .json({ error: ticketsErr.code, message: ticketsErr.message });
    }

    // 3. Agrupar tickets por columna_id.
    const byColumna = new Map();
    for (const t of tickets ?? []) {
      const key = t.columna_id ?? '__sin_columna__';
      if (!byColumna.has(key)) byColumna.set(key, []);
      byColumna.get(key).push(t);
    }

    // 4. Armar la respuesta final preservando el orden de columnas.
    const result = (columnas ?? []).map((col) => ({
      ...col,
      tickets: byColumna.get(col.id) ?? [],
      count: (byColumna.get(col.id) ?? []).length,
    }));

    res.json({
      data: result,
      count: result.length,
      total_tickets: tickets?.length ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
