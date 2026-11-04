import { Session, SessionInput } from './session.model';

export abstract class SessionsRepository {
  abstract list(eventId: string): Promise<Session[]>;
  abstract create(eventId: string, input: SessionInput): Promise<Session>;
  abstract update(id: string, input: SessionInput): Promise<Session>;
  /** Falla con DomainError(HAS_REGISTRATIONS) si la sesión tiene inscritos. */
  abstract delete(id: string): Promise<void>;
}
