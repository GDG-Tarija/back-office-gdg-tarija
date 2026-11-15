import { buildEventOverview, latestRegistrations, packageOccupancy } from './event-overview';

type Row = Parameters<typeof buildEventOverview>[1][number];

const row = (overrides: Partial<Row>): Row => ({
  status: 'CONFIRMED',
  paymentProofUrl: null,
  amountDue: 0,
  checkedIn: false,
  ...overrides,
});

describe('buildEventOverview', () => {
  it('cuenta estados, comprobantes por revisar, montos y check-in sin las anuladas', () => {
    const overview = buildEventOverview({ capacity: 10 }, [
      row({ status: 'CONFIRMED', amountDue: 50, checkedIn: true }),
      row({ status: 'CONFIRMED', amountDue: 0 }),
      row({ status: 'PENDING', amountDue: 50, paymentProofUrl: 'https://x/p.png' }),
      row({ status: 'PENDING', amountDue: 30 }),
      row({ status: 'CANCELLED', amountDue: 50, checkedIn: true }),
    ]);

    expect(overview).toEqual({
      active: 4,
      capacity: 10,
      remaining: 6,
      fillRate: 0.4,
      confirmed: 2,
      pending: 2,
      cancelled: 1,
      proofsToReview: 1,
      pendingWithoutProof: 1,
      collected: 50,
      receivable: 80,
      checkedIn: 1,
      checkinRate: 0.5,
    });
  });

  it('acepta estados en minúsculas', () => {
    const overview = buildEventOverview({ capacity: 5 }, [row({ status: 'pending' })]);
    expect(overview.pending).toBe(1);
  });

  it('no da cupos negativos ni ocupación sobre 100 % si se sobrevendió', () => {
    const overview = buildEventOverview({ capacity: 1 }, [row({}), row({})]);
    expect(overview.remaining).toBe(0);
    expect(overview.fillRate).toBe(1);
  });

  it('sin cupo ni confirmadas no divide por cero', () => {
    const overview = buildEventOverview({ capacity: 0 }, [row({ status: 'PENDING' })]);
    expect(overview.fillRate).toBe(0);
    expect(overview.checkinRate).toBe(0);
  });
});

describe('packageOccupancy', () => {
  it('cruza los paquetes con las inscritas por paquete', () => {
    const result = packageOccupancy(
      [
        { id: 't1', name: 'General', ticketCapacity: 4 },
        { id: 't2', name: 'Estudiantes', ticketCapacity: null },
        { id: 't3', name: 'VIP', ticketCapacity: 2 },
      ],
      { t1: 1, t2: 7, t3: 5 },
    );

    expect(result).toEqual([
      { id: 't1', name: 'General', sold: 1, capacity: 4, fillRate: 0.25 },
      { id: 't2', name: 'Estudiantes', sold: 7, capacity: null, fillRate: null },
      { id: 't3', name: 'VIP', sold: 5, capacity: 2, fillRate: 1 },
    ]);
  });

  it('un paquete sin inscritas cuenta 0', () => {
    expect(packageOccupancy([{ id: 't1', name: 'General', ticketCapacity: 10 }], {})[0].sold).toBe(
      0,
    );
  });
});

describe('latestRegistrations', () => {
  it('ordena de la más nueva a la más vieja, deja sin fecha al final y respeta el límite', () => {
    const a = { id: 'a', registeredAt: new Date('2026-11-01T10:00:00Z') };
    const b = { id: 'b', registeredAt: null };
    const c = { id: 'c', registeredAt: new Date('2026-11-03T10:00:00Z') };
    const d = { id: 'd', registeredAt: new Date('2026-11-02T10:00:00Z') };

    expect(latestRegistrations([a, b, c, d], 3).map((x) => x.id)).toEqual(['c', 'd', 'a']);
  });
});
