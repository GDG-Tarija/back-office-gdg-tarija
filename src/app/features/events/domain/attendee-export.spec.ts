import { describe, expect, it } from 'vitest';

import { buildAttendeeExport, formatExportDate, toCsv } from './attendee-export';
import { Attendee } from './event.model';
import { FormField } from './form-field.model';

const attendee: Attendee = {
  id: 'r1',
  userId: null,
  email: 'ana@ejemplo.test',
  firstName: 'Ana',
  lastName: 'Pérez',
  avatarUrl: null,
  phone: '+59170000001',
  role: 'ORGANIZER',
  status: 'CANCELLED',
  ticketName: 'General',
  ticketPrice: 10,
  phaseName: 'Normal',
  phasePrice: 10,
  couponId: null,
  couponCode: null,
  amountDue: 10,
  registeredAt: new Date(2026, 10, 5, 9, 7),
  customResponses: { talla: 'M', trae_laptop: true, vieja: '=cmd' },
  paymentProofUrl: null,
  checkedIn: false,
};

const fields: FormField[] = [
  { key: 'talla', label: 'Talla de polera', type: 'text', required: false },
  { key: 'trae_laptop', label: '¿Traes laptop?', type: 'checkbox', required: false },
];

describe('attendee-export', () => {
  it('usa encabezados en español y las etiquetas reales del formulario', () => {
    const { headers } = buildAttendeeExport([attendee], fields);
    expect(headers.slice(0, 3)).toEqual(['Nombre', 'Apellido', 'Correo']);
    expect(headers).toContain('Talla de polera');
    expect(headers).toContain('¿Traes laptop?');
    expect(headers.every((h) => !/_/.test(h))).toBe(true);
  });

  it('traduce rol, estado y booleanos y formatea fechas locales', () => {
    const { headers, rows } = buildAttendeeExport([attendee], fields);
    const row = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]));
    expect(row['Rol']).toBe('Organizador');
    expect(row['Estado']).toBe('Anulada');
    expect(row['Entrada']).toBe('General · Normal');
    expect(row['Fecha de inscripción']).toBe('05/11/2026 09:07');
    expect(row['¿Traes laptop?']).toBe('Sí');
  });

  it('conserva las respuestas que ya no están en el formulario', () => {
    const { headers } = buildAttendeeExport([attendee], fields);
    expect(headers).toContain('Vieja');
  });

  it('neutraliza fórmulas y escapa comas al armar el CSV', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['=1+1', 'uno, dos']] });
    expect(csv).toBe('a,b\n\'=1+1,"uno, dos"');
  });

  it('devuelve cadena vacía para fechas inválidas', () => {
    expect(formatExportDate(null)).toBe('');
    expect(formatExportDate(new Date('x'))).toBe('');
  });
});
