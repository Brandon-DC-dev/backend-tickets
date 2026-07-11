// filepath: src/routes/tickets.routes.js
// CRUD for tickets (id, numero_ticket, fecha_asignado, fecha_entrega,
//                    fecha_prometida, avance, estado, observaciones,
//                    columna_id, posicion,
//                    usuario_asignado_id, gestor_id,
//                    created_at, updated_at).
//
// Extra endpoints:
//   PATCH /tickets/:id/mover   → drag & drop (columna_id + posicion)
//   PATCH /tickets/:id/avance  → actualizar % de avance (0..100)
//   PATCH /tickets/avance/bulk → mismo, en lote
//   PATCH /tickets/estado/bulk → cambio de estado en lote
//
// POST/PATCH sobre tickets generan automáticamente un registro en
// `ticket_historial` (creación, cambio de usuario, columna, avance o estado).

import { Router } from 'express';
import { createCrudRouter } from '../lib/crudRouter.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// --- Shared helpers --------------------------------------------------------

const TICKETS_SELECT = `
  *,
  usuario:usuarios!tickets_usuario_asignado_id_fkey(*),
  gestor:gestores!tickets_gestor_id_fkey(*),
  columna:columnas_tablero!tickets_columna_id_fkey(*)
`;

/**
 * Insert a row into `ticket_historial`. Errors here are non-fatal so a
 * missing FK on `usuario_cambio_id` doesn't block the main operation.
 */
async function logHistory({ ticketId, usuarioId, cambio }) {
  if (!ticketId || !cambio) return;
  try {
    await supabase.from('ticket_historial').insert({
      ticket_id: ticketId,
      usuario_cambio_id: usuarioId ?? null,
      cambio,
    });
  } catch {
    // Swallow history errors intentionally — main op already succeeded.
  }
}

// Detect which meaningful fields changed between `before` and `after`.
function diffChanges(before, after) {
  const changes = [];
  if (before.columna_id !== after.columna_id) {
    changes.push(`Cambio de columna (${before.columna_id ?? '—'} → ${after.columna_id ?? '—'})`);
  }
  if (before.posicion !== after.posicion) {
    changes.push(`Cambio de posición (${before.posicion} → ${after.posicion})`);
  }
  if (before.avance !== after.avance) {
    changes.push(`Cambio de avance (${before.avance}% → ${after.avance}%)`);
  }
  if (before.estado !== after.estado) {
    changes.push(`Cambio de estado (${before.estado ?? '—'} → ${after.estado ?? '—'})`);
  }
  if (before.usuario_asignado_id !== after.usuario_asignado_id) {
    changes.push(
      `Cambio de usuario asignado (${before.usuario_asignado_id ?? '—'} → ${after.usuario_asignado_id ?? '—'})`,
    );
  }
  return changes;
}

// --- PATCH /tickets/:id/mover (drag & drop) -------------------------------
// Body: { columna_id: '<uuid>', posicion: 2, usuario_cambio_id?: '<uuid>' }
//
// Notes:
//  - Moves the ticket to `columna_id` at `posicion`.
//  - If the destination column is different, appends it to the end.
//  - Recomputes `posicion` of every other ticket in the affected column(s)
//    so the order stays consistent.
router.patch('/:id/mover', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { columna_id, posicion, usuario_cambio_id } = req.body ?? {};

    if (!columna_id) {
      return res.status(400).json({
        error: 'BadRequest',
        message: '`columna_id` is required.',
      });
    }
    if (!Number.isInteger(posicion) || posicion < 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: '`posicion` must be a non-negative integer.',
      });
    }

    // Get the current ticket (for history + recalc).
    const { data: actual, error: getErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !actual) {
      return res
        .status(getErr?.code === 'PGRST116' ? 404 : 500)
        .json({
          error: getErr?.code ?? 'NotFound',
          message: getErr?.message ?? 'Ticket not found',
        });
    }

    const columnaOrigen = actual.columna_id;
    const columnaDestino = columna_id;
    const mismaColumna = columnaOrigen === columnaDestino;

    // 1. Get all tickets in the destination column except `id`.
    const { data: destino, error: destErr } = await supabase
      .from('tickets')
      .select('id, posicion')
      .eq('columna_id', columnaDestino)
      .neq('id', id)
      .order('posicion', { ascending: true });
    if (destErr) {
      return res
        .status(500)
        .json({ error: destErr.code, message: destErr.message });
    }

    // 2. Build the new order for the destination column.
    const idsDestino = (destino ?? []).map((t) => t.id);
    const insertAt = Math.min(posicion, idsDestino.length);
    idsDestino.splice(insertAt, 0, id);

    // 3. Update the moved ticket first (columna_id + posicion nueva).
    const { data: movido, error: moveErr } = await supabase
      .from('tickets')
      .update({ columna_id: columnaDestino, posicion: insertAt })
      .eq('id', id)
      .select(TICKETS_SELECT)
      .single();
    if (moveErr) {
      return res
        .status(moveErr.code === 'PGRST116' ? 404 : 500)
        .json({ error: moveErr.code, message: moveErr.message });
    }

    // 4. Renumber the destination column to its new positions.
    const renumDest = idsDestino.map((tid, idx) =>
      supabase.from('tickets').update({ posicion: idx }).eq('id', tid),
    );
    await Promise.all(renumDest);

    // 5. If the source column is different, compact it (remove a hole).
    if (!mismaColumna && columnaOrigen) {
      const { data: origen } = await supabase
        .from('tickets')
        .select('id')
        .eq('columna_id', columnaOrigen)
        .order('posicion', { ascending: true });
      const renumOrigen = (origen ?? []).map((t, idx) =>
        supabase.from('tickets').update({ posicion: idx }).eq('id', t.id),
      );
      await Promise.all(renumOrigen);
    }

    // 6. Record history.
    await logHistory({
      ticketId: id,
      usuarioId: usuario_cambio_id,
      cambio: mismaColumna
        ? `Reordenado en columna (pos ${actual.posicion} → ${insertAt})`
        : `Movido a columna ${columnaDestino} (pos ${insertAt})`,
    });

    res.json({ data: movido });
  } catch (err) {
    next(err);
  }
});

// --- PATCH /tickets/:id/avance (singular) ---------------------------------
router.patch('/:id/avance', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { avance, usuario_cambio_id } = req.body ?? {};

    if (typeof avance !== 'number' || Number.isNaN(avance)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: '`avance` must be a number.',
      });
    }
    if (avance < 0 || avance > 100) {
      return res.status(400).json({
        error: 'BadRequest',
        message: '`avance` must be between 0 and 100.',
      });
    }

    const { data: actual, error: getErr } = await supabase
      .from('tickets')
      .select('avance')
      .eq('id', id)
      .single();
    if (getErr || !actual) {
      return res
        .status(getErr?.code === 'PGRST116' ? 404 : 500)
        .json({
          error: getErr?.code ?? 'NotFound',
          message: getErr?.message ?? 'Ticket not found',
        });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ avance })
      .eq('id', id)
      .select(TICKETS_SELECT)
      .single();
    if (error) {
      return res
        .status(error.code === 'PGRST116' ? 404 : 500)
        .json({ error: error.code, message: error.message });
    }

    if (actual.avance !== avance) {
      await logHistory({
        ticketId: id,
        usuarioId: usuario_cambio_id,
        cambio: `Cambio de avance (${actual.avance}% → ${avance}%)`,
      });
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// --- GET listing / detail with full joins ---------------------------------
// Slim read endpoints via the factory.
router.use(
  '/',
  createCrudRouter({
    table: 'tickets',
    client: supabase,
    // The factory's read endpoints are fine — they only register
    // GET / and GET /:id, which we want for the standard list/detail.
    defaultSelect: TICKETS_SELECT,
    allowedFilters: [
      'gestor_id',
      'usuario_asignado_id',
      'estado',
      'columna_id',
    ],
    searchable: ['numero_ticket', 'observaciones'],
  }),
);

// --- POST /tickets (auto-history) -----------------------------------------
// Override to add history logging on creation. Lives AFTER `router.use('/')`
// but only matches `POST /` exactly (Express prefers exact paths).
router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Body must be a JSON object.' });
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert(body)
      .select(TICKETS_SELECT)
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
      return res
        .status(status)
        .json({ error: code, message: error.message });
    }

    await logHistory({
      ticketId: data.id,
      usuarioId: body.usuario_cambio_id,
      cambio: 'Ticket creado',
    });

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// --- PUT /tickets/:id  (full update + history) ----------------------------
router.put('/:id', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Body must be a JSON object.' });
    }

    const { data: before } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (!before) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'Ticket not found.' });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update(body)
      .eq('id', req.params.id)
      .select(TICKETS_SELECT)
      .single();
    if (error) {
      return res
        .status(error.code === 'PGRST116' ? 404 : 500)
        .json({ error: error.code, message: error.message });
    }

    const changes = diffChanges(before, data);
    for (const cambio of changes) {
      // eslint-disable-next-line no-await-in-loop
      await logHistory({
        ticketId: data.id,
        usuarioId: body.usuario_cambio_id,
        cambio,
      });
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// --- PATCH /tickets/:id (partial update + history) ------------------------
router.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Body must be a JSON object.' });
    }

    const { data: before } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (!before) {
      return res
        .status(404)
        .json({ error: 'NotFound', message: 'Ticket not found.' });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update(body)
      .eq('id', req.params.id)
      .select(TICKETS_SELECT)
      .single();
    if (error) {
      return res
        .status(error.code === 'PGRST116' ? 404 : 500)
        .json({ error: error.code, message: error.message });
    }

    const changes = diffChanges(before, data);
    for (const cambio of changes) {
      // eslint-disable-next-line no-await-in-loop
      await logHistory({
        ticketId: data.id,
        usuarioId: body.usuario_cambio_id,
        cambio,
      });
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// --- DELETE /tickets/:id (override for clarity) ----------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', req.params.id);
    if (error) {
      return res
        .status(500)
        .json({ error: error.code, message: error.message });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- PATCH /tickets/avance/bulk -------------------------------------------
// Body: { updates: [{ id, avance }, ...], usuario_cambio_id? }
router.patch('/avance/bulk', async (req, res, next) => {
  try {
    const list = req.body?.updates;
    const usuarioCambioId = req.body?.usuario_cambio_id;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Body must include a non-empty `updates` array.',
      });
    }
    const results = [];
    for (const item of list) {
      if (!item?.id || typeof item.avance !== 'number') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Each item needs { id: string, avance: number }.',
        });
      }
      if (item.avance < 0 || item.avance > 100) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `avance must be between 0 and 100 (got ${item.avance}).`,
        });
      }
      const { data: before } = await supabase
        .from('tickets')
        .select('avance')
        .eq('id', item.id)
        .single();
      const { data, error } = await supabase
        .from('tickets')
        .update({ avance: item.avance })
        .eq('id', item.id)
        .select()
        .single();
      if (error) {
        return res
          .status(error.code === 'PGRST116' ? 404 : 500)
          .json({ error: error.code, message: error.message });
      }
      results.push(data);
      if (before && before.avance !== item.avance) {
        await logHistory({
          ticketId: item.id,
          usuarioId: usuarioCambioId,
          cambio: `Cambio de avance (${before.avance}% → ${item.avance}%)`,
        });
      }
    }
    res.json({ data: results, count: results.length });
  } catch (err) {
    next(err);
  }
});

// --- PATCH /tickets/estado/bulk --------------------------------------------
// Body: { updates: [{ id, estado }, ...], usuario_cambio_id? }
router.patch('/estado/bulk', async (req, res, next) => {
  try {
    const list = req.body?.updates;
    const usuarioCambioId = req.body?.usuario_cambio_id;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Body must include a non-empty `updates` array.',
      });
    }
    const results = [];
    for (const item of list) {
      if (!item?.id || typeof item.estado !== 'string') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Each item needs { id: string, estado: string }.',
        });
      }
      const { data: before } = await supabase
        .from('tickets')
        .select('estado')
        .eq('id', item.id)
        .single();
      const { data, error } = await supabase
        .from('tickets')
        .update({ estado: item.estado })
        .eq('id', item.id)
        .select()
        .single();
      if (error) {
        return res
          .status(error.code === 'PGRST116' ? 404 : 500)
          .json({ error: error.code, message: error.message });
      }
      results.push(data);
      if (before && before.estado !== item.estado) {
        await logHistory({
          ticketId: item.id,
          usuarioId: usuarioCambioId,
          cambio: `Cambio de estado (${before.estado ?? '—'} → ${item.estado})`,
        });
      }
    }
    res.json({ data: results, count: results.length });
  } catch (err) {
    next(err);
  }
});

export default router;
