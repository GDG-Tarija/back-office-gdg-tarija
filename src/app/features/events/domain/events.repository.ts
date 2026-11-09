import { Event, EventInput, Attendee, AttendeeSessionItem } from './event.model';

export abstract class EventsRepository {
  abstract getEvents(): Promise<Event[]>;
  abstract getEventById(eventId: string): Promise<Event | null>;
  abstract create(input: EventInput): Promise<Event>;
  abstract update(eventId: string, input: EventInput): Promise<Event>;
  abstract setPublished(eventId: string, published: boolean): Promise<Event>;
  /** Falla con DomainError(HAS_REGISTRATIONS) si el evento tiene inscritos. */
  abstract delete(eventId: string): Promise<void>;
  abstract isSlugAvailable(slug: string, excludeEventId?: string): Promise<boolean>;
  abstract countRegistrations(eventId: string): Promise<number>;
  abstract getAttendees(eventId: string): Promise<Attendee[]>;
  abstract confirmPendingRegistration(registrationId: string): Promise<void>;
  abstract getAttendeeSessions(
    eventId: string,
    registrationId: string,
    userId: string | null,
  ): Promise<AttendeeSessionItem[]>;
  /**
   * Pasa una inscripción PENDING a CANCELLED (libera su cupo en la fase). Solo SUPERADMIN (RLS).
   * Falla con DomainError si ya no está pendiente o no hay permiso.
   */
  abstract cancelPendingRegistration(registrationId: string): Promise<void>;
  abstract registerManualCheckin(registrationId: string): Promise<boolean>;
  abstract registerManualRefrigerio(registrationId: string): Promise<boolean>;
  abstract registerManualSessionCheckin(
    registrationId: string,
    sessionId: string,
    userId: string | null,
  ): Promise<boolean>;
}
