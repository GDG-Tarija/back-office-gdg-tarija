import { Database } from '../../../core/supabase/supabase.client';
import { AuditAction, AuditEntry } from '../domain/audit-entry.model';

export type AuditRow = Database['public']['Functions']['list_audit_log']['Returns'][number];

const ACTIONS: readonly AuditAction[] = ['INSERT', 'UPDATE', 'DELETE'];

export function toAuditEntry(row: AuditRow): AuditEntry {
  const changes =
    row.changes && typeof row.changes === 'object' && !Array.isArray(row.changes)
      ? (row.changes as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at),
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole:
      row.actor_role === 'SUPERADMIN' || row.actor_role === 'STAFF' ? row.actor_role : null,
    actorName: row.actor_name,
    action: ACTIONS.find((a) => a === row.action) ?? 'UPDATE',
    table: row.table_name,
    recordId: row.record_id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    subjectName: row.subject_name,
    changes,
    source: row.source === 'backfill' ? 'backfill' : 'app',
  };
}
