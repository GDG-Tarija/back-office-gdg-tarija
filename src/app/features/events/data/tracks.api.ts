import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { Track, TrackInput } from '../domain/track.model';
import { TracksRepository } from '../domain/tracks.repository';
import { toDomainError } from './postgres-error.mapper';
import { toDomainTrack, toTrackRow } from './tracks.mapper';

@Injectable({ providedIn: 'root' })
export class TracksApi implements TracksRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<Track[]> {
    const { data, error } = await this.supabase
      .from('tracks')
      .select('*')
      .eq('evento_id', eventId)
      .order('nombre', { ascending: true });
    if (error) throw toDomainError(error, 'track');
    return (data ?? []).map(toDomainTrack);
  }

  async create(eventId: string, input: TrackInput): Promise<Track> {
    const { data, error } = await this.supabase
      .from('tracks')
      .insert({ ...toTrackRow(input), evento_id: eventId })
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'track');
    return toDomainTrack(data);
  }

  async update(id: string, input: TrackInput): Promise<Track> {
    const { data, error } = await this.supabase
      .from('tracks')
      .update(toTrackRow(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'track');
    return toDomainTrack(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('tracks').delete().eq('id', id);
    if (error) throw toDomainError(error, 'track');
  }
}
