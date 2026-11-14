import { DoorTone } from './door-result';

export interface RecentScan {
  id: string;
  name: string;
  tone: DoorTone;
  /** Texto corto del resultado ("Check-in", "Pago pendiente", "Deshecho"...). */
  label: string;
  at: Date;
}

export const RECENT_SCANS_LIMIT = 5;

/** Agrega el registro más nuevo al principio y conserva solo los últimos `limit`. */
export function pushRecentScan(
  list: readonly RecentScan[],
  entry: RecentScan,
  limit = RECENT_SCANS_LIMIT,
): RecentScan[] {
  return [entry, ...list].slice(0, limit);
}

/** Marca un registro como deshecho sin sacarlo del historial. */
export function markScanUndone(list: readonly RecentScan[], id: string): RecentScan[] {
  return list.map((s) => (s.id === id ? { ...s, tone: 'wait', label: 'Deshecho' } : s));
}
