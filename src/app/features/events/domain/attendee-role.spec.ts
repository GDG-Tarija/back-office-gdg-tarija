import { describe, expect, it } from 'vitest';

import {
  ATTENDEE_ROLE_OPTIONS,
  attendeeRoleLabel,
  attendeeRoleOption,
  attendeeRoleSeverity,
} from './attendee-role';
import { REGISTRATION_STATUS_OPTIONS } from './registration-status';

describe('attendee-role', () => {
  it('nombra cada rol sin mezclar Organizador con Staff', () => {
    expect(attendeeRoleLabel('ORGANIZER')).toBe('Organizador');
    expect(attendeeRoleLabel('staff')).toBe('Staff');
    expect(attendeeRoleLabel('SPEAKER')).toBe('Expositor');
    expect(attendeeRoleLabel('VOLUNTEER')).toBe('Voluntario');
    expect(attendeeRoleLabel('ATTENDEE')).toBe('Asistente');
  });

  it('usa el valor tal cual si el rol no se conoce y Asistente si falta', () => {
    expect(attendeeRoleLabel('SPONSOR')).toBe('SPONSOR');
    expect(attendeeRoleLabel(undefined)).toBe('Asistente');
    expect(attendeeRoleOption('SPONSOR')).toBeNull();
  });

  it('ningún rol reutiliza el color de un estado de inscripción', () => {
    const statusSeverities = new Set(REGISTRATION_STATUS_OPTIONS.map((o) => o.severity));
    for (const role of ATTENDEE_ROLE_OPTIONS) {
      if (role.severity === 'secondary') continue;
      expect(statusSeverities.has(role.severity as never)).toBe(false);
    }
    expect(attendeeRoleSeverity('STAFF')).not.toBe('danger');
  });
});
