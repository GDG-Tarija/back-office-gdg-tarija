/**
 * Estados de una inscripción (columna `registrations.status`, CHECK en la BD).
 * El catálogo de opciones es genérico (`StatusOption<T>`) para que los paquetes,
 * que tendrán estados equivalentes (pendiente / pagado / anulado), puedan reutilizarlo.
 */
export type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  'CONFIRMED',
  'PENDING',
  'CANCELLED',
];

export type StatusSeverity = 'success' | 'warn' | 'danger' | 'secondary';

export interface StatusOption<T extends string> {
  value: T;
  /** Nombre del estado (tags, detalle). */
  label: string;
  /** Texto del filtro (plural). */
  filterLabel: string;
  /** Texto del botón/acción que lleva a este estado. */
  actionLabel: string;
  /** Ícono de Material Symbols. */
  icon: string;
  severity: StatusSeverity;
  /** Pasar a este estado pide confirmación explícita. */
  requiresConfirmation: boolean;
}

export const REGISTRATION_STATUS_OPTIONS: readonly StatusOption<RegistrationStatus>[] = [
  {
    value: 'CONFIRMED',
    label: 'Pagada / Confirmada',
    filterLabel: 'Confirmados / pagados',
    actionLabel: 'Marcar como pagada',
    icon: 'paid',
    severity: 'success',
    requiresConfirmation: false,
  },
  {
    value: 'PENDING',
    label: 'Pendiente de pago',
    filterLabel: 'Pendientes',
    actionLabel: 'Marcar como pendiente',
    icon: 'schedule',
    severity: 'warn',
    requiresConfirmation: false,
  },
  {
    value: 'CANCELLED',
    label: 'Anulada',
    filterLabel: 'Anulados',
    actionLabel: 'Anular inscripción',
    icon: 'block',
    severity: 'danger',
    requiresConfirmation: true,
  },
];

/** Resultado persistido de un cambio de estado. */
export interface RegistrationStatusChange {
  id: string;
  status: RegistrationStatus;
  updatedAt: Date | null;
}

export function isRegistrationStatus(value: unknown): value is RegistrationStatus {
  return typeof value === 'string' && (REGISTRATION_STATUSES as readonly string[]).includes(value);
}

/** Normaliza mayúsculas/espacios; devuelve null si no es un estado válido. */
export function parseRegistrationStatus(value: unknown): RegistrationStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return isRegistrationStatus(normalized) ? normalized : null;
}

export function registrationStatusOption(status: unknown): StatusOption<RegistrationStatus> | null {
  const parsed = parseRegistrationStatus(status);
  return REGISTRATION_STATUS_OPTIONS.find((o) => o.value === parsed) ?? null;
}

export function registrationStatusLabel(status: unknown): string {
  return (
    registrationStatusOption(status)?.label ??
    (typeof status === 'string' && status ? status : 'Desconocido')
  );
}

export function registrationStatusSeverity(status: unknown): StatusSeverity {
  return registrationStatusOption(status)?.severity ?? 'secondary';
}

/**
 * Una inscripción anulada no puede registrar asistencia (check-in, refrigerio ni sesiones).
 * PENDING sigue las reglas de cada flujo (el QR exige CONFIRMED); la BD solo bloquea CANCELLED.
 */
export function blocksAttendance(status: unknown): boolean {
  return parseRegistrationStatus(status) === 'CANCELLED';
}

export type StatusChangeCheck =
  | { ok: true; next: RegistrationStatus; requiresConfirmation: boolean }
  | { ok: false; reason: 'INVALID' | 'UNCHANGED'; message: string };

/**
 * Valida un cambio de estado. Cualquier transición entre los tres estados es válida
 * (incluida la restauración desde CANCELLED); solo anular pide confirmación.
 */
export function checkStatusChange(current: unknown, next: unknown): StatusChangeCheck {
  const target = parseRegistrationStatus(next);
  if (!target) {
    return { ok: false, reason: 'INVALID', message: 'Estado de inscripción no válido.' };
  }
  if (parseRegistrationStatus(current) === target) {
    return { ok: false, reason: 'UNCHANGED', message: 'La inscripción ya está en ese estado.' };
  }
  const option = REGISTRATION_STATUS_OPTIONS.find((o) => o.value === target)!;
  return { ok: true, next: target, requiresConfirmation: option.requiresConfirmation };
}

export type StatusFilter<T extends string> = T | 'ALL';
export type RegistrationStatusFilter = StatusFilter<RegistrationStatus>;

export function filterByRegistrationStatus<T extends { status: string }>(
  items: readonly T[],
  filter: RegistrationStatusFilter,
): T[] {
  if (filter === 'ALL') return [...items];
  return items.filter((item) => parseRegistrationStatus(item.status) === filter);
}

export function countByRegistrationStatus(
  items: readonly { status: string }[],
): Record<RegistrationStatus, number> {
  const counts: Record<RegistrationStatus, number> = { CONFIRMED: 0, PENDING: 0, CANCELLED: 0 };
  for (const item of items) {
    const status = parseRegistrationStatus(item.status);
    if (status) counts[status]++;
  }
  return counts;
}
