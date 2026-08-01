// filepath: src/middleware/asyncHandler.js
// Wrapper que captura excepciones async y las forwarda a Express via next().
// Sin esto, un throw dentro de un handler async termina en una promesa
// rechazada que Express NO captura y queda colgada la request.

/**
 * @template {(...args: any[]) => Promise<any>} T
 * @param {T} fn
 * @returns {(...args: Parameters<T>) => ReturnType<T>}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
