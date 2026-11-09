import { InjectionToken, Provider } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      event_coupons: {
        Row: {
          code: string;
          created_at: string | null;
          event_id: string;
          id: string;
          max_uses: number;
          role: string;
          updated_at: string | null;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          event_id: string;
          id?: string;
          max_uses?: number;
          role?: string;
          updated_at?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          event_id?: string;
          id?: string;
          max_uses?: number;
          role?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_coupons_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_staff_assignments: {
        Row: {
          assigned_at: string;
          event_id: string;
          id: string;
          staff_email: string;
        };
        Insert: {
          assigned_at?: string;
          event_id: string;
          id?: string;
          staff_email: string;
        };
        Update: {
          assigned_at?: string;
          event_id?: string;
          id?: string;
          staff_email?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_staff_assignments_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          address_link: string | null;
          banner_url: string | null;
          capacity: number;
          category: string | null;
          created_at: string | null;
          date_end: string | null;
          date_start: string;
          description: string | null;
          event_type: string;
          extra_info: Json | null;
          id: string;
          image_url: string | null;
          is_published: boolean | null;
          location_name: string | null;
          location_type: string | null;
          slug: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          address_link?: string | null;
          banner_url?: string | null;
          capacity: number;
          category?: string | null;
          created_at?: string | null;
          date_end?: string | null;
          date_start: string;
          description?: string | null;
          event_type: string;
          extra_info?: Json | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean | null;
          location_name?: string | null;
          location_type?: string | null;
          slug: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          address_link?: string | null;
          banner_url?: string | null;
          capacity?: number;
          category?: string | null;
          created_at?: string | null;
          date_end?: string | null;
          date_start?: string;
          description?: string | null;
          event_type?: string;
          extra_info?: Json | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean | null;
          location_name?: string | null;
          location_type?: string | null;
          slug?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      inscripciones_sessions: {
        Row: {
          asistio: boolean;
          checked_in_at: string | null;
          id: string;
          inscrito_en: string;
          session_id: string;
          usuario_id: string;
        };
        Insert: {
          asistio?: boolean;
          checked_in_at?: string | null;
          id?: string;
          inscrito_en?: string;
          session_id: string;
          usuario_id: string;
        };
        Update: {
          asistio?: boolean;
          checked_in_at?: string | null;
          id?: string;
          inscrito_en?: string;
          session_id?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inscripciones_sessions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      registrations: {
        Row: {
          coupon_id: string | null;
          created_at: string | null;
          custom_responses: Json | null;
          event_id: string;
          event_role: string;
          id: string;
          payment_proof_url: string | null;
          status: string;
          ticket_phase_id: string | null;
          ticket_type_id: string;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          coupon_id?: string | null;
          created_at?: string | null;
          custom_responses?: Json | null;
          event_id: string;
          event_role?: string;
          id?: string;
          payment_proof_url?: string | null;
          status?: string;
          ticket_phase_id?: string | null;
          ticket_type_id: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          coupon_id?: string | null;
          created_at?: string | null;
          custom_responses?: Json | null;
          event_id?: string;
          event_role?: string;
          id?: string;
          payment_proof_url?: string | null;
          status?: string;
          ticket_phase_id?: string | null;
          ticket_type_id?: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'registrations_coupon_id_fkey';
            columns: ['coupon_id'];
            isOneToOne: false;
            referencedRelation: 'event_coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registrations_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registrations_ticket_phase_id_fkey';
            columns: ['ticket_phase_id'];
            isOneToOne: false;
            referencedRelation: 'ticket_phases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registrations_ticket_type_id_fkey';
            columns: ['ticket_type_id'];
            isOneToOne: false;
            referencedRelation: 'ticket_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registrations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      scan_logs: {
        Row: {
          created_at: string | null;
          id: string;
          registration_id: string;
          scan_type: string;
          scanned_at: string | null;
          scanned_by: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          registration_id: string;
          scan_type: string;
          scanned_at?: string | null;
          scanned_by?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          registration_id?: string;
          scan_type?: string;
          scanned_at?: string | null;
          scanned_by?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'scan_logs_registration_id_fkey';
            columns: ['registration_id'];
            isOneToOne: false;
            referencedRelation: 'registrations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scan_logs_scanned_by_fkey';
            columns: ['scanned_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      session_registrations: {
        Row: {
          registered_at: string | null;
          registration_id: string;
          session_id: string;
        };
        Insert: {
          registered_at?: string | null;
          registration_id: string;
          session_id: string;
        };
        Update: {
          registered_at?: string | null;
          registration_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_registrations_registration_id_fkey';
            columns: ['registration_id'];
            isOneToOne: false;
            referencedRelation: 'registrations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_registrations_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          capacity: number;
          city: string | null;
          created_at: string | null;
          date: string | null;
          end_time: string | null;
          event_id: string;
          id: string;
          level: Database['public']['Enums']['session_level'] | null;
          speaker: string | null;
          speaker_avatar_url: string | null;
          start_time: string | null;
          title: string;
          topic: string | null;
          track_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          capacity: number;
          city?: string | null;
          created_at?: string | null;
          date?: string | null;
          end_time?: string | null;
          event_id: string;
          id?: string;
          level?: Database['public']['Enums']['session_level'] | null;
          speaker?: string | null;
          speaker_avatar_url?: string | null;
          start_time?: string | null;
          title: string;
          topic?: string | null;
          track_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          capacity?: number;
          city?: string | null;
          created_at?: string | null;
          date?: string | null;
          end_time?: string | null;
          event_id?: string;
          id?: string;
          level?: Database['public']['Enums']['session_level'] | null;
          speaker?: string | null;
          speaker_avatar_url?: string | null;
          start_time?: string | null;
          title?: string;
          topic?: string | null;
          track_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_track_id_fkey';
            columns: ['track_id'];
            isOneToOne: false;
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          },
        ];
      };
      sponsors: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string | null;
          score: string | null;
          state: Database['public']['Enums']['state_enum'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          score?: string | null;
          state?: Database['public']['Enums']['state_enum'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          score?: string | null;
          state?: Database['public']['Enums']['state_enum'];
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_whitelist: {
        Row: {
          created_at: string | null;
          email: string;
          id: string;
          role: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email: string;
          id?: string;
          role: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string;
          id?: string;
          role?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      ticket_phases: {
        Row: {
          capacity: number | null;
          created_at: string;
          id: string;
          name: string;
          payment_qr_url: string | null;
          position: number;
          price: number;
          ticket_type_id: string;
          updated_at: string;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          id?: string;
          name: string;
          payment_qr_url?: string | null;
          position: number;
          price?: number;
          ticket_type_id: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          id?: string;
          name?: string;
          payment_qr_url?: string | null;
          position?: number;
          price?: number;
          ticket_type_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ticket_phases_ticket_type_id_fkey';
            columns: ['ticket_type_id'];
            isOneToOne: false;
            referencedRelation: 'ticket_types';
            referencedColumns: ['id'];
          },
        ];
      };
      ticket_types: {
        Row: {
          created_at: string | null;
          description: string | null;
          event_id: string;
          id: string;
          image_url: string | null;
          name: string;
          payment_qr_url: string | null;
          price: number;
          ticket_capacity: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          event_id: string;
          id?: string;
          image_url?: string | null;
          name: string;
          payment_qr_url?: string | null;
          price?: number;
          ticket_capacity?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          event_id?: string;
          id?: string;
          image_url?: string | null;
          name?: string;
          payment_qr_url?: string | null;
          price?: number;
          ticket_capacity?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ticket_types_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      tracks: {
        Row: {
          created_at: string;
          descripcion: string | null;
          evento_id: string;
          id: string;
          nombre: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          descripcion?: string | null;
          evento_id: string;
          id?: string;
          nombre: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          descripcion?: string | null;
          evento_id?: string;
          id?: string;
          nombre?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          email: string;
          extra_info: Json | null;
          first_name: string;
          id: string;
          is_staff: boolean | null;
          last_name: string;
          phone: string | null;
          updated_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          email: string;
          extra_info?: Json | null;
          first_name: string;
          id: string;
          is_staff?: boolean | null;
          last_name: string;
          phone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          email?: string;
          extra_info?: Json | null;
          first_name?: string;
          id?: string;
          is_staff?: boolean | null;
          last_name?: string;
          phone?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_coupon_uses: { Args: { p_coupon_id: string }; Returns: number };
      get_my_profile: {
        Args: never;
        Returns: {
          avatar_url: string | null;
          created_at: string | null;
          email: string;
          extra_info: Json | null;
          first_name: string;
          id: string;
          is_staff: boolean | null;
          last_name: string;
          phone: string | null;
          updated_at: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'users';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_my_role: { Args: never; Returns: string };
      get_public_certificate: {
        Args: { p_registration_id: string };
        Returns: {
          check_in_date: string;
          event_banner_url: string;
          event_date_end: string;
          event_date_start: string;
          event_id: string;
          event_role: string;
          event_slug: string;
          event_title: string;
          registration_id: string;
          ticket_name: string;
          user_email: string;
          user_first_name: string;
          user_id: string;
          user_last_name: string;
        }[];
      };
      get_ticket_availability: {
        Args: { p_event_id: string };
        Returns: {
          capacity: number | null;
          is_active: boolean;
          name: string;
          package_capacity: number | null;
          package_sold: number;
          payment_qr_url: string | null;
          position: number;
          price: number;
          remaining: number | null;
          sold: number;
          ticket_phase_id: string | null;
          ticket_type_id: string;
        }[];
      };
      has_event_access: { Args: { p_event_id: string }; Returns: boolean };
      is_staff: { Args: never; Returns: boolean };
      is_superadmin: { Args: never; Returns: boolean };
      registrar_asistencia_qr: {
        Args: { p_session_id: string; p_usuario_id: string };
        Returns: string;
      };
      update_user_profile: {
        Args: { p_first_name: string; p_last_name: string; p_phone: string };
        Returns: {
          avatar_url: string | null;
          created_at: string | null;
          email: string;
          extra_info: Json | null;
          first_name: string;
          id: string;
          is_staff: boolean | null;
          last_name: string;
          phone: string | null;
          updated_at: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'users';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      upsert_user_profile: {
        Args: {
          p_avatar_url?: string;
          p_email: string;
          p_first_name: string;
          p_id: string;
          p_last_name: string;
        };
        Returns: {
          avatar_url: string | null;
          created_at: string | null;
          email: string;
          extra_info: Json | null;
          first_name: string;
          id: string;
          is_staff: boolean | null;
          last_name: string;
          phone: string | null;
          updated_at: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'users';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      validate_coupon: {
        Args: { p_code: string; p_event_id: string };
        Returns: {
          id: string;
          max_uses: number;
          role: string;
          uses_left: number;
        }[];
      };
    };
    Enums: {
      session_level: 'Basico' | 'Intermedio' | 'Avanzado';
      state_enum: 'ACTIVE' | 'INACTIVE';
    };
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
