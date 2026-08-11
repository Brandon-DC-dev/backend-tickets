// filepath: public/sw.js
// ============================================================================
// Service Worker para recordatorios de tickets (follow-ups).
//
// Responsabilidad:
//   1. Cada TICK_INTERVAL_MS consulta GET /api/ticket-followup al backend.
//   2. Compara fechas: si next_notification_at <= now, dispara la
//      notificación nativa con Notification API (NO requiere backend ni
//      Web Push).
//   3. Llama POST /api/ticket-followup/:ticketId/tick para que Supabase
//      mantenga el contador sincronizado.
//
// Limitaciones:
//   - El setInterval se PAUSA si el SO mata el SW (típicamente tras cerrar
//     todas las pestañas del sitio). No llega con navegador cerrado.
//   - Si necesitas push real con pestaña cerrada, hay que volver a un cron
//     del backend (plan Pro o servicio externo).
//
// Activación: registrar con `navigator.serviceWorker.register('/sw.js')`
// desde la app. Se auto-activa al primer load.
// ============================================================================

const TICK_INTERVAL_MS = 30_000; // 30s — ajustar según necesidad
const API_BASE = 'https://backend-tickets.vercel.app/api';

// --- Ciclo de vida ----------------------------------------------------------
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  // Primer tick al activarse (además del interval).
  runTick();
});

// --- Timer interno ----------------------------------------------------------
// Vive mientras el SW esté activo. Se reinicia si el SW se reinicia.
let intervalId = null;

function ensureInterval() {
  if (intervalId !== null) return;
  intervalId = setInterval(runTick, TICK_INTERVAL_MS);
}

ensureInterval();

// --- Tick principal ---------------------------------------------------------
async function runTick() {
  // Si el SW está por ser terminado, evita reiniciar el interval.
  ensureInterval();

  let followups;
  try {
    const res = await fetch(`${API_BASE}/ticket-followup`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const json = await res.json();
    followups = Array.isArray(json?.data) ? json.data : [];
  } catch {
    return; // red caída → silencioso, reintento en el próximo tick
  }

  const now = Date.now();
  for (const f of followups) {
    const nextAtMs = new Date(f.proximo_recordatorio).getTime();
    if (Number.isNaN(nextAtMs) || nextAtMs > now) continue;

    try {
      // 1) Mostrar la notificación nativa.
      await self.registration.showNotification('Seguimiento de ticket', {
        body:
          (f.message && f.message.trim()) ||
          `Recordatorio ${(f.enviados ?? 0) + 1} de ${f.total}`,
        tag: `ticket-followup-${f.ticket_id}`,
        renotify: true,
        requireInteraction: false,
        data: {
          ticketId: f.ticket_id,
          followupId: f.id,
        },
      });

      // 2) Avisar al backend para que Supabase sume +1.
      await fetch(`${API_BASE}/ticket-followup/${f.ticket_id}/tick`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      // No interrumpir el resto de seguimientos.
      console.error('[sw] followup failed', f.ticket_id, err);
    }
  }
}

// --- Click en notificación → abre/enfoca la app -----------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ticketId = event.notification.data?.ticketId;
  const target = ticketId ? `/?ticket=${ticketId}` : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin)) {
            return client.focus().then(() =>
              client.navigate(target).catch(() => {}),
            );
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
