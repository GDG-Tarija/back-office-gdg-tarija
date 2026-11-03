import { StaffAssignment } from './staff-assignment.model';

export abstract class StaffAssignmentsRepository {
  abstract list(eventId: string): Promise<StaffAssignment[]>;
  abstract add(eventId: string, staffEmail: string): Promise<StaffAssignment>;
  abstract remove(id: string): Promise<void>;
}
