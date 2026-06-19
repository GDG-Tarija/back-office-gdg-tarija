import { Database } from '../../../core/supabase/supabase.client';

export type EventRow = Database['public']['Tables']['events']['Row'];
export type RegistrationRow = Database['public']['Tables']['registrations']['Row'];

export interface RawRegistrationRow {
  id: string;
  event_id: string;
  user_id: string | null;
  ticket_type_id: string;
  event_role: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  custom_responses: Record<string, unknown> | null;
  payment_proof_url: string | null;
  scan_logs?: { id: string; scan_type: string }[] | null;
}

export interface RegistrationWithDetailsRow extends RawRegistrationRow {
  users: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  ticket_types: {
    id: string;
    name: string;
    price: number;
  } | null;
}
