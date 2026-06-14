import { Event, Attendee } from './event.model';

export abstract class EventsRepository {
  abstract getEvents(): Promise<Event[]>;
  abstract getEventById(eventId: string): Promise<Event | null>;
  abstract getAttendees(eventId: string): Promise<Attendee[]>;
}
