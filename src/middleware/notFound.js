// filepath: src/middleware/notFound.js
// 404 handler for unmatched routes.
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
  });
}