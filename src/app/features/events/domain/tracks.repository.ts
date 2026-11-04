import { Track, TrackInput } from './track.model';

export abstract class TracksRepository {
  abstract list(eventId: string): Promise<Track[]>;
  abstract create(eventId: string, input: TrackInput): Promise<Track>;
  abstract update(id: string, input: TrackInput): Promise<Track>;
  abstract delete(id: string): Promise<void>;
}
