import { InjectionToken, Provider } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import { Profile } from '../models/profile.model';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          avatar_url?: string | null;
          phone?: string | null;
          extra_info?: Record<string, unknown> | null;
          is_staff?: boolean | null;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          avatar_url?: string | null;
          phone?: string | null;
          extra_info?: Record<string, unknown> | null;
          is_staff?: boolean | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_profile: {
        Args: Record<string, never>;
        Returns: Profile[];
      };
      upsert_user_profile: {
        Args: {
          p_id: string;
          p_email: string;
          p_first_name: string;
          p_last_name: string;
          p_avatar_url: string | null;
        };
        Returns: Profile[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export const SUPABASE = new InjectionToken<SupabaseClient<Database>>('SUPABASE');

export const supabaseProvider: Provider = {
  provide: SUPABASE,
  useFactory: () =>
    createClient<Database>(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }),
};
