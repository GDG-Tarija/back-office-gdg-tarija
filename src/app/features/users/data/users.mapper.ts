import { BackofficeRole } from '../../../core/models/role.model';
import { Database, Json } from '../../../core/supabase/supabase.client';
import { PostgresLikeError, toDomainError } from '../../events/data/postgres-error.mapper';
import { DomainError, DomainErrorCode } from '../../events/domain/domain-error';
import { AssignedEvent, BackofficeUser } from '../domain/backoffice-user.model';

export type BackofficeUserRow =
  Database['public']['Functions']['list_backoffice_users']['Returns'][number];

const toDate = (value: string | null | undefined): Date | null => (value ? new Date(value) : null);

function toAssignedEvents(json: Json): AssignedEvent[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const { assignment_id, event_id, title, date_start } = item as Record<string, Json | undefined>;
    if (typeof assignment_id !== 'string' || typeof event_id !== 'string') return [];
    return [
      {
        assignmentId: assignment_id,
        eventId: event_id,
        title: typeof title === 'string' ? title : 'Evento sin título',
        dateStart: toDate(typeof date_start === 'string' ? date_start : null),
      },
    ];
  });
}

export function toBackofficeUser(row: BackofficeUserRow): BackofficeUser {
  return {
    email: row.email,
    role: (row.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'STAFF') satisfies BackofficeRole,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    lastSignInAt: toDate(row.last_sign_in_at),
    addedAt: toDate(row.added_at),
    addedByEmail: row.added_by_email,
    lastActivityAt: toDate(row.last_activity_at),
    assignedEvents: toAssignedEvents(row.assigned_events),
  };
}

// Errores de negocio de las RPCs (ver 20261115235749_backoffice_users_and_audit.sql): el mensaje
// ya viene en español desde la base.
const BUSINESS_ERRORS: Record<string, { code: DomainErrorCode; field?: string }> = {
  P0020: { code: 'INVALID', field: 'email' },
  P0021: { code: 'DUPLICATE', field: 'email' },
  P0022: { code: 'FORBIDDEN' },
  P0023: { code: 'FORBIDDEN' },
  P0024: { code: 'NOT_FOUND' },
};

export function toUsersError(error: PostgresLikeError): DomainError {
  const business = BUSINESS_ERRORS[error.code ?? ''];
  if (business && error.message?.trim()) {
    return new DomainError(error.message.trim(), business.code, business.field);
  }
  return toDomainError(error, 'staff');
}
