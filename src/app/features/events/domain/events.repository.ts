import { Event, Attendee, AttendeeSessionItem } from './event.model';

export abstract class EventsRepository {
  abstract getEvents(): Promise<Event[]>;
  abstract getEventById(eventId: string): Promise<Event | null>;
  abstract getAttendees(eventId: string): Promise<Attendee[]>;
  abstract getAttendeeSessions(
    eventId: string,
    registrationId: string,
    userId: string | null,
  ): Promise<AttendeeSessionItem[]>;
  abstract registerManualCheckin(registrationId: string): Promise<boolean>;
  abstract registerManualRefrigerio(registrationId: string): Promise<boolean>;
  abstract registerManualSessionCheckin(
    registrationId: string,
    sessionId: string,
    userId: string | null,
  ): Promise<boolean>;
}
