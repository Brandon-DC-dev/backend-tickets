# Migraciones de base de datos

Este directorio contiene las migraciones SQL del proyecto.

## Cómo aplicar

### Opción A — SQL Editor de Supabase

1. Abrir el proyecto en [app.supabase.com](https://app.supabase.com).
2. Ir a **SQL Editor**.
3. Pegar el contenido del archivo `.sql` y ejecutar.

### Opción B — `psql` apuntando a la DB del proyecto

```bash
psql "$SUPABASE_DB_URL" \
  -f db/migrations/001_ticket_followups_and_push_subscriptions.sql
```

`SUPABASE_DB_URL` está en **Project Settings → Database → Connection string**
(formato `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres`).

## Archivos

| Archivo | Descripción |
|---|---|
| [001_ticket_followups_and_push_subscriptions.sql](migrations/001_ticket_followups_and_push_subscriptions.sql) | Tablas `ticket_followups` + `push_subscriptions`, índices, trigger de cancelación automática por estado de ticket. |

## Modelo

### `ticket_followups`

| Columna | Tipo | Notas |
|---|---|---|
| `ticket_id` | UUID FK → `tickets.id` | UNIQUE → un solo seguimiento activo por ticket. |
| `duration_minutes` | int | Configurado por el usuario. |
| `total_notifications` | int | Configurado por el usuario. |
| `notifications_sent` | int | Contador, lo incrementa el cron. |
| `interval_minutes` | int | `duration_minutes / total_notifications`. |
| `next_notification_at` | timestamptz | Lo actualiza el cron. |
| `message` | text | Mensaje que verá el receptor del push. |

### `push_subscriptions`

| Columna | Tipo | Notas |
|---|---|---|
| `endpoint` | text UNIQUE | El browser lo garantiza. |
| `p256dh` / `auth` | text | Claves públicas de la suscripción. |
| `user_id` | UUID FK → `usuarios.id` | Opcional, se setea si la app envía el usuario. |
| `user_agent` | text | Útil para debugging. |

### Trigger de cancelación automática

> Cuando un ticket pasa a `Entregado` / `Finalizado` / `Cancelado`, sus
> seguimientos se eliminan **inmediatamente en la BD** (no depende del cron).

Si tu proyecto usa otros nombres para los estados terminales, ajusta la
función `cancel_followup_on_ticket_status_change()` en la migración.
