import { Session, ScanResult, ScanMode } from './checkin.model';
import { Event } from '../../events/domain/event.model';

export abstract class CheckinRepository {
  abstract getEvents(): Promise<Event[]>;
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
}
