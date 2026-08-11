// filepath: src/routes/ticketFollowup.routes.js
// Router Express para `/api/ticket-followup`.
//
//   POST   /                  Crear seguimiento.
//   GET    /                  Listar todos los activos.
//   GET    /:ticketId         Obtener uno por ticket.
//   DELETE /:ticketId         Cancelar (eliminar) seguimiento.

import { Router } from 'express';
import * as ctrl from '../controllers/ticketFollowup.controller.js';
import { validateSchema } from '../middleware/validateSchema.js';
import {
  createFollowupBodySchema,
  ticketIdParamSchema,
} from '../validators/ticketFollowup.schema.js';

const router = Router();

router.post(
  '/',
  validateSchema({ body: createFollowupBodySchema }),
  ctrl.create,
);

router.get('/', ctrl.list);

router.get(
  '/:ticketId',
  validateSchema({ params: ticketIdParamSchema }),
  ctrl.getOne,
);

router.delete(
  '/:ticketId',
  validateSchema({ params: ticketIdParamSchema }),
  ctrl.cancel,
);

// POST /:ticketId/tick — el Service Worker del navegador lo llama cuando
// dispara una notificación local. Reemplaza lo que antes hacía el cron:
//   - incrementa notifications_sent
//   - avanza next_notification_at al siguiente intervalo
//   - elimina la fila si era la última notificación
router.post(
  '/:ticketId/tick',
  validateSchema({ params: ticketIdParamSchema }),
  ctrl.tick,
);

export default router;
