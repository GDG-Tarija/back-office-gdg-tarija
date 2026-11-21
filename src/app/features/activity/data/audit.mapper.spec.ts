import { AuditRow, toAuditEntry } from './audit.mapper';

const row = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  id: 7,
  occurred_at: '2026-11-15T12:00:00Z',
  actor_id: 'u1',
  actor_email: 'admin@gdg.test',
  actor_role: 'SUPERADMIN',
  actor_name: 'Ada Admin',
  action: 'UPDATE',
  table_name: 'registrations',
  record_id: 'r1',
  event_id: 'e1',
  event_title: 'DevFest',
  subject_name: 'Ana Paz',
  changes: { status: ['PENDING', 'CONFIRMED'] },
  source: 'app',
  total_count: 1,
  ...overrides,
});

describe('toAuditEntry', () => {
  it('convierte la fecha y conserva los cambios', () => {
    const e = toAuditEntry(row());
    expect(e.occurredAt.toISOString()).toBe('2026-11-15T12:00:00.000Z');
    expect(e.changes).toEqual({ status: ['PENDING', 'CONFIRMED'] });
    expect(e.actorRole).toBe('SUPERADMIN');
  });

  it('un rol ausente es una persona sin acceso al back-office; un valor raro no rompe', () => {
    const e = toAuditEntry(row({ actor_role: null, changes: [1, 2], source: 'backfill' }));
    expect(e.actorRole).toBeNull();
    expect(e.changes).toEqual({});
    expect(e.source).toBe('backfill');
  });
});
