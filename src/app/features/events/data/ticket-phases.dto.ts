import { Database } from '../../../core/supabase/supabase.client';

export type TicketPhaseRow = Database['public']['Tables']['ticket_phases']['Row'];
export type TicketPhaseInsert = Database['public']['Tables']['ticket_phases']['Insert'];
export type TicketPhaseUpdate = Database['public']['Tables']['ticket_phases']['Update'];
export type TicketAvailabilityRow =
  Database['public']['Functions']['get_ticket_availability']['Returns'][number];
