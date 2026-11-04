import { Database } from '../../../core/supabase/supabase.client';

export type TicketTypeRow = Database['public']['Tables']['ticket_types']['Row'];
export type TicketTypeInsert = Database['public']['Tables']['ticket_types']['Insert'];
