import { describe, expect, it } from 'vitest';

import { buildErrorSummary, summaryHeading } from './error-summary';

const FIELDS = {
  title: { id: 'ev-title', label: 'Título' },
  dateEnd: { id: 'ev-end-date', label: 'Fecha de fin' },
};

describe('buildErrorSummary', () => {
  it('mapea errores a ítems con id y etiqueta, sin repetir controles', () => {
    const items = buildErrorSummary(
      [
        { field: 'title', message: 'Muy corto' },
        { field: 'title', message: 'Otro' },
        { field: 'dateEnd', message: 'Falta' },
        { field: 'desconocido', message: 'x' },
      ],
      FIELDS,
    );
    expect(items).toEqual([
      { id: 'ev-title', label: 'Título', message: 'Muy corto' },
      { id: 'ev-end-date', label: 'Fecha de fin', message: 'Falta' },
    ]);
  });
});

describe('summaryHeading', () => {
  it('pluraliza y lista los campos', () => {
    const items = buildErrorSummary(
      [
        { field: 'title', message: 'a' },
        { field: 'dateEnd', message: 'b' },
      ],
      FIELDS,
    );
    expect(summaryHeading(items)).toBe('Revisa 2 campos: Título, Fecha de fin');
    expect(summaryHeading(items.slice(0, 1))).toBe('Revisa 1 campo: Título');
  });
});
