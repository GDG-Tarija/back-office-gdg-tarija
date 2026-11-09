import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { PhaseAvailability, TicketPhase } from '../domain/ticket-phase.model';
import { PhaseSyncOp, planPhaseSync } from '../domain/ticket-phase-sync';
import { TicketType, TicketTypeInput } from '../domain/ticket-type.model';
import { TicketTypesRepository } from '../domain/ticket-types.repository';
import { toDomainError } from './postgres-error.mapper';
import {
  sortPhases,
  toAvailabilityByPhase,
  toTicketPhaseInsert,
  toTicketPhaseUpdate,
} from './ticket-phases.mapper';
import { countByTicketType, toDomainTicketType, toTicketTypeRow } from './ticket-types.mapper';

const WITH_PHASES = '*, ticket_phases(*)';

@Injectable({ providedIn: 'root' })
export class TicketTypesApi implements TicketTypesRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<TicketType[]> {
    const { data, error } = await this.supabase
      .from('ticket_types')
      .select(WITH_PHASES)
      .eq('event_id', eventId)
      .order('price', { ascending: true });
    if (error) throw toDomainError(error, 'ticket_type');
    return (data ?? []).map(toDomainTicketType);
  }

  async create(eventId: string, input: TicketTypeInput): Promise<TicketType> {
    const { data, error } = await this.supabase
      .from('ticket_types')
      .insert({ ...toTicketTypeRow(input), event_id: eventId })
      .select('id')
      .single();
    if (error) throw toDomainError(error, 'ticket_type');
    try {
      await this.syncPhases(data.id, [], input);
    } catch (err) {
      // Sin RPC transaccional: si fallan las fases no se deja un paquete a medias.
      await this.supabase.from('ticket_types').delete().eq('id', data.id);
      throw err;
    }
    return this.get(data.id);
  }

  async update(id: string, input: TicketTypeInput): Promise<TicketType> {
    const { error } = await this.supabase
      .from('ticket_types')
      .update(toTicketTypeRow(input))
      .eq('id', id);
    if (error) throw toDomainError(error, 'ticket_type');
    await this.syncPhases(id, await this.listPhases(id), input);
    return this.get(id);
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

  async getPhaseAvailability(eventId: string): Promise<Record<string, PhaseAvailability>> {
    const { data, error } = await this.supabase.rpc('get_ticket_availability', {
      p_event_id: eventId,
    });
    if (error) throw toDomainError(error, 'ticket_phase');
    return toAvailabilityByPhase(data ?? []);
  }

  private async get(id: string): Promise<TicketType> {
    const { data, error } = await this.supabase
      .from('ticket_types')
      .select(WITH_PHASES)
      .eq('id', id)
      .single();
    if (error) throw toDomainError(error, 'ticket_type');
    return toDomainTicketType(data);
  }

  private async listPhases(ticketTypeId: string): Promise<TicketPhase[]> {
    const { data, error } = await this.supabase
      .from('ticket_phases')
      .select('*')
      .eq('ticket_type_id', ticketTypeId);
    if (error) throw toDomainError(error, 'ticket_phase');
    return sortPhases(data ?? []);
  }

  /** Aplica el plan en orden: el orden importa (ver planPhaseSync). Se corta en el primer error. */
  private async syncPhases(
    ticketTypeId: string,
    existing: TicketPhase[],
    input: TicketTypeInput,
  ): Promise<void> {
    const ops = planPhaseSync(existing, input.phases ?? []);
    for (const op of ops) await this.run(ticketTypeId, op);
  }

  private async run(ticketTypeId: string, op: PhaseSyncOp): Promise<void> {
    const table = this.supabase.from('ticket_phases');
    const { error } =
      op.kind === 'delete'
        ? await table.delete().eq('id', op.id)
        : op.kind === 'update'
          ? await table.update(toTicketPhaseUpdate(op.patch)).eq('id', op.id)
          : await table.insert(toTicketPhaseInsert(op.input, ticketTypeId, op.position));
    if (error) throw toDomainError(error, 'ticket_phase');
  }
}
