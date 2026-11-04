import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { StaffAssignment } from '../domain/staff-assignment.model';
import { StaffAssignmentsRepository } from '../domain/staff-assignments.repository';
import { toDomainError } from './postgres-error.mapper';
import { toDomainStaffAssignment } from './staff-assignments.mapper';

@Injectable({ providedIn: 'root' })
export class StaffAssignmentsApi implements StaffAssignmentsRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<StaffAssignment[]> {
    const { data, error } = await this.supabase
      .from('event_staff_assignments')
      .select('*')
      .eq('event_id', eventId)
      .order('assigned_at', { ascending: true });
    if (error) throw toDomainError(error, 'staff');
    return (data ?? []).map(toDomainStaffAssignment);
  }

  async add(eventId: string, staffEmail: string): Promise<StaffAssignment> {
    const { data, error } = await this.supabase
      .from('event_staff_assignments')
      .insert({ event_id: eventId, staff_email: staffEmail.trim().toLowerCase() })
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'staff');
    return toDomainStaffAssignment(data);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from('event_staff_assignments').delete().eq('id', id);
    if (error) throw toDomainError(error, 'staff');
  }
}
