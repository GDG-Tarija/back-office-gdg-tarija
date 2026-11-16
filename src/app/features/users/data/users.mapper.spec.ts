import { BackofficeUserRow, toBackofficeUser, toUsersError } from './users.mapper';

const row = (overrides: Partial<BackofficeUserRow> = {}): BackofficeUserRow => ({
  email: 'puerta@gdg.test',
  role: 'STAFF',
  user_id: 'u1',
  first_name: 'Ana',
  last_name: 'Paz',
  avatar_url: null,
  last_sign_in_at: '2026-11-10T12:00:00Z',
  added_at: '2026-11-01T12:00:00Z',
  added_by_email: 'admin@gdg.test',
  last_activity_at: null,
  assigned_events: [
    { assignment_id: 'a1', event_id: 'e1', title: 'DevFest', date_start: '2026-11-27T09:00:00Z' },
  ],
  ...overrides,
});

describe('toBackofficeUser', () => {
  it('convierte fechas y eventos asignados', () => {
    const user = toBackofficeUser(row());
    expect(user.lastSignInAt?.toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(user.lastActivityAt).toBeNull();
    expect(user.assignedEvents).toEqual([
      {
        assignmentId: 'a1',
        eventId: 'e1',
        title: 'DevFest',
        dateStart: new Date('2026-11-27T09:00:00Z'),
      },
    ]);
  });

  it('descarta eventos mal formados y trata un rol desconocido como STAFF', () => {
    const user = toBackofficeUser(row({ role: 'OTRO', assigned_events: [{ title: 'x' }, 3] }));
    expect(user.role).toBe('STAFF');
    expect(user.assignedEvents).toEqual([]);
  });
});

describe('toUsersError', () => {
  it('usa el mensaje en español de la base para las reglas de negocio', () => {
    const err = toUsersError({
      code: 'P0021',
      message: 'Ese correo ya tiene acceso al back-office.',
    });
    expect(err.message).toBe('Ese correo ya tiene acceso al back-office.');
    expect(err.code).toBe('DUPLICATE');
    expect(err.field).toBe('email');
  });

  it('cae al mapper general para el resto (sin exponer el texto crudo)', () => {
    const err = toUsersError({ code: '42501', message: 'permission denied for function x' });
    expect(err.message).toBe('No tienes permisos para realizar esta acción.');
  });
});
