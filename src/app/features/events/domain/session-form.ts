import { SessionSlot, ValidationIssue, normalizeTopics } from './event-validators';
import { Session, SessionInput, SessionLevel } from './session.model';
import { Track } from './track.model';

/** Valor del formulario de sesión: números y temas como texto para inputs nativos. */
export interface SessionFormValue {
  title: string;
  speaker: string;
  speakerAvatarUrl: string | null;
  city: string;
  /** '' = sin nivel */
  level: string;
  /** Temas separados por coma (mismo formato CSV que lee el sitio público). */
  topics: string;
  capacity: string;
  date: string;
  startTime: string;
  endTime: string;
  /** '' = sin track */
  trackId: string;
}

export function emptySessionFormValue(date = ''): SessionFormValue {
  return {
    title: '',
    speaker: '',
    speakerAvatarUrl: null,
    city: '',
    level: '',
    topics: '',
    capacity: '',
    date,
    startTime: '09:00',
    endTime: '10:00',
    trackId: '',
  };
}

export function sessionToFormValue(s: Session): SessionFormValue {
  return {
    title: s.title,
    speaker: s.speaker ?? '',
    speakerAvatarUrl: s.speakerAvatarUrl,
    city: s.city ?? '',
    level: s.level ?? '',
    topics: s.topics.join(', '),
    capacity: String(s.capacity),
    date: s.date ?? '',
    startTime: s.startTime ?? '',
    endTime: s.endTime ?? '',
    trackId: s.trackId ?? '',
  };
}

/** Texto de temas -> lista normalizada (trim, sin vacíos ni duplicados). */
export function parseTopics(text: string): string[] {
  return normalizeTopics(text.split(','));
}

/** Texto no numérico produce NaN para que el validador lo rechace. */
export function formValueToSessionInput(v: SessionFormValue): SessionInput {
  const capText = v.capacity.trim();
  return {
    title: v.title,
    speaker: v.speaker.trim() || null,
    speakerAvatarUrl: v.speakerAvatarUrl,
    city: v.city.trim() || null,
    level: (v.level || null) as SessionLevel | null,
    topics: parseTopics(v.topics),
    capacity: capText === '' ? NaN : Number(capText),
    date: v.date || null,
    startTime: v.startTime || null,
    endTime: v.endTime || null,
    trackId: v.trackId || null,
  };
}

/** Una sesión con inscritos no se puede eliminar. */
export function sessionDeleteBlockReason(registeredCount: number): string | null {
  return registeredCount > 0 ? `No se puede eliminar: tiene ${registeredCount} inscrito(s).` : null;
}

/** La capacidad no puede bajar de los inscritos actuales. */
export function validateSessionCapacityFloor(
  capacity: number,
  registeredCount: number,
): ValidationIssue | null {
  if (registeredCount > 0 && Number.isInteger(capacity) && capacity < registeredCount) {
    return {
      field: 'capacity',
      message: `La capacidad no puede ser menor a los inscritos actuales (${registeredCount}).`,
    };
  }
  return null;
}

/** Aviso (no bloqueo) cuando la sesión supera la capacidad total del evento. */
export function sessionCapacityWarning(
  capacity: number,
  eventCapacity: number,
): ValidationIssue | null {
  if (Number.isInteger(capacity) && capacity > eventCapacity) {
    return {
      field: 'capacity',
      message: `La capacidad supera la del evento (${eventCapacity}).`,
    };
  }
  return null;
}

/** Inscritos por sesión (session_id -> cantidad). */
export function countBySession(rows: { session_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.session_id] = (counts[row.session_id] ?? 0) + 1;
  return counts;
}

/**
 * Pares de sesiones con misma fecha y hora de inicio en distinto track (o sin track): una misma
 * persona no podría elegir ambas (trigger check_session_datetime_conflict). Los pares del mismo
 * track ya los cubre findSessionOverlaps.
 */
export function findSameStartPairs(sessions: SessionSlot[]): [SessionSlot, SessionSlot][] {
  const pairs: [SessionSlot, SessionSlot][] = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];
      if (!a.date || !a.startTime) continue;
      if (a.date !== b.date || a.startTime !== b.startTime) continue;
      if (a.trackId && a.trackId === b.trackId) continue;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

export function trackDeleteMessage(track: Pick<Track, 'name'>, sessionCount: number): string {
  if (sessionCount === 0) return `¿Eliminar el track "${track.name}"?`;
  return `¿Eliminar el track "${track.name}"? Sus ${sessionCount} sesión(es) quedarán sin track (no se borran).`;
}

export interface AgendaTrackGroup {
  trackId: string | null;
  name: string;
  sessions: Session[];
}

export interface AgendaDay {
  /** null = sesiones sin fecha */
  date: string | null;
  label: string;
  groups: AgendaTrackGroup[];
}

const NO_TRACK = 'Sin track';

/** 'YYYY-MM-DD' -> 'jueves, 15 de octubre' (sin depender de la zona del navegador). */
export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function bySlot(a: Session, b: Session): number {
  return (
    (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
    (a.endTime ?? '').localeCompare(b.endTime ?? '') ||
    a.title.localeCompare(b.title)
  );
}

/** Agenda: días ordenados -> tracks (por nombre, "Sin track" al final) -> sesiones por hora. */
export function groupAgenda(sessions: Session[], tracks: Track[]): AgendaDay[] {
  const dates = [...new Set(sessions.map((s) => s.date))].sort((a, b) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  });
  const orderedTracks = [...tracks].sort((a, b) => a.name.localeCompare(b.name));
  const known = new Set(tracks.map((t) => t.id));

  return dates.map((date) => {
    const ofDay = sessions.filter((s) => s.date === date).sort(bySlot);
    const groups: AgendaTrackGroup[] = [];
    for (const t of orderedTracks) {
      const list = ofDay.filter((s) => s.trackId === t.id);
      if (list.length) groups.push({ trackId: t.id, name: t.name, sessions: list });
    }
    const loose = ofDay.filter((s) => !s.trackId || !known.has(s.trackId));
    if (loose.length) groups.push({ trackId: null, name: NO_TRACK, sessions: loose });
    return { date, label: date ? formatDayLabel(date) : 'Sin fecha', groups };
  });
}
