import { BackofficeUser } from './backoffice-user.model';
import {
  canChangeRole,
  canRemove,
  displayName,
  filterUsers,
  initials,
  roleOption,
  validateNewUserEmail,
} from './user-rules';

const user = (overrides: Partial<BackofficeUser>): BackofficeUser => ({
  email: 'persona@gdg.test',
  role: 'STAFF',
  userId: null,
  firstName: null,
  lastName: null,
  avatarUrl: null,
  lastSignInAt: null,
  addedAt: null,
  addedByEmail: null,
  lastActivityAt: null,
  assignedEvents: [],
  ...overrides,
});

describe('validateNewUserEmail', () => {
  it('pide un correo y lo valida con el mismo criterio que la base', () => {
    expect(validateNewUserEmail('   ', [])).toBe('Escribe el correo de la persona.');
    expect(validateNewUserEmail('sin-arroba', [])).toBe('Escribe un correo válido.');
    expect(validateNewUserEmail('a@b', [])).toBe('Escribe un correo válido.');
    expect(validateNewUserEmail(' Nueva@GDG.test ', [])).toBeNull();
  });

  it('rechaza un correo que ya tiene acceso, sin importar mayúsculas ni espacios', () => {
    expect(validateNewUserEmail(' PERSONA@gdg.test', ['persona@gdg.test'])).toBe(
      'Ese correo ya tiene acceso al back-office.',
    );
  });
});

describe('canChangeRole / canRemove', () => {
  const admin = user({ email: 'admin@gdg.test', role: 'SUPERADMIN' });
  const otherAdmin = user({ email: 'admin2@gdg.test', role: 'SUPERADMIN' });
  const staff = user({ email: 'puerta@gdg.test' });

  it('nadie cambia su propio rol ni se quita el acceso', () => {
    expect(canChangeRole(admin, 'ADMIN@gdg.test')).toEqual({
      ok: false,
      reason: 'No puedes cambiar tu propio rol.',
    });
    expect(canRemove(admin, 'admin@gdg.test', [admin, otherAdmin])).toEqual({
      ok: false,
      reason: 'No puedes quitarte el acceso a ti mismo.',
    });
  });

  it('permite actuar sobre otras personas', () => {
    expect(canChangeRole(staff, 'admin@gdg.test')).toEqual({ ok: true });
    expect(canRemove(otherAdmin, 'admin@gdg.test', [admin, otherAdmin, staff])).toEqual({
      ok: true,
    });
  });

  it('no deja quitar al último superadmin', () => {
    expect(canRemove(admin, 'puerta@gdg.test', [admin, staff])).toEqual({
      ok: false,
      reason: 'Debe quedar al menos un superadministrador.',
    });
  });
});

describe('presentación', () => {
  it('muestra el nombre o, si nunca entró, el correo', () => {
    expect(displayName(user({ firstName: 'Ana', lastName: 'Paz' }))).toBe('Ana Paz');
    expect(displayName(user({}))).toBe('persona@gdg.test');
    expect(initials(user({ firstName: 'Ana', lastName: 'Paz' }))).toBe('AP');
    expect(initials(user({}))).toBe('P');
  });

  it('el STAFF del back-office se llama "Staff de check-in" para no confundirlo con el rol de evento', () => {
    expect(roleOption('STAFF').label).toBe('Staff de check-in');
    expect(roleOption('SUPERADMIN').label).toBe('Superadmin');
  });
});

describe('filterUsers', () => {
  const users = [
    user({ email: 'ana@gdg.test', firstName: 'Ana', lastName: 'Paz', role: 'SUPERADMIN' }),
    user({ email: 'beto@gdg.test', firstName: 'Beto', lastName: 'Rojas' }),
  ];

  it('busca por nombre o correo y filtra por rol', () => {
    expect(filterUsers(users, { query: 'rojas', role: null }).map((u) => u.email)).toEqual([
      'beto@gdg.test',
    ]);
    expect(filterUsers(users, { query: 'ANA@', role: null }).map((u) => u.email)).toEqual([
      'ana@gdg.test',
    ]);
    expect(filterUsers(users, { query: '', role: 'STAFF' }).map((u) => u.email)).toEqual([
      'beto@gdg.test',
    ]);
  });
});
