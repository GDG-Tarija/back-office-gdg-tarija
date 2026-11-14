import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PreselectableEvent,
  eventsVisibleTo,
  isEventToday,
  pickInitialEvent,
} from './event-preselection';

const NOW = new Date(2026, 10, 20, 10, 0);

function ev(id: string, start: Date, end: Date | null = null): PreselectableEvent {
  return { id, dateStart: start, dateEnd: end };
}

const ctx = (over: Partial<{ requestedId: string | null; lastUsedId: string | null }> = {}) => ({
  requestedId: null,
  lastUsedId: null,
  now: NOW,
  ...over,
});

describe('pickInitialEvent', () => {
  const today = ev('hoy', new Date(2026, 10, 20, 9, 0), new Date(2026, 10, 20, 18, 0));
  const soon = ev('pronto', new Date(2026, 10, 25, 9, 0));
  const far = ev('lejano', new Date(2027, 5, 1, 9, 0));
  const past = ev('pasado', new Date(2026, 9, 1, 9, 0));

  it('devuelve null sin eventos', () => {
    expect(pickInitialEvent([], ctx())).toBeNull();
  });

  it('?event= manda sobre todo', () => {
    expect(pickInitialEvent([today, soon, far], ctx({ requestedId: 'lejano' }))?.id).toBe('lejano');
  });

  it('ignora ?event= si no está entre los visibles', () => {
    expect(pickInitialEvent([today, soon], ctx({ requestedId: 'otro' }))?.id).toBe('hoy');
  });

  it('prefiere el evento de hoy aunque el último usado sea otro', () => {
    expect(pickInitialEvent([far, soon, today], ctx({ lastUsedId: 'pronto' }))?.id).toBe('hoy');
  });

  it('entre varios de hoy prefiere el que está en curso', () => {
    const morning = ev('manana', new Date(2026, 10, 20, 7, 0), new Date(2026, 10, 20, 9, 0));
    expect(pickInitialEvent([morning, today], ctx())?.id).toBe('hoy');
  });

  it('un evento de varios días cuenta como hoy en cualquiera de sus días', () => {
    const multi = ev('multi', new Date(2026, 10, 19, 9, 0), new Date(2026, 10, 21, 18, 0));
    expect(isEventToday(multi, NOW)).toBe(true);
    expect(pickInitialEvent([far, multi], ctx())?.id).toBe('multi');
  });

  it('con un solo evento (p. ej. el único asignado) lo elige aunque no sea de hoy', () => {
    expect(pickInitialEvent([far], ctx())?.id).toBe('lejano');
  });

  it('sin evento de hoy usa el último usado en el dispositivo', () => {
    expect(pickInitialEvent([far, soon], ctx({ lastUsedId: 'lejano' }))?.id).toBe('lejano');
  });

  it('ignora un último usado que ya no es visible', () => {
    expect(pickInitialEvent([far, soon], ctx({ lastUsedId: 'borrado' }))?.id).toBe('pronto');
  });

  it('sin nada más elige el más cercano a hoy, nunca el más lejano', () => {
    expect(pickInitialEvent([far, past, soon], ctx())?.id).toBe('pronto');
  });
});

describe('eventsVisibleTo', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('STAFF solo ve sus eventos asignados', () => {
    expect(eventsVisibleTo('STAFF', events, ['b'])).toEqual([{ id: 'b' }]);
  });

  it('STAFF sin asignaciones no ve ninguno', () => {
    expect(eventsVisibleTo('STAFF', events, [])).toEqual([]);
  });

  it('SUPERADMIN ve todos', () => {
    expect(eventsVisibleTo('SUPERADMIN', events, [])).toHaveLength(3);
  });
});

describe('zona horaria La Paz', () => {
  // El spec corre en Node pero el tsconfig no incluye @types/node.
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
    .process.env;
  const previousTz = env['TZ'];
  beforeAll(() => {
    env['TZ'] = 'Asia/Tokyo';
  });
  afterAll(() => {
    if (previousTz === undefined) delete env['TZ'];
    else env['TZ'] = previousTz;
  });

  it('mismo día en La Paz es "hoy" aunque en el dispositivo (Tokio) ya sea otro día', () => {
    const morning = ev('manana', new Date('2026-10-15T14:00:00Z')); // 15-oct 10:00 La Paz
    const now = new Date('2026-10-15T16:00:00Z'); // 15-oct 12:00 La Paz (16-oct 01:00 en Tokio)
    expect(isEventToday(morning, now)).toBe(true);
  });
});
