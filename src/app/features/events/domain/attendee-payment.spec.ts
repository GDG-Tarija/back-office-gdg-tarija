import { describe, it, expect } from 'vitest';

import {
  AttendeeFilters,
  EMPTY_FILTERS,
  attendeeFiltersToParams,
  parseAttendeeFilters,
  attendeeFullName,
  attendeeInitials,
  computeAmountDue,
  computeStats,
  entryKey,
  entryLabel,
  expectsProof,
  filterAttendees,
  hasActiveFilters,
  isImageProof,
} from './attendee-payment';
import { Attendee } from './event.model';

function make(overrides: Partial<Attendee> = {}): Attendee {
  return {
    id: 'r1',
    userId: 'u1',
    email: 'ana@x.com',
    firstName: 'Ana',
    lastName: 'Pérez',
    avatarUrl: null,
    phone: null,
    role: 'ATTENDEE',
    status: 'PENDING',
    ticketName: 'Entrada de Pago',
    ticketPrice: 15,
    phaseName: null,
    phasePrice: null,
    couponId: null,
    couponCode: null,
    amountDue: 15,
    registeredAt: null,
    customResponses: null,
    paymentProofUrl: null,
    checkedIn: false,
    ...overrides,
  };
}

describe('computeAmountDue', () => {
  it('prioriza cupón, luego fase, luego paquete', () => {
    expect(computeAmountDue({ couponId: 'c', phasePrice: 20, packagePrice: 15 })).toBe(0);
    expect(computeAmountDue({ couponId: null, phasePrice: 20, packagePrice: 15 })).toBe(20);
    expect(computeAmountDue({ couponId: null, phasePrice: 0, packagePrice: 15 })).toBe(0);
    expect(computeAmountDue({ couponId: null, phasePrice: null, packagePrice: 15 })).toBe(15);
  });
});

describe('entryLabel', () => {
  it('agrega la fase cuando existe', () => {
    expect(entryLabel(make({ phaseName: 'Normal' }))).toBe('Entrada de Pago · Normal');
    expect(entryLabel(make())).toBe('Entrada de Pago');
  });
});

describe('isImageProof', () => {
  it('detecta imágenes por extensión o bucket público, ignorando query', () => {
    expect(isImageProof('https://x/a.PNG?t=1')).toBe(true);
    expect(isImageProof('https://x/storage/v1/object/public/proofs/abc')).toBe(true);
    expect(isImageProof('https://x/comprobante.pdf')).toBe(false);
    expect(isImageProof('https://x/storage/v1/object/public/proofs/a.pdf')).toBe(false);
    expect(isImageProof(null)).toBe(false);
  });
});

describe('nombres', () => {
  it('cae al correo cuando no hay nombre', () => {
    const a = make({ firstName: '', lastName: '' });
    expect(attendeeFullName(a)).toBe('ana@x.com');
    expect(attendeeInitials(a)).toBe('A');
    expect(attendeeInitials(make())).toBe('AP');
  });
});

describe('filterAttendees', () => {
  const list = [
    make({ id: 'a', status: 'PENDING', phaseName: 'Preventa', paymentProofUrl: 'https://x/p.png' }),
    make({ id: 'b', status: 'CONFIRMED', phaseName: 'Normal', checkedIn: true, firstName: 'José' }),
    make({ id: 'c', status: 'CANCELLED', role: 'SPEAKER', ticketName: 'Invitado' }),
  ];

  it('sin filtros devuelve todo', () => {
    expect(filterAttendees(list, EMPTY_FILTERS)).toHaveLength(3);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('filtra por estado, rol, check-in y comprobante', () => {
    const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
      filterAttendees(list, { ...EMPTY_FILTERS, ...f }).map((a) => a.id);
    expect(ids({ status: 'PENDING' })).toEqual(['a']);
    expect(ids({ role: 'SPEAKER' })).toEqual(['c']);
    expect(ids({ checkin: 'CHECKED_IN' })).toEqual(['b']);
    expect(ids({ checkin: 'NOT_CHECKED_IN' })).toEqual(['a', 'c']);
    expect(ids({ proof: 'WITH_PROOF' })).toEqual(['a']);
    expect(ids({ proof: 'WITHOUT_PROOF' })).toEqual(['b', 'c']);
  });

  it('filtra por paquete + fase', () => {
    const key = entryKey(list[1]);
    expect(filterAttendees(list, { ...EMPTY_FILTERS, entry: key }).map((a) => a.id)).toEqual(['b']);
  });

  it('busca sin acentos, por fase y con varios términos', () => {
    const ids = (search: string) =>
      filterAttendees(list, { ...EMPTY_FILTERS, search }).map((a) => a.id);
    expect(ids('jose')).toEqual(['b']);
    expect(ids('preventa')).toEqual(['a']);
    expect(ids('ana normal')).toEqual(['b']);
    expect(ids('zzz')).toEqual([]);
  });
});

describe('computeStats', () => {
  it('cuenta por estado y no cuenta check-ins de cancelados', () => {
    const stats = computeStats([
      make({ status: 'CONFIRMED', checkedIn: true }),
      make({ status: 'CONFIRMED' }),
      make({ status: 'PENDING' }),
      make({ status: 'CANCELLED', checkedIn: true }),
    ]);
    expect(stats).toMatchObject({
      total: 4,
      confirmed: 2,
      pending: 1,
      cancelled: 1,
      checkedIn: 1,
      active: 3,
      checkinRate: 50,
    });
  });
});

describe('expectsProof', () => {
  it('solo asistentes que deben pagar', () => {
    expect(expectsProof(make())).toBe(true);
    expect(expectsProof(make({ amountDue: 0 }))).toBe(false);
    expect(expectsProof(make({ role: 'SPEAKER' }))).toBe(false);
  });
});

describe('filtros en la URL', () => {
  const params = (q: string) => new URLSearchParams(q);

  it('ida y vuelta de todos los filtros', () => {
    const filters: AttendeeFilters = {
      search: 'ana',
      status: 'PENDING',
      role: 'STAFF',
      checkin: 'NOT_CHECKED_IN',
      entry: 'General · Normal',
      proof: 'WITH_PROOF',
    };
    const out = attendeeFiltersToParams(filters);
    expect(out['estado']).toBe('pendiente');
    const search = new URLSearchParams(
      Object.entries(out).filter((e): e is [string, string] => e[1] !== null),
    );
    expect(parseAttendeeFilters(search)).toEqual(filters);
  });

  it('los valores por defecto no ensucian la URL', () => {
    expect(Object.values(attendeeFiltersToParams(EMPTY_FILTERS)).every((v) => v === null)).toBe(
      true,
    );
  });

  it('ignora valores desconocidos', () => {
    expect(parseAttendeeFilters(params('estado=zzz&rol=otro&checkin=x&comprobante=y'))).toEqual(
      EMPTY_FILTERS,
    );
  });

  it('acepta el enlace del dashboard (?estado=pendiente&comprobante=con)', () => {
    const f = parseAttendeeFilters(params('estado=pendiente&comprobante=con'));
    expect(f.status).toBe('PENDING');
    expect(f.proof).toBe('WITH_PROOF');
  });
});
