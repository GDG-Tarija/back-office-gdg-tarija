import { Database } from '../../../core/supabase/supabase.client';

export type CouponRow = Database['public']['Tables']['event_coupons']['Row'];
