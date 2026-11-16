import { BackofficeRole } from '../../../core/models/role.model';
import { BackofficeUser } from './backoffice-user.model';

export interface RoleOption {
  value: BackofficeRole;
  label: string;
  description: string;
  icon: string;
}

/**
 * "Staff de check-in" y no "Staff": el rol de evento "Staff" (cupón) es otra cosa y no da acceso.
 */
export const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    value: 'SUPERADMIN',
    label: 'Superadmin',
    description: 'Ve y gestiona todo: eventos, inscripciones, pagos y usuarios.',
    icon: 'admin_panel_settings',
  },
  {
    value: 'STAFF',
    label: 'Staff de check-in',
    description: 'Hace check-in y ve asistentes solo en los eventos que tiene asignados.',
    icon: 'qr_code_scanner',
  },
];

export function roleOption(role: BackofficeRole): RoleOption {
  return ROLE_OPTIONS.find((o) => o.value === role) ?? ROLE_OPTIONS[1];
}

// Mismo criterio que add_backoffice_user en la base.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Mensaje de error del correo nuevo, o null si se puede agregar. */
export function validateNewUserEmail(email: string, existing: readonly string[]): string | null {
  const clean = normalizeEmail(email);
  if (!clean) return 'Escribe el correo de la persona.';
  if (!EMAIL_RE.test(clean)) return 'Escribe un correo válido.';
  if (existing.some((e) => normalizeEmail(e) === clean)) {
    return 'Ese correo ya tiene acceso al back-office.';
  }
  return null;
}

export type RuleCheck = { ok: true } | { ok: false; reason: string };

const isSelf = (target: Pick<BackofficeUser, 'email'>, currentEmail: string | null) =>
  !!currentEmail && normalizeEmail(target.email) === normalizeEmail(currentEmail);

/** Replica las reglas de set_backoffice_user_role para avisar antes de enviar. */
export function canChangeRole(
  target: Pick<BackofficeUser, 'email'>,
  currentEmail: string | null,
): RuleCheck {
  if (isSelf(target, currentEmail))
    return { ok: false, reason: 'No puedes cambiar tu propio rol.' };
  return { ok: true };
}

/** Replica las reglas de remove_backoffice_user para avisar antes de enviar. */
export function canRemove(
  target: Pick<BackofficeUser, 'email' | 'role'>,
  currentEmail: string | null,
  users: readonly Pick<BackofficeUser, 'role'>[],
): RuleCheck {
  if (isSelf(target, currentEmail)) {
    return { ok: false, reason: 'No puedes quitarte el acceso a ti mismo.' };
  }
  const superadmins = users.filter((u) => u.role === 'SUPERADMIN').length;
  if (target.role === 'SUPERADMIN' && superadmins <= 1) {
    return { ok: false, reason: 'Debe quedar al menos un superadministrador.' };
  }
  return { ok: true };
}

export function displayName(u: Pick<BackofficeUser, 'firstName' | 'lastName' | 'email'>): string {
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
}

export function initials(u: Pick<BackofficeUser, 'firstName' | 'lastName' | 'email'>): string {
  const fromName = `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  return fromName || (u.email[0] ?? '?').toUpperCase();
}

export interface UserFilters {
  query: string;
  role: BackofficeRole | null;
}

export function filterUsers(
  users: readonly BackofficeUser[],
  { query, role }: UserFilters,
): BackofficeUser[] {
  const q = query.trim().toLowerCase();
  return users.filter((u) => {
    if (role && u.role !== role) return false;
    if (!q) return true;
    return `${displayName(u)} ${u.email}`.toLowerCase().includes(q);
  });
}
