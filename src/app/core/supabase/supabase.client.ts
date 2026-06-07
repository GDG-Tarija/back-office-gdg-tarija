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
      events: {
        Row: {
          id: string;
          title: string;
          slug: string;
          event_type: string;
          capacity: number;
          date_start: string;
          date_end: string | null;
          is_published: boolean | null;
          created_at: string | null;
          updated_at: string | null;
          description: string | null;
          image_url: string | null;
          banner_url: string | null;
          location_type: string | null;
          location_name: string | null;
          address_link: string | null;
          category: string | null;
          extra_info: Record<string, unknown> | null;
        };
        Insert: Omit<
          Database['public']['Tables']['events']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['events']['Row']>;
        Relationships: [];
      };
      registrations: {
        Row: {
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
        };
        Insert: Omit<
          Database['public']['Tables']['registrations']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['registrations']['Row']>;
        Relationships: [];
      };
      ticket_types: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          price: number;
          ticket_capacity: number | null;
          created_at: string | null;
          updated_at: string | null;
          payment_qr_url: string | null;
          description: string | null;
          image_url: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['ticket_types']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['ticket_types']['Row']>;
        Relationships: [];
      };
      sponsors: {
        Row: {
          id: string;
          name: string | null;
          description: string | null;
          score: string | null;
          state: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['sponsors']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sponsors']['Row']>;
        Relationships: [];
      };
      inscripciones_sessions: {
        Row: {
          id: string;
          usuario_id: string;
          session_id: string;
          inscrito_en: string;
          asistio: boolean;
          checked_in_at: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['inscripciones_sessions']['Row'],
          'id' | 'inscrito_en' | 'asistio' | 'checked_in_at'
        > & {
          id?: string;
          inscrito_en?: string;
          asistio?: boolean;
          checked_in_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['inscripciones_sessions']['Row']>;
        Relationships: [];
      };
      scan_logs: {
        Row: {
          id: string;
          registration_id: string;
          scanned_by: string | null;
          scan_type: string;
          scanned_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['scan_logs']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['scan_logs']['Row']>;
        Relationships: [];
      };
      session_registrations: {
        Row: {
          registration_id: string;
          session_id: string;
          registered_at: string | null;
        };
        Insert: Database['public']['Tables']['session_registrations']['Row'];
        Update: Partial<Database['public']['Tables']['session_registrations']['Row']>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          capacity: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['sessions']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['sessions']['Row']>;
        Relationships: [];
      };
      staff_whitelist: {
        Row: {
          id: string;
          email: string;
          role: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['staff_whitelist']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['staff_whitelist']['Row']>;
        Relationships: [];
      };
      tracks: {
        Row: {
          id: string;
          evento_id: string;
          nombre: string;
          descripcion: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tracks']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tracks']['Row']>;
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
