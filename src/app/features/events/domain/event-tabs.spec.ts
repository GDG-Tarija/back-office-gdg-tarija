import { describe, expect, it } from 'vitest';

import {
  firstPendingTab,
  isRequiredToPublish,
  parseEventTab,
  tabForField,
  tabStatuses,
} from './event-tabs';

const err = (field: string) => ({ field, message: 'x' });

describe('event tabs', () => {
  it('parsea la pestaña de la URL con valor por defecto', () => {
    expect(parseEventTab('paquetes')).toBe('paquetes');
    expect(parseEventTab('nope')).toBe('datos');
    expect(parseEventTab(null)).toBe('datos');
  });

  it('asigna cada error de publicación a su pestaña', () => {
    expect(tabForField('description')).toBe('datos');
    expect(tabForField('imageUrl')).toBe('datos');
    expect(tabForField('fields[1].label')).toBe('formulario');
    expect(tabForField('ticketTypes')).toBe('paquetes');
    expect(tabForField('ticketTypes[0].phases')).toBe('paquetes');
    expect(tabForField('sessions')).toBe('sesiones');
  });

  it('marca lo que exige la publicación', () => {
    expect(isRequiredToPublish('description')).toBe(true);
    expect(isRequiredToPublish('category')).toBe(false);
  });

  it('calcula el estado de cada pestaña', () => {
    const result = { errors: [err('description'), err('ticketTypes')], warnings: [] };
    const s = tabStatuses(result, true);
    expect(s.datos).toBe('pending');
    expect(s.formulario).toBe('complete');
    expect(s.paquetes).toBe('pending');
    expect(s.extras).toBe('optional');
    expect(s.publicacion).toBe('pending');
    expect(tabStatuses({ errors: [], warnings: [] }, true).publicacion).toBe('complete');
    expect(tabStatuses(null, false).datos).toBe('pending');
  });

  it('elige el primer paso pendiente o Publicación si todo está listo', () => {
    expect(firstPendingTab({ errors: [err('ticketTypes')], warnings: [] })).toBe('paquetes');
    expect(firstPendingTab({ errors: [], warnings: [] })).toBe('publicacion');
  });
});
