import { BackofficeRole } from '../../../core/models/role.model';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

/** Grupos de tablas para filtrar la actividad (mismos que `list_audit_log`). */
export type AuditCategory = 'ACCESS' | 'CONFIG' | 'REGISTRATIONS' | 'CHECKIN';

/** Una fila de `audit_log` con los nombres ya resueltos por la base. */
export interface AuditEntry {
  id: number;
  occurredAt: Date;
  /** null = Sistema (consola, migración o service role). */
  actorId: string | null;
  actorEmail: string | null;
  /** Rol del back-office al momento del cambio; null = persona sin acceso (p. ej. desde la web). */
  actorRole: BackofficeRole | null;
  actorName: string | null;
  action: AuditAction;
  table: string;
  recordId: string | null;
  eventId: string | null;
  eventTitle: string | null;
  /** Sobre quién o qué fue: la persona inscrita, el paquete, el cupón, el correo con acceso... */
  subjectName: string | null;
  /** INSERT/DELETE: la fila. UPDATE: `{campo: [antes, después]}` solo con lo que cambió. */
  changes: Record<string, unknown>;
  /** `backfill` = importado al crear la auditoría (lo anterior a ella). */
  source: 'app' | 'backfill';
}

export interface AuditFilters {
  eventId: string | null;
  actorId: string | null;
  category: AuditCategory | null;
  registrationId: string | null;
  from: Date | null;
  to: Date | null;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  eventId: null,
  actorId: null,
  category: null,
  registrationId: null,
  from: null,
  to: null,
};

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
}
