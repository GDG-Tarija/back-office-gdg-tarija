import { Event, Attendee } from './event.model';

export abstract class EventsRepository {
  abstract getEvents(): Promise<Event[]>;
  abstract getAttendees(eventId: string): Promise<Attendee[]>;
}
