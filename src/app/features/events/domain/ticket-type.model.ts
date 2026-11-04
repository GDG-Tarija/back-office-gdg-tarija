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
}

export type TicketTypeInput = Omit<TicketType, 'id' | 'eventId'>;
