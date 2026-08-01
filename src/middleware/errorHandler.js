// filepath: src/middleware/errorHandler.js
// Centralized error handler. Express lo reconoce como middleware de error
// porque tiene 4 parámetros (err, req, res, next) — el `next` aunque no se
// use debe estar presente.
//
// Reglas:
//   - Si `err.statusCode` existe → úsalo como HTTP status.
//   - Errores operacionales (`isOperational = true`) → log warn y mensaje al cliente.
//   - Errores NO operacionales (bugs, etc.) → log error con stack + mensaje genérico al cliente.
//   - Siempre se devuelve JSON con { error, message, details? }.

import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const isOperational = err.isOperational !== false; // default true

  if (statusCode >= 500 || !isOperational) {
    logger.error(
      `[error] ${req.method} ${req.originalUrl} status=${statusCode}`,
      err,
    );
  } else {
    logger.warn(
      `[error] ${req.method} ${req.originalUrl} status=${statusCode} msg="${err.message}"`,
    );
  }

  const body = {
    error: err.name || 'InternalServerError',
    message:
      isProd && statusCode >= 500
        ? 'Something went wrong.'
        : err.message || 'Unexpected error.',
  };

  if (err.details !== undefined) {
    body.details = err.details;
  }

  res.status(statusCode).json(body);
}