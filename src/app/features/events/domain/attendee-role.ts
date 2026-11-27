import { StatusSeverity } from './registration-status';

/**
 * Rol de la entrada (`registrations.event_role`, lo da el cupón). Mismos valores que permite la base.
 * No confundir con el rol del back-office (Superadmin / Staff de check-in, en Usuarios).
 */
export type AttendeeRole = 'ATTENDEE' | 'SPEAKER' | 'SPONSOR' | 'MENTOR' | 'PARTNER' | 'STAFF';

export interface RoleOption {
  value: AttendeeRole;
  label: string;
  pluralLabel: string;
  /** Distinto del rojo de "Anulada" y del verde/ámbar de los estados de pago. */
  severity: StatusSeverity | 'info' | 'contrast';
  description: string;
}

export const ATTENDEE_ROLE_OPTIONS: readonly RoleOption[] = [
  {
    value: 'ATTENDEE',
    label: 'Asistente',
    pluralLabel: 'Asistentes',
    severity: 'secondary',
    description: 'Participa en el evento.',
  },
  {
    value: 'SPEAKER',
    label: 'Expositor',
    pluralLabel: 'Expositores',
    severity: 'info',
    description: 'Da una charla o taller.',
  },
  {
    value: 'SPONSOR',
    label: 'Sponsor',
    pluralLabel: 'Sponsors',
    severity: 'contrast',
    description: 'Representa a una empresa o institución que apoya el evento.',
  },
  {
    value: 'MENTOR',
    label: 'Mentor',
    pluralLabel: 'Mentores',
    severity: 'info',
    description: 'Acompaña y orienta a los participantes. No participa del sorteo.',
  },
  {
    value: 'PARTNER',
    label: 'Comunidad aliada',
    pluralLabel: 'Comunidades aliadas',
    severity: 'info',
    description: 'Viene de una comunidad aliada. Participa del sorteo.',
  },
  {
    value: 'STAFF',
    label: 'Staff',
    pluralLabel: 'Staff',
    severity: 'contrast',
    description:
      'Ayuda en el evento (moderación, asistencia técnica). No da acceso al back-office.',
  },
];

export function attendeeRoleOption(role: unknown): RoleOption | null {
  if (typeof role !== 'string') return null;
  const normalized = role.trim().toUpperCase();
  return ATTENDEE_ROLE_OPTIONS.find((o) => o.value === normalized) ?? null;
}

export function attendeeRoleLabel(role: unknown): string {
  return attendeeRoleOption(role)?.label ?? (typeof role === 'string' && role ? role : 'Asistente');
}

export function attendeeRoleSeverity(role: unknown): RoleOption['severity'] {
  return attendeeRoleOption(role)?.severity ?? 'secondary';
}
