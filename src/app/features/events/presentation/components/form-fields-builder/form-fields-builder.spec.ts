import { TestBed } from '@angular/core/testing';

import { Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { FormField } from '../../../domain/form-field.model';
import { FormFieldsBuilder } from './form-fields-builder';

const fields: FormField[] = [
  { key: 'edad', label: 'Edad', type: 'number', required: true },
  { key: 'nivel', label: 'Nivel', type: 'select', required: false, options: ['A', 'B'] },
];

function makeEvent(id = 'e1', formFields = fields): Event {
  return {
    id,
    title: 'Evento',
    slug: 'evento',
    eventType: 'MEETUP',
    capacity: 10,
    dateStart: new Date('2026-10-15T13:00:00Z'),
    dateEnd: null,
    isPublished: false,
    createdAt: null,
    updatedAt: null,
    description: null,
    imageUrl: null,
    bannerUrl: null,
    locationType: null,
    locationName: null,
    addressLink: null,
    category: null,
    extraInfo: null,
    formFields,
  };
}

describe('FormFieldsBuilder', () => {
  const repo = { countRegistrations: vi.fn(), update: vi.fn(), getEvents: vi.fn() };

  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset());
    repo.countRegistrations.mockResolvedValue(0);
    repo.getEvents.mockResolvedValue([]);
    TestBed.configureTestingModule({
      imports: [FormFieldsBuilder],
      providers: [{ provide: EventsRepository, useValue: repo }],
    });
  });

  async function create(registrations = 0) {
    repo.countRegistrations.mockResolvedValue(registrations);
    const fixture = TestBed.createComponent(FormFieldsBuilder);
    fixture.componentRef.setInput('event', makeEvent());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('carga los campos y no permite guardar sin cambios', async () => {
    const cmp = (await create()).componentInstance;
    expect(cmp.fields()).toHaveLength(2);
    expect(cmp.dirty()).toBe(false);
    expect(cmp.canSave()).toBe(false);
  });

  it('un campo nuevo genera key desde el label, y bloquea guardar con errores', async () => {
    const cmp = (await create()).componentInstance;
    cmp.add();
    expect(cmp.canSave()).toBe(false);
    cmp.setLabel(2, 'Edad');
    expect(cmp.fields()[2].key).toBe('edad_2');
    expect(cmp.canSave()).toBe(true);
    cmp.setType(2, 'select');
    expect(cmp.canSave()).toBe(false); // opciones vacías
  });

  it('guarda con EventsRepository.update y emite fieldsChange', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    const emitted: FormField[][] = [];
    cmp.fieldsChange.subscribe((v) => emitted.push(v));
    cmp.add();
    cmp.setLabel(2, 'Empresa');
    repo.update.mockImplementation(async (_id: string, input: { formFields: FormField[] }) =>
      makeEvent('e1', input.formFields),
    );
    await cmp.save();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update.mock.calls[0][0]).toBe('e1');
    expect(repo.update.mock.calls[0][1].formFields[2]).toEqual({
      key: 'empresa',
      label: 'Empresa',
      type: 'text',
      required: false,
    });
    expect(emitted).toHaveLength(1);
    expect(cmp.dirty()).toBe(false);
    expect(cmp.fields()[2].isNew).toBe(false);
    expect(cmp.notice()).toBe('Formulario guardado.');
  });

  it('muestra el error si el guardado falla', async () => {
    const cmp = (await create()).componentInstance;
    cmp.setRequired(0, false);
    repo.update.mockRejectedValue(new Error('boom'));
    await cmp.save();
    expect(cmp.saveError()).toBe('boom');
    expect(cmp.dirty()).toBe(true);
  });

  it('con inscritos no elimina campos guardados ni edita sus keys, pero sí los nuevos', async () => {
    const cmp = (await create(5)).componentInstance;
    expect(cmp.locked()).toBe(true);
    cmp.remove(0);
    expect(cmp.fields()).toHaveLength(2);
    expect(cmp.keyEditable(cmp.fields()[0])).toBe(false);
    cmp.add();
    cmp.remove(2);
    expect(cmp.fields()).toHaveLength(2);
  });

  it('reordena con move() y rechaza límites', async () => {
    const cmp = (await create()).componentInstance;
    cmp.move(0, 1);
    expect(cmp.fields().map((f) => f.key)).toEqual(['nivel', 'edad']);
    cmp.move(0, -1);
    expect(cmp.fields().map((f) => f.key)).toEqual(['nivel', 'edad']);
    expect(cmp.dirty()).toBe(true);
  });

  it('aplicar plantilla pide confirmación si ya hay campos y reemplaza al confirmar', async () => {
    const cmp = (await create()).componentInstance;
    cmp.chooseTemplate('X', [{ key: 'z', label: 'Z', type: 'text', required: false }]);
    expect(cmp.pending()).not.toBeNull();
    expect(cmp.fields()).toHaveLength(2);
    cmp.confirmPending();
    expect(cmp.fields().map((f) => f.key)).toEqual(['z']);
    expect(cmp.pending()).toBeNull();
  });

  it('readonly impide guardar', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('readonly', true);
    fixture.componentInstance.setRequired(0, false);
    expect(fixture.componentInstance.canSave()).toBe(false);
  });
});
