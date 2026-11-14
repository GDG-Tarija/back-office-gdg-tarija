import { Injectable, inject } from '@angular/core';

import { SUPABASE, Database } from '../../../core/supabase/supabase.client';
import { computeAmountDue } from '../../events/domain/attendee-payment';
import { DashboardEvent, DashboardRegistration } from '../domain/dashboard.model';
import { DashboardRepository } from '../domain/dashboard.repository';

type EventRow = Database['public']['Tables']['events']['Row'];

interface RegistrationRow {
  id: string;
  event_id: string;
  event_role: string;
  status: string;
  created_at: string | null;
  payment_proof_url: string | null;
  coupon_id: string | null;
  ticket_types: { price: number } | null;
  ticket_phases: { price: number } | null;
}

export function toDashboardRegistration(r: RegistrationRow): DashboardRegistration {
  return {
    id: r.id,
    eventId: r.event_id,
    role: r.event_role,
    status: r.status,
    amountDue: computeAmountDue({
      couponId: r.coupon_id,
      phasePrice: r.ticket_phases?.price ?? null,
      packagePrice: r.ticket_types?.price ?? 0,
    }),
    hasProof: !!r.payment_proof_url,
    createdAt: r.created_at ? new Date(r.created_at) : new Date(),
  };
}

@Injectable({
  providedIn: 'root',
})
export class DashboardApi implements DashboardRepository {
  private readonly supabase = inject(SUPABASE);

  async getEvents(): Promise<DashboardEvent[]> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .order('date_start', { ascending: false });

    if (error) {
      console.error('Error fetching dashboard events:', error);
      throw error;
    }

    return ((data as unknown as EventRow[]) || []).map((e) => ({
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      capacity: e.capacity,
      dateStart: new Date(e.date_start),
      dateEnd: e.date_end ? new Date(e.date_end) : null,
      isPublished: !!e.is_published,
      category: e.category,
    }));
  }

  async getRegistrations(): Promise<DashboardRegistration[]> {
    const { data, error } = await this.supabase.from('registrations').select(`
        id,
        event_id,
        event_role,
        status,
        created_at,
        payment_proof_url,
        coupon_id,
        ticket_types ( price ),
        ticket_phases ( price )
      `);

    if (error) {
      console.error('Error fetching dashboard registrations:', error);
      throw error;
    }

    return ((data as unknown as RegistrationRow[]) || []).map(toDashboardRegistration);
  }
}
