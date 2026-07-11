// filepath: src/routes/index.js
import { Router } from 'express';
import { supabase, pingSupabase } from '../config/supabase.js';

import categoriasUsuarioRoutes from './categoriasUsuario.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import gestoresRoutes from './gestores.routes.js';
import columnasTableroRoutes from './columnasTablero.routes.js';
import ticketsRoutes from './tickets.routes.js';
import ticketHistorialRoutes from './ticketHistorial.routes.js';
import tableroRoutes from './tablero.routes.js';

const router = Router();

// Root index route.
router.get('/', (req, res) => {
  res.json({
    name: 'backend-supabase API',
    version: '1.0.0',
    docs: '/api/health',
    endpoints: [
      'GET    /api/health',
      'GET    /api/connection   — detailed Supabase connection report',
      '',
      '--- tablero ---',
      'GET    /api/tablero',
      '',
      '--- categorias_usuario ---',
      'GET    /api/categorias-usuario',
      'GET    /api/categorias-usuario/:id',
      'GET    /api/categorias-usuario/:id/usuarios',
      'POST   /api/categorias-usuario',
      'PUT    /api/categorias-usuario/:id',
      'PATCH  /api/categorias-usuario/:id',
      'DELETE /api/categorias-usuario/:id',
      '',
      '--- usuarios ---',
      'GET    /api/usuarios',
      'GET    /api/usuarios/:id',
      'GET    /api/usuarios/:id/tickets',
      'POST   /api/usuarios',
      'PUT    /api/usuarios/:id',
      'PATCH  /api/usuarios/:id',
      'DELETE /api/usuarios/:id',
      '',
      '--- gestores ---',
      'GET    /api/gestores',
      'GET    /api/gestores/:id',
      'GET    /api/gestores/:id/tickets',
      'POST   /api/gestores',
      'PUT    /api/gestores/:id',
      'PATCH  /api/gestores/:id',
      'DELETE /api/gestores/:id',
      '',
      '--- columnas_tablero ---',
      'GET    /api/columnas-tablero',
      'GET    /api/columnas-tablero/:id',
      'GET    /api/columnas-tablero/activas/listado',
      'GET    /api/columnas-tablero/:id/tickets',
      'POST   /api/columnas-tablero',
      'PUT    /api/columnas-tablero/:id',
      'PATCH  /api/columnas-tablero/:id',
      'DELETE /api/columnas-tablero/:id',
      '',
      '--- tickets ---',
      'GET    /api/tickets',
      'GET    /api/tickets/:id',
      'POST   /api/tickets',
      'PUT    /api/tickets/:id',
      'PATCH  /api/tickets/:id',
      'PATCH  /api/tickets/:id/mover',
      'PATCH  /api/tickets/:id/avance',
      'PATCH  /api/tickets/avance/bulk',
      'PATCH  /api/tickets/estado/bulk',
      'DELETE /api/tickets/:id',
      '',
      '--- ticket_historial ---',
      'GET    /api/ticket-historial',
      'GET    /api/ticket-historial/:id',
      'GET    /api/ticket-historial/por-ticket/:ticketId',
      'GET    /api/ticket-historial/por-usuario/:usuarioId',
      'POST   /api/ticket-historial',
      'PUT    /api/ticket-historial/:id',
      'PATCH  /api/ticket-historial/:id',
      'DELETE /api/ticket-historial/:id',
    ],
  });
});

// Health check — verifies the API is up and Supabase is reachable.
router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: { supabase: 'unknown' },
  };

  try {
    const latencyMs = await pingSupabase();
    health.services.supabase = 'ok';
    health.services.supabaseLatencyMs = latencyMs;
    res.status(200).json(health);
  } catch (err) {
    health.status = 'degraded';
    health.services.supabase = 'down';
    health.error = err.message;
    res.status(503).json(health);
  }
});

// Detailed connection report — useful for first-time setup debugging.
router.get('/connection', async (req, res) => {
  const report = {
    connected: false,
    url: process.env.SUPABASE_URL ? '[set]' : '[missing]',
    anonKey:
      process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
        ? '[set]'
        : '[missing]',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '[set]' : '[not set]',
    timestamp: new Date().toISOString(),
  };

  try {
    const latencyMs = await pingSupabase();
    report.connected = true;
    report.latencyMs = latencyMs;

    // Probe PostgREST to confirm the REST layer is alive.
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      report.postgrestError = error.message;
    } else {
      report.postgrest = error
        ? 'reachable (table missing — expected on new projects)'
        : 'reachable';
      report.sampleRow = data?.[0] ?? null;
    }

    res.status(200).json(report);
  } catch (err) {
    report.connected = false;
    report.error = err.message;
    res.status(503).json(report);
  }
});

// --- CRUD resources --------------------------------------------------------
router.use('/categorias-usuario', categoriasUsuarioRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/gestores', gestoresRoutes);
router.use('/columnas-tablero', columnasTableroRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/ticket-historial', ticketHistorialRoutes);
router.use('/tablero', tableroRoutes);

export default router;