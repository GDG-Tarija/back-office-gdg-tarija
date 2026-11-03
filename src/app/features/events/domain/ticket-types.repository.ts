import { TicketType, TicketTypeInput } from './ticket-type.model';

export abstract class TicketTypesRepository {
  abstract list(eventId: string): Promise<TicketType[]>;
  abstract create(eventId: string, input: TicketTypeInput): Promise<TicketType>;
  abstract update(id: string, input: TicketTypeInput): Promise<TicketType>;
  abstract delete(id: string): Promise<void>;
  /** Inscritos por paquete (ticket_type_id -> cantidad). */
  abstract getRegistrationCounts(eventId: string): Promise<Record<string, number>>;
}
