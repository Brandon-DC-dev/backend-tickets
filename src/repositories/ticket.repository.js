// filepath: src/repositories/ticket.repository.js
// Acceso a datos sobre `tickets` para validaciones cruzadas
// (ej: existencia del ticket al crear un seguimiento).

import { supabase } from '../config/supabase.js';

const TABLE = 'tickets';

/**
 * Devuelve el estado actual del ticket o null si no existe.
 * No lanza — el caller decide si NotFound es apropiado.
 */
export async function getStatus(ticketId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, estado')
    .eq('id', ticketId)
    .maybeSingle();

  return { data, error };
}
