import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { RaffleQr } from '../domain/raffle-qr.model';
import { RaffleQrsRepository } from '../domain/raffle-qrs.repository';
import { toDomainError } from './postgres-error.mapper';

@Injectable({ providedIn: 'root' })
export class RaffleQrsApi implements RaffleQrsRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<RaffleQr[]> {
    const { data, error } = await this.supabase
      .from('point_activities')
      .select('id, name, point_activity_qrs (id, active)')
      .eq('event_id', eventId)
      .order('name', { ascending: true });
    if (error) throw toDomainError(error, 'raffle_qr');
    return (data ?? []).map((a) => ({
      activityId: a.id,
      name: a.name,
      code: a.point_activity_qrs?.id ?? null,
      active: a.point_activity_qrs?.active ?? false,
    }));
  }

  async create(eventId: string, name: string): Promise<RaffleQr> {
    const { data, error } = await this.supabase
      .from('point_activities')
      .insert({ event_id: eventId, name })
      .select('id')
      .single();
    if (error) throw toDomainError(error, 'raffle_qr');
    return this.setActive({ activityId: data.id, name, code: null, active: false }, true);
  }

  async rename(activityId: string, name: string): Promise<void> {
    const { error } = await this.supabase
      .from('point_activities')
      .update({ name })
      .eq('id', activityId)
      .select('id')
      .single();
    if (error) throw toDomainError(error, 'raffle_qr');
  }

  async setActive(qr: RaffleQr, active: boolean): Promise<RaffleQr> {
    const { data, error } = await this.supabase
      .from('point_activity_qrs')
      .upsert({ activity_id: qr.activityId, active }, { onConflict: 'activity_id' })
      .select('id, active')
      .single();
    if (error) throw toDomainError(error, 'raffle_qr');
    return { ...qr, code: data.id, active: data.active };
  }

  async delete(activityId: string): Promise<void> {
    // `.single()`: si RLS no deja borrar no hay error, solo cero filas.
    const { error } = await this.supabase
      .from('point_activities')
      .delete()
      .eq('id', activityId)
      .select('id')
      .single();
    if (error) throw toDomainError(error, 'raffle_qr');
  }
}
