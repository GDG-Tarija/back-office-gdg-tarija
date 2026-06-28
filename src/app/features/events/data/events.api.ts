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
        ),
        scan_logs (
          id,
          scan_type
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
      scan_logs: { id: string }[] | null;
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
        scan_logs: r.scan_logs,
        users: user,
        ticket_types: r.ticket_types,
      } as RegistrationWithDetailsRow;
    });

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

  async registerManualCheckin(registrationId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;
    const { error } = await client.from('scan_logs').insert({
      registration_id: registrationId,
      scan_type: 'checkin',
      scanned_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error registering manual check-in:', error);
      return false;
    }
    return true;
  }

  async registerManualRefrigerio(registrationId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;
    const { error } = await client.from('scan_logs').insert({
      registration_id: registrationId,
      scan_type: 'refrigerio',
      scanned_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error registering manual refrigerio:', error);
      return false;
    }
    return true;
  }

  async registerManualSessionCheckin(
    registrationId: string,
    sessionId: string,
    userId: string | null,
  ): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;
    const nowIso = new Date().toISOString();

    const { error: scanError } = await client.from('scan_logs').insert({
      registration_id: registrationId,
      scan_type: `session_entry:${sessionId.substring(0, 16)}`,
      scanned_at: nowIso,
    });

    if (scanError) {
      console.error('Error registering manual session scan_log:', scanError);
    }

    if (userId) {
      const { error: inscError } = await client
        .from('inscripciones_sessions')
        .update({
          asistio: true,
          checked_in_at: nowIso,
        })
        .eq('usuario_id', userId)
        .eq('session_id', sessionId);

      if (inscError) {
        console.error('Error updating inscripciones_sessions:', inscError);
      }
    }

    return true;
  }
}
