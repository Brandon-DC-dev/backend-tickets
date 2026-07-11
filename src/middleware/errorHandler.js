// filepath: src/middleware/errorHandler.js
// Centralized error handler. Must have 4 parameters for Express to recognize it.
// filepath: src/middleware/errorHandler.js
export function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  console.error(`[ERROR] ${req.method} ${req.originalUrl} ->`, err);

  res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message: isProd && statusCode === 500 ? 'Something went wrong.' : err.message,
  });
}