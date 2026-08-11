# Followups sin cron — Plan B

Este documento explica cómo quedó configurado el sistema de
recordatorios de tickets **sin depender del cron de Vercel**, para
mantenerte en el plan Hobby.

## Arquitectura

```
┌──────────────────────────────────────────────┐
│ Navegador del usuario                         │
│                                              │
│  �────────────────────────────────────────┐  │
│  │ Service Worker (public/sw.js)          │  │
│  │  setInterval(30s) → tick               │  │
│  │  - GET /api/ticket-followup            │  │
│  │  - showNotification(...)  (local)      │  │
│  │  - POST /api/ticket-followup/:id/tick  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ UI (src/lib/followupClient.ts)         │  │
│  │  - initFollowups()  → registra el SW   │  │
│  │  - createFollowup() → POST             │  │
│  │  - cancelFollowup() → DELETE           │  │
│  │  - listFollowups()  → GET              │  │
│  └────────────────────────────────────────┘  │
└────────────────┬─────────────────────────────┘
                 │ HTTPS
                 ▼
┌──────────────────────────────────────────────┐
│ Backend (backend-supabase / Vercel Hobby)    │
│                                              │
│  GET    /api/ticket-followup                 │
│  POST   /api/ticket-followup                 │
│  GET    /api/ticket-followup/:ticketId       │
│  DELETE /api/ticket-followup/:ticketId       │
│  POST   /api/ticket-followup/:ticketId/tick  │  ← NUEVO
│                                              │
│  Supabase (tabla `ticket_followups`)         │
└──────────────────────────────────────────────┘
```

> El cron `* * * * *` y el archivo `api/cron/process-followups.js`
> fueron **eliminados**. Eso desbloquea los deploys en plan Hobby.

## Endpoints del backend

| Método | Path | Body / Params | Respuesta |
|--------|------|---------------|-----------|
| `POST` | `/api/ticket-followup` | `{ ticketId, durationMinutes, notifications, message? }` | `{ data: Followup }` |
| `GET` | `/api/ticket-followup` | — | `{ data: Followup[], count }` |
| `GET` | `/api/ticket-followup/:ticketId` | `ticketId` (uuid) | `{ data: Followup }` |
| `DELETE` | `/api/ticket-followup/:ticketId` | `ticketId` (uuid) | `{ deleted: boolean, ticketId }` |
| `POST` | `/api/ticket-followup/:ticketId/tick` | `ticketId` (uuid) | `{ done: boolean, nextAt?, sent?, reason?, ticketId, deleted? }` |

### Detalle de `/tick`

Este endpoint **reemplaza la lógica del antiguo cron**. Lo invoca el
Service Worker del navegador después de mostrar la notificación.

- Si la fila ya no existe → `{ done: true, reason: 'not_found' }`.
- Si no vence todavía → `{ done: false, nextAt, sent }`.
- Si era la última notificación → DELETE fila + `{ done: true, reason: 'completed' }`.
- Si quedan más → +1 al contador y avanza `next_notification_at`.

## Instalación en el frontend

### 1. Copiar archivos

Desde este repo (`backend-supabase/docs/frontend/`):

| Origen | Destino en tu proyecto front |
|--------|------------------------------|
| `public/sw.js` | `public/sw.js` |
| `src/lib/followupClient.ts` | `src/lib/followupClient.ts` |

### 2. Registrar el SW

En tu layout o app entry (ej. `src/layouts/Layout.astro`):

```astro
<script>
  import { initFollowups } from '@/lib/followupClient';
  initFollowups();
</script>
```

O en un `useEffect` de React/Vue/etc.

### 3. Permiso de notificaciones

El módulo `initFollowups()` ya llama a `Notification.requestPermission()`.
El navegador lo muestra automáticamente la primera vez.

> **Importante**: el permiso debe pedirse **tras un gesto del usuario**
> (click). Si lo pedís al cargar la página, muchos navegadores lo
> rechazan silenciosamente.

### 4. Probar en local

1. Abrí DevTools → Application → Service Workers.
2. Verificá que `/sw.js` esté **activated and running**.
3. Creá un follow-up con `durationMinutes` bajo para no esperar.
4. Esperá el `TICK_INTERVAL_MS` (default 30s) y debería aparecer la
   notificación.

## Limitación importante

El `setInterval` dentro del Service Worker se **pausa cuando el sistema
operativo mata el SW** (típicamente tras cerrar todas las pestañas del
sitio). En la práctica:

- ✅ Funciona con la pestaña activa.
- ✅ Funciona con la pestaña en background (mientras el navegador esté
  abierto).
- ❌ **No llega con el navegador cerrado**.

Si en algún momento necesitás Web Push "real" (con el navegador
cerrado), hay que volver a un cron del backend, lo que requiere el
plan Pro o un servicio externo (GitHub Actions, Supabase Edge
Functions, etc.).
