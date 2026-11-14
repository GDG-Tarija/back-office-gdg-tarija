export interface PreselectableEvent {
  id: string;
  dateStart: Date;
  dateEnd: Date | null;
}

export interface PreselectionContext {
  /** `?event=` de la URL: manda sobre todo lo demás. */
  requestedId: string | null;
  /** Último evento usado en este dispositivo. */
  lastUsedId: string | null;
  now: Date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** El evento es de hoy si hoy cae entre el día de inicio y el día de fin (ambos incluidos). */
export function isEventToday(event: PreselectableEvent, now: Date): boolean {
  const today = startOfDay(now);
  const first = startOfDay(event.dateStart);
  const last = event.dateEnd ? Math.max(first, startOfDay(event.dateEnd)) : first;
  return today >= first && today <= last;
}

function isInProgress(event: PreselectableEvent, now: Date): boolean {
  const t = now.getTime();
  return event.dateStart.getTime() <= t && !!event.dateEnd && t <= event.dateEnd.getTime();
}

/**
 * Evento que la puerta debe tener elegido al abrir el check-in:
 * `?event=` → el de hoy / en curso → el único disponible → el último usado en el dispositivo →
 * el más cercano a hoy (nunca el más lejano).
 */
export function pickInitialEvent<T extends PreselectableEvent>(
  events: readonly T[],
  { requestedId, lastUsedId, now }: PreselectionContext,
): T | null {
  if (events.length === 0) return null;

  const requested = requestedId ? events.find((e) => e.id === requestedId) : undefined;
  if (requested) return requested;

  const today = events
    .filter((e) => isEventToday(e, now))
    .sort(
      (a, b) =>
        Number(isInProgress(b, now)) - Number(isInProgress(a, now)) ||
        a.dateStart.getTime() - b.dateStart.getTime(),
    );
  if (today.length > 0) return today[0];

  if (events.length === 1) return events[0];

  const lastUsed = lastUsedId ? events.find((e) => e.id === lastUsedId) : undefined;
  if (lastUsed) return lastUsed;

  const distance = (e: T) => Math.abs(e.dateStart.getTime() - now.getTime());
  return [...events].sort((a, b) => distance(a) - distance(b))[0];
}

/** STAFF solo ve los eventos que tiene asignados; SUPERADMIN ve todos. */
export function eventsVisibleTo<T extends { id: string }>(
  role: string | null,
  events: readonly T[],
  assignedEventIds: readonly string[],
): T[] {
  if (role !== 'STAFF') return [...events];
  const allowed = new Set(assignedEventIds);
  return events.filter((e) => allowed.has(e.id));
}
