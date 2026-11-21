import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { toDomainError } from '../../events/data/postgres-error.mapper';
import { AuditFilters, AuditPage } from '../domain/audit-entry.model';
import { AuditRepository } from '../domain/audit.repository';
import { toAuditEntry } from './audit.mapper';

@Injectable({ providedIn: 'root' })
export class AuditApi implements AuditRepository {
  private readonly supabase = inject(SUPABASE);

  async list(filters: AuditFilters, limit: number, offset: number): Promise<AuditPage> {
    const { data, error } = await this.supabase.rpc('list_audit_log', {
      p_event_id: filters.eventId ?? undefined,
      p_actor_id: filters.actorId ?? undefined,
      p_category: filters.category ?? undefined,
      p_registration_id: filters.registrationId ?? undefined,
      p_from: filters.from?.toISOString(),
      p_to: filters.to?.toISOString(),
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw toDomainError(error, 'event');
    const rows = data ?? [];
    return { entries: rows.map(toAuditEntry), total: rows[0]?.total_count ?? 0 };
  }
}
