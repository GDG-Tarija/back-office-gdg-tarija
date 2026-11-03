import { Database } from '../../../core/supabase/supabase.client';

export type TrackRow = Database['public']['Tables']['tracks']['Row'];
