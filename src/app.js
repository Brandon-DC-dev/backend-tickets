// filepath: src/app.js
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import router from './routes/index.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Orígenes permitidos para el frontend.
//   - Dev: lista blanca fija (Astro 4321, mismo puerto 3000).
//   - Prod: tomar de env.corsOrigins (CSV en CORS_ORIGIN=https://a,https://b).
const defaultOrigins = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const origins =
  env.corsOrigins.length > 0 ? env.corsOrigins : defaultOrigins;

const corsOptions = {
  origin(origin, cb) {
    // Requests sin Origin (curl, Postman, server-to-server) siempre pasan.
    if (!origin) return cb(null, true);
    if (origins.includes(origin)) return cb(null, true);
    // No lanzar error: pasamos `false` y el paquete `cors` omite los
    // headers, devolviendo un 403 CORS nativo del navegador sin 500.
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // cache de preflight: 24h
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Preflight explícito para rutas /api/* (algunos proxies lo necesitan).
app.options(/^\/.*/, cors(corsOptions));

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes mounted under the configured prefix.
app.use(env.apiPrefix, router);

// Root fallback so `/` works without the prefix.
app.get('/', (req, res) => {
  res.json({
    name: 'backend-supabase API',
    version: '1.0.0',
    docs: `${env.apiPrefix}/health`,
  });
});

// 404 + error handlers (must be registered last).
app.use(notFoundHandler);
app.use(errorHandler);

export default app;