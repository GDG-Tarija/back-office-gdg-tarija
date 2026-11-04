import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { SessionRegistrationsRepository } from '../domain/session-registrations.repository';
import { countBySession } from '../domain/session-form';
import { toDomainError } from './postgres-error.mapper';

@Injectable({ providedIn: 'root' })
export class SessionRegistrationsApi implements SessionRegistrationsRepository {
  private readonly supabase = inject(SUPABASE);

  async getCounts(sessionIds: string[]): Promise<Record<string, number>> {
    if (sessionIds.length === 0) return {};
    const { data, error } = await this.supabase
      .from('session_registrations')
      .select('session_id')
      .in('session_id', sessionIds);
    if (error) throw toDomainError(error, 'session');
    return countBySession(data ?? []);
  }
}
