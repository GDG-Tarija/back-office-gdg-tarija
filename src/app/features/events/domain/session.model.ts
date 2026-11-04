export type SessionLevel = 'Basico' | 'Intermedio' | 'Avanzado';

export const SESSION_LEVELS: readonly SessionLevel[] = ['Basico', 'Intermedio', 'Avanzado'];

export interface Session {
  id: string;
  eventId: string;
  trackId: string | null;
  title: string;
  speaker: string | null;
  speakerAvatarUrl: string | null;
  city: string | null;
  level: SessionLevel | null;
  topics: string[];
  capacity: number;
  /** 'YYYY-MM-DD' en hora de La Paz */
  date: string | null;
  /** 'HH:mm' en hora de La Paz */
  startTime: string | null;
  endTime: string | null;
}

export type SessionInput = Omit<Session, 'id' | 'eventId'>;
