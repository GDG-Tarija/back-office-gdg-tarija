import { AuditFilters, AuditPage } from './audit-entry.model';

/** Lectura de la auditoría (solo SUPERADMIN; la base lo exige). */
export abstract class AuditRepository {
  abstract list(filters: AuditFilters, limit: number, offset: number): Promise<AuditPage>;
}
