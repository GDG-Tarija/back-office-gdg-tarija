import { StaffAssignment } from '../domain/staff-assignment.model';
import { StaffAssignmentRow } from './staff-assignments.dto';

export function toDomainStaffAssignment(row: StaffAssignmentRow): StaffAssignment {
  return {
    id: row.id,
    eventId: row.event_id,
    staffEmail: row.staff_email,
    assignedAt: new Date(row.assigned_at),
  };
}
