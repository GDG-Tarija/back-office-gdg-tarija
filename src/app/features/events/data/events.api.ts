import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { EventsRepository } from '../domain/events.repository';
import { Event, EventInput, Attendee } from '../domain/event.model';
import { toDomainEvent, toDomainAttendee, toEventRow } from './events.mapper';
import { toDomainError } from './postgres-error.mapper';
import { RegistrationWithDetailsRow } from './events.dto';

const ATTENDEES_PAGE_SIZE = 1000;

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

  async getEventById(eventId: string): Promise<Event | null> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching event by id:', error);
      throw error;
    }

    return data ? toDomainEvent(data) : null;
  }

  async create(input: EventInput): Promise<Event> {
    const { data, error } = await this.supabase
      .from('events')
      .insert({ ...toEventRow(input), is_published: false })
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'event');
    return toDomainEvent(data);
  }

  async update(eventId: string, input: EventInput): Promise<Event> {
    const { data: current, error: readError } = await this.supabase
      .from('events')
      .select('extra_info')
      .eq('id', eventId)
      .single();
    if (readError) throw toDomainError(readError, 'event');

    const { data, error } = await this.supabase
      .from('events')
      .update(toEventRow(input, current.extra_info))
      .eq('id', eventId)
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'event');
    return toDomainEvent(data);
  }

  async setPublished(eventId: string, published: boolean): Promise<Event> {
    const { data, error } = await this.supabase
      .from('events')
      .update({ is_published: published })
      .eq('id', eventId)
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'event');
    return toDomainEvent(data);
  }

  async delete(eventId: string): Promise<void> {
    const { error } = await this.supabase.from('events').delete().eq('id', eventId);
    if (error) throw toDomainError(error, 'event');
  }

  async isSlugAvailable(slug: string, excludeEventId?: string): Promise<boolean> {
    let query = this.supabase.from('events').select('id').eq('slug', slug);
    if (excludeEventId) query = query.neq('id', excludeEventId);
    const { data, error } = await query.limit(1);
    if (error) throw toDomainError(error, 'event');
    return (data ?? []).length === 0;
  }

  async countRegistrations(eventId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (error) throw toDomainError(error, 'event');
    return count ?? 0;
  }

  async getAttendees(eventId: string): Promise<Attendee[]> {
    // PostgREST corta en 1000 filas por defecto: se pagina con range() y orden estable.
    const rows: RegistrationWithDetailsRow[] = [];
    for (let from = 0; ; from += ATTENDEES_PAGE_SIZE) {
      const { data, error } = await this.supabase
        .from('registrations')
        .select(
          `
          id,
          event_id,
          user_id,
          ticket_type_id,
          ticket_phase_id,
          coupon_id,
          event_role,
          status,
          created_at,
          updated_at,
          custom_responses,
          payment_proof_url,
          users ( id, email, first_name, last_name, avatar_url, phone ),
          ticket_types ( id, name, price ),
          ticket_phases ( id, name, price ),
          event_coupons ( code ),
          scan_logs ( id, scan_type, scanned_at )
        `,
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + ATTENDEES_PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching registrations:', error);
        throw error;
      }

      const page = (data ?? []) as unknown as RegistrationWithDetailsRow[];
      rows.push(...page);
      if (page.length < ATTENDEES_PAGE_SIZE) break;
    }

    return rows.map(toDomainAttendee);
  }

  async getAttendeeSessions(
    eventId: string,
    registrationId: string,
    userId: string | null,
  ): Promise<import('../domain/event.model').AttendeeSessionItem[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;

    // 1. Obtener todas las sesiones del evento
    const { data: eventSessions, error: sessionsError } = await client
      .from('sessions')
      .select('id, title, speaker, start_time, end_time')
      .eq('event_id', eventId)
      .order('title', { ascending: true });

    if (sessionsError) {
      console.error('Error fetching event sessions:', sessionsError);
      return [];
    }

    if (!eventSessions || eventSessions.length === 0) {
      return [];
    }

    // 2. Obtener inscripciones de sesiones si se cuenta con userId
    const userSessionMap = new Map<string, { asistio: boolean; checkedInAt: Date | null }>();

    if (userId) {
      const { data: userInscripciones } = await client
        .from('inscripciones_sessions')
        .select('session_id, asistio, checked_in_at')
        .eq('usuario_id', userId);

      if (userInscripciones) {
        userInscripciones.forEach(
          (item: { session_id: string; asistio: boolean; checked_in_at: string | null }) => {
            userSessionMap.set(item.session_id, {
              asistio: !!item.asistio,
              checkedInAt: item.checked_in_at ? new Date(item.checked_in_at) : null,
            });
          },
        );
      }
    }

    // 3. Obtener scan_logs de sesiones para esta registración específica
    const { data: scanLogs } = await client
      .from('scan_logs')
      .select('scan_type, scanned_at')
      .eq('registration_id', registrationId);

    const scanLogMap = new Map<string, Date>();
    if (scanLogs) {
      scanLogs.forEach((log: { scan_type: string; scanned_at: string | null }) => {
        if (log.scan_type.startsWith('session_entry:')) {
          const sIdPrefix = log.scan_type.replace('session_entry:', '');
          scanLogMap.set(sIdPrefix, log.scanned_at ? new Date(log.scanned_at) : new Date());
        }
      });
    }

    // 4. Mapear la información combinada
    return eventSessions.map(
      (s: {
        id: string;
        title: string;
        speaker: string | null;
        start_time: string | null;
        end_time: string | null;
      }) => {
        const userInsc = userSessionMap.get(s.id);
        const scanTime =
          scanLogMap.get(s.id) || scanLogMap.get(s.id.substring(0, 16)) || userInsc?.checkedInAt;
        const isAttended = !!(userInsc?.asistio || scanTime);

        return {
          sessionId: s.id,
          sessionTitle: s.title,
          speaker: s.speaker,
          startTime: s.start_time ? s.start_time.substring(0, 5) : null,
          endTime: s.end_time ? s.end_time.substring(0, 5) : null,
          asistio: isAttended,
          checkedInAt: scanTime || null,
        };
      },
    );
  }
}
