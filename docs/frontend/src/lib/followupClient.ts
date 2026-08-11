// filepath: src/lib/followupClient.ts
// ============================================================================
// Registro del Service Worker + helpers para gestionar seguimientos desde
// la UI del frontend.
//
// Uso:
//   import { initFollowups } from '@/lib/followupClient';
//   useEffect(() => { initFollowups(); }, []);
// ============================================================================

const SW_PATH = '/sw.js';

/**
 * Registra el Service Worker una vez por sesión y solicita permiso para
 * notificaciones nativas. Es idempotente: si ya está registrado, no hace
 * nada.
 */
export async function initFollowups(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) {
    console.warn('[followups] Service Worker no soportado en este navegador.');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, {
      scope: '/',
    });
    console.info('[followups] SW registrado scope:', reg.scope);

    // Pedir permiso para notificaciones (idempotente: si ya está granted
    // o denied, la promise resuelve inmediatamente).
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    return reg;
  } catch (err) {
    console.error('[followups] error registrando SW:', err);
    return null;
  }
}

/**
 * Helper para crear un seguimiento desde la UI.
 */
export async function createFollowup(input: {
  ticketId: string;
  durationMinutes: number;
  notifications: number;
  message?: string;
}): Promise<unknown> {
  const res = await fetch('/api/ticket-followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Helper para cancelar un seguimiento.
 */
export async function cancelFollowup(ticketId: string): Promise<void> {
  const res = await fetch(`/api/ticket-followup/${ticketId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * Helper para listar todos los seguimientos activos.
 */
export async function listFollowups(): Promise<unknown[]> {
  const res = await fetch('/api/ticket-followup');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}
