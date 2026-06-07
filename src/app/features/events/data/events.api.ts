import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { EventsRepository } from '../domain/events.repository';
import { Event, Attendee } from '../domain/event.model';
import { toDomainEvent, toDomainAttendee } from './events.mapper';
import { RegistrationWithDetailsRow, RawRegistrationRow } from './events.dto';

@Injectable({
  providedIn: 'root',
})
export class EventsApi implements EventsRepository {
  private readonly supabase = inject(SUPABASE);

  async getEvents(): Promise<Event[]> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .order('date_start', { ascending: false });

    if (error) {
      console.error('Error fetching events:', error);
      throw error;
    }

    return (data || []).map(toDomainEvent);
  }

  async getAttendees(eventId: string): Promise<Attendee[]> {
    const { data: regs, error: regsError } = await this.supabase
      .from('registrations')
      .select(
        `
        id,
        event_id,
        user_id,
        ticket_type_id,
        event_role,
        status,
        created_at,
        updated_at,
        custom_responses,
        payment_proof_url,
        ticket_types (
          id,
          name,
          price
        )
      `,
      )
      .eq('event_id', eventId);

    if (regsError) {
      console.error('Error fetching registrations:', regsError);
      throw regsError;
    }

    if (!regs || regs.length === 0) {
      return [];
    }

    // Explicitly cast regs to resolve type inference issues
    const regsData = regs as unknown as (RawRegistrationRow & {
      ticket_types: { id: string; name: string; price: number } | null;
    })[];

    const userIds = regsData.map((r) => r.user_id).filter((id): id is string => !!id);
    const usersMap = new Map<
      string,
      {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        avatar_url: string | null;
        phone: string | null;
      }
    >();

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select(
          `
          id,
          email,
          first_name,
          last_name,
          avatar_url,
          phone
        `,
        )
        .in('id', userIds);

      if (usersError) {
        console.error('Error fetching public profiles from users:', usersError);
      } else if (users) {
        const usersData = users as unknown as {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          avatar_url: string | null;
          phone: string | null;
        }[];
        usersData.forEach((u) => usersMap.set(u.id, u));
      }
    }

    const rows: RegistrationWithDetailsRow[] = regsData.map((r) => {
      const user = r.user_id ? usersMap.get(r.user_id) || null : null;
      return {
        id: r.id,
        event_id: r.event_id,
        user_id: r.user_id,
        ticket_type_id: r.ticket_type_id,
        event_role: r.event_role,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        custom_responses: r.custom_responses,
        payment_proof_url: r.payment_proof_url,
        users: user,
        ticket_types: r.ticket_types,
      } as RegistrationWithDetailsRow;
    });

    return rows.map(toDomainAttendee);
  }
}
