import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startOfLaPazDay } from './la-paz-time';

// El spec corre en Node pero el tsconfig no incluye @types/node.
declare const process: { env: Record<string, string | undefined> };

describe('startOfLaPazDay', () => {
  const previousTz = process.env['TZ'];

  // Con una zona muy distinta a La Paz, el cálculo local del día cambiaría el resultado.
  beforeAll(() => {
    process.env['TZ'] = 'Asia/Tokyo';
  });
  afterAll(() => {
    if (previousTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previousTz;
  });

  it('una noche en La Paz (20:00 del 15) sigue siendo el día 15 aunque en UTC ya sea 16', () => {
    const evening = new Date('2026-10-16T00:00:00Z'); // 15-oct 20:00 La Paz
    expect(new Date(startOfLaPazDay(evening)).toISOString()).toBe('2026-10-15T04:00:00.000Z');
  });

  it('00:00 La Paz abre el día nuevo y 23:59 todavía es el anterior', () => {
    const midnight = new Date('2026-10-15T04:00:00Z');
    const justBefore = new Date('2026-10-15T03:59:59Z');
    expect(new Date(startOfLaPazDay(midnight)).toISOString()).toBe('2026-10-15T04:00:00.000Z');
    expect(new Date(startOfLaPazDay(justBefore)).toISOString()).toBe('2026-10-14T04:00:00.000Z');
  });
});
