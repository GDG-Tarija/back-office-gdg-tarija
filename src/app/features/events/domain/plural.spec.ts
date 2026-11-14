import { describe, expect, it } from 'vitest';

import { inscritas, plural } from './plural';

describe('plural', () => {
  it('usa singular solo con 1', () => {
    expect(plural(1, 'sesión', 'sesiones')).toBe('1 sesión');
    expect(plural(0, 'sesión', 'sesiones')).toBe('0 sesiones');
    expect(plural(2, 'sesión', 'sesiones')).toBe('2 sesiones');
  });
  it('inscritas', () => {
    expect(inscritas(1)).toBe('1 persona inscrita');
    expect(inscritas(5)).toBe('5 personas inscritas');
  });
});
