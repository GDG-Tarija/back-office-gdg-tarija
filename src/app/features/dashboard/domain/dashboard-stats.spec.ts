import { describe, expect, it } from 'vitest';

import { DashboardEvent, DashboardRegistration } from './dashboard.model';
import {
  capacityFillRate,
  computeCashFlow,
  dailyTrend,
  draftEvents,
  filterEvents,
  filterRegistrations,
  proofsToReview,
  roleDistribution,
  statusDistribution,
  upcomingEvents,
} from './dashboard-stats';

const NOW = new Date(2026, 10, 14, 10, 0);

function event(over: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    id: 'e1',
    title: 'DevFest',
    eventType: 'CONFERENCE',
    capacity: 10,
    dateStart: new Date(2026, 10, 16, 9, 0),
    dateEnd: null,
    isPublished: true,
    category: null,
    ...over,
  };
}

function reg(over: Partial<DashboardRegistration> = {}): DashboardRegistration {
  return {
    id: 'r1',
    eventId: 'e1',
    role: 'ATTENDEE',
    status: 'CONFIRMED',
    amountDue: 20,
    hasProof: true,
    createdAt: NOW,
    ...over,
  };
}

describe('computeCashFlow', () => {
  it('separa cobrado y por cobrar sin sumarlos', () => {
    const flow = computeCashFlow([
      reg({ amountDue: 20 }),
      reg({ amountDue: 30, status: 'PENDING' }),
      reg({ amountDue: 50, status: 'CANCELLED' }),
    ]);
    expect(flow).toEqual({ collected: 20, receivable: 30 });
  });

  it('ignora roles que no pagan', () => {
    expect(computeCashFlow([reg({ role: 'SPEAKER', amountDue: 20 })])).toEqual({
      collected: 0,
      receivable: 0,
    });
  });
});

describe('proofsToReview', () => {
  it('cuenta pendientes de pago con comprobante, por evento', () => {
    const regs = [
      reg({ status: 'PENDING' }),
      reg({ status: 'PENDING' }),
      reg({ status: 'PENDING', hasProof: false }),
      reg({ status: 'CONFIRMED' }),
      reg({ status: 'CANCELLED' }),
    ];
    expect(proofsToReview([event()], regs)).toEqual([
      { eventId: 'e1', title: 'DevFest', count: 2 },
    ]);
  });

  it('usa el mismo criterio que el filtro de Asistentes: cuenta cualquier rol y monto', () => {
    const regs = [
      reg({ status: 'PENDING', role: 'SPEAKER' }),
      reg({ status: 'PENDING', amountDue: 0 }),
    ];
    expect(proofsToReview([event()], regs)[0].count).toBe(2);
  });
});

describe('upcomingEvents', () => {
  it('incluye hoy y 7 días, descarta lejanos, borradores y pasados', () => {
    const events = [
      event({ id: 'a', dateStart: new Date(2026, 10, 14, 18, 0) }),
      event({ id: 'b', dateStart: new Date(2026, 10, 21, 8, 0) }),
      event({ id: 'c', dateStart: new Date(2026, 10, 22, 8, 0) }),
      event({ id: 'd', dateStart: new Date(2026, 10, 15), isPublished: false }),
      event({ id: 'e', dateStart: new Date(2026, 10, 10) }),
    ];
    const result = upcomingEvents(events, [], NOW);
    expect(result.map((u) => u.event.id)).toEqual(['a', 'b']);
    expect(result[0].isToday).toBe(true);
    expect(result[1].isToday).toBe(false);
  });

  it('un evento de varios días en curso cuenta como hoy', () => {
    const multi = event({ dateStart: new Date(2026, 10, 13), dateEnd: new Date(2026, 10, 15) });
    expect(upcomingEvents([multi], [], NOW)[0].isToday).toBe(true);
  });

  it('cuenta asistentes activos', () => {
    const regs = [reg(), reg({ status: 'PENDING' }), reg({ status: 'CANCELLED' })];
    expect(upcomingEvents([event()], regs, NOW)[0].registered).toBe(2);
  });
});

describe('draftEvents', () => {
  it('devuelve los no publicados', () => {
    expect(draftEvents([event(), event({ id: 'x', isPublished: false })]).map((e) => e.id)).toEqual(
      ['x'],
    );
  });
});

describe('capacityFillRate', () => {
  it('excluye anuladas y roles no asistentes', () => {
    const regs = [reg(), reg({ status: 'CANCELLED' }), reg({ role: 'SPEAKER' })];
    expect(capacityFillRate([event({ capacity: 4 })], regs)).toBe(0.25);
  });

  it('es 0 sin capacidad', () => {
    expect(capacityFillRate([event({ capacity: 0 })], [reg()])).toBe(0);
  });
});

describe('dailyTrend', () => {
  it('termina hoy con 7 días aunque no haya datos recientes', () => {
    const trend = dailyTrend([reg({ createdAt: new Date(2026, 9, 1) })], NOW);
    expect(trend).toHaveLength(7);
    expect(trend[6].label).toBe('14/11');
    expect(trend[0].label).toBe('8/11');
    expect(trend.every((d) => d.count === 0)).toBe(true);
  });

  it('cuenta las inscripciones de cada día', () => {
    const trend = dailyTrend(
      [reg(), reg(), reg({ createdAt: new Date(2026, 10, 13, 23, 0) })],
      NOW,
    );
    expect(trend[6].count).toBe(2);
    expect(trend[5].count).toBe(1);
  });
});

describe('filtros', () => {
  const events = [event(), event({ id: 'e2', dateStart: new Date(2026, 11, 20) })];
  const base = { eventId: null, role: null, dateRange: null };

  it('el rango filtra por fecha del evento y las inscripciones lo heredan', () => {
    const f = { ...base, dateRange: [new Date(2026, 11, 1), new Date(2026, 11, 31)] };
    const evs = filterEvents(events, f);
    expect(evs.map((e) => e.id)).toEqual(['e2']);
    const regs = filterRegistrations([reg(), reg({ eventId: 'e2' })], evs, f);
    expect(regs.map((r) => r.eventId)).toEqual(['e2']);
  });

  it('filtra por rol', () => {
    const regs = filterRegistrations([reg(), reg({ role: 'STAFF' })], events, {
      ...base,
      role: 'STAFF',
    });
    expect(regs).toHaveLength(1);
  });
});

describe('distribuciones', () => {
  it('no mezcla Staff ni Organizadores con Asistentes', () => {
    const items = roleDistribution([reg(), reg({ role: 'ORGANIZER' }), reg({ role: 'STAFF' })]);
    expect(items.map((i) => i.label)).toEqual(['Asistentes', 'Organizadores', 'Staff']);
  });

  it('usa el vocabulario de estados', () => {
    const items = statusDistribution([
      reg(),
      reg({ status: 'PENDING' }),
      reg({ status: 'CANCELLED' }),
    ]);
    expect(items.map((i) => i.label)).toEqual(['Confirmadas', 'Pendientes de pago', 'Anuladas']);
  });

  it('vacío sin datos', () => {
    expect(roleDistribution([])).toEqual([]);
  });
});
