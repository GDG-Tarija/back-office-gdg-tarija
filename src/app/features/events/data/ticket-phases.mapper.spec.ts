import { describe, expect, it } from 'vitest';

import {
  sortPhases,
  toAvailabilityByPhase,
  toTicketPhaseInsert,
  toTicketPhaseUpdate,
} from './ticket-phases.mapper';
import { toDomainTicketType, toTicketTypeRow } from './ticket-types.mapper';

const row = (id: string, position: number) => ({
  id,
  ticket_type_id: 't1',
  name: id,
  position,
  price: 10,
  capacity: null,
  payment_qr_url: 'qr',
  created_at: '',
  updated_at: '',
});

describe('ticket-phases mapper', () => {
  it('ordena las fases por posición y convierte el precio a número', () => {
    const phases = sortPhases([row('b', 2), row('a', 1)]);
    expect(phases.map((p) => p.id)).toEqual(['a', 'b']);
    expect(phases[0]).toMatchObject({ ticketTypeId: 't1', price: 10, paymentQrUrl: 'qr' });
  });

  it('inserta con posición, nombre recortado y sin QR si es gratis', () => {
    const paid = toTicketPhaseInsert(
      { id: null, name: ' Preventa ', price: 30, capacity: 5, paymentQrUrl: 'qr' },
      't1',
      1,
    );
    expect(paid).toMatchObject({ name: 'Preventa', position: 1, payment_qr_url: 'qr' });
    const free = toTicketPhaseInsert(
      { id: null, name: 'Free', price: 0, capacity: null, paymentQrUrl: 'qr' },
      't1',
      2,
    );
    expect(free.payment_qr_url).toBeNull();
  });

  it('el parche solo incluye lo que cambia; precio lleva su QR', () => {
    expect(toTicketPhaseUpdate({ position: 1001 })).toEqual({ position: 1001 });
    expect(toTicketPhaseUpdate({ capacity: null })).toEqual({ capacity: null });
    expect(toTicketPhaseUpdate({ price: 0, paymentQrUrl: 'qr' })).toEqual({
      price: 0,
      payment_qr_url: null,
    });
  });

  it('indexa la disponibilidad por fase y omite paquetes sin fases', () => {
    const base = {
      ticket_type_id: 't1',
      name: 'x',
      position: 1,
      price: 0,
      payment_qr_url: null,
      capacity: 10,
      package_capacity: null,
      package_sold: 0,
    };
    const out = toAvailabilityByPhase([
      { ...base, ticket_phase_id: 'p1', sold: 4, remaining: 6, is_active: true },
      { ...base, ticket_phase_id: null, sold: 1, remaining: null, is_active: true },
    ]);
    expect(out).toEqual({ p1: { ticketPhaseId: 'p1', sold: 4, remaining: 6, isActive: true } });
  });

  it('el paquete con fases toma precio y QR de la primera fase', () => {
    const base = {
      id: 't1',
      event_id: 'e1',
      name: 'General',
      description: null,
      price: 99,
      ticket_capacity: null,
      image_url: null,
      payment_qr_url: null,
      created_at: null,
      updated_at: null,
    };
    expect(
      toDomainTicketType({ ...base, ticket_phases: [row('b', 2), row('a', 1)] }).phases,
    ).toHaveLength(2);
    const input = {
      name: 'General',
      description: null,
      price: NaN,
      ticketCapacity: null,
      imageUrl: null,
      paymentQrUrl: null,
      phases: [
        { id: null, name: 'Pre', price: 30, capacity: 5, paymentQrUrl: 'qr' },
        { id: null, name: 'Normal', price: 50, capacity: null, paymentQrUrl: 'qr2' },
      ],
    };
    expect(toTicketTypeRow(input)).toMatchObject({ price: 30, payment_qr_url: 'qr' });
  });
});
