import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { TicketType, TicketTypeInput } from '../domain/ticket-type.model';
import { TicketTypesRepository } from '../domain/ticket-types.repository';
import { toDomainError } from './postgres-error.mapper';
import { countByTicketType, toDomainTicketType, toTicketTypeRow } from './ticket-types.mapper';

@Injectable({ providedIn: 'root' })
export class TicketTypesApi implements TicketTypesRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<TicketType[]> {
    const { data, error } = await this.supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .order('price', { ascending: true });
    if (error) throw toDomainError(error, 'ticket_type');
    return (data ?? []).map(toDomainTicketType);
  }

  async create(eventId: string, input: TicketTypeInput): Promise<TicketType> {
    const { data, error } = await this.supabase
      .from('ticket_types')
      .insert({ ...toTicketTypeRow(input), event_id: eventId })
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'ticket_type');
    return toDomainTicketType(data);
  }

  async update(id: string, input: TicketTypeInput): Promise<TicketType> {
    const { data, error } = await this.supabase
      .from('ticket_types')
      .update(toTicketTypeRow(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'ticket_type');
    return toDomainTicketType(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('ticket_types').delete().eq('id', id);
    if (error) throw toDomainError(error, 'ticket_type');
  }

  async getRegistrationCounts(eventId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase
      .from('registrations')
      .select('ticket_type_id')
      .eq('event_id', eventId);
    if (error) throw toDomainError(error, 'ticket_type');
    return countByTicketType(data ?? []);
  }
}
