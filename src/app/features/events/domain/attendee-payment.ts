import { Attendee } from './event.model';

export interface AmountInput {
  couponId: string | null;
  phasePrice: number | null;
  packagePrice: number;
}

/**
 * Monto que respalda el comprobante. El servidor asigna la fase al inscribir: manda su precio sobre
 * el del paquete (que el editor iguala al de la primera fase). El cupón es un descuento del 100%.
 */
export function computeAmountDue({ couponId, phasePrice, packagePrice }: AmountInput): number {
  if (couponId) return 0;
  return phasePrice ?? packagePrice;
}

/** "Entrada de Pago · Normal" o solo el nombre del paquete si no hay fase. */
export function entryLabel(attendee: Pick<Attendee, 'ticketName' | 'phaseName'>): string {
  return attendee.phaseName
    ? `${attendee.ticketName} · ${attendee.phaseName}`
    : attendee.ticketName;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];

export function isImageProof(url: string | null): boolean {
  if (!url) return false;
  const cleaned = url.split('?')[0].toLowerCase();
  if (cleaned.endsWith('.pdf')) return false;
  return (
    IMAGE_EXTENSIONS.some((ext) => cleaned.endsWith(ext)) ||
    cleaned.includes('/storage/v1/object/public/')
  );
}

export function attendeeFullName(a: Pick<Attendee, 'firstName' | 'lastName' | 'email'>): string {
  return `${a.firstName} ${a.lastName}`.trim() || a.email || 'Sin nombre';
}

export function attendeeInitials(a: Pick<Attendee, 'firstName' | 'lastName' | 'email'>): string {
  const initials = `${a.firstName[0] ?? ''}${a.lastName[0] ?? ''}`.toUpperCase();
  return initials || (a.email[0] ?? '?').toUpperCase();
}

export type ProofFilter = 'ALL' | 'WITH_PROOF' | 'WITHOUT_PROOF';
export type CheckinFilter = 'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN';

export interface AttendeeFilters {
  search: string;
  status: string;
  role: string;
  checkin: CheckinFilter;
  /** Clave de `entryKey` ('' = todas). */
  entry: string;
  proof: ProofFilter;
}

export const EMPTY_FILTERS: AttendeeFilters = {
  search: '',
  status: '',
  role: '',
  checkin: 'ALL',
  entry: '',
  proof: 'ALL',
};

export function hasActiveFilters(f: AttendeeFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.status !== '' ||
    f.role !== '' ||
    f.checkin !== 'ALL' ||
    f.entry !== '' ||
    f.proof !== 'ALL'
  );
}

/** Clave estable paquete+fase para el filtro por entrada. */
export function entryKey(a: Pick<Attendee, 'ticketName' | 'phaseName'>): string {
  return entryLabel(a);
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterAttendees(list: Attendee[], f: AttendeeFilters): Attendee[] {
  const terms = normalize(f.search.trim()).split(/\s+/).filter(Boolean);
  return list.filter((a) => {
    if (f.status && a.status.toUpperCase() !== f.status) return false;
    if (f.role && a.role.toUpperCase() !== f.role) return false;
    if (f.checkin === 'CHECKED_IN' && !a.checkedIn) return false;
    if (f.checkin === 'NOT_CHECKED_IN' && a.checkedIn) return false;
    if (f.entry && entryKey(a) !== f.entry) return false;
    if (f.proof === 'WITH_PROOF' && !a.paymentProofUrl) return false;
    if (f.proof === 'WITHOUT_PROOF' && a.paymentProofUrl) return false;
    if (terms.length === 0) return true;
    const haystack = normalize(
      [
        a.id,
        a.userId ?? '',
        a.firstName,
        a.lastName,
        a.email,
        a.phone ?? '',
        a.role,
        a.status,
        entryLabel(a),
        a.couponCode ?? '',
      ].join(' '),
    );
    return terms.every((t) => haystack.includes(t));
  });
}

export interface AttendeeStats {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  checkedIn: number;
  /** Inscripciones que ocupan cupo (CONFIRMED + PENDING). */
  active: number;
  checkinRate: number;
}

export function computeStats(list: Attendee[]): AttendeeStats {
  const count = (status: string) => list.filter((a) => a.status.toUpperCase() === status).length;
  const confirmed = count('CONFIRMED');
  const pending = count('PENDING');
  const checkedIn = list.filter(
    (a) => a.checkedIn && a.status.toUpperCase() !== 'CANCELLED',
  ).length;
  return {
    total: list.length,
    confirmed,
    pending,
    cancelled: count('CANCELLED'),
    checkedIn,
    active: confirmed + pending,
    checkinRate: confirmed > 0 ? Math.min(100, Math.round((checkedIn / confirmed) * 100)) : 0,
  };
}

/** ¿Se espera un comprobante de pago? (inscripción de pago sin cupón.) */
export function expectsProof(a: Attendee): boolean {
  return a.amountDue > 0 && a.role.toUpperCase() === 'ATTENDEE';
}
