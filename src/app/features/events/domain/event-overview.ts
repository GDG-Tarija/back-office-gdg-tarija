import { Attendee, Event } from './event.model';
import { TicketType } from './ticket-type.model';

/** Cifras de la portada de un evento. Las anuladas no ocupan cupo ni cuentan como inscritas. */
export interface EventOverview {
  /** Inscritas sin anuladas (confirmadas + pendientes de pago). */
  active: number;
  capacity: number;
  /** Cupos libres; nunca negativo. */
  remaining: number;
  /** 0..1, tope 1 aunque se haya sobrevendido. */
  fillRate: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  /** Pendientes de pago que ya subieron comprobante: esperan la revisión de un organizador. */
  proofsToReview: number;
  pendingWithoutProof: number;
  /** Suma del monto real (fase y cupón) de las confirmadas. */
  collected: number;
  /** Suma del monto real de las pendientes de pago. */
  receivable: number;
  /** Check-ins de inscripciones no anuladas. */
  checkedIn: number;
  /** 0..1 sobre las confirmadas (solo ellas pueden registrar asistencia). */
  checkinRate: number;
}

export function buildEventOverview(
  event: Pick<Event, 'capacity'>,
  attendees: readonly Pick<Attendee, 'status' | 'paymentProofUrl' | 'amountDue' | 'checkedIn'>[],
): EventOverview {
  let confirmed = 0;
  let pending = 0;
  let cancelled = 0;
  let proofsToReview = 0;
  let collected = 0;
  let receivable = 0;
  let checkedIn = 0;

  for (const a of attendees) {
    const status = a.status.toUpperCase();
    if (status === 'CANCELLED') {
      cancelled++;
      continue;
    }
    if (a.checkedIn) checkedIn++;
    if (status === 'CONFIRMED') {
      confirmed++;
      collected += a.amountDue;
    } else if (status === 'PENDING') {
      pending++;
      receivable += a.amountDue;
      if (a.paymentProofUrl) proofsToReview++;
    }
  }

  const active = confirmed + pending;
  const capacity = Math.max(event.capacity, 0);
  return {
    active,
    capacity,
    remaining: Math.max(capacity - active, 0),
    fillRate: capacity > 0 ? Math.min(active / capacity, 1) : 0,
    confirmed,
    pending,
    cancelled,
    proofsToReview,
    pendingWithoutProof: pending - proofsToReview,
    collected,
    receivable,
    checkedIn,
    checkinRate: confirmed > 0 ? Math.min(checkedIn / confirmed, 1) : 0,
  };
}

export interface PackageOccupancy {
  id: string;
  name: string;
  /** Inscritas sin anuladas en el paquete. */
  sold: number;
  /** null = el paquete no tiene cupo propio (comparte el del evento). */
  capacity: number | null;
  /** 0..1 cuando hay cupo propio; null si no lo hay. */
  fillRate: number | null;
}

/** Ocupación por paquete, en el orden en que los devuelve el repositorio. */
export function packageOccupancy(
  tickets: readonly Pick<TicketType, 'id' | 'name' | 'ticketCapacity'>[],
  activeCounts: Readonly<Record<string, number>>,
): PackageOccupancy[] {
  return tickets.map((t) => {
    const sold = activeCounts[t.id] ?? 0;
    const capacity = t.ticketCapacity;
    return {
      id: t.id,
      name: t.name,
      sold,
      capacity,
      fillRate: capacity && capacity > 0 ? Math.min(sold / capacity, 1) : null,
    };
  });
}

/** Últimas inscripciones (las más nuevas primero); las que no tienen fecha van al final. */
export function latestRegistrations<T extends Pick<Attendee, 'registeredAt'>>(
  attendees: readonly T[],
  limit = 5,
): T[] {
  return [...attendees]
    .sort((a, b) => (b.registeredAt?.getTime() ?? 0) - (a.registeredAt?.getTime() ?? 0))
    .slice(0, limit);
}
