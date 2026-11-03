import { Track, TrackInput } from '../domain/track.model';
import { TrackRow } from './tracks.dto';

export function toDomainTrack(row: TrackRow): Track {
  return {
    id: row.id,
    eventId: row.evento_id,
    name: row.nombre,
    description: row.descripcion,
  };
}

export function toTrackRow(input: TrackInput): { nombre: string; descripcion: string | null } {
  return { nombre: input.name.trim(), descripcion: input.description?.trim() || null };
}
