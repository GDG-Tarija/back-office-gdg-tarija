import { describe, expect, it } from 'vitest';

import {
  filterAttendees,
  getMatchedCustomResponses,
  matchesAttendeeSearch,
  normalizePhoneDigits,
  normalizeSearchText,
} from './attendee-search';
import { Attendee } from './event.model';

const baseAttendee: Attendee = {
  id: '00000000-0000-4000-8000-000000000101',
  userId: '00000000-0000-4000-8000-0000000000a4',
  email: 'ana@ejemplo.test',
  firstName: 'Ana María',
  lastName: 'Pérez',
  avatarUrl: null,
  phone: '+591 700-00001',
  role: 'ATTENDEE',
  status: 'CONFIRMED',
  ticketName: 'Entrada Gratuita',
  ticketPrice: 0,
  phaseName: null,
  phasePrice: null,
  couponId: null,
  couponCode: null,
  amountDue: 0,
  registeredAt: new Date('2026-10-01T10:00:00Z'),
  customResponses: {
    university: 'Universidad Católica Boliviana (UCB)',
    company: 'Tech Tarija',
    dietary_restrictions: 'Vegano',
    has_laptop: false,
  },
  paymentProofUrl: null,
  checkedIn: false,
};

const secondAttendee: Attendee = {
  ...baseAttendee,
  id: '00000000-0000-4000-8000-000000000202',
  userId: '00000000-0000-4000-8000-0000000000a7',
  email: 'diego@ejemplo.test',
  firstName: 'Diego',
  lastName: 'Developer',
  phone: '+59172233445',
  role: 'SPEAKER',
  ticketName: 'Elite Builder',
  customResponses: {
    discovery_source: 'centro de estudiantes',
    experience_level: 'senior',
    has_laptop: true,
  },
};

describe('attendee-search domain logic', () => {
  it('normaliza texto quitando tildes y espacios extra', () => {
    expect(normalizeSearchText('  Ana   María  Pérez ')).toBe('ana maria perez');
    expect(normalizePhoneDigits('+591 700-00001')).toBe('59170000001');
  });

  it('busca por nombre, apellido y nombre completo sin importar tildes', () => {
    expect(matchesAttendeeSearch(baseAttendee, 'ana')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, 'perez')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, 'Ana Maria Perez')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, 'diego')).toBe(false);
  });

  it('busca por correo e ID de inscripción o usuario', () => {
    expect(matchesAttendeeSearch(baseAttendee, 'ana@ejemplo.test')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, '00000101')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, '00000000-0000-4000-8000-000000000101')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, '000000a4')).toBe(true);
  });

  it('busca por celular con o sin prefijo de país o separadores', () => {
    expect(matchesAttendeeSearch(baseAttendee, '+591 700-00001')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, '70000001')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, '700 000 01')).toBe(true);
    expect(matchesAttendeeSearch(secondAttendee, '72233445')).toBe(true);
  });

  it('busca en las respuestas del formulario de inscripción (universidad, empresa, etc.)', () => {
    expect(matchesAttendeeSearch(baseAttendee, 'UCB')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, 'Catolica')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, 'Tech Tarija')).toBe(true);
    expect(matchesAttendeeSearch(baseAttendee, 'vegano')).toBe(true);
    // No debe hacer falso positivo con booleanos como false/true
    expect(matchesAttendeeSearch(baseAttendee, 'false')).toBe(false);
  });

  it('permite combinar nombre y dato de inscripción en una misma búsqueda', () => {
    const list = [baseAttendee, secondAttendee];
    expect(filterAttendees(list, 'Ana UCB')).toEqual([baseAttendee]);
    expect(filterAttendees(list, 'Diego senior')).toEqual([secondAttendee]);
    expect(filterAttendees(list, '')).toHaveLength(2);
  });

  it('extrae las respuestas del formulario que coincidieron con la búsqueda', () => {
    const matches = getMatchedCustomResponses(baseAttendee, 'ucb');
    expect(matches).toEqual([
      {
        key: 'university',
        label: 'Universidad / Colegio',
        value: 'Universidad Católica Boliviana (UCB)',
      },
    ]);
  });
});
