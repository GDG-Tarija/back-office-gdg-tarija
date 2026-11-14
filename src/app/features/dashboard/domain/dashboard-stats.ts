import { DashboardEvent, DashboardRegistration } from './dashboard.model';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardFilters {
  eventId: string | null;
  role: string | null;
  /** Rango de la fecha del evento (no de la inscripción). */
  dateRange: Date[] | null;
}

export interface CashFlow {
  /** Inscripciones Confirmadas. */
  collected: number;
  /** Inscripciones Pendientes de pago. */
  receivable: number;
}

export interface ProofsToReview {
  eventId: string;
  title: string;
  count: number;
}

export interface UpcomingEvent {
  event: DashboardEvent;
  registered: number;
  isToday: boolean;
}

export interface TrendDay {
  label: string;
  count: number;
}

export interface DistributionItem {
  key: string;
  label: string;
  value: number;
  percentage: number;
}

const ROLE_LABELS: Record<string, string> = {
  ATTENDEE: 'Asistentes',
  SPEAKER: 'Expositores',
  ORGANIZER: 'Organizadores',
  STAFF: 'Staff',
  VOLUNTEER: 'Voluntarios',
  SPONSOR: 'Sponsors',
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmadas',
  PENDING: 'Pendientes de pago',
  CANCELLED: 'Anuladas',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role.toUpperCase()] ?? role;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status.toUpperCase()] ?? status;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isAttendee(r: DashboardRegistration): boolean {
  return r.role.toUpperCase() === 'ATTENDEE';
}

function isActive(r: DashboardRegistration): boolean {
  return r.status.toUpperCase() !== 'CANCELLED';
}

export function filterEvents(events: DashboardEvent[], f: DashboardFilters): DashboardEvent[] {
  const [from, to] = f.dateRange ?? [];
  const start = from ? startOfDay(from) : null;
  const end = to ? endOfDay(to) : null;
  return events.filter((e) => {
    if (f.eventId && e.id !== f.eventId) return false;
    if (start && e.dateStart < start) return false;
    if (end && e.dateStart > end) return false;
    return true;
  });
}

/** Las inscripciones heredan el filtro de fecha del evento al que pertenecen. */
export function filterRegistrations(
  regs: DashboardRegistration[],
  filteredEvents: DashboardEvent[],
  f: DashboardFilters,
): DashboardRegistration[] {
  const ids = new Set(filteredEvents.map((e) => e.id));
  const role = f.role?.toUpperCase();
  return regs.filter((r) => ids.has(r.eventId) && (!role || r.role.toUpperCase() === role));
}

/** Cobrado y por cobrar por separado: sumarlos daría una cifra engañosa. */
export function computeCashFlow(regs: DashboardRegistration[]): CashFlow {
  const flow: CashFlow = { collected: 0, receivable: 0 };
  for (const r of regs) {
    if (!isAttendee(r)) continue;
    const status = r.status.toUpperCase();
    if (status === 'CONFIRMED') flow.collected += r.amountDue;
    else if (status === 'PENDING') flow.receivable += r.amountDue;
  }
  return flow;
}

export function countByStatus(regs: DashboardRegistration[], status: string): number {
  return regs.filter((r) => r.status.toUpperCase() === status).length;
}

/** Mismo criterio que el filtro de Asistentes `?estado=pendiente&comprobante=con`: sin mirar rol ni monto. */
export function proofsToReview(
  events: DashboardEvent[],
  regs: DashboardRegistration[],
): ProofsToReview[] {
  const titles = new Map(events.map((e) => [e.id, e.title]));
  const counts = new Map<string, number>();
  for (const r of regs) {
    if (r.status.toUpperCase() !== 'PENDING' || !r.hasProof) continue;
    counts.set(r.eventId, (counts.get(r.eventId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([eventId, count]) => ({ eventId, title: titles.get(eventId) ?? 'Evento', count }))
    .sort((a, b) => b.count - a.count);
}

export function draftEvents(events: DashboardEvent[]): DashboardEvent[] {
  return events.filter((e) => !e.isPublished);
}

/** Eventos publicados que empiezan hoy o en los próximos `days` días, o que siguen en curso hoy. */
export function upcomingEvents(
  events: DashboardEvent[],
  regs: DashboardRegistration[],
  now: Date,
  days = 7,
): UpcomingEvent[] {
  const today = startOfDay(now);
  const limit = endOfDay(new Date(today.getTime() + days * DAY_MS));
  const todayEnd = endOfDay(now);
  return events
    .filter((e) => {
      if (!e.isPublished) return false;
      const ongoing = e.dateStart <= todayEnd && (e.dateEnd ?? e.dateStart) >= today;
      return ongoing || (e.dateStart >= today && e.dateStart <= limit);
    })
    .sort((a, b) => a.dateStart.getTime() - b.dateStart.getTime())
    .map((event) => ({
      event,
      registered: regs.filter((r) => r.eventId === event.id && isAttendee(r) && isActive(r)).length,
      isToday: event.dateStart <= todayEnd && (event.dateEnd ?? event.dateStart) >= today,
    }));
}

/** Ocupación = inscritos activos (sin anuladas) sobre la capacidad de los eventos. */
export function capacityFillRate(events: DashboardEvent[], regs: DashboardRegistration[]): number {
  const total = events.reduce((sum, e) => sum + e.capacity, 0);
  if (total === 0) return 0;
  const ids = new Set(events.map((e) => e.id));
  const used = regs.filter((r) => ids.has(r.eventId) && isAttendee(r) && isActive(r)).length;
  return used / total;
}

/** Siete días que terminan hoy, aunque no haya inscripciones recientes. */
export function dailyTrend(regs: DashboardRegistration[], now: Date, days = 7): TrendDay[] {
  const today = startOfDay(now);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const buckets = new Map<string, TrendDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.set(key(d), { label: `${d.getDate()}/${d.getMonth() + 1}`, count: 0 });
  }
  for (const r of regs) {
    const bucket = buckets.get(key(r.createdAt));
    if (bucket) bucket.count++;
  }
  return [...buckets.values()];
}

function distribute(
  values: string[],
  order: string[],
  labelOf: (key: string) => string,
): DistributionItem[] {
  if (values.length === 0) return [];
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const keys = [
    ...order.filter((k) => counts.has(k)),
    ...[...counts.keys()].filter((k) => !order.includes(k)),
  ];
  return keys.map((key) => ({
    key,
    label: labelOf(key),
    value: counts.get(key) ?? 0,
    percentage: (counts.get(key) ?? 0) / values.length,
  }));
}

export function roleDistribution(regs: DashboardRegistration[]): DistributionItem[] {
  return distribute(
    regs.map((r) => r.role.toUpperCase()),
    Object.keys(ROLE_LABELS),
    roleLabel,
  );
}

export function statusDistribution(regs: DashboardRegistration[]): DistributionItem[] {
  return distribute(
    regs.map((r) => r.status.toUpperCase()),
    Object.keys(STATUS_LABELS),
    statusLabel,
  );
}
