import { validatePublish, validateTicketPhases, validateTicketType } from './event-validators';
import { TicketPhaseInput } from './ticket-phase.model';
import { TicketTypeInput } from './ticket-type.model';

const fields = (r: { errors: { field: string }[] }) => r.errors.map((e) => e.field);

const pre: TicketPhaseInput = {
  id: 'p1',
  name: 'Preventa',
  price: 30,
  capacity: 50,
  paymentQrUrl: 'qr',
};
const normal: TicketPhaseInput = {
  id: 'p2',
  name: 'Normal',
  price: 50,
  capacity: null,
  paymentQrUrl: 'qr2',
};

describe('validateTicketPhases', () => {
  it('acepta preventa con cupo + normal ilimitada', () => {
    expect(validateTicketPhases([pre, normal]).errors).toEqual([]);
  });

  it('exige al menos una fase', () => {
    expect(fields(validateTicketPhases([]))).toContain('phases');
  });

  it('nombres obligatorios y únicos sin distinguir mayúsculas', () => {
    const r = validateTicketPhases([
      { ...pre, name: ' ' },
      { ...normal, name: 'x' },
      { ...normal, id: null, name: 'X' },
    ]);
    expect(fields(r)).toEqual(expect.arrayContaining(['phases[0].name', 'phases[2].name']));
    expect(fields(r)).not.toContain('phases[1].name');
  });

  it('solo la última fase puede tener cupo vacío', () => {
    const r = validateTicketPhases([{ ...pre, capacity: null }, normal]);
    expect(fields(r)).toEqual(['phases[0].capacity']);
  });

  it('cupo entero >= 1', () => {
    expect(fields(validateTicketPhases([{ ...pre, capacity: 0 }, normal]))).toContain(
      'phases[0].capacity',
    );
    expect(fields(validateTicketPhases([{ ...pre, capacity: 2.5 }, normal]))).toContain(
      'phases[0].capacity',
    );
  });

  it('precio >= 0 con máximo 2 decimales', () => {
    expect(fields(validateTicketPhases([{ ...pre, price: -1 }, normal]))).toContain(
      'phases[0].price',
    );
    expect(fields(validateTicketPhases([{ ...pre, price: NaN }, normal]))).toContain(
      'phases[0].price',
    );
    expect(fields(validateTicketPhases([{ ...pre, price: 10.999 }, normal]))).toContain(
      'phases[0].price',
    );
    expect(validateTicketPhases([{ ...pre, price: 10.5 }, normal]).errors).toEqual([]);
  });

  it('precio > 0 exige QR y precio 0 lo prohíbe', () => {
    expect(fields(validateTicketPhases([{ ...pre, paymentQrUrl: null }, normal]))).toEqual([
      'phases[0].paymentQrUrl',
    ]);
    expect(
      fields(validateTicketPhases([pre, { ...normal, price: 0, paymentQrUrl: 'qr' }])),
    ).toEqual(['phases[1].paymentQrUrl']);
    expect(validateTicketPhases([pre, { ...normal, price: 0, paymentQrUrl: null }]).errors).toEqual(
      [],
    );
  });

  it('no baja el cupo por debajo de lo vendido', () => {
    const r = validateTicketPhases([{ ...pre, capacity: 10 }, normal], {
      soldByPhaseId: { p1: 12 },
    });
    expect(r.errors[0].field).toBe('phases[0].capacity');
    expect(r.errors[0].message).toContain('12');
    expect(
      validateTicketPhases([{ ...pre, capacity: 12 }, normal], { soldByPhaseId: { p1: 12 } })
        .errors,
    ).toEqual([]);
  });

  it('no quita fases con ventas pero sí las vacías', () => {
    const ctx = {
      existingPhases: [
        { id: 'p1', name: 'Preventa' },
        { id: 'p2', name: 'Normal' },
      ],
      soldByPhaseId: { p1: 4 },
    };
    const r = validateTicketPhases([normal], ctx);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('Preventa');
    expect(validateTicketPhases([pre], ctx).errors).toEqual([]);
  });

  it('avisa (sin bloquear) si la suma de cupos supera el cupo del paquete', () => {
    const r = validateTicketPhases([pre, { ...normal, capacity: 100 }], {}, 120);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(validateTicketPhases([pre, normal], {}, 120).warnings).toEqual([]);
    expect(validateTicketPhases([pre, normal], {}, null).warnings).toEqual([]);
  });

  it('avisa al cambiar el precio de una fase con ventas', () => {
    const r = validateTicketPhases([{ ...pre, price: 35 }, normal], {
      existingPhases: [{ id: 'p1', name: 'Preventa', price: 30 }],
      soldByPhaseId: { p1: 2 },
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0].message).toContain('Preventa');
  });
});

describe('validateTicketType con fases', () => {
  const base: TicketTypeInput = {
    name: 'General',
    description: null,
    price: NaN, // con fases el precio del paquete no se valida
    ticketCapacity: null,
    imageUrl: null,
    paymentQrUrl: null,
    phases: [pre, normal],
  };

  it('ignora precio/QR del paquete y valida las fases', () => {
    expect(validateTicketType(base, { otherNames: [] }).errors).toEqual([]);
    expect(fields(validateTicketType({ ...base, phases: [] }, { otherNames: [] }))).toContain(
      'phases',
    );
  });

  it('volver a "sin fases" con ventas en una fase se bloquea', () => {
    const r = validateTicketType(
      { ...base, price: 10, paymentQrUrl: 'qr', phases: null },
      {
        otherNames: [],
        existingPhases: [{ id: 'p1', name: 'Preventa' }],
        soldByPhaseId: { p1: 1 },
      },
    );
    expect(fields(r)).toEqual(['phases']);
  });
});

describe('validatePublish con fases', () => {
  const event = {
    title: 'Evento',
    slug: 'evento',
    description: 'd',
    eventType: 'CONFERENCE',
    locationType: 'PRESENCIAL',
    locationName: 'Lugar',
    dateStart: new Date('2026-12-01T13:00:00Z'),
    dateEnd: new Date('2026-12-01T20:00:00Z'),
    capacity: 100,
    imageUrl: 'img',
    addressLink: null,
    formFields: [],
  } as unknown as Parameters<typeof validatePublish>[0]['event'];

  it('bloquea si un paquete tiene fases inválidas', () => {
    const r = validatePublish({
      event,
      sessions: [],
      ticketTypes: [
        { name: 'General', ticketCapacity: null, phases: [{ ...pre, paymentQrUrl: null }, normal] },
      ],
    });
    expect(r.errors.map((e) => e.field)).toContain('ticketTypes[0].phases');
    expect(r.errors.find((e) => e.field === 'ticketTypes[0].phases')?.message).toContain('General');
  });

  it('paquetes con fases válidas o sin fases no bloquean', () => {
    const r = validatePublish({
      event,
      sessions: [],
      ticketTypes: [
        { name: 'A', ticketCapacity: null, phases: [pre, normal] },
        { name: 'B', ticketCapacity: 10, phases: [] },
        { ticketCapacity: 10 },
      ],
    });
    expect(r.errors.map((e) => e.field)).not.toContain('ticketTypes[0].phases');
  });
});
