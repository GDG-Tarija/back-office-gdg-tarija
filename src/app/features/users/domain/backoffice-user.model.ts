import { BackofficeRole } from '../../../core/models/role.model';

export interface AssignedEvent {
  assignmentId: string;
  eventId: string;
  title: string;
  dateStart: Date | null;
}

/**
 * Persona con acceso al back-office (`staff_whitelist`). No confundir con el rol que alguien tiene
 * dentro de un evento (`registrations.event_role`, que da el cupón): ese no da acceso al panel.
 */
export interface BackofficeUser {
  email: string;
  role: BackofficeRole;
  /** null mientras la persona no haya entrado nunca con Google. */
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  lastSignInAt: Date | null;
  addedAt: Date | null;
  /** Quién le dio acceso (null si se agregó antes de la auditoría o desde la consola). */
  addedByEmail: string | null;
  lastActivityAt: Date | null;
  assignedEvents: AssignedEvent[];
}
