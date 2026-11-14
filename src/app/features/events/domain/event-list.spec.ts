import { Event } from './event.model';
import {
  DEFAULT_EVENT_FILTERS,
  eventFiltersToParams,
  eventTiming,
  filterEvents,
  parseEventFilters,
  sortEventsForList,
} from './event-list';

const NOW = new Date(2026, 10, 14, 15, 0);

function ev(id: string, start: Date, extra: Partial<Event> = {}): Event {
  return {
    id,
    title: id,
    eventType: 'WORKSHOP',
    dateStart: start,
    dateEnd: null,
    isPublished: true,
    locationName: null,
    category: null,
    ...extra,
  } as Event;
}

describe('eventTiming', () => {
  it('clasifica próximo, hoy y pasado', () => {
    expect(eventTiming(ev('a', new Date(2026, 10, 20)), NOW)).toBe('UPCOMING');
    expect(eventTiming(ev('b', new Date(2026, 10, 14, 8)), NOW)).toBe('TODAY');
    expect(eventTiming(ev('c', new Date(2026, 10, 1)), NOW)).toBe('PAST');
  });

  it('un evento de varios días que incluye hoy es "hoy"', () => {
    const e = ev('d', new Date(2026, 10, 13), { dateEnd: new Date(2026, 10, 15) });
    expect(eventTiming(e, NOW)).toBe('TODAY');
  });
});

describe('sortEventsForList', () => {
  it('próximos por cercanía y luego pasados del más reciente al más antiguo', () => {
    const list = [
      ev('past-old', new Date(2026, 8, 1)),
      ev('far', new Date(2026, 11, 30)),
      ev('past-new', new Date(2026, 10, 2)),
      ev('near', new Date(2026, 10, 18)),
      ev('today', new Date(2026, 10, 14, 9)),
    ];
    expect(sortEventsForList(list, NOW).map((e) => e.id)).toEqual([
      'today',
      'near',
      'far',
      'past-new',
      'past-old',
    ]);
  });

  it('no muta la lista original', () => {
    const list = [ev('b', new Date(2026, 11, 1)), ev('a', new Date(2026, 10, 20))];
    sortEventsForList(list, NOW);
    expect(list[0].id).toBe('b');
  });
});

describe('filterEvents', () => {
  const list = [
    ev('Taller de Flutter', new Date(2026, 11, 1), { isPublished: false }),
    ev('Conferencia anual', new Date(2026, 9, 1), { eventType: 'CONFERENCE' }),
    ev('Meetup hoy', new Date(2026, 10, 14, 19), { eventType: 'MEETUP' }),
  ];

  it('filtra por estado de publicación', () => {
    const r = filterEvents(list, { ...DEFAULT_EVENT_FILTERS, status: 'DRAFT' }, NOW);
    expect(r.map((e) => e.title)).toEqual(['Taller de Flutter']);
  });

  it('próximos incluye hoy; pasados solo los ya terminados', () => {
    expect(filterEvents(list, { ...DEFAULT_EVENT_FILTERS, time: 'UPCOMING' }, NOW)).toHaveLength(2);
    expect(
      filterEvents(list, { ...DEFAULT_EVENT_FILTERS, time: 'PAST' }, NOW).map((e) => e.title),
    ).toEqual(['Conferencia anual']);
  });

  it('busca sin tildes ni mayúsculas, también por tipo traducido', () => {
    expect(
      filterEvents(list, { ...DEFAULT_EVENT_FILTERS, query: 'CONFERENCIA' }, NOW),
    ).toHaveLength(1);
    expect(filterEvents(list, { ...DEFAULT_EVENT_FILTERS, query: 'taller' }, NOW)).toHaveLength(1);
  });
});

describe('filtros en la URL', () => {
  it('hace ida y vuelta y omite los valores por defecto', () => {
    const filters = { status: 'PUBLISHED', time: 'UPCOMING', query: ' flutter ' } as const;
    const params = eventFiltersToParams(filters);
    expect(params).toEqual({ estado: 'published', cuando: 'upcoming', q: 'flutter' });
    const map = new Map(Object.entries(params));
    expect(parseEventFilters({ get: (k) => map.get(k) ?? null })).toEqual({
      ...filters,
      query: 'flutter',
    });
    expect(eventFiltersToParams(DEFAULT_EVENT_FILTERS)).toEqual({
      estado: null,
      cuando: null,
      q: null,
    });
  });

  it('ignora valores desconocidos', () => {
    const map = new Map([['estado', 'xx']]);
    expect(parseEventFilters({ get: (k) => map.get(k) ?? null }).status).toBe('ALL');
  });
});
