import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';

import { BsPipe } from '../pipes/bs.pipe';
import { formatBs } from './money';

describe('formatBs', () => {
  beforeAll(() => registerLocaleData(localeEsBo, 'es-BO'));

  it('muestra enteros sin decimales', () => {
    expect(formatBs(10)).toBe('Bs\u00A010');
    expect(formatBs(0)).toBe('Bs\u00A00');
  });

  it('muestra siempre dos decimales cuando hay centavos', () => {
    expect(formatBs(12.5)).toBe('Bs\u00A012,50');
    expect(formatBs(12.05)).toBe('Bs\u00A012,05');
  });

  it('agrupa miles', () => {
    expect(formatBs(1234.5)).toContain('1');
    expect(formatBs(1234.5)).toMatch(/^Bs\u00A01.?234,50$/);
  });

  it('devuelve vacío sin valor', () => {
    expect(formatBs(null)).toBe('');
    expect(formatBs(undefined)).toBe('');
    expect(formatBs(Number.NaN)).toBe('');
  });

  it('el pipe delega en formatBs', () => {
    expect(new BsPipe().transform(10)).toBe('Bs\u00A010');
  });
});
