import { TestBed } from '@angular/core/testing';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { CheckinApi } from './checkin.api';

const REG_ID = '00000000-0000-4000-8000-000000000201';
const EVENT_ID = '00000000-0000-4000-8000-0000000000e2';
const SESSION_ID = 'd3d3d3d3-0000-4000-8000-000000000003';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * Supabase falso por tabla: cada `from(tabla)` devuelve una cadena encadenable cuyo
 * resultado final (maybeSingle / insert / update) sale de `results[tabla]`.
 */
function fakeSupabase(results: {
  registration: Result;
  existingScan?: Result;
  sessionRegistration?: Result;
  insertScan?: Result;
  deleteScan?: Result;
}) {
  const inserts: unknown[] = [];
  const deletes: string[] = [];
  const legacyUpdates: unknown[] = [];
  const chain = (final: () => Result) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) c[m] = vi.fn(() => c);
    c['maybeSingle'] = vi.fn(() => Promise.resolve(final()));
    return c;
  };
  const from = vi.fn((table: string) => {
    switch (table) {
      case 'registrations':
        return chain(() => results.registration);
      case 'session_registrations':
        return chain(() => results.sessionRegistration ?? { data: null, error: null });
      case 'scan_logs':
        return {
          ...chain(() => results.existingScan ?? { data: null, error: null }),
          insert: vi.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve(results.insertScan ?? { data: null, error: null });
          }),
          delete: vi.fn(() => {
            const c = {
              eq: vi.fn((_col: string, id: string) => {
                deletes.push(id);
                return c;
              }),
              select: vi.fn(() =>
                Promise.resolve(results.deleteScan ?? { data: [{ id: 'x' }], error: null }),
              ),
            };
            return c;
          }),
        };
      case 'inscripciones_sessions':
        return {
          update: vi.fn((row: unknown) => {
            legacyUpdates.push(row);
            const c = {
              eq: vi.fn(() => c),
              then: (r: (v: Result) => void) => r({ data: null, error: null }),
            };
            return c;
          }),
        };
      default:
        throw new Error(`tabla inesperada ${table}`);
    }
  });
  return { client: { from }, inserts, legacyUpdates, deletes };
}

function registration(status: string) {
  return {
    data: {
      id: REG_ID,
      event_id: EVENT_ID,
      user_id: 'u1',
      event_role: 'ATTENDEE',
      status,
      ticket_types: { name: 'Ticket Básico' },
      users: { first_name: 'Ana', last_name: 'Asistente', email: 'ana@ejemplo.test' },
    },
    error: null,
  };
}

describe('CheckinApi — estado de la inscripción', () => {
  function setup(results: Parameters<typeof fakeSupabase>[0]) {
    const fake = fakeSupabase(results);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake.client }] });
    return { api: TestBed.inject(CheckinApi), ...fake };
  }

  it.each(['checkin', 'refrigerio', 'session'] as const)(
    'CANCELLED no registra asistencia (%s) y lo explica',
    async (mode) => {
      const { api, inserts } = setup({ registration: registration('CANCELLED') });
      const result = await api.registerScan(
        REG_ID,
        EVENT_ID,
        mode,
        mode === 'session' ? SESSION_ID : null,
        'op1',
      );
      expect(result.success).toBe(false);
      expect(result.reason).toBe('cancelled');
      expect(result.message).toBe('La inscripción está anulada. No puede registrar asistencia.');
      expect(inserts).toHaveLength(0);
    },
  );

  it('PENDING sigue rechazado por el QR, como antes', async () => {
    const { api, inserts } = setup({ registration: registration('PENDING') });
    const result = await api.registerScan(REG_ID, EVENT_ID, 'checkin', null, 'op1');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('pending');
    expect(result.message).toContain('pendiente de pago');
    expect(inserts).toHaveLength(0);
  });

  it('CONFIRMED registra check-in', async () => {
    const { api, inserts } = setup({ registration: registration('CONFIRMED') });
    const result = await api.registerScan(REG_ID, EVENT_ID, 'checkin', null, 'op1');
    expect(result.success).toBe(true);
    expect(inserts).toEqual([
      expect.objectContaining({ registration_id: REG_ID, scan_type: 'checkin', scanned_by: 'op1' }),
    ]);
    expect(result.scanLogId).toBeTruthy();
    expect(inserts[0]).toMatchObject({ id: result.scanLogId });
  });

  it('CONFIRMED registra ingreso a sesión si está inscrito en ella', async () => {
    const { api, inserts, legacyUpdates } = setup({
      registration: registration('CONFIRMED'),
      sessionRegistration: { data: { registration_id: REG_ID }, error: null },
    });
    const result = await api.registerScan(REG_ID, EVENT_ID, 'session', SESSION_ID, 'op1');
    expect(result.success).toBe(true);
    expect(inserts).toEqual([
      expect.objectContaining({ scan_type: `session_entry:${SESSION_ID.substring(0, 16)}` }),
    ]);
    expect(legacyUpdates).toHaveLength(1);
  });

  it('un escaneo duplicado sigue rechazado', async () => {
    const { api, inserts } = setup({
      registration: registration('CONFIRMED'),
      existingScan: { data: { id: 's1', scanned_at: '2026-11-07T12:00:00Z' }, error: null },
    });
    const result = await api.registerScan(REG_ID, EVENT_ID, 'refrigerio', null, 'op1');
    expect(result.success).toBe(false);
    expect(result.alreadyScanned).toBe(true);
    expect(result.reason).toBe('already_scanned');
    expect(inserts).toHaveLength(0);
  });

  it('si la BD rechaza el insert (p. ej. anulada entre la lectura y el guardado), no hay éxito', async () => {
    const { api, legacyUpdates } = setup({
      registration: registration('CONFIRMED'),
      sessionRegistration: { data: { registration_id: REG_ID }, error: null },
      insertScan: {
        data: null,
        error: {
          code: 'P0001',
          message: 'La inscripción está anulada: no se puede registrar asistencia.',
        },
      },
    });
    const result = await api.registerScan(REG_ID, EVENT_ID, 'session', SESSION_ID, 'op1');
    expect(result.success).toBe(false);
    expect(legacyUpdates).toHaveLength(0);
  });
});

describe('CheckinApi — deshacer', () => {
  function setup(results: Parameters<typeof fakeSupabase>[0]) {
    const fake = fakeSupabase(results);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake.client }] });
    return { api: TestBed.inject(CheckinApi), ...fake };
  }

  it('borra el registro por id', async () => {
    const { api, deletes } = setup({ registration: registration('CONFIRMED') });
    const result = await api.undoScan({
      scanLogId: 'log-1',
      mode: 'checkin',
      sessionId: null,
      userId: null,
    });
    expect(result.ok).toBe(true);
    expect(deletes).toEqual(['log-1']);
  });

  it('si RLS no deja borrar (pasaron más de 60 s o no es suyo) lo explica', async () => {
    const { api } = setup({
      registration: registration('CONFIRMED'),
      deleteScan: { data: [], error: null },
    });
    const result = await api.undoScan({
      scanLogId: 'log-1',
      mode: 'checkin',
      sessionId: null,
      userId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Ya no se puede deshacer');
  });

  it('en sesión también revierte la asistencia sincronizada', async () => {
    const { api, legacyUpdates } = setup({ registration: registration('CONFIRMED') });
    const result = await api.undoScan({
      scanLogId: 'log-1',
      mode: 'session',
      sessionId: SESSION_ID,
      userId: 'u1',
    });
    expect(result.ok).toBe(true);
    expect(legacyUpdates).toEqual([{ asistio: false, checked_in_at: null }]);
  });

  it('un error de la base no se reporta como éxito', async () => {
    const { api } = setup({
      registration: registration('CONFIRMED'),
      deleteScan: { data: null, error: { code: '500', message: 'boom' } },
    });
    const result = await api.undoScan({
      scanLogId: 'log-1',
      mode: 'checkin',
      sessionId: null,
      userId: null,
    });
    expect(result.ok).toBe(false);
  });
});
