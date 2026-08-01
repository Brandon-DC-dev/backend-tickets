# backend-supabase

API backend en **Express 5 + Supabase**, desplegable a **Vercel** como función serverless. Incluye un módulo de **seguimiento automático de tickets** con Web Push notifications disparado por **Vercel Cron**.

## Stack

- Node.js >= 22 (ESM, `type: "module"`)
- Express 5
- Supabase JS v2 (`@supabase/supabase-js`)
- Web Push (`web-push`) + VAPID
- Zod (validación de esquemas)
- CORS configurable por CSV de orígenes
- Vercel Serverless + Vercel Cron

## Estructura

```
src/
  server.js                       # Único entry point Express (Vercel + local)
  config/
    env.js                        # Carga y validación de variables de entorno
    supabase.js                   # Clientes supabase (anon + service-role)
    vapid.js                      # Inicialización de web-push con VAPID keys
  utils/
    errors.js                     # Jerarquía AppError (Validation, NotFound, Conflict…)
    logger.js                     # Logger con niveles
  middleware/
    asyncHandler.js               # Wrapper para handlers async
    validateSchema.js             # Validación con Zod (body/query/params)
    errorHandler.js               # Handler central de errores
    notFound.js
  validators/
    ticketFollowup.schema.js      # Zod schemas de los endpoints de follow-up
    push.schema.js                # Zod schemas de push subscribe/unsubscribe
  controllers/
    ticketFollowup.controller.js  # Handlers HTTP de /api/ticket-followup
    push.controller.js            # Handlers HTTP de /api/push
  services/
    ticketFollowup.service.js     # Reglas de negocio (validaciones, interval calc)
    push.service.js               # Envío de Web Push + limpieza de subs vencidas
    cronFollowup.service.js       # Tick del cron: process due followups
  repositories/
    ticketFollowup.repository.js  # Acceso a `ticket_followups`
    pushSubscription.repository.js# Acceso a `push_subscriptions`
    ticket.repository.js          # Lookups sobre `tickets`
  routes/
    ticketFollowup.routes.js
    push.routes.js
    index.js                      # Agregador + /health + /connection
  lib/
    crudRouter.js                 # Helper para routers CRUD
api/
  cron/
    process-followups.js          # Handler STANDALONE del Vercel Cron (no usa Express)
db/
  migrations/
    001_ticket_followups_and_push_subscriptions.sql
  README.md                       # Cómo aplicar las migraciones
vercel.json                       # Región + headers CORS + crons
```

> **Entry points en Vercel:**
> - `src/server.js` → captura todas las rutas salvo las override.
> - `api/cron/process-followups.js` → función standalone para el cron (cold-start aislado).

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `PORT` | No (3000) | Puerto local |
| `NODE_ENV` | No (`development`) | Entorno |
| `API_PREFIX` | No (`/api`) | Prefijo de rutas |
| `SUPABASE_URL` | **Sí** | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | **Sí** | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role (server-side only) |
| `CORS_ORIGINS` | No | CSV de orígenes permitidos |
| `VAPID_PUBLIC_KEY` | **Sí (para push)** | Generar con `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | **Sí (para push)** | Idem |
| `VAPID_SUBJECT` | No (`mailto:admin@example.com`) | Subject del VAPID claim |
| `CRON_SECRET` | **Sí en prod** | Token que Vercel envía en `Authorization: Bearer <…>` |

## Endpoints

### Tablero y CRUD existentes

(Ver `GET /api/` para la lista completa — se imprime en JSON al hitear el índice.)

### Seguimiento automático de tickets

| Método | Path | Descripción |
|---|---|---|
| `POST` | `/api/ticket-followup` | Crea un seguimiento. Body: `{ ticketId, durationMinutes, notifications, message? }`. Calcula `interval = durationMinutes / notifications`. |
| `GET` | `/api/ticket-followup` | Lista todos los seguimientos activos. |
| `GET` | `/api/ticket-followup/:ticketId` | Devuelve el seguimiento de un ticket (con campos enriquecidos: `activo`, `enviados`, `total`, `restantes`, `tiempo_restante_minutos`, `proximo_recordatorio`). |
| `DELETE` | `/api/ticket-followup/:ticketId` | Elimina el seguimiento. Idempotente. |

Reglas:

- `durationMinutes > 0`
- `notifications > 0`
- `notifications <= durationMinutes`
- Un ticket solo puede tener **un** seguimiento activo (UNIQUE en `ticket_id`).
- Si el ticket pasa a `Entregado | Finalizado | Cancelado`, el trigger de Postgres elimina el seguimiento automáticamente.

### Web Push

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/api/push/public-key` | Devuelve la VAPID public key (la usa el service worker para subscribirse). |
| `POST` | `/api/push/subscribe` | Body: `{ subscription: { endpoint, keys: { p256dh, auth } }, userId? }`. Idempotente (upsert por endpoint). |
| `DELETE` | `/api/push/unsubscribe` | Body: `{ endpoint }`. |

## Vercel Cron

Configurado en [vercel.json](vercel.json) con schedule `* * * * *`. Cada minuto Vercel hace `GET /api/cron/process-followups` con `Authorization: Bearer $CRON_SECRET`.

El handler standalone ([api/cron/process-followups.js](api/cron/process-followups.js)) llama a [processDueFollowups()](src/services/cronFollowup.service.js) que:

1. Busca hasta 100 seguimientos con `next_notification_at <= NOW()` y pendientes.
2. Por cada uno envía un Web Push broadcast con el `message` configurado.
3. Si fue la última notificación → `DELETE` del seguimiento.
4. Si no → incrementa `notifications_sent` y avanza `next_notification_at` por `interval_minutes`.

Las suscripciones que retornen 404/410 se eliminan automáticamente.

## Service Worker (cliente)

```js
// 1. Pedir la VAPID public key
const { data: { publicKey } } = await fetch('/api/push/public-key').then(r => r.json());

// 2. Subscribirse
const sub = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicKey,
});
await fetch('/api/push/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ subscription: sub }),
});
```

## Desarrollo local

```bash
pnpm install
pnpm dev
```

Para gatillar el cron manualmente:

```bash
curl -X POST http://localhost:3000/api/cron/process-followups \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Despliegue en Vercel

```bash
pnpm add web-push zod
npx web-push generate-vapid-keys   # copia a VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Configurar env vars en el dashboard (incluyendo `CRON_SECRET`, `VAPID_*`). Aplicar la migración en **Supabase SQL Editor** (ver [db/README.md](db/README.md)).

> **Caveat operacional:** cada `git push` crea un deploy nuevo, pero **no se promociona automáticamente** al alias de producción. Después de cada push hay que promover manualmente:
>
> ```bash
> vercel promote <deployment-alias>
> ```
>
> O configurar Git Integration para que el push a `main` sea el trigger de promoción.
