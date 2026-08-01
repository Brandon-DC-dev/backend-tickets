// filepath: src/validators/ticketFollowup.schema.js
// Esquemas Zod para validar el body/params de los endpoints de follow-up.

import { z } from 'zod';

// UUID v4/v7 genérico — el backend no distingue variantes.
const uuid = z.string().uuid();

// POST /api/ticket-followup
export const createFollowupBodySchema = z
  .object({
    ticketId: uuid,
    durationMinutes: z.number().int().positive(),
    notifications: z.number().int().positive(),
    message: z.string().max(500).optional().default(''),
  })
  .strict()
  .refine((v) => v.notifications <= v.durationMinutes, {
    message: 'notifications cannot be greater than durationMinutes.',
    path: ['notifications'],
  });

// GET/DELETE /api/ticket-followup/:ticketId
export const ticketIdParamSchema = z.object({
  ticketId: uuid,
});
