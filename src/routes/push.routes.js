// filepath: src/routes/push.routes.js
// Router Express para `/api/push`.
//
//   GET    /public-key         VAPID public key (la usa el service worker).
//   POST   /subscribe          Guardar/actualizar suscripción del browser.
//   DELETE /unsubscribe        Eliminar suscripción (logout / revoke).

import { Router } from 'express';
import * as ctrl from '../controllers/push.controller.js';
import { validateSchema } from '../middleware/validateSchema.js';
import {
  subscribeBodySchema,
  unsubscribeBodySchema,
} from '../validators/push.schema.js';

const router = Router();

router.get('/public-key', ctrl.getPublicKey);

router.post(
  '/subscribe',
  validateSchema({ body: subscribeBodySchema }),
  ctrl.subscribe,
);

router.delete(
  '/unsubscribe',
  validateSchema({ body: unsubscribeBodySchema }),
  ctrl.unsubscribe,
);

export default router;
