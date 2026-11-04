import { normalizeTopics } from '../domain/event-validators';
import { Session, SessionInput } from '../domain/session.model';
import { SessionInsert, SessionRow } from './sessions.dto';

/** '09:30:00' -> '09:30' */
function toHHmm(time: string | null): string | null {
  return time ? time.substring(0, 5) : null;
}

export function toDomainSession(row: SessionRow): Session {
  return {
    id: row.id,
    eventId: row.event_id,
    trackId: row.track_id,
    title: row.title,
    speaker: row.speaker,
    speakerAvatarUrl: row.speaker_avatar_url,
    city: row.city,
    level: row.level,
    topics: row.topic ? normalizeTopics(row.topic.split(',')) : [],
    capacity: row.capacity,
    date: row.date,
    startTime: toHHmm(row.start_time),
    endTime: toHHmm(row.end_time),
  };
}

export function toSessionRow(input: SessionInput): Omit<SessionInsert, 'event_id'> {
  const topics = normalizeTopics(input.topics);
  return {
    track_id: input.trackId,
    title: input.title.trim(),
    speaker: input.speaker?.trim() || null,
    speaker_avatar_url: input.speakerAvatarUrl,
    city: input.city?.trim() || null,
    level: input.level,
    topic: topics.length ? topics.join(', ') : null,
    capacity: input.capacity,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
  };
}
