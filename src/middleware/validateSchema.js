// filepath: src/middleware/validateSchema.js
// Middleware de validación con Zod.
//
//   router.post('/foo', validateSchema({ body: zodSchema }), controller);
//
// `schemaSpec` es un objeto cuyas claves son 'body' | 'query' | 'params' y
// cuyos valores son Zod schemas. Valida cada parte en paralelo, reemplaza
// req.body/query/params por el resultado parseado (con tipos/transformaciones
// aplicadas) y forwarda a next().

import { ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * @param {Record<'body'|'query'|'params', import('zod').ZodTypeAny>} schemaSpec
 */
export function validateSchema(schemaSpec) {
  return async (req, res, next) => {
    try {
      const parts = ['body', 'query', 'params'];
      const errors = [];

      for (const part of parts) {
        const schema = schemaSpec[part];
        if (!schema) continue;

        const result = await schema.safeParseAsync(req[part]);
        if (!result.success) {
          for (const issue of result.error.issues) {
            errors.push({
              source: part,
              field: issue.path.join('.') || '(root)',
              message: issue.message,
              code: issue.code,
            });
          }
        } else {
          // Sobrescribimos con la versión parseada (tipos correctos, defaults aplicados).
          req[part] = result.data;
        }
      }

      if (errors.length > 0) {
        return next(new ValidationError('Validation failed.', errors));
      }

      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new ValidationError(
            'Validation failed.',
            err.issues.map((i) => ({
              field: i.path.join('.'),
              message: i.message,
              code: i.code,
            })),
          ),
        );
      }
      return next(err);
    }
  };
}

export default validateSchema;
