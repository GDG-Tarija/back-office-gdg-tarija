/** Fase de precio de un paquete (p. ej. Preventa -> Entrada normal). */
export interface TicketPhase {
  id: string;
  ticketTypeId: string;
  name: string;
  /** Orden de activación (1 = primera). La activa es la primera con cupo libre. */
  position: number;
  price: number;
  /** null = sin límite (solo permitido en la última fase) */
  capacity: number | null;
  paymentQrUrl: string | null;
}

/** Fase tal como la edita el formulario; `id` es null mientras no se haya guardado. */
export interface TicketPhaseInput {
  id: string | null;
  name: string;
  price: number;
  capacity: number | null;
  paymentQrUrl: string | null;
}

/** Vendidos/restantes de una fase (RPC get_ticket_availability). */
export interface PhaseAvailability {
  ticketPhaseId: string;
  sold: number;
  /** null = fase sin límite */
  remaining: number | null;
  /** Fase que recibe la próxima inscripción. */
  isActive: boolean;
}
