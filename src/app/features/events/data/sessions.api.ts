import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { Session, SessionInput } from '../domain/session.model';
import { SessionsRepository } from '../domain/sessions.repository';
import { toDomainError } from './postgres-error.mapper';
import { toDomainSession, toSessionRow } from './sessions.mapper';

@Injectable({ providedIn: 'root' })
export class SessionsApi implements SessionsRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<Session[]> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('*')
      .eq('event_id', eventId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw toDomainError(error, 'session');
    return (data ?? []).map(toDomainSession);
  }

  async create(eventId: string, input: SessionInput): Promise<Session> {
    const { data, error } = await this.supabase
      .from('sessions')
      .insert({ ...toSessionRow(input), event_id: eventId })
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'session');
    return toDomainSession(data);
  }

  async update(id: string, input: SessionInput): Promise<Session> {
    const { data, error } = await this.supabase
      .from('sessions')
      .update(toSessionRow(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'session');
    return toDomainSession(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('sessions').delete().eq('id', id);
    if (error) throw toDomainError(error, 'session');
  }
}
