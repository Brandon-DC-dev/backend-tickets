// filepath: src/utils/errors.js
// Jerarquía de errores custom para el proyecto.
//
//   AppError (base, statusCode + isOperational)
//   ├── ValidationError   (400)
//   ├── UnauthorizedError (401)
//   ├── ForbiddenError    (403)
//   ├── NotFoundError     (404)
//   ├── ConflictError     (409)
//   └── UnprocessableError (422)
//
// El errorHandler central traduce `statusCode` a HTTP status, y muestra
// `message` al cliente. `isOperational=true` indica errores esperados (no
// loguear como crash). Errores desconocidos se loguean con stack completo.

export class AppError extends Error {
  /**
   * @param {string}  message   Mensaje seguro para el cliente.
   * @param {number}  statusCode HTTP status code.
   * @param {object}  [details] Datos extra (ej: lista de campos inválidos).
   * @param {boolean} [isOperational=true] Si false, se considera bug.
   */
  constructor(message, statusCode = 500, details = undefined, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed.', details) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized.') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden.') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict.') {
    super(message, 409);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity.', details) {
    super(message, 422, details);
  }
}
