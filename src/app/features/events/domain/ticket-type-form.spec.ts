import { TicketType } from './ticket-type.model';
import {
  applyPhasePricesToQr,
  applyPriceToQr,
  emptyTicketTypeFormValue,
  enablePhases,
  formValueToTicketTypeInput,
  movePhase,
  phaseDeleteBlockReason,
  ticketDeleteBlockReason,
  ticketTypeToFormValue,
} from './ticket-type-form';
import { validateTicketCapacities, validateTicketType } from './event-validators';

const ticket: TicketType = {
  id: 't1',
  eventId: 'e1',
  name: 'General',
  description: null,
  price: 25,
  ticketCapacity: 10,
  imageUrl: null,
  paymentQrUrl: 'qr',
  phases: [],
};

describe('ticket-type-form', () => {
  it('convierte entre dominio y formulario', () => {
    const v = ticketTypeToFormValue(ticket);
    expect(v).toMatchObject({ price: '25', ticketCapacity: '10', description: '' });
    expect(formValueToTicketTypeInput(v)).toMatchObject({
      price: 25,
      ticketCapacity: 10,
      description: null,
    });
  });

  it('cupo vacío es null y precio con coma se acepta', () => {
    const input = formValueToTicketTypeInput({
      ...emptyTicketTypeFormValue(),
      price: '12,5',
      ticketCapacity: ' ',
    });
    expect(input.price).toBe(12.5);
    expect(input.ticketCapacity).toBeNull();
  });

  it('texto inválido produce NaN y el validador lo rechaza', () => {
    const input = formValueToTicketTypeInput({
      ...emptyTicketTypeFormValue(),
      name: 'A',
      price: 'abc',
    });
    expect(validateTicketType(input, { otherNames: [] }).errors.map((e) => e.field)).toContain(
      'price',
    );
  });

  it('bloquea el borrado con inscritos', () => {
    expect(ticketDeleteBlockReason(0)).toBeNull();
    expect(ticketDeleteBlockReason(3)).toContain('3');
  });

  it('precio 0 descarta el QR; precio > 0 lo conserva', () => {
    const free = applyPriceToQr({ ...ticketTypeToFormValue(ticket), price: '0' });
    expect(free.value.paymentQrUrl).toBeNull();
    expect(free.discardedQr).toBe('qr');
    const paid = applyPriceToQr(ticketTypeToFormValue(ticket));
    expect(paid.value.paymentQrUrl).toBe('qr');
    expect(paid.discardedQr).toBeNull();
  });
});

describe('reglas con inscritos', () => {
  const base = formValueToTicketTypeInput(ticketTypeToFormValue(ticket));

  it('no permite bajar el cupo por debajo de los inscritos', () => {
    const r = validateTicketType(
      { ...base, ticketCapacity: 4 },
      { otherNames: [], registeredCount: 5, originalPrice: 25 },
    );
    expect(r.errors.map((e) => e.field)).toContain('ticketCapacity');
  });

  it('avisa al cambiar el precio con inscritos', () => {
    const r = validateTicketType(
      { ...base, price: 30 },
      { otherNames: [], registeredCount: 5, originalPrice: 25 },
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.field)).toContain('price');
  });

  it('rechaza nombre duplicado y advierte si los cupos superan la capacidad', () => {
    expect(
      validateTicketType(base, { otherNames: ['general'] }).errors.map((e) => e.field),
    ).toContain('name');
    expect(
      validateTicketCapacities([{ ticketCapacity: 8 }, { ticketCapacity: 8 }], 10).warnings,
    ).toHaveLength(1);
  });
});

describe('fases en el formulario', () => {
  const phased: TicketType = {
    ...ticket,
    phases: [
      {
        id: 'p1',
        ticketTypeId: 't1',
        name: 'Preventa',
        position: 1,
        price: 30,
        capacity: 50,
        paymentQrUrl: 'qr1',
      },
      {
        id: 'p2',
        ticketTypeId: 't1',
        name: 'Normal',
        position: 2,
        price: 50,
        capacity: null,
        paymentQrUrl: 'qr2',
      },
    ],
  };

  it('convierte fases entre dominio y formulario', () => {
    const v = ticketTypeToFormValue(phased);
    expect(v.usesPhases).toBe(true);
    expect(v.phases[1]).toMatchObject({ id: 'p2', price: '50', capacity: '' });
    const input = formValueToTicketTypeInput(v);
    expect(input.phases).toEqual([
      { id: 'p1', name: 'Preventa', price: 30, capacity: 50, paymentQrUrl: 'qr1' },
      { id: 'p2', name: 'Normal', price: 50, capacity: null, paymentQrUrl: 'qr2' },
    ]);
  });

  it('un paquete sin fases produce phases null', () => {
    expect(formValueToTicketTypeInput(ticketTypeToFormValue(ticket)).phases).toBeNull();
  });

  it('enablePhases mueve precio y QR del paquete a la primera fase', () => {
    const v = enablePhases(ticketTypeToFormValue(ticket));
    expect(v.usesPhases).toBe(true);
    expect(v.paymentQrUrl).toBeNull();
    expect(v.phases).toHaveLength(2);
    expect(v.phases[0]).toMatchObject({ name: 'Preventa', price: '25', paymentQrUrl: 'qr' });
  });

  it('movePhase intercambia y respeta los límites', () => {
    const v = ticketTypeToFormValue(phased).phases;
    expect(movePhase(v, 0, 1).map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(movePhase(v, 0, -1)).toBe(v);
    expect(movePhase(v, 1, 1)).toBe(v);
  });

  it('phaseDeleteBlockReason bloquea con ventas', () => {
    expect(phaseDeleteBlockReason(0)).toBeNull();
    expect(phaseDeleteBlockReason(3)).toContain('3');
  });

  it('applyPhasePricesToQr descarta el QR de las fases gratuitas', () => {
    const base = ticketTypeToFormValue(phased);
    const edited = {
      ...base,
      phases: [{ ...base.phases[0], price: '0' }, base.phases[1]],
    };
    const { value, discardedQrs } = applyPhasePricesToQr(edited);
    expect(discardedQrs).toEqual(['qr1']);
    expect(value.phases[0].paymentQrUrl).toBeNull();
    expect(value.phases[1].paymentQrUrl).toBe('qr2');
    expect(applyPhasePricesToQr(base).discardedQrs).toEqual([]);
  });
});
