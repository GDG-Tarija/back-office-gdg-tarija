import { Event } from './event.model';
import {
  distinctCategories,
  emptyEventFormValue,
  eventToFormValue,
  eventToInput,
  formValueToEventInput,
  nextAutoSlug,
} from './event-form';

describe('event-form', () => {
  it('nextAutoSlug sigue al título mientras no se edite a mano', () => {
    expect(nextAutoSlug('Build with AI 2026', '', false)).toBe('build-with-ai-2026');
    expect(nextAutoSlug('Otro título', 'mi-slug', true)).toBe('mi-slug');
    expect(nextAutoSlug('Otro título', 'viejo', false, true)).toBe('viejo');
  });

  it('formValueToEventInput convierte fechas de La Paz a UTC y normaliza vacíos', () => {
    const input = formValueToEventInput({
      ...emptyEventFormValue(),
      title: '  Evento  ',
      slug: 'evento',
      startDate: '2026-10-15',
      startTime: '09:00',
      endDate: '2026-10-15',
      endTime: '18:00',
      capacity: '120',
      category: '  ',
    });
    expect(input.title).toBe('Evento');
    expect(input.dateStart?.toISOString()).toBe('2026-10-15T13:00:00.000Z');
    expect(input.dateEnd?.toISOString()).toBe('2026-10-15T22:00:00.000Z');
    expect(input.capacity).toBe(120);
    expect(input.category).toBeNull();
    expect(input.formFields).toEqual([]);
  });

  it('capacidad vacía o no numérica queda en null y fecha incompleta en null', () => {
    const base = emptyEventFormValue();
    expect(formValueToEventInput({ ...base, capacity: '' }).capacity).toBeNull();
    expect(formValueToEventInput({ ...base, capacity: 'abc' }).capacity).toBeNull();
    expect(formValueToEventInput({ ...base, startDate: '' }).dateStart).toBeNull();
  });

  it('eventToFormValue / eventToInput hacen round-trip conservando formFields', () => {
    const event = {
      id: '1',
      title: 'Demo',
      slug: 'demo',
      eventType: 'WORKSHOP',
      capacity: 50,
      dateStart: new Date('2026-10-15T13:00:00.000Z'),
      dateEnd: new Date('2026-10-15T22:00:00.000Z'),
      isPublished: false,
      createdAt: null,
      updatedAt: null,
      description: 'd',
      imageUrl: 'http://x/i.png',
      bannerUrl: null,
      locationType: 'PHYSICAL',
      locationName: 'Sala',
      addressLink: null,
      category: 'IA',
      extraInfo: null,
      formFields: [{ key: 'a', label: 'A', type: 'text', required: true }],
    } as Event;
    const form = eventToFormValue(event);
    expect(form.startDate).toBe('2026-10-15');
    expect(form.startTime).toBe('09:00');
    expect(form.capacity).toBe('50');
    const input = eventToInput(event);
    expect(input.dateStart).toEqual(event.dateStart);
    expect(input.dateEnd).toEqual(event.dateEnd);
    expect(input.formFields).toHaveLength(1);
  });

  it('distinctCategories deduplica sin distinguir mayúsculas', () => {
    expect(
      distinctCategories([
        { category: 'IA' },
        { category: 'ia' },
        { category: null },
        { category: 'Cloud' },
      ]),
    ).toEqual(['Cloud', 'IA']);
  });
});
