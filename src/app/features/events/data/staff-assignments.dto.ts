import { Database } from '../../../core/supabase/supabase.client';

export type StaffAssignmentRow = Database['public']['Tables']['event_staff_assignments']['Row'];
