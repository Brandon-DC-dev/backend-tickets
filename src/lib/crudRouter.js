// filepath: src/lib/crudRouter.js
// Generic CRUD router factory for Supabase-backed tables.
//
//   import { createCrudRouter } from '../lib/crudRouter.js';
//   export default createCrudRouter({ table: 'gestores', client: supabase });
//
// Produces REST endpoints:
//
//   GET    /            → list (supports ?select=&order=&limit=&offset=)
//   GET    /:id         → get by id
//   POST   /            → create (body must match the row shape, no id)
//   PUT    /:id         → full update (body without id)
//   PATCH  /:id         → partial update
//   DELETE /:id         → delete by id
//
// Supabase errors are translated to HTTP status codes:
//   PGRST116 (no rows)        -> 404
//   23505 (unique violation)  -> 409
//   23503 (FK violation)      -> 400
//   23514 (check violation)   -> 400
//   22P02 (invalid input)     -> 400
//   other                    -> 500

import { Router } from 'express';
import { supabase as defaultSupabase } from '../config/supabase.js';

/**
 * Map a Supabase/Postgres error code to an HTTP status code.
 */
function statusFromError(err) {
  if (!err) return 500;
  switch (err.code) {
    case 'PGRST116': // no rows returned for .single()
      return 404;
    case '23505': // unique_violation
      return 409;
    case '23503': // foreign_key_violation
      return 400;
    case '23514': // check_violation
      return 400;
    case '22P02': // invalid_text_representation (bad uuid, etc.)
      return 400;
    default:
      return 500;
  }
}

/**
 * Wrap an async handler so rejected promises are forwarded to Express.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Create a CRUD router bound to a Supabase table.
 *
 * @param {object}   opts
 * @param {string}   opts.table            - Postgres table name.
 * @param {object}   [opts.client]         - Supabase client (defaults to anon).
 * @param {string}   [opts.defaultSelect]  - Default select string.
 * @param {string[]} [opts.allowedFilters] - Columns allowed for ?field=value
 *                                           filtering on the list endpoint.
 * @param {string[]} [opts.searchable]     - Columns searched by ?q=.
 */
export function createCrudRouter({
  table,
  client = defaultSupabase,
  defaultSelect = '*',
  allowedFilters = [],
  searchable = [],
} = {}) {
  if (!table) {
    throw new Error('createCrudRouter: `table` is required.');
  }

  

  const router = Router();

  // --- GET / -------------------------------------------------------------
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      let query = client.from(table).select(defaultSelect);

      // Apply simple equality filters (?column=value).
      for (const key of allowedFilters) {
        if (req.query[key] !== undefined) {
          query = query.eq(key, req.query[key]);
        }
      }

      // Generic text search (?q=). Case-insensitive contains across fields.
      if (req.query.q && searchable.length > 0) {
        const q = String(req.query.q);
        const filters = searchable
          .map((col) => `${col}.ilike.%${q}%`)
          .join(',');
        query = query.or(filters);
      }

      // Sorting: ?order=column or ?order=column.asc / column.desc
      if (req.query.order) {
        const [column, direction] = String(req.query.order).split('.');
        query = query.order(column, {
          ascending: direction !== 'desc',
        });
      }

      // Pagination: ?limit= (default 100, max 1000) and ?offset= (default 0).
      const limit = Math.min(
        Number.parseInt(req.query.limit, 10) || 100,
        1000,
      );
      const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) {
        return res
          .status(statusFromError(error))
          .json({ error: error.code, message: error.message });
      }

      res.json({ data, count: data?.length ?? 0, limit, offset });
    }),
  );

  // --- GET /:id ----------------------------------------------------------
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { data, error } = await client
        .from(table)
        .select(defaultSelect)
        .eq('id', req.params.id)
        .single();

      if (error) {
        return res
          .status(statusFromError(error))
          .json({ error: error.code, message: error.message });
      }

      res.json({ data });
    }),
  );

  // --- POST / ------------------------------------------------------------
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      if (!req.body || typeof req.body !== 'object') {
        return res
          .status(400)
          .json({ error: 'BadRequest', message: 'Body must be a JSON object.' });
      }

      const { data, error } = await client
        .from(table)
        .insert(req.body)
        .select(defaultSelect)
        .single();

      if (error) {
        return res
          .status(statusFromError(error))
          .json({ error: error.code, message: error.message });
      }

      res.status(201).json({ data });
    }),
  );

  // --- PUT /:id (full update) --------------------------------------------
  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!req.body || typeof req.body !== 'object') {
        return res
          .status(400)
          .json({ error: 'BadRequest', message: 'Body must be a JSON object.' });
      }

      const { data, error } = await client
        .from(table)
        .update(req.body)
        .eq('id', req.params.id)
        .select(defaultSelect)
        .single();

      if (error) {
        return res
          .status(statusFromError(error))
          .json({ error: error.code, message: error.message });
      }

      res.json({ data });
    }),
  );

  // --- PATCH /:id (partial update) ---------------------------------------
  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Body must be a flat JSON object.',
        });
      }

      const { data, error } = await client
        .from(table)
        .update(req.body)
        .eq('id', req.params.id)
        .select(defaultSelect)
        .single();

      if (error) {
        return res
          .status(statusFromError(error))
          .json({ error: error.code, message: error.message });
      }

      res.json({ data });
    }),
  );

  // --- DELETE /:id -------------------------------------------------------
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const { error } = await client
        .from(table)
        .delete()
        .eq('id', req.params.id);

      if (error) {
        return res
          .status(statusFromError(error))
          .json({ error: error.code, message: error.message });
      }

      res.status(204).send();
    }),
  );

  return router;
}

export default createCrudRouter;
