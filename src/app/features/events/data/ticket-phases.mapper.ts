import { PhaseAvailability, TicketPhase, TicketPhaseInput } from '../domain/ticket-phase.model';
import { PhaseRowPatch } from '../domain/ticket-phase-sync';
import {
  TicketAvailabilityRow,
  TicketPhaseInsert,
  TicketPhaseRow,
  TicketPhaseUpdate,
} from './ticket-phases.dto';

export function toDomainTicketPhase(row: TicketPhaseRow): TicketPhase {
  return {
    id: row.id,
    ticketTypeId: row.ticket_type_id,
    name: row.name,
    position: row.position,
    price: Number(row.price),
    capacity: row.capacity,
    paymentQrUrl: row.payment_qr_url,
  };
}

export function sortPhases(rows: TicketPhaseRow[]): TicketPhase[] {
  return rows.map(toDomainTicketPhase).sort((a, b) => a.position - b.position);
}

/** Espejo del CHECK: precio 0 nunca lleva QR. */
function cleanQr(price: number, qr: string | null): string | null {
  return price > 0 ? qr?.trim() || null : null;
}

export function toTicketPhaseInsert(
  input: TicketPhaseInput,
  ticketTypeId: string,
  position: number,
): TicketPhaseInsert {
  return {
    ticket_type_id: ticketTypeId,
    name: input.name.trim(),
    position,
    price: input.price,
    capacity: input.capacity,
    payment_qr_url: cleanQr(input.price, input.paymentQrUrl),
  };
}

export function toTicketPhaseUpdate(patch: PhaseRowPatch): TicketPhaseUpdate {
  const row: TicketPhaseUpdate = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.price !== undefined) {
    row.price = patch.price;
    row.payment_qr_url = cleanQr(patch.price, patch.paymentQrUrl ?? null);
  }
  if (patch.capacity !== undefined) row.capacity = patch.capacity;
  if (patch.position !== undefined) row.position = patch.position;
  return row;
}

/** Disponibilidad por fase; descarta las filas de paquetes sin fases (ticket_phase_id null). */
export function toAvailabilityByPhase(
  rows: TicketAvailabilityRow[],
): Record<string, PhaseAvailability> {
  const out: Record<string, PhaseAvailability> = {};
  for (const r of rows) {
    if (!r.ticket_phase_id) continue;
    out[r.ticket_phase_id] = {
      ticketPhaseId: r.ticket_phase_id,
      sold: r.sold,
      remaining: r.remaining,
      isActive: r.is_active,
    };
  }
  return out;
}
