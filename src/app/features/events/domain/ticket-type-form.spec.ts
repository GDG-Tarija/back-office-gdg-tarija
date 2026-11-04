import { TicketType } from './ticket-type.model';
import {
  applyPriceToQr,
  emptyTicketTypeFormValue,
  formValueToTicketTypeInput,
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
