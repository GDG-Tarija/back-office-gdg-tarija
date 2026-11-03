import { TicketType, TicketTypeInput } from '../domain/ticket-type.model';
import { TicketTypeInsert, TicketTypeRow } from './ticket-types.dto';

export function toDomainTicketType(row: TicketTypeRow): TicketType {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    ticketCapacity: row.ticket_capacity,
    imageUrl: row.image_url,
    paymentQrUrl: row.payment_qr_url,
  };
}

export function toTicketTypeRow(input: TicketTypeInput): Omit<TicketTypeInsert, 'event_id'> {
  const qr = input.paymentQrUrl?.trim() || null;
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: input.price,
    ticket_capacity: input.ticketCapacity,
    image_url: input.imageUrl,
    // Espejo del CHECK: precio 0 nunca lleva QR.
    payment_qr_url: input.price > 0 ? qr : null,
  };
}

/** Agrupa filas de registrations por paquete (ticket_type_id -> cantidad). */
export function countByTicketType(rows: { ticket_type_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.ticket_type_id] = (counts[row.ticket_type_id] ?? 0) + 1;
  }
  return counts;
}
