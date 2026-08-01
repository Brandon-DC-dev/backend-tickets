-- filepath: db/migrations/001_ticket_followups_and_push_subscriptions.sql
-- ============================================================================
-- 001 — Ticket follow-ups + Web Push subscriptions
-- ============================================================================
-- Crea las tablas y triggers para el módulo de seguimiento automático de
-- tickets y suscripciones Web Push.
--
-- Idempotente: puede ejecutarse varias veces sin error.
--
-- Ejecutar en el SQL editor de Supabase o con `psql` apuntando al proyecto:
--   psql "$SUPABASE_DB_URL" -f db/migrations/001_ticket_followups_and_push_subscriptions.sql
-- ============================================================================

-- --- Extensions ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- para gen_random_uuid()

-- ============================================================================
-- Table: ticket_followups
-- ============================================================================
-- Un único seguimiento activo por ticket. Se modela con UNIQUE sobre
-- ticket_id (no se necesita estado "activo/inactivo" porque cuando termina
-- el ciclo de notificaciones se elimina la fila).
-- ============================================================================
CREATE TABLE IF NOT EXISTS ticket_followups (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             UUID         NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- Configuración original del usuario.
  duration_minutes      INTEGER      NOT NULL CHECK (duration_minutes > 0),
  total_notifications   INTEGER      NOT NULL CHECK (total_notifications > 0),
  message               TEXT         NOT NULL DEFAULT '',

  -- Estado de avance.
  notifications_sent    INTEGER      NOT NULL DEFAULT 0 CHECK (notifications_sent >= 0),
  interval_minutes      INTEGER      NOT NULL CHECK (interval_minutes > 0),

  -- Próxima ejecución calculada por el cron.
  next_notification_at  TIMESTAMPTZ  NOT NULL,

  -- Auditoría.
  started_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Restricciones compuestas.
  CONSTRAINT ticket_followups_notifications_lte_duration
    CHECK (total_notifications <= duration_minutes),
  CONSTRAINT ticket_followups_one_per_ticket
    UNIQUE (ticket_id)
);

-- Índice crítico para el cron: busca por fecha de próxima notificación,
-- acotado a filas pendientes (notifications_sent < total_notifications).
CREATE INDEX IF NOT EXISTS idx_ticket_followups_pending_due
  ON ticket_followups (next_notification_at)
  WHERE notifications_sent < total_notifications;

-- Índice de lookup por ticket (GET /:ticketId, DELETE /:ticketId).
CREATE INDEX IF NOT EXISTS idx_ticket_followups_ticket_id
  ON ticket_followups (ticket_id);


-- ============================================================================
-- Table: push_subscriptions
-- ============================================================================
-- Almacena las suscripciones Web Push generadas por el service worker del
-- navegador. endpoint es UNIQUE (el navegador lo garantiza).
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     TEXT         NOT NULL UNIQUE,
  p256dh       TEXT         NOT NULL,
  auth         TEXT         NOT NULL,
  user_agent   TEXT,
  user_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions (user_id);


-- ============================================================================
-- Trigger: updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_followups_updated_at ON ticket_followups;
CREATE TRIGGER trg_ticket_followups_updated_at
  BEFORE UPDATE ON ticket_followups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================================
-- Trigger: cancelar seguimiento al cambiar estado del ticket
-- ============================================================================
-- Si el ticket pasa a Entregado / Finalizado / Cancelado, se eliminan todos
-- los seguimientos asociados (garantizado por la BD, independiente del cron).
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_followup_on_ticket_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Estados terminales del ticket (case-sensitive, ajustar si tu enum difiere).
  IF NEW.estado IN ('Entregado', 'Finalizado', 'Cancelado')
     AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado) THEN

    DELETE FROM ticket_followups WHERE ticket_id = NEW.id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted > 0 THEN
      RAISE NOTICE '[followup] auto-cancelled % followup(s) for ticket % (status=%)',
        v_deleted, NEW.id, NEW.estado;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_followups_cancel_on_status ON tickets;
CREATE TRIGGER trg_ticket_followups_cancel_on_status
  AFTER INSERT OR UPDATE OF estado ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION cancel_followup_on_ticket_status_change();


-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================
-- El backend usa la service-role key (bypassa RLS). RLS queda habilitado
-- para que clientes con la anon key no puedan leer/escribir directamente.
-- ============================================================================
ALTER TABLE ticket_followups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;

-- Sin policies → cualquier acceso desde la anon key será rechazado.
-- Si en el futuro quieres exponer algo vía PostgREST directamente, agrega
-- policies explícitas aquí.
