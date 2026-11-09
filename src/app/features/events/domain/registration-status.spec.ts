import {
  REGISTRATION_STATUS_OPTIONS,
  blocksAttendance,
  checkStatusChange,
  countByRegistrationStatus,
  filterByRegistrationStatus,
  isRegistrationStatus,
  parseRegistrationStatus,
  registrationStatusLabel,
  registrationStatusSeverity,
} from './registration-status';

const rows = [
  { id: '1', status: 'CONFIRMED' },
  { id: '2', status: 'PENDING' },
  { id: '3', status: 'CANCELLED' },
  { id: '4', status: 'confirmed' },
  { id: '5', status: 'REGISTERED' },
];

describe('registration-status', () => {
  it('expone exactamente los tres valores del CHECK de la BD', () => {
    expect(REGISTRATION_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'CONFIRMED',
      'PENDING',
      'CANCELLED',
    ]);
    expect(isRegistrationStatus('CONFIRMED')).toBe(true);
    expect(isRegistrationStatus('confirmed')).toBe(false);
    expect(isRegistrationStatus('PAID')).toBe(false);
    expect(isRegistrationStatus(null)).toBe(false);
  });

  it('normaliza mayúsculas y espacios, y rechaza valores desconocidos', () => {
    expect(parseRegistrationStatus(' pending ')).toBe('PENDING');
    expect(parseRegistrationStatus('Cancelled')).toBe('CANCELLED');
    expect(parseRegistrationStatus('REGISTERED')).toBeNull();
    expect(parseRegistrationStatus(42)).toBeNull();
  });

  it('traduce etiquetas y severidades con fallback seguro', () => {
    expect(registrationStatusLabel('CONFIRMED')).toBe('Pagada / Confirmada');
    expect(registrationStatusLabel('PENDING')).toBe('Pendiente de pago');
    expect(registrationStatusLabel('CANCELLED')).toBe('Anulada');
    expect(registrationStatusLabel('REGISTERED')).toBe('REGISTERED');
    expect(registrationStatusLabel('')).toBe('Desconocido');
    expect(registrationStatusSeverity('CONFIRMED')).toBe('success');
    expect(registrationStatusSeverity('PENDING')).toBe('warn');
    expect(registrationStatusSeverity('CANCELLED')).toBe('danger');
    expect(registrationStatusSeverity('otro')).toBe('secondary');
  });

  describe('checkStatusChange', () => {
    it('PENDING -> CONFIRMED sin confirmación', () => {
      expect(checkStatusChange('PENDING', 'CONFIRMED')).toEqual({
        ok: true,
        next: 'CONFIRMED',
        requiresConfirmation: false,
      });
    });

    it('CONFIRMED -> PENDING sin confirmación', () => {
      expect(checkStatusChange('CONFIRMED', 'PENDING')).toEqual({
        ok: true,
        next: 'PENDING',
        requiresConfirmation: false,
      });
    });

    it('anular siempre pide confirmación', () => {
      expect(checkStatusChange('PENDING', 'CANCELLED')).toMatchObject({
        ok: true,
        requiresConfirmation: true,
      });
      expect(checkStatusChange('CONFIRMED', 'CANCELLED')).toMatchObject({
        ok: true,
        requiresConfirmation: true,
      });
    });

    it('permite restaurar desde CANCELLED a cualquiera de los otros estados', () => {
      expect(checkStatusChange('CANCELLED', 'CONFIRMED')).toMatchObject({
        ok: true,
        next: 'CONFIRMED',
      });
      expect(checkStatusChange('CANCELLED', 'PENDING')).toMatchObject({
        ok: true,
        next: 'PENDING',
      });
    });

    it('rechaza valores no válidos', () => {
      for (const bad of ['PAID', 'REGISTERED', '', null, undefined, 1]) {
        expect(checkStatusChange('PENDING', bad)).toEqual({
          ok: false,
          reason: 'INVALID',
          message: 'Estado de inscripción no válido.',
        });
      }
    });

    it('no considera cambio pasar al mismo estado (aunque difiera en mayúsculas)', () => {
      expect(checkStatusChange('confirmed', 'CONFIRMED')).toMatchObject({
        ok: false,
        reason: 'UNCHANGED',
      });
    });

    it('acepta salir de un estado heredado desconocido', () => {
      expect(checkStatusChange('REGISTERED', 'PENDING')).toMatchObject({ ok: true });
    });
  });

  it('filtra por estado sin mutar la lista original', () => {
    expect(filterByRegistrationStatus(rows, 'ALL').map((r) => r.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(filterByRegistrationStatus(rows, 'CONFIRMED').map((r) => r.id)).toEqual(['1', '4']);
    expect(filterByRegistrationStatus(rows, 'PENDING').map((r) => r.id)).toEqual(['2']);
    expect(filterByRegistrationStatus(rows, 'CANCELLED').map((r) => r.id)).toEqual(['3']);
    expect(filterByRegistrationStatus(rows, 'ALL')).not.toBe(rows);
    expect(rows).toHaveLength(5);
  });

  it('cuenta por estado ignorando valores desconocidos', () => {
    expect(countByRegistrationStatus(rows)).toEqual({ CONFIRMED: 2, PENDING: 1, CANCELLED: 1 });
    expect(countByRegistrationStatus([])).toEqual({ CONFIRMED: 0, PENDING: 0, CANCELLED: 0 });
  });

  it('solo CANCELLED bloquea la asistencia (PENDING sigue las reglas de cada flujo)', () => {
    expect(blocksAttendance('CANCELLED')).toBe(true);
    expect(blocksAttendance('cancelled')).toBe(true);
    expect(blocksAttendance('PENDING')).toBe(false);
    expect(blocksAttendance('CONFIRMED')).toBe(false);
  });
});
