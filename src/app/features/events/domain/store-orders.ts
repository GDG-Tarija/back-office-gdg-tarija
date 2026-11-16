import { StatusSeverity } from './registration-status';
import {
  STORE_ORDER_STATUSES,
  STORE_ORDER_STATUS_OPTIONS,
  StoreOrder,
  StoreOrderStatus,
} from './store.model';

export const CORRECTION_REASON_MIN = 10;
export const CORRECTION_REASON_MAX = 500;

export function parseStoreOrderStatus(value: unknown): StoreOrderStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return (STORE_ORDER_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as StoreOrderStatus)
    : null;
}

export function storeOrderStatusLabel(status: unknown): string {
  const parsed = parseStoreOrderStatus(status);
  return STORE_ORDER_STATUS_OPTIONS.find((o) => o.value === parsed)?.label ?? 'Desconocido';
}

export function storeOrderStatusSeverity(status: unknown): StatusSeverity {
  const parsed = parseStoreOrderStatus(status);
  return STORE_ORDER_STATUS_OPTIONS.find((o) => o.value === parsed)?.severity ?? 'secondary';
}

export function hasDeliveries(order: Pick<StoreOrder, 'items'>): boolean {
  return order.items.some((i) => i.deliveredQuantity > 0);
}

export function totalUnits(order: Pick<StoreOrder, 'items'>): number {
  return order.items.reduce((sum, i) => sum + i.quantity, 0);
}

export function isRegistrationCancelled(order: Pick<StoreOrder, 'registrationStatus'>): boolean {
  return order.registrationStatus?.toUpperCase() === 'CANCELLED';
}

/** Revisión normal: solo desde PENDING. */
export function canReview(order: Pick<StoreOrder, 'status'>): boolean {
  return order.status === 'PENDING';
}

/** Por qué no se puede marcar pagada (null = sí se puede). */
export function markPaidBlockReason(
  order: Pick<StoreOrder, 'status' | 'registrationStatus'>,
): string | null {
  if (order.status !== 'PENDING') return 'Solo se marcan pagadas las compras pendientes.';
  if (isRegistrationCancelled(order)) {
    return 'La inscripción del comprador está anulada: esta compra solo se puede anular.';
  }
  return null;
}

/** Corrección excepcional PAID | CANCELLED -> PENDING. null = permitida. */
export function correctionBlockReason(order: Pick<StoreOrder, 'status' | 'items'>): string | null {
  if (order.status === 'PENDING') return 'La compra ya está pendiente.';
  if (hasDeliveries(order)) {
    return 'No se puede corregir: ya se entregaron productos de esta compra.';
  }
  return null;
}

/** Valida el motivo de una corrección (obligatorio, 10 a 500 caracteres). */
export function correctionReasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) return 'Indica el motivo de la corrección.';
  if (length < CORRECTION_REASON_MIN) {
    return `El motivo debe tener al menos ${CORRECTION_REASON_MIN} caracteres.`;
  }
  if (length > CORRECTION_REASON_MAX) {
    return `El motivo admite como máximo ${CORRECTION_REASON_MAX} caracteres.`;
  }
  return null;
}

/** Motivo opcional de una revisión normal (como máximo 500 caracteres). */
export function optionalReasonError(reason: string): string | null {
  return reason.trim().length > CORRECTION_REASON_MAX
    ? `El motivo admite como máximo ${CORRECTION_REASON_MAX} caracteres.`
    : null;
}

// ---------------------------------------------------------------------------
// Lista: filtros y resumen
// ---------------------------------------------------------------------------

export type StoreOrderStatusFilter = StoreOrderStatus | 'ALL';

export interface StoreOrderFilters {
  search: string;
  status: StoreOrderStatusFilter;
}

export const EMPTY_STORE_ORDER_FILTERS: StoreOrderFilters = { search: '', status: 'ALL' };

export function buyerName(order: Pick<StoreOrder, 'buyer'>): string {
  const b = order.buyer;
  if (!b) return 'Comprador sin perfil';
  return `${b.firstName} ${b.lastName}`.trim() || b.email || 'Sin nombre';
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busca por nombre, correo, celular, producto o los primeros caracteres del id. */
export function matchesStoreOrderSearch(order: StoreOrder, search: string): boolean {
  const q = normalize(search.trim());
  if (!q) return true;
  const haystack = [
    buyerName(order),
    order.buyer?.email ?? '',
    order.buyer?.phone ?? '',
    order.id,
    ...order.items.map((i) => i.productName),
  ]
    .map(normalize)
    .join(' ');
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function filterStoreOrders(list: StoreOrder[], f: StoreOrderFilters): StoreOrder[] {
  return list.filter(
    (o) => (f.status === 'ALL' || o.status === f.status) && matchesStoreOrderSearch(o, f.search),
  );
}

export function hasActiveStoreOrderFilters(f: StoreOrderFilters): boolean {
  return f.search.trim() !== '' || f.status !== 'ALL';
}

export interface StoreOrderStats {
  total: number;
  pending: number;
  paid: number;
  cancelled: number;
  /** Suma de las compras pagadas (Bs). */
  paidAmount: number;
  /** Suma de las compras por revisar (Bs). */
  pendingAmount: number;
}

export function computeStoreOrderStats(list: StoreOrder[]): StoreOrderStats {
  const sum = (status: StoreOrderStatus) =>
    Math.round(list.filter((o) => o.status === status).reduce((s, o) => s + o.total, 0) * 100) /
    100;
  return {
    total: list.length,
    pending: list.filter((o) => o.status === 'PENDING').length,
    paid: list.filter((o) => o.status === 'PAID').length,
    cancelled: list.filter((o) => o.status === 'CANCELLED').length,
    paidAmount: sum('PAID'),
    pendingAmount: sum('PENDING'),
  };
}

/** Pendientes primero (las más antiguas antes: se revisan en orden de llegada), luego el resto. */
export function sortStoreOrders(list: StoreOrder[]): StoreOrder[] {
  return [...list].sort((a, b) => {
    const pa = a.status === 'PENDING' ? 0 : 1;
    const pb = b.status === 'PENDING' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return pa === 0
      ? a.createdAt.getTime() - b.createdAt.getTime()
      : b.createdAt.getTime() - a.createdAt.getTime();
  });
}
