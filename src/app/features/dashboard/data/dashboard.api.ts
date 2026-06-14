import { Injectable, inject } from '@angular/core';

import { SUPABASE, Database } from '../../../core/supabase/supabase.client';
import { DashboardRepository } from '../domain/dashboard.repository';
import {
  DashboardEvent,
  DashboardRegistration,
  RecentRegistration,
} from '../domain/dashboard.model';

type EventRow = Database['public']['Tables']['events']['Row'];
type RegistrationRow = Database['public']['Tables']['registrations']['Row'];
type ProfileRow = Database['public']['Tables']['users']['Row'];

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

    const eventsData = (data as unknown as EventRow[]) || [];

    return eventsData.map((e) => ({
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
        ticket_type_id,
        ticket_types (
          price
        )
      `);

    if (error) {
      console.error('Error fetching dashboard registrations:', error);
      throw error;
    }

    const regsData = data as unknown as {
      id: string;
      event_id: string;
      event_role: string;
      status: string;
      created_at: string | null;
      ticket_type_id: string;
      ticket_types: { price: number } | null;
    }[];

    return (regsData || []).map((r) => ({
      id: r.id,
      eventId: r.event_id,
      role: r.event_role,
      status: r.status,
      price: r.ticket_types?.price || 0,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
    }));
  }

  async getRecentRegistrations(limit: number): Promise<RecentRegistration[]> {
    // 1. Fetch recent registrations
    const { data: regs, error: regsError } = await this.supabase
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (regsError) {
      console.error('Error fetching recent registrations:', regsError);
      throw regsError;
    }

    const regsData = (regs as unknown as RegistrationRow[]) || [];

    // 2. Fetch event titles for those registrations
    const eventIds = Array.from(new Set(regsData.map((r) => r.event_id)));
    const eventsMap = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: events } = await this.supabase.from('events').select('*').in('id', eventIds);

      const eventsData = (events as unknown as EventRow[]) || [];
      eventsData.forEach((e) => eventsMap.set(e.id, e.title));
    }

    // 3. Fetch user names/avatars/emails for those registrations
    const userIds = regsData.map((r) => r.user_id).filter((id): id is string => !!id);
    const usersMap = new Map<
      string,
      { first_name: string; last_name: string; email: string; avatar_url: string | null }
    >();
    if (userIds.length > 0) {
      const { data: users } = await this.supabase.from('users').select('*').in('id', userIds);

      const usersData = (users as unknown as ProfileRow[]) || [];
      usersData.forEach((u) => usersMap.set(u.id, u));
    }

    // 4. Map to RecentRegistration model
    return regsData.map((r) => {
      const user = r.user_id ? usersMap.get(r.user_id) : null;
      const eventTitle = eventsMap.get(r.event_id) || 'Evento';
      const userName = user ? `${user.first_name} ${user.last_name}` : 'Usuario';
      const email = user ? user.email : '';
      const initials = user
        ? `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase()
        : 'US';

      return {
        id: r.id,
        userName,
        userEmail: email,
        avatarUrl: user?.avatar_url || null,
        userInitials: initials,
        eventTitle,
        role: r.event_role,
        status: r.status,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      };
    });
  }
}
