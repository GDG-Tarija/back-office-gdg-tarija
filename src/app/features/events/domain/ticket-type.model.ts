import { TicketPhase, TicketPhaseInput } from './ticket-phase.model';

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  price: number;
  /** null = sin cupo propio */
  ticketCapacity: number | null;
  imageUrl: string | null;
  paymentQrUrl: string | null;
  /** Vacío = paquete sin fases: usa price/paymentQrUrl como siempre. Ordenadas por position. */
  phases: TicketPhase[];
}

export type TicketTypeInput = Omit<TicketType, 'id' | 'eventId' | 'phases'> & {
  /** null/ausente = paquete sin fases. */
  phases?: TicketPhaseInput[] | null;
};
