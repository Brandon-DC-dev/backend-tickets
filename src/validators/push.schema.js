// filepath: src/validators/push.schema.js
// Esquemas Zod para los endpoints de Web Push.

import { z } from 'zod';

// POST /api/push/subscribe
export const subscribeBodySchema = z
  .object({
    subscription: z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
    }),
    userId: z.string().uuid().optional(),
  })
  .strict();

// DELETE /api/push/unsubscribe
export const unsubscribeBodySchema = z
  .object({
    endpoint: z.string().url(),
  })
  .strict();
