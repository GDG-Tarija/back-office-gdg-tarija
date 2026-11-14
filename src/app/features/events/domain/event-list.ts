import { startOfLaPazDay as startOfDay } from '../../../shared/utils/la-paz-time';
import { Event } from './event.model';

export type EventTiming = 'UPCOMING' | 'TODAY' | 'PAST';
export type EventStatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED';
export type EventTimeFilter = 'UPCOMING' | 'PAST' | 'ALL';

export interface EventListFilters {
  status: EventStatusFilter;
  time: EventTimeFilter;
  query: string;
}

export const DEFAULT_EVENT_FILTERS: EventListFilters = { status: 'ALL', time: 'ALL', query: '' };

export const EVENT_TYPE_LABELS: Record<string, string> = {
  MEETUP: 'Meetup',
  CONFERENCE: 'Conferencia',
  HACKATHON: 'Hackathon',
  WORKSHOP: 'Taller',
};

export const EVENT_TIMING_LABELS: Record<EventTiming, string> = {
  UPCOMING: 'Próximo',
  TODAY: 'Hoy',
  PAST: 'Pasado',
};

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

/** "Hoy" cubre todo el día calendario en el que el evento empieza, o los días que abarca. */
export function eventTiming(event: Pick<Event, 'dateStart' | 'dateEnd'>, now: Date): EventTiming {
  const today = startOfDay(now);
  const first = startOfDay(event.dateStart);
  const last = event.dateEnd ? Math.max(first, startOfDay(event.dateEnd)) : first;
  if (first > today) return 'UPCOMING';
  if (last < today) return 'PAST';
  return 'TODAY';
}

/** Hoy y próximos primero (el más cercano arriba), luego los pasados del más reciente al más antiguo. */
export function sortEventsForList(events: readonly Event[], now: Date): Event[] {
  const rank = (e: Event) => (eventTiming(e, now) === 'PAST' ? 1 : 0);
  return [...events].sort((a, b) => {
    const byGroup = rank(a) - rank(b);
    if (byGroup !== 0) return byGroup;
    const diff = a.dateStart.getTime() - b.dateStart.getTime();
    return rank(a) === 0 ? diff : -diff;
  });
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterEvents(
  events: readonly Event[],
  filters: EventListFilters,
  now: Date,
): Event[] {
  const query = normalize(filters.query.trim());
  return events.filter((e) => {
    if (filters.status === 'DRAFT' && e.isPublished) return false;
    if (filters.status === 'PUBLISHED' && !e.isPublished) return false;
    const timing = eventTiming(e, now);
    if (filters.time === 'UPCOMING' && timing === 'PAST') return false;
    if (filters.time === 'PAST' && timing !== 'PAST') return false;
    if (!query) return true;
    return normalize(
      [e.title, eventTypeLabel(e.eventType), e.locationName ?? '', e.category ?? ''].join(' '),
    ).includes(query);
  });
}

export function hasActiveEventFilters(filters: EventListFilters): boolean {
  return filters.status !== 'ALL' || filters.time !== 'ALL' || filters.query.trim() !== '';
}

const STATUS_VALUES: readonly EventStatusFilter[] = ['ALL', 'DRAFT', 'PUBLISHED'];
const TIME_VALUES: readonly EventTimeFilter[] = ['UPCOMING', 'PAST', 'ALL'];

/** Lee los filtros desde los query params; valores desconocidos caen al predeterminado. */
export function parseEventFilters(params: { get(name: string): string | null }): EventListFilters {
  const status = params.get('estado')?.toUpperCase() as EventStatusFilter;
  const time = params.get('cuando')?.toUpperCase() as EventTimeFilter;
  return {
    status: STATUS_VALUES.includes(status) ? status : 'ALL',
    time: TIME_VALUES.includes(time) ? time : 'ALL',
    query: params.get('q') ?? '',
  };
}

/** Solo incluye lo que difiere del predeterminado para mantener la URL corta. */
export function eventFiltersToParams(filters: EventListFilters): Record<string, string | null> {
  return {
    estado: filters.status === 'ALL' ? null : filters.status.toLowerCase(),
    cuando: filters.time === 'ALL' ? null : filters.time.toLowerCase(),
    q: filters.query.trim() || null,
  };
}
