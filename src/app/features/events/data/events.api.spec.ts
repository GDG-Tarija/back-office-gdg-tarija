import { TestBed } from '@angular/core/testing';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { EventsApi } from './events.api';

function row(i: number) {
  return {
    id: `r${i}`,
    event_id: 'e1',
    user_id: null,
    ticket_type_id: 't1',
    ticket_phase_id: null,
    coupon_id: null,
    event_role: 'ATTENDEE',
    status: 'PENDING',
    created_at: '2026-11-08T10:00:00Z',
    updated_at: null,
    custom_responses: null,
    payment_proof_url: null,
    users: null,
    ticket_types: { id: 't1', name: 'General', price: 10 },
    ticket_phases: null,
    event_coupons: null,
    scan_logs: [],
  };
}

describe('EventsApi.getAttendees', () => {
  function create(total: number) {
    const ranges: [number, number][] = [];
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: (from: number, to: number) => {
        ranges.push([from, to]);
        const data = Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) =>
          row(from + i),
        );
        return Promise.resolve({ data, error: null });
      },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: { from: () => query } }],
    });
    return { api: TestBed.inject(EventsApi), ranges };
  }

  it('pagina para superar el límite de 1000 filas de PostgREST', async () => {
    const { api, ranges } = create(2300);
    const list = await api.getAttendees('e1');
    expect(list).toHaveLength(2300);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('una sola consulta cuando cabe en una página', async () => {
    const { api, ranges } = create(3);
    expect(await api.getAttendees('e1')).toHaveLength(3);
    expect(ranges).toHaveLength(1);
  });

  it('con exactamente 1000 filas pide la página siguiente (vacía) y termina', async () => {
    const { api, ranges } = create(1000);
    expect(await api.getAttendees('e1')).toHaveLength(1000);
    expect(ranges).toHaveLength(2);
  });
});
