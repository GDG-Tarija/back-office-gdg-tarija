export interface Track {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
}

export type TrackInput = Omit<Track, 'id' | 'eventId'>;
