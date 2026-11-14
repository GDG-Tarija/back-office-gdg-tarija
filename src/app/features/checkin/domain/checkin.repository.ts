import { Session, ScanResult, ScanMode, UndoScanInput, UndoScanResult } from './checkin.model';
import { Attendee, Event } from '../../events/domain/event.model';

export abstract class CheckinRepository {
  abstract getEvents(): Promise<Event[]>;
  /** Eventos asignados al operador (RLS: un STAFF solo lee los suyos). */
  abstract getAssignedEventIds(): Promise<string[]>;
  abstract getAttendees(eventId: string): Promise<Attendee[]>;
  abstract getSessions(eventId: string): Promise<Session[]>;
  abstract getCheckinStats(eventId: string): Promise<{
    checkedInCount: number;
    refrigerioCount: number;
    totalRegistered: number;
  }>;
  abstract registerScan(
    registrationId: string,
    eventId: string,
    mode: ScanMode,
    sessionId: string | null,
    operatorUserId: string | null,
  ): Promise<ScanResult>;
  abstract undoScan(input: UndoScanInput): Promise<UndoScanResult>;
  abstract verifyRegistration(
    registrationId: string,
    eventId: string,
    mode: ScanMode,
    sessionId: string | null,
  ): Promise<ScanResult>;
}
