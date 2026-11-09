import { Database } from '../../../core/supabase/supabase.client';

export type TicketTypeRow = Database['public']['Tables']['ticket_types']['Row'];
export type TicketTypeInsert = Database['public']['Tables']['ticket_types']['Insert'];

/** Fila de paquete con sus fases embebidas (select '*, ticket_phases(*)'). */
export type TicketTypeWithPhasesRow = TicketTypeRow & {
  ticket_phases?: Database['public']['Tables']['ticket_phases']['Row'][] | null;
};
